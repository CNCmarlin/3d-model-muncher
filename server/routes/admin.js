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

async function runHealLogic(isDryRun = false, specificPath = null) {
    console.log("!!! HEAL LOGIC TRIGGERED !!!");
    console.log("Is Dry Run:", isDryRun);

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

                // --- 3. IDENTITY & PROPOSAL ---
                let modelFileName = data.filePath
                    ? path.basename(data.filePath, path.extname(data.filePath))
                    : entry.name.replace(/(-stl)?-munchie\.json$/i, '');

                const siblings = fs.readdirSync(dir);

                // --- 4. PATH HEALING ---
                if (!data.filePath || data.filePath === "") {
                    const foundModel = siblings.find(f => {
                        const low = f.toLowerCase();
                        return low.endsWith('.stl') || low.endsWith('.3mf');
                    });

                    if (foundModel) {
                        const newRelPath = path.join(path.relative(modelsDir, dir), foundModel).replace(/\\/g, '/');
                        proposal.additions.push(`Recovered filePath: ${foundModel}`);
                        data.filePath = newRelPath;
                        data.modelUrl = `/models/${newRelPath}`;
                        modelFileName = path.basename(foundModel, path.extname(foundModel));
                        hasChanged = true;
                    }
                }

                // --- 5. ASSET CLAIMING ---
                siblings.forEach(file => {
                    if (file.endsWith('.json') || file === 'project.json') return;
                    const relAssetPath = path.join(path.relative(modelsDir, dir), file).replace(/\\/g, '/');
                    const lowerFile = file.toLowerCase();
                    const isMatch = modelFileName && lowerFile.startsWith(modelFileName.toLowerCase());
                    const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(file);
                    const isGeneratedThumb = lowerFile.endsWith('-thumb.png');
                    const isSystemFile = lowerFile.includes('.bak') || lowerFile.includes('.tmp') || file.startsWith('.');

                    let shouldClaim = false;
                    if (!isSystemFile) {
                        if (isProject) {
                            const isGcode = lowerFile.endsWith('.gcode');
                            shouldClaim = !((isGeneratedThumb || isGcode) && !isMatch);
                        } else {
                            if (isMatch) shouldClaim = true;
                        }
                    }

                    if (shouldClaim && relAssetPath !== data.filePath) {
                        if (isImage) {
                            const url = `/models/${relAssetPath}`;
                            if (!data.parsedImages.includes(url)) {
                                proposal.additions.push(`${file} (Gallery Link)`);
                                data.parsedImages.push(url);
                                hasChanged = true;
                            }
                        } else {
                            if (!data.related_files.includes(relAssetPath)) {
                                proposal.additions.push(`${file} (Related Part/Doc)`);
                                data.related_files.push(relAssetPath);
                                hasChanged = true;
                            }
                        }
                    }
                });

                // --- 6. SCRUBBING ---
                const expectedFolderUrl = `/models/${path.relative(modelsDir, dir).replace(/\\/g, '/')}/`;
                data.parsedImages = data.parsedImages.filter(imgUrl => {
                    const fileName = path.basename(imgUrl);
                    const isPhysicallyHere = siblings.includes(fileName);
                    const isCorrectFolder = imgUrl.startsWith(expectedFolderUrl);
                    const isMatch = modelFileName && fileName.toLowerCase().startsWith(modelFileName.toLowerCase());
                    const isLegit = isProject ? isPhysicallyHere : isMatch;

                    if (!isPhysicallyHere || !isCorrectFolder || !isLegit) {
                        proposal.deletions.push(`${fileName} (Stale/Wrong Path)`);
                        return false;
                    }
                    return true;
                });

                if (data.parsedImages.length !== originalImgCount) hasChanged = true;

                data.related_files = data.related_files.filter(p => {
                    const fileName = path.basename(p);
                    const isPhysicallyHere = siblings.includes(fileName);
                    const expectedRelPath = path.join(path.relative(modelsDir, dir), fileName).replace(/\\/g, '/');
                    const isMatch = modelFileName && fileName.toLowerCase().startsWith(modelFileName.toLowerCase());
                    const isLegit = isProject ? isPhysicallyHere : isMatch;
                    const isMetadata = fileName.toLowerCase().endsWith('munchie.json') || fileName === 'project.json' || fileName.toLowerCase().includes('.bak');

                    if (!isPhysicallyHere || p !== expectedRelPath || !isLegit || isMetadata) {
                        proposal.deletions.push(`${fileName} (Stale or Metadata Path)`);
                        return false;
                    }
                    return true;
                });

                if (data.related_files.length !== originalRelatedCount) hasChanged = true;

                // --- 7. THUMBNAIL REPAIR ---
                const actualFile = data.filePath ? path.basename(data.filePath) : "";
                if (actualFile) {
                    const expectedThumbName = `${actualFile}-thumb.png`;
                    const thumbWebUrl = `${expectedFolderUrl}${expectedThumbName}`;

                    if (siblings.includes(expectedThumbName)) {
                        if (data.isProjectRoot || data.filePath.toLowerCase().includes(actualFile.toLowerCase())) {
                            if (!data.parsedImages.includes(thumbWebUrl)) {
                                proposal.additions.push(`${expectedThumbName} (Added to Gallery)`);
                                data.parsedImages.push(thumbWebUrl);
                                hasChanged = true;
                            }

                            // 2. Instead of forcing the array to move, find the ACTUAL index of the thumb
                            const thumbIndex = data.parsedImages.indexOf(thumbWebUrl);
                            const targetPointer = `parsed:${thumbIndex}`;

                            // 3. Update the pointer to match where the thumb actually sits
                            if (data.userDefined?.thumbnail !== targetPointer) {
                                proposal.additions.push(`Syncing thumbnail pointer to ${targetPointer}`);
                                if (!data.userDefined) data.userDefined = { thumbnail: '', imageOrder: [], images: [] };
                                data.userDefined.thumbnail = targetPointer;
                                hasChanged = true;
                            }
                        }

                        const hasParsedImages = data.parsedImages && data.parsedImages.length > 0;
                        const firstImageIsThumb = hasParsedImages && data.parsedImages[0].includes('-thumb.png');

                        if (hasParsedImages && firstImageIsThumb) {
                            if (data.userDefined?.thumbnail !== 'parsed:0') {
                                proposal.additions.push(`Pointing thumbnail to parsed:0`);
                                if (!data.userDefined) data.userDefined = { thumbnail: 'parsed:0', imageOrder: [], images: [] };
                                data.userDefined.thumbnail = 'parsed:0';
                                data.userDefined.imageOrder = data.parsedImages.map((_, idx) => `parsed:${idx}`);
                                hasChanged = true;
                            }
                        } else if (data.isRelatedPart && !firstImageIsThumb) {
                            if (data.userDefined?.thumbnail === 'parsed:0') {
                                data.userDefined.thumbnail = undefined;
                                hasChanged = true;
                                proposal.deletions.push("Removing parsed:0 pointer from Related Part (No matching thumb)");
                            }
                        } else if (data.userDefined?.thumbnail) {
                            proposal.deletions.push("Clearing invalid thumbnail pointers");
                            if (data.userDefined) data.userDefined.thumbnail = undefined;
                            hasChanged = true;
                        }

                        // --- 🧹 CLEANUP ROOT POLLUTION ---
                        // If the root-level 'thumbnail' field exists, delete it immediately
                        if (Object.prototype.hasOwnProperty.call(data, 'thumbnail')) {
                            delete data.thumbnail;
                            hasChanged = true;
                            proposal.deletions.push("Purged duplicate root-level thumbnail field");
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

                if (proposal.additions.length > 0 || proposal.deletions.length > 0 || hasChanged) {
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
    console.log("➡️ API Request received: /api/admin/library-heal-preview");
    try {
        const results = await runHealLogic(true);
        console.log("⬅️ HEAL PREVIEW COMPLETE. Found:", results.details.length, "changes.");
        res.json({ success: true, previewResults: results });
    } catch (err) {
        console.error("API ROUTE ERROR:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/admin/library-heal
router.post('/library-heal', async (req, res) => {
    const { targetPath } = req.body;
    console.log(`➡️ API Request received: Library Heal ${targetPath ? `for ${targetPath}` : '(Full)'}`);
    try {
        const results = await runHealLogic(false, targetPath);
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
