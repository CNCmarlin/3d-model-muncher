const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * DATABASE VERSION: Collection Service
 * Handles hierarchical collection operations using Prisma
 * Collections represent folder structure for organizing models
 */

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

    // Map models relation to modelIds array
    return collections.map(c => ({
      ...c,
      modelIds: c.models ? c.models.map(m => m.id) : []
    }));
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

  // Map models relation to modelIds array
  return collections.map(c => ({
    ...c,
    modelIds: c.models ? c.models.map(m => m.id) : []
  }));
}

/**
 * Get collection by ID with all relations
 * @param {string} id - Collection ID
 * @returns {Promise<Collection|null>}
 */
async function getCollectionById(id) {
  return await prisma.collection.findUnique({
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
}

/**
 * Get collection tree structure (recursive hierarchy)
 * @param {string|null} parentId - Starting point (null = root)
 * @returns {Promise<Collection[]>} - Collections with nested children
 */
async function getCollectionTree(parentId = null) {
  const collections = await prisma.collection.findMany({
    where: { parentId },
    include: {
      _count: { select: { models: true } }
    },
    orderBy: { name: 'asc' }
  });

  // Recursively fetch children
  for (const collection of collections) {
    collection.children = await getCollectionTree(collection.id);
  }

  return collections;
}

/**
 * Create a new collection
 * @param {Object} data - Collection data
 * @returns {Promise<Collection>}
 */
async function createCollection(data) {
  const { name, parentId, description, coverImage, modelIds = [] } = data;

  return await prisma.collection.create({
    data: {
      name,
      parentId: parentId || null,
      description,
      coverImage,
      modelIds, // Store as JSON array
      path: '', // Will be computed
      pathHash: null
    }
  });
}

/**
 * Update a collection
 * @param {string} id - Collection ID
 * @param {Object} updates - Partial collection data
 * @returns {Promise<Collection>}
 */
async function updateCollection(id, updates) {
  const { name, description, coverImage, modelIds } = updates;

  return await prisma.collection.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(coverImage !== undefined && { coverImage }),
      ...(modelIds && { modelIds })
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
 * Delete a collection (soft delete by removing from tree)
 * @param {string} id - Collection ID
 * @param {boolean} cascade - If true, delete children too
 * @returns {Promise<void>}
 */
async function deleteCollection(id, cascade = false) {
  if (cascade) {
    // Delete collection and all descendants
    await deleteCollectionRecursive(id);
  } else {
    // Move children to parent before deleting
    const collection = await prisma.collection.findUnique({ where: { id } });
    if (collection) {
      await prisma.collection.updateMany({
        where: { parentId: id },
        data: { parentId: collection.parentId }
      });
      await prisma.collection.delete({ where: { id } });
    }
  }
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
