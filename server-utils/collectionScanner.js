const fs = require('fs');
const path = require('path');

/**
 * Generates collections based on folder structure.
 * * Strategies:
 * 1. 'smart': (Flattener) Creates a collection ONLY for folders that directly contain models. Ignores intermediate folders.
 * 2. 'strict': (Mirror) Replicates folder hierarchy exactly. Creates collections for parent folders if they lead to content.
 * 3. 'top-level': (Aggregator) Creates one collection per top-level folder, containing ALL models found recursively inside it.
 */
function generateCollections(scanRoot, modelsDir, options = { strategy: 'smart' }) {
  const strategy = options.strategy || 'smart';
  console.log(`🔍 Auto-generating collections using strategy: '${strategy}'...`);
  
  const collections = [];
  let taggedCount = 0;
  
  // Helper: Read JSON safely
  function readJson(fp) {
    try {
      const raw = fs.readFileSync(fp, 'utf8');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // Helper: Auto-tag models based on folder path
  function updateModelTags(jsonPath, newTags) {
    try {
      const data = readJson(jsonPath) || {};
      const existingTags = Array.isArray(data.tags) ? data.tags : [];
      const combined = [...existingTags];
      const lowerExisting = new Set(existingTags.map(t => t.toLowerCase()));
      
      let changed = false;
      
      for (const t of newTags) {
        if (!lowerExisting.has(t.toLowerCase())) {
          combined.push(t);
          lowerExisting.add(t.toLowerCase());
          changed = true;
        }
      }

      if (changed) {
        data.tags = combined;
        data.lastModified = new Date().toISOString();
        const tmp = jsonPath + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tmp, jsonPath);
        taggedCount++;
      }
    } catch (e) {
      // console.warn(`   ⚠️ Failed to update tags for ${path.basename(jsonPath)}:`, e.message);
    }
  }

  // Helper: Generate stable ID from folder path
  function generateCollectionId(folderPath) {
    const rel = path.relative(modelsDir, folderPath);
    // Force forward slashes to ensure IDs match across Windows/Linux
    const normalized = rel.replace(/\\/g, '/');
    return `col_${Buffer.from(normalized).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
  }

  // --- RECURSIVE SCANNER ---
  function scanRecursively(currentDir, parentColId = null) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (e) { return false; } // Return false if unreadable

    const modelIds = [];
    const subFolders = [];

    // 1. Process files in current directory
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.')) subFolders.push(fullPath);
      } else if (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json')) {
        const modelData = readJson(fullPath);
        if (modelData && modelData.id) {
          modelIds.push(modelData.id);
        }
      }
    }

    // 2. Prepare recursion
    const myColId = generateCollectionId(currentDir);
    
    // [CRITICAL FIX] Determine ID to pass to children.
    // If strategy is 'strict', we normally pass OUR ID.
    // BUT: If we are the 'scanRoot', we (usually) don't create a collection for ourselves.
    // If we pass 'myColId' as parent but don't create the parent collection, the children become hidden orphans.
    // So if currentDir == scanRoot, we pass 'null' (top-level) to children.
    let idToPass = null;
    if (strategy === 'strict') {
        if (currentDir === scanRoot) {
            idToPass = null; 
        } else {
            idToPass = myColId;
        }
    }
    // In 'smart' mode, we always pass null because we want a flat list.

    // 3. Recurse first (depth-first)
    let childCreatedCollection = false;
    for (const sub of subFolders) {
       const childHasContent = scanRecursively(sub, idToPass);
       if (childHasContent) childCreatedCollection = true;
    }

    // 4. Determine if we should create a collection for THIS folder
    const hasDirectModels = modelIds.length > 0;
    
    let shouldCreate = false;

    if (strategy === 'smart') {
        // Smart: Create ONLY if this specific folder holds models. 
        if (hasDirectModels) shouldCreate = true;
    } else if (strategy === 'strict') {
        // Strict: Create if we have models OR if a child has content (hierarchy node).
        if (hasDirectModels || childCreatedCollection) shouldCreate = true;
    }

    // Don't create collection for the root watch folder itself
    if (shouldCreate && currentDir !== scanRoot) {
        const folderName = path.basename(currentDir);
        
        collections.push({
            id: myColId,
            name: folderName,
            description: `Auto-generated from ${folderName}`,
            modelIds: modelIds, 
            parentId: strategy === 'strict' ? parentColId : null,
            created: new Date().toISOString(),
            category: 'Auto-Imported' // <--- Confirmed Category
        });

        // Tagging
        if (hasDirectModels) {
            for (const entry of entries) {
                if ((entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json'))) {
                    updateModelTags(path.join(currentDir, entry.name), [folderName]);
                }
            }
        }
        return true; // Report up that we created content
    }

    if (currentDir === scanRoot) {
        return hasDirectModels || childCreatedCollection;
    }

    return shouldCreate;
  }

  // --- TOP-LEVEL AGGREGATION ---
  function scanTopLevelOnly() {
    const topEntries = fs.readdirSync(scanRoot, { withFileTypes: true });
    for (const entry of topEntries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      
      const folderName = entry.name;
      const fullPath = path.join(scanRoot, folderName);
      const allModelIds = [];

      function deepGrab(d) {
        const subs = fs.readdirSync(d, { withFileTypes: true });
        for (const s of subs) {
          const p = path.join(d, s.name);
          if (s.isDirectory() && !s.name.startsWith('.')) deepGrab(p);
          else if (s.name.endsWith('munchie.json')) {
             const m = readJson(p);
             if (m && m.id) allModelIds.push(m.id);
          }
        }
      }
      deepGrab(fullPath);

      if (allModelIds.length > 0) {
        collections.push({
          id: generateCollectionId(fullPath),
          name: folderName,
          modelIds: allModelIds,
          category: 'Auto-Imported',
          created: new Date().toISOString(),
          description: `Aggregated ${allModelIds.length} models from /${folderName}`
        });
      }
    }
  }

  // --- EXECUTE ---
  if (strategy === 'top-level') {
    scanTopLevelOnly();
  } else {
    scanRecursively(scanRoot, null);
  }

  console.log(`📂 Scan complete (${strategy}). Found ${collections.length} collections.`);
  return collections;
}

module.exports = { scanDirectory: generateCollections };