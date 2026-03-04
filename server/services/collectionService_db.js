const fs = require('fs');
const path = require('path');
const prisma = require('../../server-utils/db');
const { getAbsoluteModelsPath } = require('../../server-utils/dataAccess');

/**
 * DATABASE VERSION: Collection Service
 * Handles hierarchical collection operations using Prisma
 * Collections represent folder structure for organizing models
 */

// Helper to unpack metadata for frontend parity
function unpackCollectionMetadata(c) {
  let meta = {};
  if (c.metadata) {
    try {
      meta = typeof c.metadata === 'string' ? JSON.parse(c.metadata) : c.metadata;
    } catch (e) { }
  }
  return {
    ...c,
    modelIds: c.models ? c.models.map(m => m.id) : [],
    images: c.images || meta.images || [],
    documents: c.documents || meta.documents || [],
    metadata: meta
  };
}

/**
 * Get all collections with optional hierarchy flattening
 * @param {Object} options - Query options
 * @returns {Promise<Collection[]>}
 */
async function getAllCollections(options = {}) {
  const {
    parentId = undefined, // Filter by parent (undefined = root level)
    includeModels = false,
    includeChildren = false,
    includeCount = true, // Always include model counts by default
    flattenHierarchy = false
  } = options;

  const include = {
    // Always include model IDs for frontend compatibility
    models: { select: { id: true } },
    ...(includeModels && { models: true }), // Full models if explicitly requested
    ...(includeChildren && {
      children: {
        include: {
          _count: includeCount ? { select: { models: true } } : undefined
        }
      }
    }),
    ...(includeCount && { _count: { select: { models: true } } })
  };

  if (flattenHierarchy) {
    // Return all collections regardless of hierarchy
    const collections = await prisma.collection.findMany({
      include,
      orderBy: { name: 'asc' }
    });

    return collections.map(unpackCollectionMetadata);
  }

  // Return collections filtered by parent
  const where = parentId === null
    ? { parentId: null } // Root level
    : parentId
      ? { parentId } // Specific parent
      : {}; // All if undefined

  const collections = await prisma.collection.findMany({
    where,
    include,
    orderBy: { name: 'asc' }
  });

  return collections.map(unpackCollectionMetadata);
}

/**
 * Get collection by ID with all relations
 * @param {string} id - Collection ID
 * @returns {Promise<Collection|null>}
 */
async function getCollectionById(id) {
  const c = await prisma.collection.findUnique({
    where: { id },
    include: {
      models: true,
      children: {
        include: {
          _count: { select: { models: true } }
        }
      },
      parent: true,
      _count: { select: { models: true } }
    }
  });
  return c ? unpackCollectionMetadata(c) : null;
}

/**
 * Get collection tree structure (recursive hierarchy)
 * @param {string|null} parentId - Starting point (null = root)
 * @returns {Promise<Collection[]>} - Collections with nested children
 */
async function getCollectionTree(parentId = null) {
  // Single query: fetch ALL collections, then build tree in memory
  const allCollections = await prisma.collection.findMany({
    include: {
      models: { select: { id: true } },
      _count: { select: { models: true } }
    },
    orderBy: { name: 'asc' }
  });

  // Map models relation to modelIds array and unpack metadata
  const mappedCollections = allCollections.map(unpackCollectionMetadata);

  // Build lookup map: parentId -> children[]
  const childrenMap = new Map();
  for (const col of mappedCollections) {
    const key = col.parentId || null;
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    childrenMap.get(key).push(col);
  }

  // Recursive tree builder using the map (no additional DB queries)
  function buildTree(pId) {
    const children = childrenMap.get(pId) || [];
    return children.map(col => ({
      ...col,
      children: buildTree(col.id)
    }));
  }

  return buildTree(parentId);
}

/**
 * Create a new collection
 * Database First Approach: Create DB record, optionally sync to disk
 * @param {Object} data
 * @returns {Promise<Collection>}
 */
async function createCollection(data) {
  const { name, parentId, coverImagePath, coverImage, pathHash: providedHash, path: providedPath, createOnDisk, type, category, metadata, images, description } = data;

  let finalPathHash = providedHash || null;
  const finalCoverImagePath = coverImagePath || coverImage || null;

  // Case 1: Import Existing Folder (Path provided)
  if (providedPath && !finalPathHash) {
    // Generate hash from provided path
    // Normalize: remove leading slashes, use forward slashes
    const normalized = providedPath.replace(/^(\/|\\)+/, '').replace(/\\/g, '/');
    finalPathHash = Buffer.from(normalized).toString('base64');
  }

  // Case 2: Create New Physical Folder
  if (createOnDisk) {
    try {
      const modelsDir = getAbsoluteModelsPath();
      let parentDir = modelsDir;

      if (parentId) {
        const parent = await prisma.collection.findUnique({ where: { id: parentId } });
        if (parent && parent.pathHash) {
          // Decode path from hash (Database First: we trust the hash/DB state)
          const relPath = Buffer.from(parent.pathHash, 'base64').toString('utf8');
          parentDir = path.join(modelsDir, relPath);
        }
      }

      const safeName = name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim();
      const newDirPath = path.join(parentDir, safeName);

      if (!fs.existsSync(newDirPath)) {
        fs.mkdirSync(newDirPath, { recursive: true });
        console.log(`[DB Collection] Created physical folder: ${newDirPath}`);
      }

      // Generate pathHash for the new folder
      const rel = path.relative(modelsDir, newDirPath);
      const normalized = rel.replace(/\\/g, '/');
      finalPathHash = Buffer.from(normalized).toString('base64');

    } catch (e) {
      console.error('[DB Collection] Physical creation failed:', e);
      // If physical creation fails, we might fallback to cloud (null hash) or error?
      // For now, let's keep it null if it failed, making it a "Cloud" collection effectively,
      // or we could throw. But "Database First" suggests we can have a record even if disk fails.
    }
  }

  // Case 3: Cloud Collection (Default)
  // If no path provided and not creating on disk, finalPathHash remains null.

  return await prisma.collection.create({
    data: {
      name,
      parentId: parentId || null,
      coverImagePath: finalCoverImagePath,
      pathHash: finalPathHash, // NULL = Cloud, Value = Physical
      type: type || 'folder',
      category: category || null,
      metadata: metadata ? JSON.stringify(metadata) : JSON.stringify({ description: '', images: [], buildPlates: [] })
    }
  });
}

/**
 * Update a collection
 * @param {string} id
 * @param {Object} updates
 * @returns {Promise<Collection>}
 */
async function updateCollection(id, updates) {
  const { name, coverImagePath, coverImage, pathHash, type, category, metadata, description, images, documents } = updates;

  const finalCoverImagePath = coverImagePath !== undefined ? coverImagePath : coverImage;

  // If metadata is provided, we should merge it with existing
  let metadataString = undefined;
  if (metadata || description !== undefined || images !== undefined || documents !== undefined) {
    const current = await prisma.collection.findUnique({ where: { id }, select: { metadata: true } });
    let existing = {};
    try { existing = JSON.parse(current?.metadata || '{}'); } catch (e) { }

    // Inject top level description/images back into metadata to bridge legacy
    const newMeta = { ...existing };
    if (metadata) Object.assign(newMeta, metadata);
    if (description !== undefined) newMeta.description = description;
    if (images !== undefined) newMeta.images = images;
    if (documents !== undefined) newMeta.documents = documents;

    metadataString = JSON.stringify(newMeta);
  }

  return await prisma.collection.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(finalCoverImagePath !== undefined && { coverImagePath: finalCoverImagePath }),
      ...(pathHash !== undefined && { pathHash }),
      ...(type && { type }),
      ...(category !== undefined && { category }),
      ...(metadataString && { metadata: metadataString })
    }
  });
}

/**
 * Move collection to a new parent
 * @param {string} collectionId - Collection to move
 * @param {string|null} newParentId - New parent ID (null = move to root)
 * @returns {Promise<Collection>}
 */
async function moveCollection(collectionId, newParentId) {
  // Validate: Cannot move a collection into itself or its descendants
  if (newParentId) {
    const isDescendant = await isDescendantOf(newParentId, collectionId);
    if (isDescendant || newParentId === collectionId) {
      throw new Error('Cannot move collection into itself or its descendants');
    }
  }

  return await prisma.collection.update({
    where: { id: collectionId },
    data: { parentId: newParentId }
  });
}

/**
 * Delete a collection
 * @param {string} id
 * @param {boolean} cascade
 * @param {boolean} deleteFiles - if true, remove from disk (Parity)
 * @returns {Promise<Collection>}
 */
async function deleteCollection(id, cascade = false, deleteFiles = false) {
  const collection = await prisma.collection.findUnique({ where: { id } });
  if (!collection) throw new Error('Collection not found');

  if (deleteFiles && collection.pathHash) {
    try {
      const modelsDir = getAbsoluteModelsPath();
      const relPath = Buffer.from(collection.pathHash, 'base64').toString('utf8');
      const fullPath = path.join(modelsDir, relPath);

      // Security check
      if (!relPath.includes('..') && !path.isAbsolute(relPath) && fs.existsSync(fullPath)) {
        console.log(`[DB Collection] Deleting physical folder: ${fullPath}`);
        fs.rmSync(fullPath, { recursive: true, force: true });
      }
    } catch (e) {
      console.error('[DB Collection] Physical delete failed:', e);
    }
  }

  // Database delete (cascade handles children relations in DB schema if configured, 
  // but if we want explicit cascade logic for files, we'd need recursion here. 
  // For now, relying on Prisma 'onDelete: Cascade' for DB relations)
  // Database delete
  // If cascade is requested, we rely on Prisma schema's 'onDelete: Cascade' for relations.
  // If not cascading, this will throw if children exist.
  return await prisma.collection.delete({
    where: { id }
  });
}

/**
 * Get breadcrumb trail for a collection
 * @param {string} id - Collection ID
 * @returns {Promise<Collection[]>} - Array from root to current
 */
async function getBreadcrumbs(id) {
  const breadcrumbs = [];
  let current = await prisma.collection.findUnique({ where: { id } });

  while (current) {
    breadcrumbs.unshift(current);
    if (current.parentId) {
      current = await prisma.collection.findUnique({ where: { id: current.parentId } });
    } else {
      current = null;
    }
  }

  return breadcrumbs;
}

// --- HELPER FUNCTIONS ---

/**
 * Check if a collection is a descendant of another
 * @private
 */
async function isDescendantOf(childId, ancestorId) {
  let current = await prisma.collection.findUnique({ where: { id: childId } });

  while (current && current.parentId) {
    if (current.parentId === ancestorId) return true;
    current = await prisma.collection.findUnique({ where: { id: current.parentId } });
  }

  return false;
}

/**
 * Recursively delete a collection and all its descendants
 * @private
 */
async function deleteCollectionRecursive(id) {
  const children = await prisma.collection.findMany({ where: { parentId: id } });

  for (const child of children) {
    await deleteCollectionRecursive(child.id);
  }

  await prisma.collection.delete({ where: { id } });
}

module.exports = {
  getAllCollections,
  getCollectionById,
  getCollectionTree,
  createCollection,
  updateCollection,
  moveCollection,
  deleteCollection,
  getBreadcrumbs
};
