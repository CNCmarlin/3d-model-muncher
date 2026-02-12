/**
 * DATABASE-FIRST Collection Type
 * Matches Prisma schema - hierarchical folder structure
 */

import type { Model } from './model_db';

export interface Collection {
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
    models?: Model[];
    children?: Collection[]; // Nested subcollections
    parent?: Collection;
    _count?: {
        models: number;
    };
}

/**
 * Collection tree node (recursive)
 */
export interface CollectionTreeNode extends Collection {
    children: CollectionTreeNode[];
}

/**
 * Query parameters for GET /api/collections
 */
export interface CollectionQueryParams {
    parentId?: string | null;
    includeModels?: boolean;
    includeChildren?: boolean;
    includeCount?: boolean;
    flattenHierarchy?: boolean;
}

/**
 * Form data for creating/updating collections
 */
export interface CollectionFormData {
    name: string;
    parentId?: string | null;
    description?: string;
    coverImage?: string;
    modelIds?: string[];
}

/**
 * Move collection operation
 */
export interface MoveCollectionData {
    collectionId: string;
    newParentId: string | null;
}
