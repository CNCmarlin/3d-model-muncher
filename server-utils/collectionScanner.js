const fs = require('fs');
const path = require('path');

/**
 * Strategy: "Top-Level Aggregation" with "Path-Based Tagging"
 * * 1. Identify direct subfolders of the Models Root (e.g., "Dump Truck", "CNC Files").
 * 2. For each folder, find ALL models inside it (recursive).
 * 3. TAGGING: For each model, calculate its relative path from the collection root.
 * Use subfolder names as Tags (e.g. "Bed/Axle/Part.stl" -> tags: ["Bed", "Axle"]).
 * Write these tags to the model's JSON file.
 * 4. Create a single Collection for that top-level folder.
 * 5. PRUNING: Skip folders that end up with 0 models.
 */
function generateCollections(scanRoot, modelsDir, options = { strategy: 'smart' }) {
  console.log(`🔍 Auto-generating collections using 'Top-Level Aggregation' & 'Auto-Tagging'...`);
  
  const collections = [];
  
  // Helper to safely read JSON
  function readJson(fp) {
    try {
      const raw = fs.readFileSync(fp, 'utf8');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // Helper to safely write JSON (preserving existing data)
  function updateModelTags(jsonPath, newTags) {
    try {
      const data = readJson(jsonPath) || {};
      const existingTags = Array.isArray(data.tags) ? data.tags : [];
      
      // Merge and deduplicate (case-insensitive check, preserve original case)
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
        // Update lastModified
        data.lastModified = new Date().toISOString();
        
        // Write atomically
        const tmp = jsonPath + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tmp, jsonPath);
        // console.log(`   🏷️ Tagged ${path.basename(jsonPath)} with: [${newTags.join(', ')}]`);
      }
    } catch (e) {
      console.warn(`   ⚠️ Failed to update tags for ${path.basename(jsonPath)}:`, e.message);
    }
  }

  // 1. Get list of top-level directories
  let topLevelEntries;
  try {
    topLevelEntries = fs.readdirSync(scanRoot, { withFileTypes: true });
  } catch (e) {
    console.error("❌ Error scanning directory:", e);
    return [];
  }

  // 2. Iterate over each top-level folder
  for (const entry of topLevelEntries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

    const folderName = entry.name;
    const fullFolderPath = path.join(scanRoot, folderName);
    
    // We will collect all model IDs found in this tree
    const modelIds = [];

    // Recursive walker to find models and apply path-tags
    function walkAndTag(currentDir) {
      const subEntries = fs.readdirSync(currentDir, { withFileTypes: true });
      
      for (const sub of subEntries) {
        const fullSubPath = path.join(currentDir, sub.name);
        
        if (sub.isDirectory()) {
          if (!sub.name.startsWith('.')) walkAndTag(fullSubPath);
        } else if (sub.name.endsWith('-munchie.json') || sub.name.endsWith('-stl-munchie.json')) {
          // It's a model metadata file
          const modelData = readJson(fullSubPath);
          if (modelData && modelData.id) {
            modelIds.push(modelData.id);

            // --- PATH-BASED TAGGING LOGIC ---
            // Calculate path relative to the Collection Root (fullFolderPath)
            // e.g. /models/Dump Truck/Bed/Axle/screw-munchie.json -> relative: Bed/Axle/screw-munchie.json
            const relPath = path.relative(fullFolderPath, fullSubPath);
            const pathParts = relPath.split(path.sep);
            
            // Remove the filename itself, keep only folders
            pathParts.pop(); 
            
            // Filter out empty strings or dotfiles
            const validTags = pathParts.filter(p => p && !p.startsWith('.'));
            
            if (validTags.length > 0) {
              updateModelTags(fullSubPath, validTags);
            }
            // --------------------------------
          }
        }
      }
    }

    // Execute walk
    walkAndTag(fullFolderPath);

    // 3. PRUNING: Skip if 0 models found
    if (modelIds.length === 0) {
      // console.log(`   Skipping empty folder: ${folderName}`);
      continue;
    }

    // 4. Create the Collection
    // Stable ID based on folder name
    const stableId = `col_${Buffer.from(folderName).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;

    collections.push({
      id: stableId,
      name: folderName,
      description: `Auto-generated from folder /${folderName}`,
      modelIds: modelIds,
      created: new Date().toISOString(),
      category: 'Auto-Imported'
    });
  }

  console.log(`📂 Generated ${collections.length} collections.`);
  return collections;
}

// Export as scanDirectory to maintain compatibility with server.js import
module.exports = { scanDirectory: generateCollections };