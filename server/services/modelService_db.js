const { PrismaClient } = require('@prisma/client');
const {
    ModelSchema,
    ModelFormSchema,
    ModelUpdateSchema,
    ModelQuerySchema,
    BulkEditSchema
} = require('../schemas');
const { dbLog } = require('../../server-utils/configHelper');

const prisma = new PrismaClient();

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
        includeFiles = true, // CRITICAL: Frontend adapter needs files relation for modelUrl
        includeTags = true, // Frontend adapter needs tags for display
        includeCollection = false,
        page = 0,
        limit = 10000, // High default to match legacy behavior (return all)
        sortBy = 'name',
        sortOrder = 'asc'
    } = validated;

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

        return { models, total };
    }

    /**
     * Get a single model by ID with all relations
     * @param {string} id - Model ID
     * @returns {Promise<Model|null>}
     */
    async function getModelById(id) {
        return await prisma.model.findUnique({
            where: { id },
            include: {
                files: true,
                tags: {
                    include: { tag: true }
                },
                collection: true
            }
        });
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

            // Update simple fields if provided
            const simpleUpdates = {};
            if (typeof updates.isPrinted === 'boolean') simpleUpdates.isPrinted = updates.isPrinted;
            if (typeof updates.isFavorite === 'boolean') simpleUpdates.isFavorite = updates.isFavorite;
            if (typeof updates.hidden === 'boolean') simpleUpdates.hidden = updates.hidden;
            if (updates.category) simpleUpdates.category = updates.category;
            if (updates.license !== undefined) simpleUpdates.license = updates.license;
            if (updates.designer !== undefined) simpleUpdates.designer = updates.designer;
            if (updates.source !== undefined) simpleUpdates.source = updates.source; // Check schema if this maps to a field
            if (updates.price !== undefined) simpleUpdates.price = updates.price;
            if (updates.printTime !== undefined) simpleUpdates.printTime = updates.printTime;
            if (updates.filamentUsage !== undefined) simpleUpdates.filamentUsage = updates.filamentUsage;
            if (updates.metadata) simpleUpdates.metadata = JSON.stringify(updates.metadata);

            if (Object.keys(simpleUpdates).length > 0) {
                const result = await tx.model.updateMany({
                    where: { id: { in: modelIds } },
                    data: simpleUpdates
                });
                updatedCount = result.count;
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
        return await prisma.model.findMany({
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
