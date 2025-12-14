// server-utils/collectionScanner.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Generates a deterministic ID based on the folder path.
 * This ensures that if you import "Vehicles/Cars" twice, it gets the same ID.
 */
function generateCollectionId(folderPath) {
  // Normalize to forward slashes for consistency across OS
  const normalized = folderPath.split(path.sep).join('/');
  // Create MD5 hash
  const hash = crypto.createHash('md5').update(normalized).digest('hex').substring(0, 12);
  return `col-imp-${hash}`;
}

/**
 * Recursively scans a directory to build a list of proposed collections.
 * * @param {string} rootPath - The absolute path to start scanning.
 * @param {string} modelsRoot - The absolute path of the models library (to calculate relative paths).
 * @param {object} options - { strategy: 'strict' | 'smart' }
 * @returns {Array} - Array of Collection objects.
 */
function scanDirectory(rootPath, modelsRoot, options = { strategy: 'strict' }) {
  const collections = [];
  // Map to store generated IDs of folders we actually created, for parent linking
  // Key: Absolute Path, Value: Collection ID
  const pathIdMap = new Map();

  function walk(currentDir, parentId = null) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    // Check contents of this folder
    const subFolders = [];
    let hasModels = false;
    let modelIds = [];

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        // Ignore hidden folders
        if (!entry.name.startsWith('.')) {
          subFolders.push(fullPath);
        }
      } else if (entry.isFile()) {
        // Check for model files or munchie files
        // We use the munchie ID logic: if we see a munchie file, we know the ID. 
        // If we see a raw file, we might not know the ID yet if it hasn't been scanned, 
        // but we know this folder contains models.
        if (entry.name.endsWith('.3mf') || entry.name.endsWith('.stl') || entry.name.endsWith('-munchie.json')) {
          hasModels = true;
          
          // Try to extract ID if it's a munchie file
          if (entry.name.endsWith('-munchie.json')) {
            try {
              const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
              if (content.id) modelIds.push(content.id);
            } catch (e) {}
          }
        }
      }
    }

    // DECISION: Should we create a collection for this folder?
    let shouldCreate = false;

    if (options.strategy === 'strict') {
      // Strict: Create for every folder (except root if desired, but we usually skip root wrapper)
      shouldCreate = currentDir !== rootPath;
    } else {
      // Smart: Create ONLY if it has models
      // (Optionally: We could create if it has sub-collections, but user requested minimizing nesting)
      shouldCreate = hasModels && currentDir !== rootPath; 
    }

    let myId = null;

    if (shouldCreate) {
      myId = generateCollectionId(path.relative(modelsRoot, currentDir));
      const name = path.basename(currentDir);
      
      // If we are in Smart mode and skipped the parent, parentId will be null (Root)
      // This flattens the tree for empty intermediate folders.
      
      const col = {
        id: myId,
        name: name,
        description: `Imported from ${path.basename(currentDir)}`,
        modelIds: [...new Set(modelIds)], // Dedupe
        parentId: parentId, // Link to parent if it exists
        childCollectionIds: [],
        created: new Date().toISOString(),
        lastModified: new Date().toISOString()
      };
      
      collections.push(col);
      pathIdMap.set(currentDir, myId);
    }

    // Recurse into subfolders
    // If we created a collection, pass OUR ID as the parent.
    // If we skipped this folder, pass the OLD parent ID (so children attach to the nearest valid ancestor).
    const nextParentId = shouldCreate ? myId : parentId;

    for (const subDir of subFolders) {
      walk(subDir, nextParentId);
    }
  }

  if (fs.existsSync(rootPath)) {
    walk(rootPath, null);
  }

  return collections;
}

module.exports = { scanDirectory, generateCollectionId };