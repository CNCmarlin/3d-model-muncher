const fs = require('fs');
const path = require('path');

/**
 * Generates collections based on folder structure.
 * Supports: 'smart', 'strict', and 'top-level' strategies.
 * Respects 'project.json' as a marker for single-model project folders.
 */
function generateCollections(scanRoot, modelsDir, options = { strategy: 'smart' }) {
  const strategy = options.strategy || 'smart';
  console.log(`\n--- 🚀 COLLECTION SCANNER DEBUG REV: FINAL (Strategy: ${strategy}) ---`);

  const collections = [];
  const allClaimedIds = new Set(); // NEW: Track every ID that gets put in a collection
  let taggedCount = 0;

  // --- HELPERS ---
  function readJson(fp) {
    try {
      const raw = fs.readFileSync(fp, 'utf8');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function updateModelTags(jsonPath, newTags) {
    try {
      const data = readJson(jsonPath) || {};
      const existingTags = Array.isArray(data.tags) ? data.tags : [];
      const combined = [...new Set([...existingTags, ...newTags])];

      if (combined.length !== existingTags.length) {
        data.tags = combined;
        data.lastModified = new Date().toISOString();
        fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
        taggedCount++;
      }
    } catch (e) { }
  }

  function generateCollectionId(folderPath) {
    const rel = path.relative(modelsDir, folderPath);
    const normalized = rel.replace(/\\/g, '/');
    return `col_${Buffer.from(normalized).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
  }

  // --- RECURSIVE SCANNER (Project Filter Revision) ---
  function scanRecursively(currentDir, parentColId = null, depth = 0) {
    const indent = "  ".repeat(depth);
    const folderName = path.basename(currentDir);

    // 1. Marker Check
    const isProjectFolder = fs.existsSync(path.join(currentDir, 'project.json'));

    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (e) { return false; }

    let directModelIds = [];
    let projectRootId = null; // We'll store the "Main" ID here if it's a project
    const subFolders = [];

    // 2. Identify contents
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.')) subFolders.push(fullPath);
      } else if (entry.name.endsWith('munchie.json') && entry.name !== 'project.json') {
        const modelData = readJson(fullPath);
        if (modelData && modelData.id) {

          // If this is a project folder, we only care about the root model
          if (isProjectFolder && modelData.isProjectRoot === true) {
            projectRootId = modelData.id;
          } else if (!isProjectFolder) {
            directModelIds.push(modelData.id);

            // AUTO-TAGGING: If in a non-root folder, tag this model with the folder name
            // Major categories and root are excluded from tagging
            const isMajorCategory = ['imported', 'uploads', 'models'].includes(folderName.toLowerCase());
            if (options.autoTag && currentDir !== scanRoot && !isMajorCategory) {
              updateModelTags(fullPath, [folderName]);
            }
          }
        }
      }
    }

    console.log(`${indent}📁 Scanning: ${folderName} [Project: ${isProjectFolder}]`);

    const myColId = generateCollectionId(currentDir);
    let idToPass = (strategy === 'strict' && currentDir !== scanRoot) ? myColId : parentColId;

    // 3. Recurse and Collect IDs from children
    let childrenModelIds = [];
    let childCreatedCollection = false;

    for (const sub of subFolders) {
      // We need to know what IDs the children found so we can include them in the parent
      const childResult = scanRecursivelyWithResult(sub, idToPass, depth + 1);
      if (childResult.hasCreated) childCreatedCollection = true;

      // Bubble up the IDs from the children (like the StarFighter from its project folder)
      childrenModelIds = [...childrenModelIds, ...childResult.foundIds];
    }

    // 4. DECISION LOGIC
    const isMajorCategory = ['imported', 'uploads', 'models'].includes(folderName.toLowerCase());
    let shouldCreate = false;
    let reason = "";

    if (isMajorCategory) {
      shouldCreate = true;
      reason = "System Category";
    } else if (isProjectFolder) {
      shouldCreate = false;
      reason = "Omitted: Project Folder (Reporting Root ID only)";
    } else if (strategy === 'smart') {
      if (directModelIds.length > 0 || childrenModelIds.length > 0) shouldCreate = true;
    } else if (strategy === 'strict') {
      if (directModelIds.length > 0 || childCreatedCollection || childrenModelIds.length > 0) shouldCreate = true;
    }

    // 5. Final Push
    const allModelsForThisCollection = [...directModelIds, ...childrenModelIds];

    if (shouldCreate && currentDir !== scanRoot) {
      console.log(`${indent}✅ CREATING: ${folderName} (Models: ${allModelsForThisCollection.length})`);

      // NEW: Mark these IDs as claimed so the Root doesn't show them
      allModelsForThisCollection.forEach(id => allClaimedIds.add(id));

      collections.push({
        id: myColId,
        name: folderName,
        modelIds: allModelsForThisCollection,
        parentId: strategy === 'strict' ? parentColId : null,
        category: 'Auto-Imported'
      });
    }

    // --- WHAT WE REPORT BACK TO THE PARENT (The Fix) ---
    let idsToReportUp = [];

    if (isProjectFolder) {
      // 1. Project Folders report their Main ID so the parent collection can "own" them.
      idsToReportUp = projectRootId ? [projectRootId] : [];
    } else if (shouldCreate) {
      // 2. If we created a collection here, these models are now "consumed."
      //    We report an empty array so the higher parent doesn't duplicate them.
      idsToReportUp = [];
    } else {
      // 3. If no collection was created, pass the models up to be handled by the parent.
      idsToReportUp = allModelsForThisCollection;
    }

    return {
      hasCreated: shouldCreate || childCreatedCollection,
      foundIds: idsToReportUp
    };
  }

  // Helper to bridge the recursion
  function scanRecursivelyWithResult(d, p, dep) {
    return scanRecursively(d, p, dep);
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
        // Skip recursing into folders marked as Projects at the top level
        if (fs.existsSync(path.join(d, 'project.json'))) {
          // We still grab the models from inside it, but don't go deeper
          const files = fs.readdirSync(d, { withFileTypes: true });
          for (const f of files) {
            if (f.name.endsWith('munchie.json') && f.name !== 'project.json') {
              const m = readJson(path.join(d, f.name));
              if (m && m.id) allModelIds.push(m.id);
            }
          }
          return;
        }

        const subs = fs.readdirSync(d, { withFileTypes: true });
        for (const s of subs) {
          const p = path.join(d, s.name);
          if (s.isDirectory() && !s.name.startsWith('.')) deepGrab(p);
          else if (s.name.endsWith('munchie.json') && s.name !== 'project.json') {
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

    // NEW: Post-Processing for the Root Collection
    // Find the "Root" collection (the one matching scanRoot) 
    // and remove any IDs that were claimed by sub-collections.
    const rootCol = collections.find(c => c.id === generateCollectionId(scanRoot));
    if (rootCol) {
      rootCol.modelIds = rootCol.modelIds.filter(id => !allClaimedIds.has(id));
      console.log(`🧹 Root Cleaned: ${rootCol.name} now has ${rootCol.modelIds.length} orphan models.`);
    }
  }

  console.log(`📂 Scan complete (${strategy}). Found ${collections.length} collections.`);
  return collections;
}

module.exports = { scanDirectory: generateCollections };

/**
 * Surgical refresh: Updates a parent collection's modelIds when a project's Root changes.
 */
function refreshProjectInCollection(projectDir, modelsDir, collectionsPath) {
  // 1. Load current collections
  let collections = [];
  try {
    collections = JSON.parse(fs.readFileSync(collectionsPath, 'utf8'));
  } catch (e) { return; }

  // 2. Identify the Parent Collection (where this project lives)
  const parentDir = path.dirname(projectDir);
  const parentColId = `col_${Buffer.from(path.relative(modelsDir, parentDir).replace(/\\/g, '/'))
    .toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;

  const collection = collections.find(c => c.id === parentColId);
  if (!collection) return;

  // 3. Find the NEW Main Model ID in the project folder
  let newMainId = null;
  const files = fs.readdirSync(projectDir);
  for (const f of files) {
    if (f.endsWith('munchie.json') && f !== 'project.json') {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(projectDir, f), 'utf8'));
        if (data.isProjectRoot === true) {
          newMainId = data.id;
          break;
        }
      } catch (e) { }
    }
  }

  // 4. Update the collection's modelIds
  // We remove all models currently in that specific project folder from the collection 
  // and re-add only the new King.
  const projectFiles = files.filter(f => f.endsWith('munchie.json')).map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(projectDir, f), 'utf8')).id; } catch (e) { return null; }
  }).filter(Boolean);

  // Remove any IDs that belong to this folder, then add the new King
  collection.modelIds = collection.modelIds.filter(id => !projectFiles.includes(id));
  if (newMainId) {
    collection.modelIds.push(newMainId);
    // User requested NO auto-update of cover image here.
    // We only ensure the model ID is in the list.
  }

  // 6. Save back to disk
  fs.writeFileSync(collectionsPath, JSON.stringify(collections, null, 2), 'utf8');
  console.log(`🎯 Collection ${collection.name} surgically updated with new Main Model: ${newMainId} (Cover image unchanged)`);
}

module.exports = {
  scanDirectory: generateCollections,
  refreshProjectInCollection // Export this!
};