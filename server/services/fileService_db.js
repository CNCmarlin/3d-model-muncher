const prisma = require('../../server-utils/db');
const { FileSchema, FileSyncSchema } = require('../schemas/index_db');

/**
 * DATABASE VERSION: File Service
 * Handles model file-related database operations
 */

/**
 * Get all files for a model
 * @param {string} modelId
 * @returns {Promise<ModelFile[]>}
 */
async function getFilesForModel(modelId) {
    const files = await prisma.modelFile.findMany({
        where: { modelId },
        orderBy: { filename: 'asc' }
    });

    // Convert BigInt size to Number
    return files.map(f => ({
        ...f,
        size: f.size ? Number(f.size) : null
    }));
}

/**
 * Upsert a file record (used by File Watcher)
 * Uses find-first-then-update-or-create since ModelFile has no
 * @@unique([modelId, filename]) composite constraint.
 * @param {Object} fileData
 * @returns {Promise<ModelFile>}
 */
async function upsertFile(fileData) {
    const { modelId, filename, filePath, size, isPrimary, isSupported } = fileData;

    const existing = await prisma.modelFile.findFirst({
        where: { modelId, filename }
    });

    if (existing) {
        return await prisma.modelFile.update({
            where: { id: existing.id },
            data: {
                size: size ? BigInt(size) : null,
                filePath,
                isSupported: isSupported !== undefined ? !!isSupported : existing.isSupported
            }
        });
    }

    return await prisma.modelFile.create({
        data: {
            modelId,
            filename,
            filePath,
            size: size ? BigInt(size) : null,
            isPrimary: !!isPrimary,
            isSupported: !!isSupported
        }
    });
}

/**
 * Sync files for a model (Reconciliation)
 * Removes files in DB that are not in the provided list
 * @param {Object} syncData - { modelId, files: [{ filename, filePath, size }] }
 */
async function syncFilesForModel(syncData) {
    const validated = FileSyncSchema.parse(syncData);
    const { modelId, files } = validated;

    return await prisma.$transaction(async (tx) => {
        // 1. Get existing files
        const existingFiles = await tx.modelFile.findMany({
            where: { modelId }
        });

        const incomingFilenames = new Set(files.map(f => f.filename));
        const existingFilenames = new Set(existingFiles.map(f => f.filename));

        // 2. Identify deletions
        const toDelete = existingFiles.filter(f => !incomingFilenames.has(f.filename));
        if (toDelete.length > 0) {
            await tx.modelFile.deleteMany({
                where: {
                    id: { in: toDelete.map(f => f.id) }
                }
            });
        }

        // 3. Upsert incoming
        for (const file of files) {
            const existing = existingFiles.find(f => f.filename === file.filename);
            const fileData = {
                modelId,
                filename: file.filename,
                filePath: file.filePath,
                size: file.size ? BigInt(file.size) : null,
                isSupported: file.filename.toLowerCase().endsWith('.stl') || file.filename.toLowerCase().endsWith('.3mf') // Simple logic
            };

            if (existing) {
                await tx.modelFile.update({
                    where: { id: existing.id },
                    data: {
                        size: fileData.size,
                        filePath: fileData.filePath
                    }
                });
            } else {
                await tx.modelFile.create({
                    data: {
                        ...fileData,
                        isPrimary: false // Default to false
                    }
                });
            }
        }

        return {
            deleted: toDelete.length,
            upserted: files.length
        };
    });
}

/**
 * Set a file as primary
 * @param {string} fileId
 * @param {string} modelId
 */
async function setPrimaryFile(fileId, modelId) {
    return await prisma.$transaction(async (tx) => {
        // Unset all others
        await tx.modelFile.updateMany({
            where: { modelId },
            data: { isPrimary: false }
        });

        // Set new primary
        return await tx.modelFile.update({
            where: { id: fileId },
            data: { isPrimary: true }
        });
    });
}

module.exports = {
    getFilesForModel,
    upsertFile,
    syncFilesForModel,
    setPrimaryFile
};
