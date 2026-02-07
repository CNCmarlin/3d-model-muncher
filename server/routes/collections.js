const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { CollectionQueue } = require('../../server-utils/collectionQueue');
const { loadCollections, saveCollections } = require('../../server-utils/dataAccess');
const { ConfigManager } = require('../../dist-backend/utils/configManager');

let activeCoverJob = null;
const DATA_DIR = path.join(process.cwd(), 'data');
const COLLECTION_IMAGES_DIR = path.join(DATA_DIR, 'images', 'collections');
const COLLECTION_DOCS_DIR = path.join(DATA_DIR, 'documents', 'collections');

const { collectionQueue } = require('../../server-utils/sharedQueue');

// Helper to get Models Path (matches server.js/system.js logic)
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

function makeId(prefix = 'col') {
    const ts = Date.now().toString(36);
    const rnd = Math.random().toString(36).slice(2, 7);
    return `${prefix}-${ts}-${rnd}`;
}

// Reconcile model hidden flags
function reconcileHiddenFlags() {
    try {
        const cols = loadCollections();
        const inAnyCollection = new Set();
        for (const c of cols) {
            const ids = Array.isArray(c?.modelIds) ? c.modelIds : [];
            for (const id of ids) {
                if (typeof id === 'string' && id) inAnyCollection.add(id);
            }
        }

        const modelsRoot = getAbsoluteModelsPath();

        function protectModelFileWrite(targetPath) {
            if (!targetPath || typeof targetPath !== 'string') return targetPath;
            if (/\.3mf$/i.test(targetPath)) {
                return targetPath.replace(/\.3mf$/i, '-munchie.json');
            }
            if (/\.stl$/i.test(targetPath)) {
                return targetPath.replace(/\.stl$/i, '-stl-munchie.json');
            }
            return targetPath;
        }

        (function scan(dir) {
            let entries = [];
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { /* ignore */ }
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    scan(full);
                    continue;
                }
                if (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json')) {
                    try {
                        const raw = fs.readFileSync(full, 'utf8');
                        const data = raw ? JSON.parse(raw) : null;
                        if (!data || typeof data !== 'object') continue;
                        const id = data.id;
                        if (!id || typeof id !== 'string') continue;

                        let changed = false;
                        const shouldBeHidden = inAnyCollection.has(id);

                        // Rule A: If in a collection but visible -> HIDE IT
                        if (shouldBeHidden && data.hidden !== true) {
                            data.hidden = true;
                            changed = true;
                        }
                        // Rule B: If not in a collection but hidden -> SHOW IT
                        else if (!shouldBeHidden && data.hidden === true) {
                            data.hidden = false;
                            changed = true;
                        }

                        if (changed) {
                            try { data.lastModified = new Date().toISOString(); } catch { }
                            const safeTarget = protectModelFileWrite(full);
                            const tmp = safeTarget + '.tmp';
                            fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
                            fs.renameSync(tmp, safeTarget);
                        }
                    } catch { /* ignore per-file errors */ }
                }
            }
        })(modelsRoot);
    } catch (e) {
        console.warn('reconcileHiddenFlags error:', e && e.message ? e.message : e);
    }
}

// Routes
router.get('/', (req, res) => {
    try {
        const cols = loadCollections();
        res.json({ success: true, collections: cols });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to load collections' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { id, name, description = '', modelIds = [], childCollectionIds = [],
            parentId = null, coverModelId, category = '', tags = [], images = [],
            createOnDisk, type, buildPlates
        } = req.body || {};

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ success: false, error: 'Name is required' });
        }

        let finalId = id;
        let finalCategory = category;

        if ((!finalId || finalId === '') && createOnDisk) {
            const modelsDir = getAbsoluteModelsPath();
            let parentDir = modelsDir;

            if (parentId && parentId !== 'root') {
                const currentCols = loadCollections();
                const parentCol = currentCols.find(c => c.id === parentId);
                if (parentCol) {
                    if (parentCol.id.startsWith('col_')) {
                        try {
                            const b64 = parentCol.id.substring(4);
                            const relPath = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
                            parentDir = path.join(modelsDir, relPath);
                        } catch (e) {
                            console.warn("Could not decode parent path from ID, defaulting to root");
                        }
                    } else {
                        console.log("Parent is manual collection, creating folder at root models dir.");
                    }
                }
            }

            const safeName = name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim();
            const newDirPath = path.join(parentDir, safeName);

            if (!fs.existsSync(newDirPath)) {
                fs.mkdirSync(newDirPath, { recursive: true });
                console.log(`[Collection] Created physical folder: ${newDirPath}`);
            }

            const rel = path.relative(modelsDir, newDirPath);
            const normalized = rel.replace(/\\/g, '/');
            finalId = `col_${Buffer.from(normalized).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
            finalCategory = 'Auto-Imported';
        } else if (!finalId) {
            finalId = makeId();
        }
        const updateTask = (currentCols) => {
            const now = new Date().toISOString();
            const normalizedIds = Array.from(new Set(modelIds.filter(x => typeof x === 'string' && x.trim() !== '')));
            const normalizedChildren = Array.isArray(childCollectionIds) ? childCollectionIds.filter(x => typeof x === 'string') : [];

            let updatedCols = [...currentCols];
            const idx = updatedCols.findIndex(c => c.id === finalId);

            const buildObject = (prev = {}) => {
                const obj = {
                    ...prev,
                    id: finalId,
                    name,
                    description,
                    modelIds: normalizedIds,
                    childCollectionIds: normalizedChildren,
                    parentId: (parentId === 'root' ? null : parentId),
                    coverModelId,
                    lastModified: now,
                    type: type || prev.type,
                    buildPlates: buildPlates || prev.buildPlates
                };
                if (finalCategory) obj.category = finalCategory;
                if (tags) obj.tags = tags;
                if (images) obj.images = images;
                if (!obj.created) obj.created = now;

                return obj;
            };

            if (idx !== -1) {
                updatedCols[idx] = buildObject(updatedCols[idx]);
            } else {
                updatedCols.push(buildObject({}));
            }

            return updatedCols;
        };

        await collectionQueue.add(updateTask);

        const freshCols = loadCollections();
        let savedItem = freshCols.find(c => c.id === finalId);

        if (!savedItem) {
            console.log(`[Collection] Race condition detected for ${finalId}. Returning memory object.`);
            savedItem = {
                id: finalId,
                name,
                description,
                modelIds: modelIds || [],
                category: finalCategory || category,
                parentId: (parentId === 'root' ? null : parentId),
                coverModelId,
                type,
                buildPlates: buildPlates || [],
                created: new Date().toISOString(),
                lastModified: new Date().toISOString()
            };
        }

        setTimeout(() => { try { reconcileHiddenFlags(); } catch { } }, 10);
        res.json({ success: true, collection: savedItem });

    } catch (e) {
        console.error('/api/collections error:', e);
        const status = e.message === 'Collection not found' ? 404 : 500;
        res.status(status).json({ success: false, error: e.message || 'Server error' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deleteTask = (currentCols) => {
            const idx = currentCols.findIndex(c => c.id === id);
            if (idx === -1) throw new Error('Not found');
            const updatedCols = [...currentCols];
            updatedCols.splice(idx, 1);
            return updatedCols;
        };
        await collectionQueue.add(deleteTask);
        try { reconcileHiddenFlags(); } catch { }
        res.json({ success: true, deletedId: id });
    } catch (e) {
        const status = e.message === 'Not found' ? 404 : 500;
        res.status(status).json({ success: false, error: e.message });
    }
});

router.post('/:id/build-plates', async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!id || !name) return res.status(400).json({ success: false, error: "Missing ID or Name" });

    try {
        const updateTask = (currentCols) => {
            const idx = currentCols.findIndex(c => c.id === id);
            if (idx === -1) throw new Error("Collection not found");
            const updatedCol = { ...currentCols[idx] };
            if (!updatedCol.buildPlates) updatedCol.buildPlates = [];
            const newPlate = {
                id: `bp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                name: name.trim(),
                modelIds: [],
                status: 'draft',
                lastModified: new Date().toISOString()
            };
            if (!updatedCol.type) updatedCol.type = 'project';
            updatedCol.buildPlates.push(newPlate);
            updatedCol.lastModified = new Date().toISOString();
            const newCols = [...currentCols];
            newCols[idx] = updatedCol;
            return newCols;
        };

        await collectionQueue.add(updateTask);
        const freshCols = loadCollections();
        const col = freshCols.find(c => c.id === id);
        const newPlate = col.buildPlates[col.buildPlates.length - 1];

        res.json({ success: true, buildPlate: newPlate, collection: col });
    } catch (e) {
        console.error("Add Plate Error:", e);
        const status = e.message === "Collection not found" ? 404 : 500;
        res.status(status).json({ success: false, error: e.message });
    }
});

router.put('/:id/build-plates/:plateId', async (req, res) => {
    const { id, plateId } = req.params;
    const updates = req.body;

    try {
        const updateTask = (currentCols) => {
            const idx = currentCols.findIndex(c => c.id === id);
            if (idx === -1) throw new Error("Collection not found");
            const updatedCol = { ...currentCols[idx] };
            if (!updatedCol.buildPlates) updatedCol.buildPlates = [];
            const plateIndex = updatedCol.buildPlates.findIndex(bp => bp.id === plateId);
            if (plateIndex === -1) throw new Error("Plate not found");
            const currentPlate = updatedCol.buildPlates[plateIndex];
            updatedCol.buildPlates[plateIndex] = {
                ...currentPlate,
                ...updates,
                id: plateId,
                lastModified: new Date().toISOString()
            };
            updatedCol.lastModified = new Date().toISOString();
            const newCols = [...currentCols];
            newCols[idx] = updatedCol;
            return newCols;
        };

        await collectionQueue.add(updateTask);
        const freshCols = loadCollections();
        const col = freshCols.find(c => c.id === id);
        const updatedPlate = col.buildPlates.find(bp => bp.id === plateId);
        res.json({ success: true, buildPlate: updatedPlate });
    } catch (e) {
        const status = (e.message === "Collection not found" || e.message === "Plate not found") ? 404 : 500;
        res.status(status).json({ success: false, error: e.message });
    }
});

router.delete('/:id/build-plates/:plateId', async (req, res) => {
    const { id, plateId } = req.params;
    try {
        const deleteTask = (currentCols) => {
            const idx = currentCols.findIndex(c => c.id === id);
            if (idx === -1) throw new Error("Collection not found");
            const updatedCol = { ...currentCols[idx] };
            if (!updatedCol.buildPlates) throw new Error("No plates found");
            const originalLen = updatedCol.buildPlates.length;
            updatedCol.buildPlates = updatedCol.buildPlates.filter(bp => bp.id !== plateId);
            if (updatedCol.buildPlates.length === originalLen) throw new Error("Plate not found");
            updatedCol.lastModified = new Date().toISOString();
            const newCols = [...currentCols];
            newCols[idx] = updatedCol;
            return newCols;
        };
        await collectionQueue.add(deleteTask);
        res.json({ success: true });
    } catch (e) {
        const status = (e.message === "Collection not found" || e.message === "Plate not found") ? 404 : 500;
        res.status(status).json({ success: false, error: e.message });
    }
});

router.post('/auto-import', async (req, res) => {
    try {
        const { targetFolder, strategy = 'smart', clearPrevious = false } = req.body;

        const config = ConfigManager.loadConfig();
        config.settings.scanStrategy = strategy || 'smart';
        ConfigManager.saveConfig(config);

        const modelsDir = getAbsoluteModelsPath();
        let scanRoot = modelsDir;
        if (targetFolder) {
            if (targetFolder.includes('..')) return res.status(400).json({ success: false, error: 'Invalid path' });
            scanRoot = path.join(modelsDir, targetFolder);
        }

        if (!fs.existsSync(scanRoot)) {
            return res.status(404).json({ success: false, error: 'Directory not found' });
        }

        console.log(`[Auto-Import] Scanning ${scanRoot} (Strategy: ${strategy}, ClearPrevious: ${clearPrevious})`);

        // Dynamic require to ensure we get the latest version if files changed
        delete require.cache[require.resolve('../../server-utils/collectionScanner')];
        const { scanDirectory } = require('../../server-utils/collectionScanner');

        const discoveredCollections = scanDirectory(scanRoot, modelsDir, { strategy });

        const mergeTask = (currentCols) => {
            let updatedCols = [...currentCols];

            // Step A: If requested, prune old auto-collections
            if (clearPrevious) {
                const beforeCount = updatedCols.length;
                updatedCols = updatedCols.filter(c => {
                    const isAutoCategory = (c.category || '').trim().toLowerCase() === 'auto-imported';
                    const isAutoId = c.id && typeof c.id === 'string' && c.id.startsWith('col_');
                    return !isAutoCategory && !isAutoId;
                });
                console.log(`[Auto-Import] Pruned ${beforeCount - updatedCols.length} old auto-collections.`);
            }

            let added = 0;
            let updated = 0;

            for (const importCol of discoveredCollections) {
                const existingIdx = updatedCols.findIndex(c => c.id === importCol.id);

                if (existingIdx !== -1) {
                    const existing = updatedCols[existingIdx];
                    const mergedIds = [...new Set([...existing.modelIds, ...importCol.modelIds])];
                    updatedCols[existingIdx] = {
                        ...existing,
                        modelIds: mergedIds,
                        category: 'Auto-Imported',
                        parentId: existing.parentId || importCol.parentId,
                        lastModified: new Date().toISOString()
                    };
                    updated++;
                } else {
                    updatedCols.push(importCol);
                    added++;
                }
            }
            console.log(`[Auto-Import] Merge complete. Added: ${added}, Updated: ${updated}`);
            return updatedCols;
        };

        await collectionQueue.add(mergeTask);
        try { reconcileHiddenFlags(); } catch { }

        res.json({ success: true, summary: `Scan complete. Found ${discoveredCollections.length} collections.` });

    } catch (e) {
        console.error("Auto-Import Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- API: Generate Collection Covers ---
router.post('/generate-covers', async (req, res) => {
    if (activeCoverJob) {
        activeCoverJob.abort();
    }
    activeCoverJob = new AbortController();
    const signal = activeCoverJob.signal;

    try {
        const { collectionIds, force = false } = req.body;
        const modelsDir = getAbsoluteModelsPath();
        const coversDir = path.join(DATA_DIR, 'covers');

        let generateCover;
        try {
            generateCover = require('../../server-utils/coverGenerator').generateCover;
        } catch (e) {
            return res.status(500).json({ success: false, error: 'Failed to load generator. Did you install "sharp"?' });
        }

        // 1. Build Index
        console.log('[Covers] Building model index...');
        const idToPathMap = {};
        function scanIndex(dir) {
            if (signal.aborted) return;
            let entries = [];
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { }

            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    scanIndex(full);
                } else if (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json')) {
                    try {
                        const raw = fs.readFileSync(full, 'utf8');
                        const data = JSON.parse(raw);
                        if (data.id) idToPathMap[data.id] = full;
                    } catch (e) { }
                }
            }
        }
        scanIndex(modelsDir);

        // 2. Get Targets
        let collections = loadCollections();
        let targets = collections;
        if (collectionIds && Array.isArray(collectionIds) && collectionIds.length > 0) {
            targets = collections.filter(c => collectionIds.includes(c.id));
        }

        console.log(`[Covers] Processing ${targets.length} collections...`);
        let processed = 0;
        let skipped = 0;
        let errors = [];

        for (const col of targets) {
            if (signal.aborted) break;

            const existingPath = path.join(coversDir, `${col.id}.jpg`);
            if (!force && col.coverImage && (fs.existsSync(existingPath) || !col.coverImage.includes('/data/covers/'))) {
                skipped++;
                continue;
            }

            try {
                const result = await generateCover(col, modelsDir, coversDir, idToPathMap);
                const idx = collections.findIndex(c => c.id === col.id);
                if (idx === -1) continue;

                if (result.success) {
                    collections[idx].coverImage = result.path;
                    collections[idx].lastModified = new Date().toISOString();
                    processed++;
                } else {
                    // Fallback: Select Single Image
                    let singleImage = null;
                    const candidates = col.modelIds || [];

                    for (const mid of candidates) {
                        const jsonPath = idToPathMap[mid];
                        if (!jsonPath || !fs.existsSync(jsonPath)) continue;
                        try {
                            const mData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                            const img = (mData.parsedImages && mData.parsedImages[0]) ||
                                (mData.images && mData.images[0]) ||
                                mData.thumbnail;

                            if (img && typeof img === 'string' && !img.startsWith('data:')) {
                                singleImage = img;
                                break;
                            }
                        } catch (e) { }
                    }

                    if (singleImage) {
                        collections[idx].coverImage = singleImage;
                        collections[idx].lastModified = new Date().toISOString();
                        processed++;
                    } else {
                        skipped++;
                    }
                }
            } catch (err) {
                console.error(`[Covers] Failed ${col.name}:`, err.message);
                errors.push({ id: col.id, name: col.name, error: err.message });
            }
        }

        saveCollections(collections);
        activeCoverJob = null;
        res.json({ success: true, processed, skipped, errors, aborted: signal.aborted });

    } catch (e) {
        activeCoverJob = null;
        console.error('[Covers] Fatal error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

router.delete('/:id/images/:filename', async (req, res) => {
    const { id, filename } = req.params;

    try {
        const updateTask = (currentCols) => {
            const idx = currentCols.findIndex(c => c.id === id);
            if (idx === -1) throw new Error("Collection not found");

            const updatedCol = { ...currentCols[idx] };

            // 1. Remove file from disk
            const filePath = path.join(COLLECTION_IMAGES_DIR, id, filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            // 2. Update DB
            const relativePath = `/api/images/collections/${id}/${filename}`;
            if (updatedCol.images) {
                updatedCol.images = updatedCol.images.filter(img => img !== relativePath);
            }

            // Unset cover image if it was this one
            if (updatedCol.coverImage === relativePath) {
                updatedCol.coverImage = updatedCol.images[0] || null;
            }

            updatedCol.lastModified = new Date().toISOString();

            const newCols = [...currentCols];
            newCols[idx] = updatedCol;
            return newCols;
        };

        await collectionQueue.add(updateTask);
        res.json({ success: true });

    } catch (e) {
        console.error("Delete Image Error:", e);
        const status = e.message === "Collection not found" ? 404 : 500;
        res.status(status).json({ success: false, error: e.message });
    }
});


// --- Document Support ---
// reused constants defined at top of file
const multer = require('multer');
const upload = multer(); // Memory storage

router.post('/:id/images', upload.single('image'), async (req, res) => {
    const collectionId = req.params.id;
    const file = req.file;
    console.log(`[CollectionsRouter] Upload Image Request for ${collectionId}`);
    if (!file) return res.status(400).json({ error: 'No file' });

    const targetDir = path.join(COLLECTION_IMAGES_DIR, collectionId);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const filename = `${Date.now()}_${file.originalname}`;
    const targetPath = path.join(targetDir, filename);
    fs.writeFileSync(targetPath, file.buffer);

    await collectionQueue.add((cols) => {
        const idx = cols.findIndex(c => c.id === collectionId);
        if (idx === -1) throw new Error('Not found');
        const c = { ...cols[idx] };
        if (!c.images) c.images = [];
        c.images.push(`/api/images/collections/${collectionId}/${filename}`);
        if (!c.coverImage) c.coverImage = c.images[c.images.length - 1];
        const newCols = [...cols];
        newCols[idx] = c;
        return newCols;
    });
    res.json({ success: true, imagePath: `/api/images/collections/${collectionId}/${filename}` });
});

router.post('/:id/documents', upload.single('file'), async (req, res) => {
    const collectionId = req.params.id;
    const file = req.file;
    console.log(`[CollectionsRouter] Document Upload Request for ${collectionId}`);

    if (!file) return res.status(400).json({ error: 'No file' });

    try {
        const targetDir = path.join(COLLECTION_DOCS_DIR, collectionId);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        const filename = `${Date.now()}_${file.originalname}`;
        fs.writeFileSync(path.join(targetDir, filename), file.buffer);

        await collectionQueue.add((cols) => {
            const idx = cols.findIndex(c => c.id === collectionId);
            if (idx === -1) throw new Error('Not found');
            const c = { ...cols[idx] };
            if (!c.documents) c.documents = [];
            c.documents.push(`/api/documents/collections/${collectionId}/${filename}`);
            const newCols = [...cols];
            newCols[idx] = c;
            return newCols;
        });
        console.log(`[CollectionsRouter] Document saved: ${filename}`);
        res.json({ success: true, filePath: `/api/documents/collections/${collectionId}/${filename}` });
    } catch (e) {
        console.error(`[CollectionsRouter] Document Upload Error:`, e);
        res.status(500).json({ success: false, error: e.message });
    }
});

router.delete('/:id/documents/:filename', async (req, res) => {
    const { id, filename } = req.params;
    console.log(`[CollectionsRouter] Delete Document Request: ${id} / ${filename}`);

    try {
        await collectionQueue.add((cols) => {
            const idx = cols.findIndex(c => c.id === id);
            if (idx === -1) throw new Error('Collection not found');
            const c = { ...cols[idx] };

            // 1. Remove from Disk
            const filePath = path.join(COLLECTION_DOCS_DIR, id, filename);
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                    console.log(`[CollectionsRouter] Deleted file: ${filePath}`);
                } catch (err) {
                    console.error(`[CollectionsRouter] File unlink failed:`, err);
                }
            } else {
                console.warn(`[CollectionsRouter] File not found on disk: ${filePath}`);
            }

            // 2. Remove from DB
            const publicPath = `/api/documents/collections/${id}/${filename}`;
            if (c.documents) {
                const initialLen = c.documents.length;
                c.documents = c.documents.filter(d => d !== publicPath && !d.endsWith(filename));
                if (c.documents.length < initialLen) {
                    console.log(`[CollectionsRouter] Removed document reference from DB`);
                }
            }
            c.lastModified = new Date().toISOString();

            const newCols = [...cols];
            newCols[idx] = c;
            return newCols;
        });

        res.json({ success: true });
    } catch (e) {
        console.error(`[CollectionsRouter] Delete Doc Error:`, e);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;

