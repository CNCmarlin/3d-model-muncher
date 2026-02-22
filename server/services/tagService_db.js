const prisma = require('../../server-utils/db');
const { TagSchema, BulkAssignSchema } = require('../schemas/index_db');

/**
 * DATABASE VERSION: Tag Service
 * Handles tag-related database operations
 */

/**
 * Get all tags with model counts
 * @returns {Promise<Tag[]>}
 */
async function getAllTags() {
    const tags = await prisma.tag.findMany({
        include: {
            _count: {
                select: { models: true }
            }
        },
        orderBy: {
            name: 'asc'
        }
    });

    return tags.map(tag => ({
        ...tag,
        count: tag._count.models
    }));
}

/**
 * Get or create a tag by name
 * @param {string} name 
 * @returns {Promise<Tag>}
 */
async function createTag(name) {
    // Validate
    const validated = TagSchema.pick({ name: true }).parse({ name });

    return await prisma.tag.upsert({
        where: { name: validated.name },
        update: {},
        create: { name: validated.name }
    });
}

/**
 * Bulk assign/remove tags for multiple models
 * @param {Object} bulkData - verified against BulkAssignSchema
 * @returns {Promise<{updated: number}>}
 */
async function bulkAssignTags(bulkData) {
    const validated = BulkAssignSchema.parse(bulkData);
    const { modelIds, tags } = validated;
    const { add = [], remove = [] } = tags;

    if (modelIds.length === 0) return { updated: 0 };
    if (add.length === 0 && remove.length === 0) return { updated: 0 };

    return await prisma.$transaction(async (tx) => {
        // 1. ADD TAGS
        if (add.length > 0) {
            // Ensure tags exist
            const tagRecords = [];
            for (const tagName of add) {
                const tag = await tx.tag.upsert({
                    where: { name: tagName },
                    update: {},
                    create: { name: tagName }
                });
                tagRecords.push(tag);
            }

            // Create ModelTag relations
            for (const modelId of modelIds) {
                for (const tag of tagRecords) {
                    await tx.modelTag.upsert({
                        where: {
                            modelId_tagId: { modelId, tagId: tag.id }
                        },
                        update: {},
                        create: { modelId, tagId: tag.id }
                    });
                }
            }
        }

        // 2. REMOVE TAGS
        if (remove.length > 0) {
            const tagsToRemove = await tx.tag.findMany({
                where: { name: { in: remove } }
            });

            if (tagsToRemove.length > 0) {
                await tx.modelTag.deleteMany({
                    where: {
                        modelId: { in: modelIds },
                        tagId: { in: tagsToRemove.map(t => t.id) }
                    }
                });
            }
        }

        return { updated: modelIds.length };
    });
}

module.exports = {
    getAllTags,
    createTag,
    bulkAssignTags
};
