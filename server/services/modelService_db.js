const prisma = require('../../server-utils/db');
const fs = require('fs');
const { parseDurationToSeconds } = require('../../server-utils/timeHelper');
const { getAbsoluteModelsPath } = require('../../server-utils/dataAccess');
const { generateCoverForCollection } = require('../../server-utils/coverGenerator_db');
const {
    ModelSchema,
    ModelFormSchema,
    ModelUpdateSchema,
    ModelQuerySchema,
    BulkEditSchema
} = require('../schemas/index_db');
const { dbLog } = require('../../server-utils/configHelper');

const PRISMA_MODEL_COLUMNS = [
    'id', 'collectionId', 'name', 'description', 'license', 'designer',
    'source', 'notes', 'printTime', 'filamentUsage', 'isPrinted', 'isFavorite',
    'isDeleted', 'isHidden', 'isComponent', 'category', 'modelUrl', 'price',
    'layerHeight', 'infill', 'nozzle', 'printer', 'material', 'fileSize',
    'gcodeFilePath', 'gcodePrintTime', 'gcodeTotalWeight', 'gcodeFilaments',
    'pathHash', 'thumbnailPath', 'filePath', 'createdAt', 'updatedAt'
];

/**
 * DATABASE VERSION: Model Service
 * Handles all model-related database operations using Prisma
 * Validates inputs with Zod schemas
 */

/**
 * Get all models with optional filtering, pagination, and relations
 * @param {Object} query - Query parameters (validated with ModelQuerySchema)
 * @returns {Promise<{models: Model[], total: number}>}
 */
async function getAllModels(query = {}) {
    // Validate and parse query parameters
    const validated = ModelQuerySchema.parse(query);

    const {
        search,
        tags,
        collectionId,
        isPrinted,
        isFavorite,
        isDeleted = false, // Default to excluding deleted
        isComponent, // New: Extracted from query
        includeFiles = true, // CRITICAL: Frontend adapter needs files relation for modelUrl
        includeTags = true, // Frontend adapter needs tags for display
        includeCollection = false,
        page = 0,
        limit = 10000, // High default to match legacy behavior (return all)
        sortBy = 'name',
        sortOrder = 'asc'
    } = validated;

    // Filter Logic:
    // If isComponent is EXPLICITLY passed (true/false), use it.
    // If NOT passed, default to FALSE (hide components), UNLESS...
    // Actually, user wants "by default hidden". So we default to false.
    // If frontend needs them, it must pass ?isComponent=true or we need a way to say "all".
    // For now, let's stick to simple boolean logic:
    // undefined -> false (Hide)
    // true -> true (Show only components)
    // false -> false (Hide components)
    // To show "All", frontend would need to not filter? 
    // Wait, typical "is" filters are inclusive if undefined. 
    // BUT user asked for "default hidden".
    // So:
    const showComponents = isComponent === true; // Only show if explicitly asked? 
    // No, standard boolean filter:
    // isComponent=true -> WHERE isComponent=true
    // isComponent=false -> WHERE isComponent=false
    // undefined -> WHERE isComponent=false (Default)

    // Check if we need a special "all" casing? 
    // Zod schema is boolean/optional.

    const componentFilter = isComponent !== undefined ? isComponent : false;

    // Build where clause
    const where = {
        isDeleted, // Respect soft deletes
        ...(search && {
            OR: [
                { name: { contains: search } },
                { description: { contains: search } }
            ]
        }),
        ...(collectionId && { collectionId }),
        ...(typeof isPrinted === 'boolean' && { isPrinted }),
        ...(typeof isFavorite === 'boolean' && { isFavorite }),
        ...(tags && tags.length > 0 && {
            tags: {
                some: {
                    tag: {
                        name: { in: tags }
                    }
                }
            }
        }),
        ...(validated.ids && validated.ids.length > 0 && {
            id: { in: validated.ids }
        }),
        ...(validated.modelUrl && {
            modelUrl: validated.modelUrl
        })
    };

    // Only apply isComponent filter if we are NOT doing a specific ID or URL lookup
    if (!validated.ids && !validated.modelUrl) {
        where.isComponent = componentFilter;
    }

    dbLog('[getAllModels] Validated Query:', JSON.stringify(validated, null, 2));
    dbLog('[getAllModels] Built Where Clause:', JSON.stringify(where, null, 2));

    // Build include clause for relations
    const include = {
        ...(includeFiles && { files: true }),
        ...(includeTags && {
            tags: {
                include: { tag: true }
            }
        }),
        ...(includeCollection && { collection: true }),
        images: { orderBy: { order: 'asc' } }, // Batch 5: Always include images
        relatedFiles: true // Batch 4: Always include related files
    };

    // Execute queries in parallel
    const [models, total] = await Promise.all([
        prisma.model.findMany({
            where,
            include,
            orderBy: { [sortBy]: sortOrder },
            skip: page * limit,
            take: limit
        }),
        prisma.model.count({ where })
    ]);

    // Transform tags for frontend compatibility (flat array of strings)
    const modelsWithTags = models.map(m => ({
        ...m,
        tags: m.tags ? m.tags.map(t => t.tag.name) : []
    }));

    return { models: modelsWithTags, total };
}

/**
 * Get a single model by ID with all relations
 * @param {string} id - Model ID
 * @returns {Promise<Model|null>}
 */
async function getModelById(id) {
    const model = await prisma.model.findUnique({
        where: { id },
        include: {
            files: true,
            tags: {
                include: { tag: true }
            },
            collection: true,
            images: { orderBy: { order: 'asc' } }, // Batch 5
            relatedFiles: true // Batch 4
        }
    });

    if (model && model.tags) {
        // Flatten tags
        model.tags = model.tags.map(t => t.tag.name);
    }

    return model;
}

/**
 * Create a new model
 * @param {Object} data - Model data (validated with ModelFormSchema)
 * @param {string} collectionId - Collection to add model to
 * @returns {Promise<Model>}
 */
async function createModel(data, collectionId) {
    const validated = ModelFormSchema.parse(data);
    const { tags, metadata, ...modelData } = validated;

    // Create model with tags in a transaction
    return await prisma.$transaction(async (tx) => {
        // Create model
        const model = await tx.model.create({
            data: {
                ...modelData,
                collectionId,
                metadata: metadata ? JSON.stringify(metadata) : null
            }
        });

        // Add tags if provided
        if (tags && tags.length > 0) {
            await addTagsToModel(model.id, tags, tx);
        }

        return model;
    });

    if (result.collectionId) {
        triggerCoverGeneration([result.collectionId]);
    }

    return result;
}

/**
 * Update a model
 * @param {string} id - Model ID
 * @param {Object} updates - Partial model data (validated with ModelUpdateSchema)
 * @returns {Promise<Model>}
 */
async function updateModel(id, updates) {
    dbLog('[updateModel] ========== START ==========');
    dbLog('[updateModel] Called with id:', id);
    dbLog('[updateModel] Raw updates received:', JSON.stringify(updates, null, 2));

    // Validate updates (id comes from route parameter, already validated)
    const validated = ModelUpdateSchema.parse(updates);
    dbLog('[updateModel] After Zod validation:', JSON.stringify(validated, null, 2));


    const {
        tags,
        metadata,
        notes,
        source,
        designer,
        filePath,
        relatedFiles,
        related_files, // Legacy key sent by frontend
        userDefined,   // Legacy wrapper for description/thumbnail
        printSettings,
        gcodeData,
        printTime,
        filamentUsage,
        ...modelUpdates
    } = validated;

    // Batch 2: Support duration strings and numeric seconds
    if (printTime !== undefined) modelUpdates.printTime = parseDurationToSeconds(printTime);
    if (filamentUsage !== undefined) {
        if (typeof filamentUsage === 'string') {
            const match = filamentUsage.match(/([\d.]+)/);
            modelUpdates.filamentUsage = match ? parseFloat(match[1]) : 0;
        } else {
            modelUpdates.filamentUsage = filamentUsage;
        }
    }

    // Batch 2: Explode printSettings group into flat model columns
    if (printSettings) {
        if (printSettings.layerHeight !== undefined) modelUpdates.layerHeight = printSettings.layerHeight;
        if (printSettings.infill !== undefined) modelUpdates.infill = printSettings.infill;
        if (printSettings.nozzle !== undefined) modelUpdates.nozzle = printSettings.nozzle;
        if (printSettings.printer !== undefined) modelUpdates.printer = printSettings.printer;
        if (printSettings.material !== undefined) modelUpdates.material = printSettings.material;
    }

    // Batch 3: Explode gcodeData group into flat model columns
    if (gcodeData) {
        if (gcodeData.gcodeFilePath !== undefined) modelUpdates.gcodeFilePath = gcodeData.gcodeFilePath;
        if (gcodeData.printTime !== undefined) modelUpdates.gcodePrintTime = gcodeData.printTime;
        if (gcodeData.totalFilamentWeight !== undefined) modelUpdates.gcodeTotalWeight = gcodeData.totalFilamentWeight;
        if (gcodeData.filaments !== undefined) modelUpdates.gcodeFilaments = JSON.stringify(gcodeData.filaments);
    }

    dbLog('[updateModel] Extracted modelUpdates:', JSON.stringify(modelUpdates, null, 2));
    dbLog('[updateModel] Extracted tags:', tags);
    dbLog('[updateModel] Extracted notes:', notes);
    dbLog('[updateModel] Extracted source:', source);
    dbLog('[updateModel] Extracted designer:', designer);
    dbLog('[updateModel] Extracted relatedFiles:', relatedFiles);
    dbLog('[updateModel] Extracted printSettings (exploded to cols):', printSettings ? JSON.stringify(printSettings, null, 2) : 'null');
    dbLog('[updateModel] Extracted metadata:', metadata ? JSON.stringify(metadata, null, 2) : 'null');

    // Fetch current model to get existing metadata
    const currentModel = await prisma.model.findUnique({ where: { id } });
    if (!currentModel) {
        throw new Error(`Model not found: ${id} `);
    }

    // Parse existing metadata
    let existingMetadata = {};
    try {
        if (currentModel.metadata) {
            existingMetadata = JSON.parse(currentModel.metadata);
        }
    } catch (e) {
        dbLog('[updateModel] Warning: Could not parse existing metadata');
    }

    // Merge metadata fields
    const mergedMetadata = {
        ...existingMetadata,
        ...(metadata || {}),  // User-provided metadata
    };

    // Legacy wrappers: merge userDefined and related_files into metadata
    if (userDefined !== undefined) {
        mergedMetadata.userDefined = {
            ...(mergedMetadata.userDefined || {}),
            ...userDefined
        };
    }
    if (related_files !== undefined) {
        mergedMetadata.related_files = related_files;
    }

    // [Batch 4] Promote source, notes, related_files out of metadata
    if (source !== undefined) modelUpdates.source = source;
    if (notes !== undefined) modelUpdates.notes = notes;
    if (designer !== undefined) modelUpdates.designer = designer;
    // NOTE: filePath/primaryModelPath is NOT written here — modelUrl is the canonical 3D path column

    // Clean up promoted fields from JSON blob to maintain "Strict" state
    delete mergedMetadata.source;
    delete mergedMetadata.notes;
    delete mergedMetadata.designer;
    delete mergedMetadata.filePath;
    delete mergedMetadata.primaryModelPath;
    delete mergedMetadata.related_files;

    // [Batch 3] Ensure gcodeData is NOT in the JSON blob (it's promoted to columns)
    delete mergedMetadata.gcodeData;

    dbLog('[updateModel] Merged metadata:', JSON.stringify(mergedMetadata, null, 2));

    // Build the data object for Prisma
    const prismaData = {
        ...modelUpdates,
        metadata: JSON.stringify(mergedMetadata)
    };
    dbLog('[updateModel] Data to send to Prisma:', JSON.stringify(prismaData, null, 2));

    return await prisma.$transaction(async (tx) => {
        // Update model
        dbLog('[updateModel] Calling Prisma update with id:', id);
        const model = await tx.model.update({
            where: { id },
            data: prismaData
        });

        // Handle Related Files (Batch 4)
        if (relatedFiles) {
            dbLog('[updateModel] Updating related files:', relatedFiles);
            // Delete old
            await tx.modelRelatedFile.deleteMany({ where: { modelId: id } });
            // Add new
            if (relatedFiles.length > 0) {
                await tx.modelRelatedFile.createMany({
                    data: relatedFiles.map(path => ({
                        modelId: id,
                        path: path
                    }))
                });
            }
        }

        dbLog('[updateModel] Prisma returned model:', JSON.stringify(model, null, 2));

        // Update tags if provided (replace all)
        if (tags) {
            dbLog('[updateModel] Updating tags:', tags);
            // Remove existing tags
            await tx.modelTag.deleteMany({ where: { modelId: id } });
            // Add new tags
            if (tags.length > 0) {
                await addTagsToModel(id, tags, tx);
            }
        }

        dbLog('[updateModel] ========== END - SUCCESS ==========');
        return model;
    });

    // Trigger cover generation if the collection changed
    if (result.collectionId !== currentModel.collectionId) {
        triggerCoverGeneration([currentModel.collectionId, result.collectionId].filter(Boolean));
    }

    return result;
}

/**
 * Soft delete a model
 * @param {string} id - Model ID
 * @returns {Promise<Model>}
 */
async function deleteModel(id) {
    const model = await prisma.model.update({
        where: { id },
        data: { isDeleted: true }
    });

    if (model.collectionId) {
        triggerCoverGeneration([model.collectionId]);
    }

    return model;
}

/**
 * Permanently delete a model (use with caution)
 * @param {string} id - Model ID
 * @returns {Promise<void>}
 */
async function hardDeleteModel(id) {
    const model = await prisma.model.findUnique({ where: { id }, select: { collectionId: true } });
    await prisma.model.delete({ where: { id } });

    if (model && model.collectionId) {
        triggerCoverGeneration([model.collectionId]);
    }
}

/**
 * Bulk edit multiple models
 * @param {Object} bulkData - Bulk edit data (validated with BulkEditSchema)
 * @returns {Promise<{updated: number}>}
 */
async function bulkEditModels(bulkData) {
    const validated = BulkEditSchema.parse(bulkData);
    const { modelIds, updates } = validated;

    return await prisma.$transaction(async (tx) => {
        let updatedCount = 0;

        // Separate Prisma column fields from metadata-only fields using dynamic routing
        const columnUpdates = {};
        const metadataUpdates = {};

        // Handle specific groups if any
        const { printSettings, tags, metadata, ...restUpdates } = updates;

        if (printSettings) {
            Object.keys(printSettings).forEach(k => {
                if (printSettings[k] !== undefined) columnUpdates[k] = printSettings[k];
            });
        }

        for (const [key, value] of Object.entries(restUpdates)) {
            if (value === undefined) continue;
            if (PRISMA_MODEL_COLUMNS.includes(key)) {
                columnUpdates[key] = value;
            } else {
                metadataUpdates[key] = value;
            }
        }

        // Bulk update column fields (fast: single updateMany)
        if (Object.keys(columnUpdates).length > 0) {
            const result = await tx.model.updateMany({
                where: { id: { in: modelIds } },
                data: columnUpdates
            });
            updatedCount = result.count;
        }

        // Merge metadata fields per-model (must read-then-write each)
        if (Object.keys(metadataUpdates).length > 0 || updates.metadata) {
            for (const modelId of modelIds) {
                const current = await tx.model.findUnique({ where: { id: modelId } });
                if (!current) continue;

                let existingMeta = {};
                try {
                    if (current.metadata) existingMeta = JSON.parse(current.metadata);
                } catch { /* ignore parse errors */ }

                const mergedMeta = {
                    ...existingMeta,
                    ...metadataUpdates,
                    ...(updates.metadata || {})
                };

                await tx.model.update({
                    where: { id: modelId },
                    data: { metadata: JSON.stringify(mergedMeta) }
                });
            }
            if (!updatedCount) updatedCount = modelIds.length;
        }

        // Handle tag operations
        if (updates.tags) {
            for (const modelId of modelIds) {
                if (updates.tags.add && updates.tags.add.length > 0) {
                    await addTagsToModel(modelId, updates.tags.add, tx);
                }
                if (updates.tags.remove && updates.tags.remove.length > 0) {
                    await removeTagsFromModel(modelId, updates.tags.remove, tx);
                }
            }
        }

        // Gather all collections that these models currently belong to 
        // OR are being moved to
        const collectionsToUpdate = new Set();
        if (updates.collectionId) collectionsToUpdate.add(updates.collectionId);

        const currentModels = await tx.model.findMany({
            where: { id: { in: modelIds } },
            select: { collectionId: true }
        });
        currentModels.forEach(m => { if (m.collectionId) collectionsToUpdate.add(m.collectionId); });

        return { updated: updatedCount || modelIds.length, collectionsToUpdate: [...collectionsToUpdate] };
    });

    if (result.collectionsToUpdate.length > 0) {
        triggerCoverGeneration(result.collectionsToUpdate);
    }

    // Don't leak the internal array back to clients
    delete result.collectionsToUpdate;

    return result;
}

/**
 * Search models by query string
 * @param {string} query - Search query
 * @param {Object} filters - Additional filters
 * @param {number} limit - Max results
 * @returns {Promise<Model[]>}
 */
async function searchModels(query, filters = {}, limit = 20) {
    const results = await prisma.model.findMany({
        where: {
            isDeleted: false,
            OR: [
                { name: { contains: query } },
                { description: { contains: query } }
            ],
            ...filters
        },
        include: {
            collection: { select: { name: true } },
            tags: { include: { tag: { select: { name: true } } } }
        },
        take: limit
    });

    // Flatten tags
    return results.map(m => ({
        ...m,
        tags: m.tags ? m.tags.map(t => t.tag.name) : []
    }));
}

// --- HELPER FUNCTIONS ---

/**
 * Trigger background generation of 2x2 mosaics for collections
 * @param {string[]} collectionIds
 */
function triggerCoverGeneration(collectionIds) {
    if (!collectionIds || collectionIds.length === 0) return;

    // Deduplicate
    const ids = [...new Set(collectionIds)];

    // Run in background without awaiting
    Promise.allSettled(ids.map(id => generateCoverForCollection(id)))
        .then(results => {
            const successes = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            if (successes > 0) {
                dbLog(`[Auto-Cover] Generated ${successes} new collection covers in the background`);
            }
        });
}

/**
 * Add tags to a model (creates tags if they don't exist)
 * @private
 */
async function addTagsToModel(modelId, tagNames, tx = prisma) {
    for (const tagName of tagNames) {
        // Upsert tag
        const tag = await tx.tag.upsert({
            where: { name: tagName },
            update: {},
            create: { name: tagName }
        });

        // Create model-tag relationship (ignore if already exists)
        await tx.modelTag.upsert({
            where: {
                modelId_tagId: { modelId, tagId: tag.id }
            },
            update: {},
            create: { modelId, tagId: tag.id }
        });
    }
}

/**
 * Remove tags from a model
 * @private
 */
async function removeTagsFromModel(modelId, tagNames, tx = prisma) {
    const tags = await tx.tag.findMany({
        where: { name: { in: tagNames } }
    });

    // Guard: If no tags found, nothing to remove
    if (!tags || tags.length === 0) {
        return;
    }

    await tx.modelTag.deleteMany({
        where: {
            modelId,
            tagId: { in: tags.map(t => t.id) }
        }
    });
}

/**
 * Remove a specific tag from a model
 * @param {string} modelId 
 * @param {string} tagName 
 */
async function removeTagFromModel(modelId, tagName) {
    dbLog(`[DB Service] Removing tag "${tagName}" from model ${modelId}`);
    const tag = await prisma.tag.findUnique({
        where: { name: tagName }
    });
    if (!tag) return;

    await prisma.modelTag.deleteMany({
        where: {
            modelId,
            tagId: tag.id
        }
    });
}

/**
 * Add a new related file to a model
 * @param {string} modelId 
 * @param {string} path 
 */
async function addRelatedFile(modelId, path) {
    dbLog(`[DB Service] Adding related file to model ${modelId}: ${path}`);
    return await prisma.modelRelatedFile.create({
        data: {
            modelId,
            path
        }
    });
}

/**
 * Update an existing related file path
 * @param {string} modelId 
 * @param {string} relatedFileId 
 * @param {string} newPath 
 */
async function updateRelatedFile(modelId, relatedFileId, newPath) {
    dbLog(`[DB Service] Updating related file ${relatedFileId} for model ${modelId} to: ${newPath}`);
    return await prisma.modelRelatedFile.update({
        where: { id: relatedFileId },
        data: { path: newPath }
    });
}

/**
 * Delete a related file from a model and the file system
 * @param {string} modelId 
 * @param {string} relatedFileId 
 */
async function deleteRelatedFile(modelId, relatedFileId) {
    dbLog(`[DB Service] Deleting related file ${relatedFileId} from model ${modelId}`);

    // 1. Get the record to find the path
    const relatedFile = await prisma.modelRelatedFile.findUnique({
        where: { id: relatedFileId }
    });

    if (!relatedFile || relatedFile.modelId !== modelId) {
        throw new Error('Related file not found or does not belong to this model');
    }

    // 2. Delete from DB
    await prisma.modelRelatedFile.delete({
        where: { id: relatedFileId }
    });

    // 3. Delete from File System
    try {
        const modelsDir = getAbsoluteModelsPath();
        const absolutePath = path.join(modelsDir, relatedFile.path);

        if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);
            dbLog(`[DB Service] Deleted physical related file: ${absolutePath}`);
        } else {
            dbLog(`[DB Service] Physical related file not found on disk: ${absolutePath}`);
        }
    } catch (fsError) {
        console.error(`[DB Service] Failed to delete physical related file: ${relatedFile.path}`, fsError);
        // We don't throw here, as the DB link is already severed
    }
}

module.exports = {
    getAllModels,
    getModelById,
    createModel,
    updateModel,
    deleteModel,
    hardDeleteModel,
    bulkEditModels,
    searchModels,
    removeTagFromModel,
    deleteRelatedFile,
    addRelatedFile,
    updateRelatedFile
};
