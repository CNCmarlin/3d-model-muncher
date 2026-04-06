import { Model_db } from '@/types/model_db';

/**
 * DB-FIRST model identity factory.
 * Use this in importers, manual uploads, and integrity checks.
 * Returns a Model_db-shaped stub — no munchie/sidecar fields.
 */
export function createStandardModelIdentity(overrides: Partial<Model_db>): Model_db {
    const description = overrides.description ?? null;
    const name = overrides.name || "New_Project";

    return {
        id: crypto.randomUUID(),
        collectionId: overrides.collectionId ?? '',
        name,
        description,
        category: overrides.category ?? "Uncategorized",
        license: overrides.license ?? "Unknown",
        designer: overrides.designer ?? null,
        source: overrides.source ?? null,
        notes: overrides.notes ?? null,
        modelUrl: overrides.modelUrl ?? null,
        price: overrides.price ?? null,
        printTime: overrides.printTime ?? null,
        filamentUsage: overrides.filamentUsage ?? null,
        isPrinted: overrides.isPrinted ?? false,
        isFavorite: overrides.isFavorite ?? false,
        isDeleted: overrides.isDeleted ?? false,
        isComponent: overrides.isComponent ?? false,
        isHidden: overrides.isHidden ?? false,
        pathHash: overrides.pathHash ?? null,
        thumbnailPath: overrides.thumbnailPath ?? null,
        filePath: overrides.filePath ?? undefined,
        createdAt: overrides.createdAt ?? new Date(),
        updatedAt: overrides.updatedAt ?? new Date(),
        // Relations — empty by default, populated by API
        files: overrides.files ?? [],
        images: overrides.images ?? [],
        tags: overrides.tags ?? [],
        ...overrides
    } as Model_db;
}