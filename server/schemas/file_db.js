const { z } = require('zod');

// File Schema (matching Prisma model)
const FileSchema = z.object({
    id: z.string().cuid().optional(),
    modelId: z.string().cuid(),
    filename: z.string().min(1),
    filePath: z.string().min(1), // Relative path
    size: z.number().int().nonnegative().optional(), // BigInt handling needed in service
    isPrimary: z.boolean().default(false),
    isSupported: z.boolean().default(false),
    createdAt: z.date().optional()
});

const FileSyncSchema = z.object({
    modelId: z.string().cuid(),
    files: z.array(z.object({
        filename: z.string(),
        filePath: z.string(),
        size: z.number().optional()
    }))
});

module.exports = {
    FileSchema,
    FileSyncSchema
};
