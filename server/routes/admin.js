const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { ConfigManager } = require('../../dist-backend/utils/configManager');
const { loadCollections, saveCollections } = require('../../server-utils/dataAccess');

// Lazy load thumbnail generator to avoid crash if sharp missing
let generateThumbnail;
try {
    generateThumbnail = require('../../dist-backend/utils/thumbnailGenerator').generateThumbnail;
} catch (e) {
    console.warn("Thumbnail generator not available:", e.message);
}

// --- Helpers ---

function getModelsDirectory() {
    if (process.env.MODELS_PATH) return process.env.MODELS_PATH;
    try {
        const dataDir = path.join(process.cwd(), 'data');
        const globalPath = path.join(dataDir, 'config.json');
        if (fs.existsSync(globalPath)) {
            const parsed = JSON.parse(fs.readFileSync(globalPath, 'utf8') || '{}');
            if (parsed?.settings?.modelDirectory) return parsed.settings.modelDirectory;
        }
    } catch (e) { }
    const config = ConfigManager.loadConfig();
    return (config.settings && config.settings.modelDirectory) || './models';
}

function getAbsoluteModelsPath() {
    const dir = getModelsDirectory();
    return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

function createInitialModelMetadata(overrides) {
    const now = new Date().toISOString();
    return {
        id: overrides.id || `local-${Date.now()}`,
        name: overrides.name || "New Model",
        filePath: overrides.filePath || "",
        modelUrl: overrides.modelUrl || "",
        fileSize: overrides.fileSize || "0",
        description: overrides.description || "",
        category: overrides.category || "Uncategorized",
        tags: overrides.tags || [],
        isPrinted: false,
        printTime: "",
        filamentUsed: "",
        license: overrides.license || "Private Use",
        source: "Upload",
        designer: "Local User",
        collections: overrides.collections || [],
        excludedCollections: overrides.excludedCollections || [],
        printSettings: {
            layerHeight: "", infill: "", nozzle: "", material: "", printer: ""
        },
        created: now,
        lastModified: now,
        parsedImages: [],
        related_files: overrides.related_files || [],
        hidden: overrides.hidden ?? true,
        isRelatedPart: overrides.isRelatedPart ?? false,
        isProjectRoot: overrides.isProjectRoot ?? false,
        price: 0,
        userDefined: {
            thumbnail: "parsed:0",
            imageOrder: [],
            description: overrides.description || "",
            images: []
        },
        ...overrides
    };
}

// --- Logic ---

async function runHealLogic(isDryRun = false, specificPath = null, thumbnailStrategy = 'prefer-embedded') {
    console.log("!!! HEAL LOGIC TRIGGERED !!!");
    console.log("Is Dry Run:", isDryRun, "Strategy:", thumbnailStrategy);

    const modelsDir = getAbsoluteModelsPath();

    if (!modelsDir || !fs.existsSync(modelsDir)) {
        console.error("❌ ERROR: Models directory does not exist or is undefined!");
        return { processed: 0, healed: 0, errors: ["Models directory missing"], details: [] };
    }

    const results = { processed: 0, healed: 0, errors: [], details: [] };

    // We don't really use actualCollections here for healing unrelated to collections, but original code had it.
    // const actualCollections = loadCollections() || []; 

    async function processDir(dir) {
        let entries = [];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (e) {
            console.error(`❌ Cannot read directory: ${dir}`);
            return;
        }

        // --- 📦 PROJECT MARKER CHECK ---
        const projectMarkerPath = path.join(dir, 'project.json');
        const projectData = fs.existsSync(projectMarkerPath) ? JSON.parse(fs.readFileSync(projectMarkerPath, 'utf8')) : null;
        const isProject = !!projectData;

        // Filter for Munchies, but be VERY inclusive
        const munchieFiles = entries.filter(e => {
            const name = e.name.toLowerCase();
            return e.isFile() &&
                name.endsWith('munchie.json') &&
                !name.includes('.bak');
        });
        const normalizedCurrentDir = dir.replace(/\\/g, '/');

        // NEW: "King of the Hill" Pre-Scan
        let folderMunchies = munchieFiles.map(f => {
            const p = path.join(dir, f.name);
            const d = JSON.parse(fs.readFileSync(p, 'utf8'));
            return { path: p, data: d, mtime: fs.statSync(p).mtime };
        });

        const roots = folderMunchies.filter(m => m.data.isProjectRoot === true);

        if (roots.length > 1) {
            console.log(`⚠️ Multiple Roots found in ${dir}. Enforcing single King...`);
            // Keep the most recently modified "King"
            roots.sort((a, b) => b.mtime - a.mtime);
            roots.slice(1).forEach(peer => {
                peer.data.isProjectRoot = false;
                // NEW: If we demote a king, it should now become a hidden related part
                peer.data.hidden = true;
                peer.data.isRelatedPart = true;

                if (!isDryRun) {
                    fs.writeFileSync(peer.path, JSON.stringify(peer.data, null, 2));
                }
                console.log(`    └─ Demoted redundant King: ${path.basename(peer.path)}`);
            });
        }

        for (const entry of munchieFiles) {
            const fullPath = path.join(dir, entry.name);

            try {
                const raw = fs.readFileSync(fullPath, 'utf8');
                let data = JSON.parse(raw);
                let hasChanged = false;


                data = createInitialModelMetadata(data);

                // FIX: Define proposal HERE so it's available for Visibility Logic
                const debugPath = path.relative(modelsDir, fullPath).replace(/\\/g, '/');
                const proposal = {
                    model: `${data.name || entry.name} (${debugPath})`,
                    additions: [],
                    deletions: [],
                    modifications: [], // For reordering or non-destructive changes
                    collectionSync: null,
                    visibilityFix: null
                };

                if (data.images) {
                    delete data.images;
                    hasChanged = true;
                }

                // --- 2. VISIBILITY LOGIC ---
                const isGlobalRoot = normalizedCurrentDir === '' || normalizedCurrentDir === '.';

                if (isGlobalRoot) {
                    const shouldBeHidden = !data.isProjectRoot;
                    if (data.hidden !== shouldBeHidden) {
                        data.hidden = shouldBeHidden;
                        hasChanged = true;
                    }
                } else {
                    if (data.hidden !== true) {
                        data.hidden = true;
                        hasChanged = true;
                    }
                }

                if (!data.parsedImages) data.parsedImages = [];
                if (!data.related_files) data.related_files = [];

                const originalImgCount = data.parsedImages.length;
                const originalRelatedCount = data.related_files.length;

                // Capture original state for preview
                const originalFilePath = data.filePath || null;
                proposal.originalFilePath = originalFilePath;

                // --- 3. IDENTITY & PROPOSAL ---
                // Determine the "Model Name" based on the file path or the metadata filename
                // This is the anchor for all matching logic.
                let modelFileName = data.filePath
                    ? path.basename(data.filePath) // e.g. "MyFile.stl"
                    : entry.name.replace(/(-stl)?-munchie\.json$/i, '') + (entry.name.includes('-stl-') ? '.stl' : '.3mf'); // heuristic fallback

                // If fallback guess was wrong (e.g. guessed .3mf but file is .stl), we might fail to match.
                // Better approach: Use the "Clean Name" (no extension) for matching start of files.
                const modelBaseName = path.basename(modelFileName, path.extname(modelFileName)); // "MyFile"

                // --- PRE-CALCULATE SIBLING MODELS FOR COLLISION DETECTION ---
                // We need to know if "cam_bed_bottom" exists before "cam_bed" claims "cam_bed_bottom.stl"
                const folderBaseNames = folderMunchies.map(m => {
                    const fname = path.basename(m.path);
                    const name = m.data.filePath
                        ? path.basename(m.data.filePath, path.extname(m.data.filePath))
                        : fname.replace(/(-stl)?-munchie\.json$/i, '');
                    return name;
                }).filter(n => n);

                const siblings = fs.readdirSync(dir);

                // --- 4. PATH HEALING (STRICT) ---
                const isExplicitStl = entry.name.toLowerCase().includes('-stl-munchie.json');

                if (!data.filePath || data.filePath === "") {
                    // STRICT RULE: Only recover if the file explicitly starts with the model name
                    // This prevents "Lagarto" from claiming "Articulated_Slug" just because it's there.
                    const foundModel = siblings.find(f => {
                        const low = f.toLowerCase();
                        const isModel = low.endsWith('.stl') || low.endsWith('.3mf');

                        // Fix for cam_bed-stl claiming cam_bed.3mf:
                        if (isExplicitStl && !low.endsWith('.stl')) return false;

                        // Match: "MyFile.stl" or "MyFile_v2.stl" but NOT "MyFile_Readme.txt" (checked via extension)
                        // AND MUST START WITH NAME
                        return isModel && f.toLowerCase().startsWith(modelBaseName.toLowerCase());
                    });

                    if (foundModel) {
                        const newRelPath = path.join(path.relative(modelsDir, dir), foundModel).replace(/\\/g, '/');
                        const prevStatus = data.filePath === "" ? "Empty String" : "Missing/Null";
                        proposal.additions.push(`Recovered filePath: ${foundModel} (Matched '${modelBaseName}' - Was: ${prevStatus})`);
                        data.filePath = newRelPath;
                        data.modelUrl = `/models/${newRelPath}`;
                        modelFileName = foundModel; // Update our anchor
                        hasChanged = true;
                    }
                }

                // Update BaseName in case it changed during recovery
                const currentBaseName = data.filePath
                    ? path.basename(data.filePath, path.extname(data.filePath))
                    : modelBaseName;

                // --- 5. ASSET CLAIMING (SMART) ---
                siblings.forEach(file => {
                    const lowerFile = file.toLowerCase();
                    if (lowerFile.endsWith('.json') || lowerFile === 'project.json' || lowerFile.endsWith('.bak')) return;

                    const relAssetPath = path.join(path.relative(modelsDir, dir), file).replace(/\\/g, '/');
                    const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(file);

                    // STRICT MATCHING (Default): Start with Model Name
                    const isNameMatch = lowerFile.startsWith(currentBaseName.toLowerCase());

                    // RELAXED MATCHING (Project Mode): Claim everything in the folder
                    // If this is a Project, and we are the Project Root, we claim all orphans.
                    // If we are just a part in a project, we only claim name-matched stuff to avoid stealing from Root.
                    const isProjectAndRoot = isProject && data.isProjectRoot;

                    // COLLISION CHECK: Is there a "Better" (Longer) match in this folder?
                    // e.g. We are "cam_bed", file is "cam_bed_bottom.stl".
                    // If "cam_bed_bottom" exists as a model, IT should claim this, not us.
                    const betterMatch = folderBaseNames.find(other =>
                        other.length > currentBaseName.length &&
                        lowerFile.startsWith(other.toLowerCase())
                    );

                    let shouldClaim = (isNameMatch && !betterMatch);

                    // PROJECT MODE OVERRIDE:
                    // If we are the Project Root, and the file is NOT claimed by a specific part (betterMatch),
                    // then we claim it as a generic project asset/doc.
                    if (isProjectAndRoot && !betterMatch) {
                        shouldClaim = true;
                    }

                    const isGenericThumb = lowerFile === 'thumbnail.png' || lowerFile === 'cover.png' || lowerFile === 'plate_1.png';

                    // Special Case: Metadata files for OTHER models
                    if (lowerFile.endsWith('munchie.json')) return;

                    // If it's a generic name (thumbnail.png), and we are the ONLY model or it's a project root, maybe claim it?
                    if (isGenericThumb && data.isProjectRoot) {
                        shouldClaim = true;
                    }

                    // Fix for cam_bed-stl claiming cam_bed.3mf-thumb.png:
                    if (isExplicitStl && lowerFile.includes('.3mf')) {
                        shouldClaim = false;
                    }

                    if (shouldClaim && relAssetPath !== data.filePath) {
                        if (isImage) {
                            const url = `/models/${relAssetPath}`;
                            if (!data.parsedImages.includes(url)) {
                                proposal.additions.push(`${file} (Gallery Link - ${isProjectAndRoot ? 'Project Asset' : "Matched '" + currentBaseName + "'"})`);
                                data.parsedImages.push(url);
                                hasChanged = true;
                            }
                        } else {
                            // Non-image assets (G-code, READMEs)
                            if (!data.related_files.includes(relAssetPath)) {
                                proposal.additions.push(`${file} (Related Part/Doc - ${isProjectAndRoot ? 'Project Asset' : "Matched '" + currentBaseName + "'"})`);
                                data.related_files.push(relAssetPath);
                                hasChanged = true;
                            }
                        }
                    }
                });

                // --- 5a. BASE64 EXTRACTION ---
                // Convert legacy Base64 thumbnails to files to reduce JSON size and fix "Stale" errors.
                data.parsedImages = data.parsedImages.map(imgUrl => {
                    if (imgUrl.startsWith('data:image')) {
                        try {
                            // 1. Determine Extension (png/jpg)
                            const match = imgUrl.match(/^data:image\/([a-zA-Z]+);base64,/);
                            const ext = match ? match[1] : 'png';
                            const base64Data = imgUrl.replace(/^data:image\/[a-z]+;base64,/, "");

                            // 2. Determine Filename (Defaults to -embedded-thumb.png)
                            // User requested cleanup of STL-specific logic.
                            let suffix = '-embedded-thumb';

                            const newFileName = `${currentBaseName}${suffix}.${ext}`;
                            const newFilePath = path.join(dir, newFileName);
                            const newRelPath = path.join(path.relative(modelsDir, dir), newFileName).replace(/\\/g, '/');
                            const newUrl = `/models/${newRelPath}`;

                            // 3. Mock existence for Scrubbing (so it doesn't get deleted immediately)
                            if (!siblings.includes(newFileName)) {
                                siblings.push(newFileName);
                            }

                            // 4. Write File (if not dry run)
                            if (!isDryRun) {
                                fs.writeFileSync(newFilePath, base64Data, 'base64');
                                console.log(`      -> Extracted Base64 to ${newFileName}`);
                            }

                            proposal.additions.push(`${newFileName} (Extracted Base64 & Linked via Strategy)`);
                            hasChanged = true;
                            return newUrl; // Replace the massive string with the new URL
                        } catch (e) {
                            console.error("Error extracting base64:", e);
                            return imgUrl; // Keep original if failed
                        }
                    }
                    return imgUrl;
                });

                // --- 6. SCRUBBING (SMART) ---
                const relDir = path.relative(modelsDir, dir).replace(/\\/g, '/');
                const expectedFolderUrl = relDir === '' ? '/models/' : `/models/${relDir}/`;
                data.parsedImages = data.parsedImages.filter(imgUrl => {
                    const fileName = path.basename(imgUrl);
                    const isPhysicallyHere = siblings.includes(fileName);
                    const isCorrectFolder = imgUrl.startsWith(expectedFolderUrl);

                    // Verification: Does it minimize pollution?
                    const isNameMatch = fileName.toLowerCase().startsWith(currentBaseName.toLowerCase());
                    const isGenericThumb = fileName.toLowerCase() === 'thumbnail.png' || fileName.toLowerCase() === 'cover.png';

                    // PROJECT RELAXATION:
                    // If we are in a Project, we assume the user put these images here for a reason.
                    // We only scrub if they are physically missing or explicitly wrong path.
                    // We DO NOT scrub for name mismatch in projects.
                    const isLegit = isNameMatch || (data.isProjectRoot && isGenericThumb) || isProject;

                    if (!isPhysicallyHere) {
                        proposal.deletions.push(`${imgUrl} (Stale - Not found in folder)`);
                        return false;
                    }
                    if (!isCorrectFolder) {
                        proposal.deletions.push(`${imgUrl} (Wrong Path - Expected '${expectedFolderUrl}')`);
                        return false;
                    }
                    if (!isLegit) {
                        proposal.deletions.push(`${imgUrl} (Name Mismatch - Expected start '${currentBaseName}')`);
                        return false;
                    }
                    return true;
                });

                if (data.parsedImages.length !== originalImgCount) hasChanged = true;



                data.related_files = data.related_files.filter(p => {
                    const fileName = path.basename(p);
                    const isPhysicallyHere = siblings.includes(fileName);
                    const expectedRelPath = path.join(path.relative(modelsDir, dir), fileName).replace(/\\/g, '/');

                    const isNameMatch = fileName.toLowerCase().startsWith(currentBaseName.toLowerCase());
                    const isMetadata = fileName.toLowerCase().endsWith('munchie.json') || fileName === 'project.json' || fileName.endsWith('.bak');

                    if (fileName.toLowerCase().endsWith('munchie.json') || fileName === 'project.json') {
                        proposal.deletions.push(`${p} (Cleanup - Metadata pollution)`);
                        return false;
                    }

                    if (fileName.toLowerCase().endsWith('.bak')) {
                        proposal.deletions.push(`${p} (Cleanup - Backup file)`);
                        return false;
                    }
                    if (!isPhysicallyHere) {
                        proposal.deletions.push(`${p} (Stale - File not found)`);
                        return false;
                    }
                    if (p !== expectedRelPath) {
                        proposal.deletions.push(`${p} (Wrong Path - Expected '${expectedRelPath}')`);
                        return false;
                    }
                    // PROJECT RELAXATION:
                    if (!isNameMatch && !isMetadata && !isProject) {
                        proposal.deletions.push(`${p} (Name Mismatch - Expected start '${currentBaseName}')`);
                        return false;
                    }
                    return true;
                });

                if (data.related_files.length !== originalRelatedCount) hasChanged = true;

                // --- 7. THUMBNAIL REPAIR (EXPLICIT LOGGING) ---
                const actualFile = data.filePath ? path.basename(data.filePath) : "";
                if (actualFile) {
                    const expectedThumbName = `${actualFile}-thumb.png`;
                    const thumbWebUrl = `${expectedFolderUrl}${expectedThumbName}`;

                    if (siblings.includes(expectedThumbName)) {
                        // 1. Ensure it's in the gallery
                        if (!data.parsedImages.includes(thumbWebUrl)) {
                            // Double check strict match logic OR Project Check
                            if (expectedThumbName.toLowerCase().startsWith(currentBaseName.toLowerCase()) || isProject) {
                                proposal.additions.push(`${expectedThumbName} (Added to Gallery)`);
                                data.parsedImages.push(thumbWebUrl);
                                hasChanged = true;
                            }
                        }


                        // 2. Set as Primary Thumbnail (STRATEGY AWARE REORDERING)
                        if (data.parsedImages.length > 1 && thumbnailStrategy !== 'none') {

                            const embedded = data.parsedImages.find(img => img.includes('-embedded-thumb'));
                            const generated = data.parsedImages.find(img => {
                                const f = path.basename(img);
                                return f.endsWith('-thumb.png') &&
                                    f.toLowerCase().startsWith(currentBaseName.toLowerCase()) &&
                                    !f.includes('embedded');
                            });

                            if (embedded && generated) {
                                let preferred = null;
                                if (thumbnailStrategy === 'prefer-embedded') preferred = embedded;
                                else if (thumbnailStrategy === 'prefer-generated') preferred = generated;

                                // Force preferred to index 0
                                if (preferred && data.parsedImages[0] !== preferred) {
                                    const others = data.parsedImages.filter(img => img !== preferred);
                                    data.parsedImages = [preferred, ...others];
                                    proposal.modifications.push(`Strategized Thumbnail: Swapped to ${path.basename(preferred)} (Strategy: ${thumbnailStrategy})`);
                                    hasChanged = true;
                                }
                            }
                        }

                        let targetForPointer = thumbWebUrl; // Default to Generated
                        if (thumbnailStrategy === 'prefer-embedded') {
                            const embedded = data.parsedImages.find(img => img.includes('-embedded-thumb'));
                            if (embedded) targetForPointer = embedded;
                        }

                        const thumbIndex = data.parsedImages.indexOf(targetForPointer);
                        if (thumbIndex !== -1) {
                            const targetPointer = `parsed:${thumbIndex}`;
                            if (data.userDefined?.thumbnail !== targetPointer) {
                                proposal.additions.push(`Syncing thumbnail pointer to ${targetPointer} (${path.basename(targetForPointer)})`);
                                if (!data.userDefined) data.userDefined = { thumbnail: '', imageOrder: [], images: [] };
                                data.userDefined.thumbnail = targetPointer;
                                hasChanged = true;
                            }
                        }
                    }
                }

                // --- 8. FINAL SAVE ---
                const cleanPath = (p) => p ? p.replace(/\\/g, '/').replace(/\/+/g, '/').trim() : p;
                if (data.filePath !== cleanPath(data.filePath)) {
                    data.filePath = cleanPath(data.filePath);
                    data.modelUrl = cleanPath(data.modelUrl);
                    hasChanged = true;
                }

                if (hasChanged && !isDryRun) {
                    const backupPath = fullPath + '.bak';
                    fs.writeFileSync(backupPath, raw, 'utf8');
                    fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
                    results.healed++;
                }

                if (proposal.additions.length > 0 || proposal.deletions.length > 0 || proposal.modifications.length > 0 || hasChanged) {
                    results.details.push(proposal);
                }
                results.processed++;

            } catch (err) {
                console.error(`   ❌ Error in ${entry.name}: ${err.message}`);
                results.errors.push({ file: entry.name, error: err.message });
            }
        } // End munchie loop

        for (const entry of entries) {
            if (entry.isDirectory()) {
                await processDir(path.join(dir, entry.name));
            }
        }
    } // End processDir

    const startDir = specificPath ? path.join(modelsDir, specificPath) : modelsDir;
    console.log(`🚀 Starting ${specificPath ? 'Micro' : 'Deep'} Heal at: ${startDir}`);

    await processDir(startDir);

    console.log(`✅ Heal Finished. Processed: ${results.processed}`);
    return results;
}

async function runRevertLogic() {
    const modelsDir = getAbsoluteModelsPath();
    const results = { restored: 0, errors: [] };

    async function revertDir(dir) {
        let entries = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                await revertDir(fullPath);
            }
            else if (entry.name.endsWith('.json.bak')) {
                try {
                    const originalJsonPath = fullPath.replace('.bak', '');
                    // Restore the backup over the current file
                    fs.copyFileSync(fullPath, originalJsonPath);
                    // Delete the backup file
                    fs.unlinkSync(fullPath);
                    results.restored++;
                    console.log(`⏪ Restored: ${path.basename(originalJsonPath)}`);
                } catch (err) {
                    results.errors.push({ file: entry.name, error: err.message });
                }
            }
        }
    }

    console.log("⏪ Starting Library Revert...");
    await revertDir(modelsDir);
    return results;
}

// --- Routes ---

// POST /api/admin/library-heal-preview
router.post('/library-heal-preview', async (req, res) => {
    const { thumbnailStrategy } = req.body;
    console.log("➡️ API Request received: /api/admin/library-heal-preview", { thumbnailStrategy });
    try {
        const results = await runHealLogic(true, null, thumbnailStrategy);
        console.log("⬅️ HEAL PREVIEW COMPLETE. Found:", results.details.length, "changes.");
        res.json({ success: true, previewResults: results });
    } catch (err) {
        console.error("API ROUTE ERROR:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/admin/library-heal
router.post('/library-heal', async (req, res) => {
    const { targetPath, thumbnailStrategy } = req.body;
    console.log(`➡️ API Request received: Library Heal ${targetPath ? `for ${targetPath}` : '(Full)'}`, { thumbnailStrategy });
    try {
        const results = await runHealLogic(false, targetPath, thumbnailStrategy);
        res.json({ success: true, results, message: "Heal applied successfully." });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/admin/library-revert
router.post('/library-revert', async (req, res) => {
    try {
        const results = await runRevertLogic();
        res.json({
            success: true,
            message: `Successfully reverted ${results.restored} models.`,
            results
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/admin/library-check-backups
router.get('/library-check-backups', async (req, res) => {
    const modelsDir = getAbsoluteModelsPath();
    let hasBackups = false;
    const scanForBackups = (dir) => {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    if (scanForBackups(path.join(dir, entry.name))) return true;
                } else if (entry.name.endsWith('.json.bak')) {
                    hasBackups = true;
                    return true;
                }
            }
        } catch (e) { }
        return false;
    };
    scanForBackups(modelsDir);
    res.json({ hasBackups });
});

// POST /api/admin/generate-thumbnails
let activeThumbnailJob = null;
router.post('/generate-thumbnails', async (req, res) => {
    if (activeThumbnailJob) {
        activeThumbnailJob.abort();
    }
    activeThumbnailJob = new AbortController();
    const signal = activeThumbnailJob.signal;

    try {
        const { modelIds, force = false } = req.body;
        const modelsDir = getAbsoluteModelsPath();
        // Assume port 3001 or standard PORT env (legacy used explicit port)
        const PORT = process.env.PORT || 3001;
        const baseUrl = `http://127.0.0.1:${PORT}`;

        if (!generateThumbnail) {
            return res.status(500).json({ success: false, error: "Thumbnail generator not available" });
        }

        const config = ConfigManager.loadConfig();
        const globalDefaultColor = config?.settings?.defaultModelColor || config?.defaultModelColor || '#6366f1';

        let processed = 0;
        let errors = [];
        let skipped = 0;
        let targets = [];

        function findTargets(dir) {
            if (signal.aborted) return;
            let entries = [];
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { }
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    findTargets(fullPath);
                } else if (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json')) {
                    try {
                        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                        if (modelIds && modelIds.length > 0 && !modelIds.includes(data.id)) continue;
                        let sourceFile;
                        if (entry.name.endsWith('-stl-munchie.json')) {
                            sourceFile = fullPath.replace('-stl-munchie.json', '.stl');
                            if (!fs.existsSync(sourceFile)) sourceFile = fullPath.replace('-stl-munchie.json', '.STL');
                        } else {
                            sourceFile = fullPath.replace('-munchie.json', '.3mf');
                        }
                        if (fs.existsSync(sourceFile)) {
                            targets.push({ jsonPath: fullPath, sourcePath: sourceFile, data });
                        }
                    } catch (e) { }
                }
            }
        }
        findTargets(modelsDir);

        console.log(`📸 Starting photo shoot for ${targets.length} models...`);
        const MAX_CONSECUTIVE_ERRORS = 5;
        let consecutiveErrors = 0;

        for (const target of targets) {
            if (signal.aborted) {
                console.log('🛑 Job aborted by user.');
                break;
            }
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                console.warn(`🚨 Aborting thumbnail generation: ${MAX_CONSECUTIVE_ERRORS} consecutive errors detected.`);
                break;
            }
            try {
                const thumbName = path.basename(target.sourcePath) + '-thumb.png';
                const thumbPath = path.join(path.dirname(target.sourcePath), thumbName);
                const relativeThumbUrl = '/models/' + path.relative(modelsDir, thumbPath).replace(/\\/g, '/');

                if (fs.existsSync(thumbPath) && !force) {
                    skipped++;
                    continue;
                }

                const modelColor = target.data.userDefined?.color || target.data.color || globalDefaultColor;
                await generateThumbnail(target.sourcePath, thumbPath, baseUrl, modelColor, modelsDir, signal);

                let json = target.data;
                let changed = false;
                if (!json.images) json.images = [];
                if (!json.images.includes(relativeThumbUrl)) {
                    json.images.unshift(relativeThumbUrl);
                    changed = true;
                }
                if (changed) {
                    fs.writeFileSync(target.jsonPath, JSON.stringify(json, null, 2));
                }
                processed++;
                consecutiveErrors = 0;
            } catch (err) {
                if (err.message && err.message.includes('cancelled')) break;
                console.error("Thumbnail error:", err);
                errors.push({ id: target.data.id, error: err.message });
                consecutiveErrors++;
            }
        }

        activeThumbnailJob = null;
        res.json({
            success: true,
            processed,
            skipped,
            errors,
            aborted: signal.aborted || consecutiveErrors >= MAX_CONSECUTIVE_ERRORS
        });

    } catch (error) {
        activeThumbnailJob = null;
        console.error('General generation error:', error);
        if (error.message && error.message.includes('cancelled')) {
            return res.json({ success: false, aborted: true, message: 'Cancelled by user' });
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
