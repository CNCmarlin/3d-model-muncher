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

export type Collection = Omit<StrictCollection_db, 'name' | 'description' | 'coverImagePath' | 'type' | 'createdAt' | 'updatedAt'> & {
    // Legacy Overrides & Permissive Types for Frontend
    name: string;
    description?: string;
    modelIds?: string[];
    childCollectionIds?: string[];
    path?: string;
    pathHash?: string | null;
    parentId?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
    coverModelId?: string;
    coverImage?: string | null;
    images?: string[];
    documents?: string[];
    category?: string;
    tags?: string[];
    type?: 'folder' | 'project' | 'standard';
    buildPlates?: any[];
    metadata?: any;
    coverImagePath?: string | null;
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
