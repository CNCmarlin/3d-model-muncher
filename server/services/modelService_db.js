const prisma = require('../../server-utils/db');
const {
    ModelSchema,
    ModelFormSchema,
    ModelUpdateSchema,
    ModelQuerySchema,
    BulkEditSchema
} = require('../schemas/index_db');
const { dbLog } = require('../../server-utils/configHelper');

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
        isComponent: componentFilter, // Apply filter
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
        })
    };

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
        ...(includeCollection && { collection: true })
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
            collection: true
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


    const { tags, metadata, category, notes, printSettings, ...modelUpdates } = validated;

    dbLog('[updateModel] Extracted modelUpdates:', JSON.stringify(modelUpdates, null, 2));
    dbLog('[updateModel] Extracted tags:', tags);
    dbLog('[updateModel] Extracted category:', category);
    dbLog('[updateModel] Extracted notes:', notes);
    dbLog('[updateModel] Extracted printSettings:', printSettings ? JSON.stringify(printSettings, null, 2) : 'null');
    dbLog('[updateModel] Extracted metadata:', metadata ? JSON.stringify(metadata, null, 2) : 'null');

    // Fetch current model to get existing metadata
    const currentModel = await prisma.model.findUnique({ where: { id } });
    if (!currentModel) {
        throw new Error(`Model not found: ${id}`);
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

    // Merge metadata fields: category, notes, and printSettings go into metadata JSON
    const mergedMetadata = {
        ...existingMetadata,
        ...(metadata || {}),  // User-provided metadata
        ...(category !== undefined && { category }),  // Store category in metadata
        ...(notes !== undefined && { notes }),  // Store notes in metadata
        ...(printSettings !== undefined && {
            printSettings: {
                ...(existingMetadata.printSettings || {}),
                ...printSettings
            }
        })

    };

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
}

/**
 * Soft delete a model
 * @param {string} id - Model ID
 * @returns {Promise<Model>}
 */
async function deleteModel(id) {
    return await prisma.model.update({
        where: { id },
        data: { isDeleted: true }
    });
}

/**
 * Permanently delete a model (use with caution)
 * @param {string} id - Model ID
 * @returns {Promise<void>}
 */
async function hardDeleteModel(id) {
    await prisma.model.delete({ where: { id } });
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

        // Separate Prisma column fields from metadata-only fields
        const columnUpdates = {};
        const metadataUpdates = {};

        // Fields that exist as Prisma columns
        if (typeof updates.isPrinted === 'boolean') columnUpdates.isPrinted = updates.isPrinted;
        if (typeof updates.isFavorite === 'boolean') columnUpdates.isFavorite = updates.isFavorite;
        if (updates.license !== undefined) columnUpdates.license = updates.license;
        if (updates.designer !== undefined) columnUpdates.designer = updates.designer;
        if (updates.printTime !== undefined) columnUpdates.printTime = updates.printTime;
        if (updates.filamentUsage !== undefined) columnUpdates.filamentUsage = updates.filamentUsage;

        // Fields that must go into metadata JSON (no Prisma column)
        if (typeof updates.hidden === 'boolean') metadataUpdates.hidden = updates.hidden;
        if (updates.category) metadataUpdates.category = updates.category;
        if (updates.source !== undefined) metadataUpdates.source = updates.source;
        if (updates.price !== undefined) metadataUpdates.price = updates.price;

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

        return { updated: updatedCount || modelIds.length };
    });
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

module.exports = {
    getAllModels,
    getModelById,
    createModel,
    updateModel,
    deleteModel,
    hardDeleteModel,
    bulkEditModels,
    searchModels
};
