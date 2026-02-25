import type { License } from '@/constants/licenses';
import type { Collection } from './collection_db';

/**
 * DATABASE-FIRST Model Type
 * Matches Prisma schema exactly - used when useDatabaseBackend=true
 * 
 * Key differences from legacy:
 * - collectionId (single) instead of collections (array)
 * - Proper relations: files[], tags[], collection
 * - No redundant fields (thumbnail, images) - use files relation
 * - Metadata stored as JSON, not flattened
 */

export interface ModelFile_db {
    id: string;
    modelId: string;
    fileName: string;
    filePath: string;
    fileType: 'stl' | '3mf' | 'obj' | 'gcode' | 'image' | 'other';
    size: number;
    isPrimary: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface ModelRelatedFile_db {
    id: string;
    modelId: string;
    path: string;
}

export interface ModelImage_db {
    id: string;
    modelId: string;
    path: string;
    source: 'gallery' | 'thumbnail' | 'user';
    sourceFile?: string | null;
    order: number;
}

export interface Tag_db {
    id: number;
    name: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface ModelTag_db {
    modelId: string;
    tagId: number;
    tag?: Tag_db; // Populated when included
}

export interface StrictModel_db {
    // Core Identity
    id: string;
    collectionId: string; // Single FK - model belongs to ONE collection
    name: string;

    // Metadata
    description: string | null;
    license: License | string | null;
    designer: string | null;
    source: string | null;
    notes: string | null;

    // Promoted from metadata (Batch 1)
    category: string | null;
    modelUrl: string | null;
    price: number | null;

    // Promoted from metadata (Batch 2 - print settings)
    layerHeight: string | null;
    infill: string | null;
    nozzle: string | null;
    printer: string | null;
    material: string | null;
    fileSize: string | null;
    // Promoted from metadata (Batch 3 - G-code Analysis)
    gcodeFilePath: string | null;
    gcodePrintTime: string | null;
    gcodeTotalWeight: string | null;
    gcodeFilaments: string | null; // JSON array of filament data

    // Virtual convenience objects (computed in dbAdapter, NOT a DB column)
    printSettings?: {
        layerHeight: string;
        infill: string;
        nozzle: string;
        printer: string;
        material: string;
    };
    gcodeData?: {
        gcodeFilePath: string | null;
        printTime: string | null;
        totalFilamentWeight: string | null;
        filaments: any[];
    };

    // Print Stats
    printTime: number | null; // Seconds
    filamentUsage: number | null; // Grams
    isPrinted: boolean;
    isFavorite: boolean;
    isHidden: boolean; // maps to is_hidden in Prisma schema

    // File System
    pathHash: string | null; // Unique file system identifier
    thumbnailPath: string | null; // Database column for thumbnail path

    // Soft Delete
    isDeleted: boolean;

    // Component Flag (replaces legacy isProjectRoot/isRelatedPart)
    isComponent: boolean; // maps to is_component in Prisma schema

    // Timestamps
    createdAt: Date;
    updatedAt: Date;

    // Relations (populated when included in query)
    files?: ModelFile_db[]; // All associated files
    relatedFiles?: ModelRelatedFile_db[]; // Batch 4
    images?: ModelImage_db[]; // Batch 5 — gallery, thumbnails, user images
    tags?: ModelTag_db[]; // Many-to-many via join table
    collection?: Collection; // Parent collection

    // Extended Metadata (JSON blob for flexibility)
    metadata?: {
        price?: number;
        hidden?: boolean;
        isRelatedPart?: boolean;
        isProjectRoot?: boolean;
        category?: string;
        related_files?: string[];
        userDefined?: {
            description?: string;
            images?: Array<string | { id: string; data: string }>;
            imageOrder?: string[];
            [key: string]: any;
        };
        [key: string]: any;
    };
}


export type Model_db = Omit<StrictModel_db, 'filePath' | 'thumbnailPath'> & {
    // Legacy Overrides (Phase 1 Migration Bridge)
    filePath?: string;
    thumbnail?: string;
    images?: string[];
    parsedImages?: string[];
    gallery?: string[];
    thumbnails?: Record<string, string[]>;
    userDefined?: Record<string, any>;
    collections?: string[];
    hidden?: boolean;
    related_files?: string[];
    excludedCollections?: string[];
    filamentUsed?: string;
    fileSize?: string;
    printSettings?: Record<string, any>;
    gcodeData?: Record<string, any>;
    thumbnailPath?: string | null;
};

// Ensure any rogue legacy imports still work during transition
export type Model = Model_db;

/** Aggregated tag info used in tag manager / settings */
export interface TagInfo {
    name: string;
    count: number;
    models: Model_db[];
}

/**
 * Query Parameters for GET /api/models
 */
export interface ModelQueryParams_db {
    search?: string;
    tags?: string[];
    collectionId?: string;
    isPrinted?: boolean;
    isFavorite?: boolean;
    isDeleted?: boolean;
    includeFiles?: boolean;
    includeTags?: boolean;
    includeCollection?: boolean;
    page?: number;
    limit?: number;
    sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'printTime' | 'filamentUsage';
    sortOrder?: 'asc' | 'desc';
}

/**
 * Form data for creating/updating models
 */
export interface ModelFormData_db {
    name: string;
    description?: string;
    license?: string;
    designer?: string;
    source?: string;
    notes?: string;
    printTime?: number;
    filamentUsage?: number;
    isPrinted?: boolean;
    isFavorite?: boolean;
    tags?: string[];
    metadata?: Record<string, any>;
}

/**
 * Bulk edit operations
 */
export interface BulkEditData_db {
    modelIds: string[];
    updates: {
        isPrinted?: boolean;
        isFavorite?: boolean;
        tags?: {
            add?: string[];
            remove?: string[];
        };
        metadata?: Record<string, any>;
    };
}
