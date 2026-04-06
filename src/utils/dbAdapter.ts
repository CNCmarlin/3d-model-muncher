import type { Collection as DbCollection } from '@/types/collection_db';
import type { Model as LegacyModel } from '@/types/model';
import type { Model as DbModel } from '@/types/model_db';

/**
 * DATABASE API ADAPTER
 * Temporary bridge between database-first API and legacy frontend components
 * 
 * Purpose: Allow existing components to work while we incrementally migrate
 * to database-first types (Phase 3.4).
 * 
 * TODO (Phase 3.4): Remove this adapter and update components to use database types directly
 */

/**
 * Transform database Model to legacy Model format
 */
export function adaptDbModelToLegacy(dbModel: DbModel): LegacyModel {
    // CRITICAL: Parse metadata JSON string from database
    let parsedMetadata: any = {};
    try {
        if (dbModel.metadata && typeof dbModel.metadata === 'string') {
            parsedMetadata = JSON.parse(dbModel.metadata);
        } else if (dbModel.metadata && typeof dbModel.metadata === 'object') {
            parsedMetadata = dbModel.metadata; // Already parsed
        }
    } catch (e) {
        console.error('[dbAdapter] Failed to parse metadata for model:', dbModel.id, e);
    }

    return ({
        // Identity
        id: dbModel.id,
        name: dbModel.name,
        filePath: dbModel.modelUrl?.replace(/^\/models\//, '') || dbModel.pathHash || '',

        // Collections (KEY TRANSFORM: single → array)
        collections: dbModel.collectionId ? [dbModel.collectionId] : [],
        excludedCollections: [],

        // Tags: handle both formats — already-flattened string[] from server OR raw ModelTag[] from Prisma
        tags: dbModel.tags?.map((mt: any) => typeof mt === 'string' ? mt : mt.tag?.name || mt?.name || '').filter(Boolean) || [],

        // Print stats (Batch 2 promoted columns)
        isPrinted: dbModel.isPrinted,
        printTime: dbModel.printTime ?? 0,
        filamentUsage: dbModel.filamentUsage ?? 0,
        filamentUsed: dbModel.filamentUsage ? String(dbModel.filamentUsage) : '',

        // Promoted columns (Batch 1+)
        description: dbModel.description || '',
        license: dbModel.license || '',
        designer: dbModel.designer ?? undefined,
        notes: dbModel.notes || undefined,
        source: dbModel.source || undefined,
        category: dbModel.category || '',

        // Images - Reconstruct from ModelImage relation (Batch 5), fall back to metadata
        thumbnail: parsedMetadata.thumbnail || (dbModel.thumbnailPath ? `/models/${dbModel.thumbnailPath}` : undefined),
        parsedImages: (() => {
            // DB-first: build parsedImages from ModelImage rows (source: 'thumbnail') with embedded priority.
            // '-embedded-thumb' in path = extracted from 3MF. Sort these first so resolveModelThumbnail
            // returns the embedded image as parsedImages[0] (the cover thumbnail).
            if (dbModel.images && dbModel.images.length > 0) {
                const thumbImages = (dbModel.images as any[])
                    .filter(img => img.source === 'thumbnail')
                    .sort((a, b) => {
                        const aIsEmbedded = (a.path || '').includes('-embedded-thumb');
                        const bIsEmbedded = (b.path || '').includes('-embedded-thumb');
                        if (aIsEmbedded && !bIsEmbedded) return -1; // embedded first
                        if (!aIsEmbedded && bIsEmbedded) return 1;
                        return a.order - b.order; // preserve insertion order otherwise
                    });
                if (thumbImages.length > 0) {
                    return thumbImages.map(img =>
                        img.path.startsWith('/') ? img.path : `/models/${img.path}`
                    );
                }
            }
            // Fallback: legacy parsedImages from JSON blob, then thumbnailPath column
            if (parsedMetadata.parsedImages?.length) return parsedMetadata.parsedImages;
            if (dbModel.thumbnailPath) return [`/models/${dbModel.thumbnailPath}`];
            return [];
        })(),
        images: (() => {
            // Batch 5: Reconstruct flat images list from ALL ModelImage rows (gallery + thumbnails)
            if (dbModel.images && dbModel.images.length > 0) {
                return dbModel.images
                    .sort((a: any, b: any) => a.order - b.order)
                    .map((img: any) => img.path);
            }
            return parsedMetadata.images || [];
        })(),

        // modelUrl — Batch 1 promoted column, fallback to deriving from files
        modelUrl: (() => {
            if (dbModel.modelUrl) return dbModel.modelUrl;
            if (!dbModel.files || dbModel.files.length === 0) return '';
            const isModelFile = (f: any) => { const ext = f.filename?.toLowerCase().split('.').pop(); return ext === 'stl' || ext === '3mf'; };
            const primaryFile = dbModel.files?.find((f: any) => f.isPrimary && isModelFile(f));
            const modelFile = primaryFile || dbModel.files?.find(isModelFile);
            return modelFile ? `/models/${modelFile.filePath}` : '';
        })(),

        // Batch 2: Print settings from DB columns
        layerHeight: dbModel.layerHeight || null,
        infill: dbModel.infill || null,
        nozzle: dbModel.nozzle || null,
        printer: dbModel.printer || null,
        material: dbModel.material || null,
        fileSize: dbModel.fileSize || (() => {
            const isModelFile = (f: any) => {
                const ext = f.filename?.toLowerCase().split('.').pop();
                return ext === 'stl' || ext === '3mf';
            };
            const primaryFile = dbModel.files?.find((f: any) => f.isPrimary && isModelFile(f));
            const modelFile = primaryFile || dbModel.files?.find(isModelFile);
            if (!modelFile || !modelFile.size) return null;
            if (modelFile.size < 1024 * 1024) {
                const sizeInKB = (modelFile.size / 1024).toFixed(0);
                return `${sizeInKB} KB`;
            }
            const sizeInMB = (modelFile.size / (1024 * 1024)).toFixed(1);
            return `${sizeInMB} MB`;
        })(),
        // Virtual printSettings object — built from flat columns for backward compat
        printSettings: {
            layerHeight: dbModel.layerHeight || '',
            infill: dbModel.infill || '',
            nozzle: dbModel.nozzle || '',
            printer: dbModel.printer || '',
            material: dbModel.material || '',
        },

        // Promoted columns
        price: dbModel.price ?? null,
        hidden: (dbModel as any).isHidden ?? false,
        isRelatedPart: (dbModel as any).isComponent ?? false,
        isProjectRoot: dbModel.isMainModel ?? (!(dbModel as any).isComponent && (dbModel.modelUrl?.replace(/^\/models\//, '') || '').includes('/')),
        related_files: dbModel.relatedFiles?.map((rf: any) => rf.path) || [],

        // Batch 5: Reconstruct gallery and thumbnails map from ModelImage relation
        gallery: (() => {
            if (dbModel.images && dbModel.images.length > 0) {
                return dbModel.images
                    .filter((img: any) => img.source === 'gallery')
                    .sort((a: any, b: any) => a.order - b.order)
                    .map((img: any) => img.path);
            }
            return parsedMetadata.gallery || [];
        })(),
        thumbnails: (() => {
            if (dbModel.images && dbModel.images.length > 0) {
                const thumbMap: Record<string, string[]> = {};
                for (const img of dbModel.images as any[]) {
                    if (img.source === 'thumbnail' && img.sourceFile) {
                        if (!thumbMap[img.sourceFile]) thumbMap[img.sourceFile] = [];
                        thumbMap[img.sourceFile].push(img.path);
                    }
                }
                return thumbMap;
            }
            return parsedMetadata.thumbnails || {};
        })(),

        hash: undefined,
        userDefined: parsedMetadata.userDefined as any,

        // G-code data reconstruction (Batch 3 promoted columns)
        gcodeData: (dbModel.gcodeFilePath || dbModel.gcodePrintTime) ? {
            gcodeFilePath: dbModel.gcodeFilePath,
            printTime: dbModel.gcodePrintTime,
            totalFilamentWeight: dbModel.gcodeTotalWeight,
            filaments: (() => {
                const raw = dbModel.gcodeFilaments;
                try {
                    return raw ? JSON.parse(raw) : [];
                } catch (e) { return []; }
            })()
        } : undefined,

        // Timestamps from DB columns
        created: dbModel.createdAt,
        lastModified: dbModel.updatedAt,
        lastScanned: dbModel.updatedAt,
    }) as unknown as LegacyModel;
}

/**
 * Transform database Collection to legacy Collection format
 */
export function adaptDbCollectionToLegacy(dbCollection: DbCollection): any {
    return {
        id: dbCollection.id,
        name: dbCollection.name,
        parentId: dbCollection.parentId,
        path: dbCollection.path,
        pathHash: dbCollection.pathHash,
        description: dbCollection.description,
        coverImage: ((dbCollection as any).coverImagePath || dbCollection.coverImage)
            ? (() => {
                const path = (dbCollection as any).coverImagePath || dbCollection.coverImage;
                if (path.startsWith('/') || path.startsWith('http')) return path;
                if (path.startsWith('images/') || path.startsWith('documents/')) return `/api/${path}`;
                return `/models/${path}`;
            })()
            : undefined,
        modelIds: dbCollection.modelIds,
        createdAt: dbCollection.createdAt,
        updatedAt: dbCollection.updatedAt,
        models: (dbCollection as any).models?.map(adaptDbModelToLegacy),
        children: (dbCollection as any).children?.map(adaptDbCollectionToLegacy),
        parent: (dbCollection as any).parent ? adaptDbCollectionToLegacy((dbCollection as any).parent) : undefined,
        _count: (dbCollection as any)._count,
        tags: [], // Collections don't have tags in database schema
        totalModels: (dbCollection as any)._count?.models || 0, // For UI display
        images: (() => {
            try {
                const meta = JSON.parse((dbCollection as any).metadata || '{}');
                return (meta.images || []).map((p: string) => {
                    if (p.startsWith('/') || p.startsWith('http')) return p;
                    if (p.startsWith('images/')) return `/api/${p}`;
                    return `/models/${p}`;
                });
            } catch (e) { return []; }
        })(),
        documents: (() => {
            try {
                const meta = JSON.parse((dbCollection as any).metadata || '{}');
                return (meta.documents || []).map((p: string) => {
                    if (p.startsWith('/') || p.startsWith('http')) return p;
                    if (p.startsWith('documents/')) return `/api/${p}`;
                    return `/models/${p}`;
                });
            } catch (e) { return []; }
        })()
    };
}

/**
 * Batch transform models array
 */
export function adaptDbModelsToLegacy(dbModels: DbModel[]): LegacyModel[] {
    return dbModels.map(adaptDbModelToLegacy);
}

/**
 * Batch transform collections array
 */
export function adaptDbCollectionsToLegacy(dbCollections: DbCollection[]): any[] {
    return dbCollections.map(adaptDbCollectionToLegacy);
}
