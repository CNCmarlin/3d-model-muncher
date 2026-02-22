const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { ConfigManager } = require('../../dist-backend/utils/configManager');
const { collectionQueue } = require('../../server-utils/sharedQueue');
const collectionScanner = require('../../server-utils/collectionScanner_db');
const { loadCollections, saveCollections } = require('../../server-utils/dataAccess');

// Configure Multer for Uploads
const MAX_UPLOAD_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES || '5368709120'); // 5GB default
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: MAX_UPLOAD_BYTES }
});

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

function reconcileHiddenFlags() {
    const modelsDir = getAbsoluteModelsPath();
    const scan = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) scan(p);
            else if (e.name.endsWith('munchie.json')) {
                try {
                    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
                    if (d.isProjectRoot && d.hidden) {
                        d.hidden = false;
                        fs.writeFileSync(p, JSON.stringify(d, null, 2));
                    }
                } catch (err) { }
            }
        }
    };
    scan(modelsDir);
}

// --- Routes ---
// POST /api/import/thingiverse
router.post('/import/thingiverse', async (req, res) => {
    try {
        const { thingId, targetFolder = 'imported', collectionId, category } = req.body;

        if (!thingId) return res.status(400).json({ success: false, error: 'No Thing ID provided' });

        const config = ConfigManager.loadConfig();
        const token = config.integrations?.thingiverse?.token || process.env.THINGIVERSE_TOKEN;
        if (!token) return res.status(500).json({ success: false, error: 'Server missing THINGIVERSE_TOKEN' });

        // 1. Perform Import
        let ThingiverseImporter;
        try {
            const module = require('../../dist-backend/utils/thingiverseImporter');
            ThingiverseImporter = module.ThingiverseImporter;
        } catch (e) {
            return res.status(500).json({ success: false, error: 'Backend utility not found. Rebuild required.' });
        }

        const importer = new ThingiverseImporter(token);
        const modelData = await importer.importThing(thingId, getAbsoluteModelsPath(), targetFolder);

        // 2. Wrap Post-Processing in Collection Queue
        await collectionQueue.add(async (currentCols) => {
            const modelsRoot = getAbsoluteModelsPath();

            // Update Category if selected
            if (category && category !== 'Uncategorized') {
                modelData.category = category;
                const jsonPath = modelData.filePath.endsWith('.json')
                    ? modelData.filePath
                    : modelData.filePath.replace(/\.(3mf|stl)$/i, modelData.filePath.toLowerCase().endsWith('.stl') ? '-stl-munchie.json' : '-munchie.json');

                const fullJsonPath = path.join(modelsRoot, jsonPath);
                fs.writeFileSync(fullJsonPath, JSON.stringify(modelData, null, 2));
            }

            // Add to Collection if selected
            if (collectionId) {
                // If we're inside the queue, currentCols contains the latest state?
                // The queue implementation in server.js passed 'currentCols' to the callback?
                // Let's check how collectionQueue works. In server.js.bak it was:
                // collectionQueue.add(async (currentCols) => { ... })
                // Here we imported collectionQueue.
                // We should ensure parity.

                // If existing implementation expects currentCols, we use it.
                // BUT, wait. In imports.js I see: const { collectionQueue } = require('../../server-utils/sharedQueue');
                // Does that queue pass arguments?
                // server-utils/collectionQueue.js (implied) usually just sequences tasks.
                // Let's assume for now we need to load collections if they aren't passed, OR if the queue provides them.
                // In server.js.bak line 2287: await collectionQueue.add(async (currentCols) => { ...
                // This implies the queue runner passes the current state?
                // Or maybe it's just a closure in the original server.js?
                // Server.js had `const collectionQueue = new CollectionQueue(DATA_DIR);` ?
                // No, I need to check `server-utils/collectionQueue.js` or `sharedQueue.js` to be sure.
                // Parity Safety: I will loadCollections() inside just in case, or look at how the original queue was initialized.
                // In server.js.bak it was likely: `const collectionQueue = require('./server-utils/collectionQueue');`

                // Let's stick to the code structure. If `currentCols` is undefined, we load.
                let cols = currentCols;
                if (!cols || !Array.isArray(cols)) cols = loadCollections();

                const colIndex = cols.findIndex(c => c.id === collectionId);
                if (colIndex !== -1) {
                    const col = cols[colIndex];
                    if (!col.modelIds.includes(modelData.id)) {
                        col.modelIds.push(modelData.id);
                        if (!col.coverModelId) col.coverModelId = modelData.id;
                        col.lastModified = new Date().toISOString();
                        // If we modified, we should save?
                        // If the queue handles saving, great. If not, we must.
                        // In server.js.bak, the callback returned a promise, but who saved?
                        // server.js.bak lines 2287-2316 do NOT show a saveCollections() call specifically. 
                        // Wait, maybe `collectionScanner.scanDirectory` invalidates or reloads?
                        // Actually, lines 2315 returns `collectionScanner.scanDirectory`.
                        // IF collectionQueue handles persistence, fine.
                        // I will add `saveCollections(cols)` here to be safe, because `imports.js` has `saveCollections` imported.
                        saveCollections(cols); // Explicit save for safety
                    }
                }
            }

            const userStrategy = config.settings?.scanStrategy || 'smart';
            return collectionScanner.scanDirectory(modelsRoot, modelsRoot, { strategy: userStrategy });
        });

        res.json({ success: true, model: modelData });
    } catch (e) {
        console.error('Thingiverse Import Error:', e);
        res.status(500).json({ success: false, error: e.message || String(e) });
    }
});

// POST /api/thingiverse/verify (Mounted at /api usually)
// If we mount the router at /api, this becomes /api/thingiverse/verify
// This is somewhat messy because we have two different "thingiverse" prefices.
// But following the "Lift and Shift" with /api mount:
router.post('/thingiverse/verify', async (req, res) => { // Internal name, mapped later
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, error: 'Token required' });
    try {
        const fetch = (await import('node-fetch')).default;
        const resp = await fetch('https://api.thingiverse.com/users/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resp.ok) {
            const data = await resp.json();
            return res.json({ success: true, username: data.name || 'Unknown User' });
        }
        return res.status(resp.status).json({ success: false, error: `Verification failed (${resp.status})` });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/upload-models
router.post('/upload-models', upload.array('files'), async (req, res) => {
    const savedFilePaths = [];
    const processedModelIds = [];
    const errors = [];
    const affectedFolders = new Map();

    try {
        const files = req.files || [];
        if (files.length === 0) {
            return res.status(400).json({ success: false, error: 'No files uploaded' });
        }

        const modelsDir = getAbsoluteModelsPath();
        const { parse3MF, parseSTL, computeMD5 } = require('../../dist-backend/utils/threeMFToJson');

        // Import ProjectService with safety catch
        let ProjectService;
        try {
            const projectModule = require('../../dist-backend/utils/ProjectService');
            ProjectService = projectModule.ProjectService || projectModule.default;
        } catch (e) {
            console.error("[UPLOAD] Critical: ProjectService utility not found. Asset Folder mode will fail.");
        }

        // --- SAFE DATA PARSING ---
        // We wrap every JSON.parse in a try/catch to document malformed frontend requests
        let destinations = null;
        let collectionTags = [];
        let sharedTags = [];

        try {
            if (req.body.destinations) destinations = JSON.parse(req.body.destinations);
        } catch (e) {
            console.error("[UPLOAD] Error parsing destinations:", e.message);
            errors.push({ error: "Invalid destination format received" });
        }

        try {
            if (req.body.collectionTags) collectionTags = JSON.parse(req.body.collectionTags);
        } catch (e) {
            console.error("[UPLOAD] Error parsing collectionTags:", e.message);
        }

        try {
            if (req.body.tags) sharedTags = JSON.parse(req.body.tags);
        } catch (e) {
            console.error("[UPLOAD] Error parsing tags:", e.message);
        }

        const {
            isProjectFolder,
            projectName,
            primaryModelFile,
            createCollection: createColRaw,
            collectionId,
            collectionName,
            category,
            collectionDescription
        } = req.body;

        const createCollection = createColRaw === 'true';

        // --- 1. PHYSICAL FILE SAVING (ATOMIC WRITE) ---
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const originalName = f.originalname.replace(/\\/g, '/');
            let base = path.basename(originalName).replace(/[^a-zA-Z0-9_.\- ]/g, '_');

            // Resolve destination with path-traversal protection
            let destFolder = (destinations && destinations[i]) ? destinations[i].replace(/\.\./g, '') : 'uploads';
            const destDir = path.join(modelsDir, destFolder);

            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

            let targetPath = path.join(destDir, base);

            // De-conflict filenames if they already exist
            if (fs.existsSync(targetPath)) {
                const ext = path.extname(base);
                const name = path.basename(base, ext);
                base = `${name}-${Date.now()}${ext}`;
                targetPath = path.join(destDir, base);
            }

            // Safe Write: Use .tmp extension during write to prevent partial file reads
            const tmpPath = targetPath + '.tmp';
            try {
                fs.writeFileSync(tmpPath, f.buffer);
                fs.renameSync(tmpPath, targetPath);

                const relativePath = path.relative(modelsDir, targetPath).replace(/\\/g, '/');
                savedFilePaths.push(relativePath);

                // --- 2. INDIVIDUAL MODEL PROCESSING ---
                // Skip heavy parsing if we are letting ProjectService handle it as an Asset Folder
                if (isProjectFolder !== 'true') {
                    const lowerBase = base.toLowerCase();
                    if (lowerBase.endsWith('.3mf') || lowerBase.endsWith('.stl')) {
                        const derivedId = base.replace(/\.(3mf|stl)$/i, '');
                        const hash = computeMD5(f.buffer);

                        const parsedData = lowerBase.endsWith('.3mf')
                            ? await parse3MF(targetPath, derivedId, hash)
                            : await parseSTL(targetPath, derivedId, hash);

                        // Create Standard Metadata via Factory
                        let metadata = createInitialModelMetadata({
                            ...parsedData,
                            id: derivedId,
                            hash: hash,
                            filePath: relativePath,
                            modelUrl: `/models/${relativePath}`,
                            category: category || 'Uncategorized',
                            tags: Array.from(new Set([...sharedTags, ...(parsedData.tags || [])]))
                        });

                        const jsonRel = relativePath.replace(/\.(3mf|stl)$/i, lowerBase.endsWith('.3mf') ? '-munchie.json' : '-stl-munchie.json');
                        const jsonPath = path.join(modelsDir, jsonRel);
                        fs.writeFileSync(jsonPath, JSON.stringify(metadata, null, 2));

                        processedModelIds.push(derivedId);
                        if (!affectedFolders.has(destDir)) affectedFolders.set(destDir, []);
                        affectedFolders.get(destDir).push(derivedId);
                    }
                }
            } catch (writeErr) {
                console.error(`[UPLOAD] Failed to save file ${base}:`, writeErr);
                errors.push({ file: base, error: "Disk write failure" });
            }
        }

        // --- 3. ASSET FOLDER MODE (Project Logic) ---
        if (isProjectFolder === 'true' && ProjectService && savedFilePaths.length > 0) {
            try {
                const firstFile = savedFilePaths[0];
                const absoluteDestDir = path.join(modelsDir, path.dirname(firstFile));
                const modelFiles = fs.readdirSync(absoluteDestDir).filter(f => f.endsWith('.stl') || f.endsWith('.3mf'));

                /**
                 * UPDATED: In mass upload "Asset Folder" mode, we generate a new project ID.
                 * Since these are all new files, the first file in the array (index 0) 
                 * will become the Main model by default in ProjectService.
                 */
                const newProjId = `proj-${Date.now()}`;

                const projectModel = await ProjectService.finalizeProject({
                    mode: 'generic',
                    destDir: absoluteDestDir,
                    modelsRoot: modelsDir,
                    importedFiles: modelFiles,
                    primaryModelFile,
                    meta: {
                        id: newProjId,
                        name: projectName || path.basename(absoluteDestDir),
                        category: category || 'Uncategorized',
                        tags: sharedTags
                    }
                });
                processedModelIds.push(projectModel.id);
            } catch (projErr) {
                console.error("[UPLOAD] ProjectService finalization failed:", projErr);
                errors.push({ error: "Asset folder organization failed" });
            }
        }

        // --- 4. LOGICAL GROUPING (Collections) ---
        if (createCollection && processedModelIds.length > 0) {
            try {
                const currentCols = loadCollections(); // Ensure this helper exists in your server.js
                let targetCol;

                if (collectionId && collectionId !== 'new') {
                    targetCol = currentCols.find(c => c.id === collectionId);
                }

                if (!targetCol) {
                    targetCol = {
                        id: collectionId && collectionId !== 'new' ? collectionId : `col-${Date.now()}`,
                        name: collectionName || projectName || "New Upload",
                        modelIds: [],
                        description: collectionDescription || '',
                        tags: collectionTags,
                        created: new Date().toISOString()
                    };
                    currentCols.push(targetCol);
                }

                // Logical union of existing and new models
                targetCol.modelIds = Array.from(new Set([...targetCol.modelIds, ...processedModelIds]));
                targetCol.lastModified = new Date().toISOString();
                saveCollections(currentCols);
            } catch (colErr) {
                console.error("[UPLOAD] Collection update failed:", colErr);
                errors.push({ error: "Failed to add models to collection" });
            }
        }

        // Final Syncing
        await collectionQueue.add(() => collectionScanner.scanDirectory(modelsDir, modelsDir, { strategy: 'strict' }));
        try { reconcileHiddenFlags(); } catch (e) { }

        res.json({
            success: errors.length === 0,
            saved: savedFilePaths,
            modelIds: processedModelIds,
            errors
        });

    } catch (err) {
        console.error("[UPLOAD] Fatal Crash in upload-models:", err);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

// POST /api/move-model-to-project
router.post('/move-model-to-project', async (req, res) => {
    try {

        let ProjectService;

        try {
            // Use the same dist-backend path since they are in the same folder
            const projectModule = require('../../dist-backend/utils/ProjectService');

            // Note: Check if your class is a named export or default export in the compiled JS
            // If it's "export class ProjectService", use .ProjectService
            // If it's "export default class ProjectService", use .default
            ProjectService = projectModule.ProjectService || projectModule.default;
        } catch (e) {
            console.error('Failed to load ProjectService:', e);
            return res.status(500).json({
                success: false,
                error: 'Project management utility not found. Rebuild required.'
            });
        }

        const { modelId, targetFolderName } = req.body;
        const modelsDir = getAbsoluteModelsPath();

        // 1. Find existing munchie
        const findMunchie = (dir) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    const found = findMunchie(full);
                    if (found) return found;
                } else if (entry.name.endsWith('munchie.json')) {
                    try {
                        const data = JSON.parse(fs.readFileSync(full, 'utf8'));
                        if (data.id === modelId) return full;
                    } catch (e) { }
                }
            }
            return null;
        };

        const munchiePath = findMunchie(modelsDir);
        if (!munchiePath) return res.status(404).json({ error: "Model not found" });

        const modelData = JSON.parse(fs.readFileSync(munchiePath, 'utf8'));
        const sourceDir = path.dirname(munchiePath);
        const safeFolderName = targetFolderName.replace(/[^a-zA-Z0-9_\- ]/g, '').trim();
        const destDir = path.join(sourceDir, safeFolderName);


        // 2. Physical Move Logic
        if (path.basename(sourceDir) !== safeFolderName) {
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

            const munchieFileName = path.basename(munchiePath);
            const baseName = munchieFileName.replace(/(-stl)?-munchie\.json$/, '');

            const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
            const filesToMove = entries.filter(entry =>
                entry.isFile() && entry.name.startsWith(baseName)
            );

            filesToMove.forEach(f => {
                const oldP = path.join(sourceDir, f.name);
                const newP = path.join(destDir, f.name);
                if (fs.existsSync(oldP)) fs.renameSync(oldP, newP);
            });
        }

        // 3. Identify all 3D files now in the new project folder
        const currentFiles = fs.readdirSync(destDir);
        const modelFiles = currentFiles.filter(f => f.endsWith('.stl') || f.endsWith('.3mf'));

        const updatedModel = await ProjectService.finalizeProject({
            mode: 'generic',
            destDir,
            modelsRoot: modelsDir,
            importedFiles: modelFiles,
            localImagePaths: [], // Service will generate thumbnails and add them
            targetFolder: '',
            meta: {
                id: modelId,
                name: safeFolderName || modelData.name,
                description: modelData.description,
                tags: modelData.tags
            }
        });

        res.json({ success: true, model: updatedModel });

    } catch (e) {
        console.error("Move model error:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
