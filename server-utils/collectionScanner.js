const fs = require('fs');
const path = require('path');

/**
 * Strategy: "Top-Level Aggregation" with "Path-Based Tagging"
 */
function generateCollections(scanRoot, modelsDir, options = { strategy: 'smart' }) {
  console.log(`🔍 Auto-generating collections using 'Top-Level Aggregation' & 'Auto-Tagging'...`);
  
  const collections = [];
  let taggedCount = 0;
  
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
      const addedTags = [];

      for (const t of newTags) {
        if (!lowerExisting.has(t.toLowerCase())) {
          combined.push(t);
          lowerExisting.add(t.toLowerCase());
          addedTags.push(t);
          changed = true;
        }
      }

      if (changed) {
        data.tags = combined;
        data.lastModified = new Date().toISOString();
        
        // Write atomically
        const tmp = jsonPath + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tmp, jsonPath);
        console.log(`   🏷️  Tagged ${path.basename(jsonPath, '.json')} +[${addedTags.join(', ')}]`);
        taggedCount++;
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
            const relPath = path.relative(fullFolderPath, fullSubPath);
            const pathParts = relPath.split(path.sep);
            
            // Remove the filename itself, keep only folders
            pathParts.pop(); 
            
            // Filter out empty strings or dotfiles
            const validTags = pathParts.filter(p => p && !p.startsWith('.'));
            
            if (validTags.length > 0) {
              updateModelTags(fullSubPath, validTags);
            }
          }
        }
      }
    }

    // Execute walk
    walkAndTag(fullFolderPath);

    // 3. PRUNING: Skip if 0 models found
    if (modelIds.length === 0) {
      continue;
    }

    // 4. Create the Collection
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

  console.log(`📂 Scan complete. Found ${collections.length} collections. Updated tags for ${taggedCount} models.`);
  return collections;
}

module.exports = { scanDirectory: generateCollections };