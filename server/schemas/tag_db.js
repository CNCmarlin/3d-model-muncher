const { z } = require('zod');

// Tag Schema (matching Prisma model)
const TagSchema = z.object({
    id: z.number().int().optional(), // Optional for creation
    name: z.string().min(1).max(50),
    _count: z.object({
        models: z.number().int().optional()
    }).optional()
});

// Bulk Assign Schema
const BulkAssignSchema = z.object({
    modelIds: z.array(z.string().uuid().or(z.string().cuid())),
    tags: z.object({
        add: z.array(z.string()).optional(),
        remove: z.array(z.string()).optional()
    }),
    createMissing: z.boolean().default(true) // Whether to create tags that don't exist
});

module.exports = {
    TagSchema,
    BulkAssignSchema
};
