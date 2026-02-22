/**
 * DATABASE-FIRST Collection Type
 * Matches Prisma schema - hierarchical folder structure
 */

import type { Model_db } from './model_db';

export interface StrictCollection_db {
    id: string;
    name: string;
    parentId: string | null; // FK to parent collection (null = root)
    path: string | null;
    pathHash: string | null;
    description: string | null;
    coverImage: string | null;
    modelIds: string[]; // JSON array of model IDs
    createdAt: Date;
    updatedAt: Date;

    // Relations (populated when included)
    models?: Model_db[];
    children?: collection_db[]; // Nested subcollections
    parent?: collection_db;
    _count?: {
        models: number;
    };
}

export type Collection = StrictCollection_db & {
    // Legacy Overrides (Phase 1 Migration Bridge)
    buildPlates?: any[];
    images?: Array<{ id: string; url: string; isCover?: boolean } | string>;
    metadata?: any;
    documents?: any[];
    coverImagePath?: string | null;
    type?: string;
    tags?: string[];
};

export type collection_db = Collection;

/**
 * Collection tree node (recursive)
 */
export type CollectionTreeNode_db = Collection & {
    children: CollectionTreeNode_db[];
};

export type CollectionTreeNode = CollectionTreeNode_db;

/**
 * Query parameters for GET /api/collections
 */
export interface CollectionQueryParams_db {
    parentId?: string | null;
    includeModels?: boolean;
    includeChildren?: boolean;
    includeCount?: boolean;
    flattenHierarchy?: boolean;
}

/**
 * Form data for creating/updating collections
 */
export interface CollectionFormData_db {
    name: string;
    parentId?: string | null;
    description?: string;
    coverImage?: string;
    modelIds?: string[];
}

/**
 * Move collection operation
 */
export interface MoveCollectionData_db {
    collectionId: string;
    newParentId: string | null;
}
