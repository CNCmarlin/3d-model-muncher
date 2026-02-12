import type { Model as LegacyModel } from '../types/model';
import type { Collection as DbCollection, Model as DbModel } from '../types/model_db';

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

    return {
        // Identity
        id: dbModel.id,
        name: dbModel.name,
        filePath: parsedMetadata.filePath || dbModel.pathHash || '', // Prefer metadata filePath

        // Collections (KEY TRANSFORM: single → array)
        collections: dbModel.collectionId ? [dbModel.collectionId] : (parsedMetadata.collections || []),
        excludedCollections: parsedMetadata.excludedCollections || [], // From metadata

        // Tags (transform relation to string array)
        tags: dbModel.tags?.map((mt: any) => mt.tag?.name).filter(Boolean) || [],

        // Print stats
        isPrinted: dbModel.isPrinted,
        printTime: dbModel.printTime ? String(dbModel.printTime) : (parsedMetadata.printTime || ''),
        filamentUsed: dbModel.filamentUsage ? String(dbModel.filamentUsage) : (parsedMetadata.filamentUsed || ''),

        // Metadata - NOW READING FROM PARSED METADATA!
        description: dbModel.description || '',
        license: dbModel.license || '',
        designer: dbModel.designer ?? undefined,
        notes: parsedMetadata.notes ?? undefined,
        source: parsedMetadata.source ?? undefined,
        category: parsedMetadata.category || '', // ← FIX: Read from parsed metadata!
        printSettings: parsedMetadata.printSettings || {  // ← CRITICAL FIX: Extract printSettings!
            layerHeight: '',
            infill: '',
            nozzle: '',
            printer: '',
            material: ''
        },

        // Images - Use metadata parsedImages if available
        thumbnail: parsedMetadata.thumbnail || (dbModel.coverImagePath ? `/models/${dbModel.coverImagePath}` : undefined),
        parsedImages: parsedMetadata.parsedImages || (dbModel.coverImagePath ? [`/models/${dbModel.coverImagePath}`] : []),
        images: parsedMetadata.images || [], // From metadata

        // File system - construct modelUrl from files relation
        // Find primary file (STL/3MF) or use first file
        modelUrl: (() => {
            // Prefer metadata modelUrl first
            if (parsedMetadata.modelUrl) return parsedMetadata.modelUrl;

            if (!dbModel.files || dbModel.files.length === 0) return '';

            // Helper to check if file is a model file (STL/3MF)
            const isModelFile = (f: any) => {
                const ext = f.filename?.toLowerCase().split('.').pop();
                return ext === 'stl' || ext === '3mf';
            };

            const primaryFile = dbModel.files?.find((f: any) => f.isPrimary && isModelFile(f));
            const modelFile = primaryFile || dbModel.files?.find(isModelFile);

            return modelFile ? `/models/${modelFile.filePath}` : '';
        })(),
        fileSize: (() => {
            // Prefer metadata fileSize first
            if (parsedMetadata.fileSize) return parsedMetadata.fileSize;

            const isModelFile = (f: any) => {
                const ext = f.filename?.toLowerCase().split('.').pop();
                return ext === 'stl' || ext === '3mf';
            };

            const primaryFile = dbModel.files?.find((f: any) => f.isPrimary && isModelFile(f));
            const modelFile = primaryFile || dbModel.files?.find(isModelFile);
            if (!modelFile) return '';
            const sizeInMB = (modelFile.size / (1024 * 1024)).toFixed(1);
            return `${sizeInMB} MB`;
        })(),

        // Extended fields from metadata
        price: parsedMetadata.price,
        hidden: parsedMetadata.hidden,
        isRelatedPart: parsedMetadata.isRelatedPart,
        isProjectRoot: parsedMetadata.isProjectRoot,
        related_files: parsedMetadata.related_files,
        hash: parsedMetadata.hash,
        userDefined: parsedMetadata.userDefined as any,

        // G-code data from metadata
        gcodeData: parsedMetadata.gcodeData,

        // Timestamps from metadata
        created: parsedMetadata.created,
        lastModified: parsedMetadata.lastModified,
        lastScanned: parsedMetadata.lastScanned,
    };
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
        coverImage: dbCollection.coverImagePath
            ? (dbCollection.coverImagePath.startsWith('/') || dbCollection.coverImagePath.startsWith('http')
                ? dbCollection.coverImagePath
                : `/models/${dbCollection.coverImagePath}`)
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
