const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const multer = require('multer');
const { ConfigManager } = require('../../../dist-backend/utils/configManager');
const { safeWriteJson, protectModelFileWrite, getAbsoluteModelsPath, getModelsDirectory } = require('../../../server-utils/dataAccess');

// Multer setup for Backup Uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});


function serverDebug(msg) {
    if (process.env.DEBUG) console.log(msg);
}

function safeLog(msg, obj) {
    console.log(msg);
}

function safeLog(msg, obj) {
    console.log(msg);
}

const modelController = require('../../controllers/legacy/modelController');

// Helper: postProcessMunchieFile
async function postProcessMunchieFile(absoluteFilePath) {
    try {
        if (!fs.existsSync(absoluteFilePath)) return;
        const raw = fs.readFileSync(absoluteFilePath, 'utf8');
        if (!raw || raw.trim().length === 0) return;
        let data;
        try { data = JSON.parse(raw); } catch (e) { return; }

        const parsedImages = Array.isArray(data.parsedImages) ? data.parsedImages : (Array.isArray(data.images) ? data.images : []);

        let changed = false;
        let udExists = data.userDefined && typeof data.userDefined === 'object';
        try {
            if (Array.isArray(data.userDefined)) {
                data.userDefined = data.userDefined.length > 0 && typeof data.userDefined[0] === 'object' ? { ...(data.userDefined[0]) } : {};
                udExists = true;
                changed = true;
            } else if (udExists && Object.prototype.hasOwnProperty.call(data.userDefined, '0')) {
                const zero = data.userDefined['0'] && typeof data.userDefined['0'] === 'object' ? { ...(data.userDefined['0']) } : {};
                const imgs = Array.isArray(data.userDefined.images) ? data.userDefined.images : undefined;
                const thumb = typeof data.userDefined.thumbnail !== 'undefined' ? data.userDefined.thumbnail : undefined;
                const order = Array.isArray(data.userDefined.imageOrder) ? data.userDefined.imageOrder : undefined;
                const normalized = { ...zero };
                if (typeof imgs !== 'undefined') normalized.images = imgs;
                if (typeof thumb !== 'undefined') normalized.thumbnail = thumb;
                if (typeof order !== 'undefined') normalized.imageOrder = order;
                data.userDefined = normalized;
                udExists = true;
                changed = true;
            }
        } catch (e) {
            console.warn('Failed to normalize legacy userDefined shape:', e);
        }

        if (parsedImages && parsedImages.length > 0) {
            if (!udExists) {
                data.userDefined = {};
                changed = true;
            }
            if (!data.userDefined.thumbnail) {
                data.userDefined.thumbnail = 'parsed:0';
                changed = true;
            }
            if (!Array.isArray(data.userDefined.imageOrder) || data.userDefined.imageOrder.length === 0) {
                const imageOrder = [];
                for (let i = 0; i < parsedImages.length; i++) imageOrder.push(`parsed:${i}`);
                const userImgs = Array.isArray(data.userDefined.images) ? data.userDefined.images : [];
                for (let i = 0; i < userImgs.length; i++) imageOrder.push(`user:${i}`);
                data.userDefined.imageOrder = imageOrder;
                changed = true;
            }
        }

        if (changed) {
            const safeTarget = protectModelFileWrite(absoluteFilePath);
            await safeWriteJson(safeTarget, data);
            console.log('Post-processed munchie file to include userDefined.thumbnail/imageOrder:', safeTarget);
        }
    } catch (e) {
        console.warn('postProcessMunchieFile error for', absoluteFilePath, e);
    }
}

// --- Routes ---

// GET /api/models - List all models
router.get('/models', (req, res) => modelController.listModels(req, res));

// POST /api/models/scan
router.post('/models/scan', (req, res) => maintenanceController.scanModels(req, res));

// PATCH /api/models/:id - Update model (Modern)
// GET /api/models/:id - Load model by ID (RESTful)
// Routes moved to end of file to prevent shadowing specific paths

// PATCH /api/models/bulk-update - Bulk update models
router.patch('/models/bulk-update', (req, res) => mutationController.bulkUpdateModels(req, res));


// --- Mutation Controller ---
const mutationController = require('../../controllers/legacy/mutationController');

// POST /api/save-model
router.post('/save-model', (req, res) => mutationController.saveModel(req, res));

// GET /api/models/load (Load single model)
router.get('/models/load', (req, res) => modelController.loadModel(req, res));

// POST /api/models/delete
router.post('/models/delete', (req, res) => mutationController.deleteModels(req, res));

// POST /api/models/restore/upload
router.post('/models/restore/upload', upload.single('backupFile'), (req, res) => backupController.restoreBackupUpload(req, res));

// POST /api/models/backup
router.post('/models/backup', async (req, res) => {
    try {
        const modelsDir = getAbsoluteModelsPath();
        const backup = {
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            files: [],
            collections: undefined
        };

        function findMunchieFiles(dir) {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    findMunchieFiles(fullPath);
                } else if (entry.name.endsWith('-munchie.json')) {
                    try {
                        const relativePath = path.relative(modelsDir, fullPath);
                        const content = fs.readFileSync(fullPath, 'utf8');
                        const jsonData = JSON.parse(content);

                        backup.files.push({
                            relativePath: relativePath.replace(/\\/g, '/'),
                            originalPath: relativePath.replace(/\\/g, '/'),
                            content: jsonData,
                            hash: jsonData.hash || null,
                            size: Buffer.byteLength(content, 'utf8')
                        });

                        // Collect collections if backup.collections undefined (first pass)
                    } catch (error) { }
                }
            }
        }
        findMunchieFiles(modelsDir);

        const jsonString = JSON.stringify(backup, null, 2);
        const compressed = zlib.gzipSync(Buffer.from(jsonString, 'utf8'));
        const timestamp = backup.timestamp.replace(/[:.]/g, '-').slice(0, 19);
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="munchie-backup-${timestamp}.gz"`);
        res.send(compressed);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/models/download (Secure)
router.get('/models/download', (req, res) => modelController.downloadModel(req, res));

// POST /api/models/verify
router.post('/models/verify', (req, res) => maintenanceController.verifyFile(req, res));

// POST /api/models/suggest (Gemini)
router.post('/models/suggest', (req, res) => modelController.suggestModel(req, res));

// GET /api/models/folders
router.get('/models/folders', (req, res) => {
    try {
        const modelsDir = getAbsoluteModelsPath();
        const folders = ['uploads'];
        function walk(dir, rel = '') {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const subRel = rel ? (rel + '/' + entry.name) : entry.name;
                    folders.push(subRel);
                    walk(path.join(dir, entry.name), subRel);
                }
            }
        }
        if (fs.existsSync(modelsDir)) walk(modelsDir);
        res.json({ success: true, folders: Array.from(new Set(folders)).sort() });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/models/folders (Create)
router.post('/models/folders', async (req, res) => mutationController.createModelFolder(req, res));

// GET /api/models/munchies
router.get('/models/munchies', (req, res) => {
    const modelsDir = getAbsoluteModelsPath();
    let result = [];
    function scan(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) scan(full);
            else if (e.name.endsWith('-munchie.json')) {
                try {
                    const d = JSON.parse(fs.readFileSync(full, 'utf8'));
                    result.push({
                        fileName: e.name, hash: d.hash,
                        modelUrl: '/models/' + path.relative(modelsDir, full).replace(/\\/g, '/')
                    });
                } catch { }
            }
        }
    }
    scan(modelsDir);
    res.json(result);
});

// GET /api/models/validate
router.get('/models/validate', (req, res) => maintenanceController.validatePath(req, res));


// Document Upload
// Document Upload (Alias)
router.post('/models/upload-document', upload.array('files'), (req, res) => mutationController.uploadDocument(req, res));

// Duplicate /hash-check removed. See service-based implementation below.

// GCode Parse (Full Implementation)
// GCode Parse (Service-Based)
router.post('/parse-gcode', upload.single('file'), (req, res) => modelController.parseGcode(req, res));


// --- Maintenance Controller ---
const maintenanceController = require('../../controllers/legacy/maintenanceController');

// POST /api/regenerate-munchie-files
router.post('/regenerate-munchie-files', (req, res) => maintenanceController.regenerateMunchieFiles(req, res));

// --- Hash Check ---
router.post('/hash-check', (req, res) => maintenanceController.hashCheck(req, res));

// --- Load Model ---
router.get('/load-model', async (req, res) => {
    try {
        const { filePath, id } = req.query;
        const modelsDir = path.resolve(getModelsDirectory());

        if (id && typeof id === 'string' && id.trim().length > 0) {
            safeLog('Load model by id requested', { id });
            function findById(dir) {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const full = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        const r = findById(full);
                        if (r) return r;
                    } else if (entry.name.toLowerCase().endsWith('-munchie.json') || entry.name.toLowerCase().endsWith('-stl-munchie.json')) {
                        try {
                            const raw = fs.readFileSync(full, 'utf8');
                            if (!raw || raw.trim().length === 0) continue;
                            const parsed = JSON.parse(raw);
                            if (parsed && (parsed.id === id || parsed.name === id)) return full;
                        } catch (e) { }
                    }
                }
                return null;
            }

            try {
                const found = findById(modelsDir);
                if (found) {
                    const content = fs.readFileSync(found, 'utf8');
                    const parsed = JSON.parse(content);
                    return res.json(parsed);
                }
                return res.status(404).json({ success: false, error: 'Model not found for id' });
            } catch (e) {
                console.error('Error during id lookup for /load-model:', e);
            }
        }

        if (!filePath || typeof filePath !== 'string') {
            return res.status(400).json({ success: false, error: 'Missing file path' });
        }

        let fullPath;
        if (path.isAbsolute(filePath)) {
            fullPath = path.resolve(filePath);
        } else {
            let rel = filePath.replace(/\\/g, '/').replace(/^\//, '');
            if (rel.includes('..')) return res.status(400).json({ success: false, error: 'Invalid relative path' });
            fullPath = path.join(modelsDir, rel);
        }
        safeLog('Resolved path for /load-model', { resolved: fullPath });

        const resolvedModelsDir = modelsDir.endsWith(path.sep) ? modelsDir : modelsDir + path.sep;
        const resolvedFull = fullPath;
        if (!resolvedFull.startsWith(modelsDir) && !resolvedFull.startsWith(resolvedModelsDir)) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        if (!fs.existsSync(fullPath)) return res.status(404).json({ success: false, error: 'File not found' });
        if (!fullPath.toLowerCase().endsWith('.json')) return res.status(400).json({ success: false, error: 'Only JSON files can be loaded as model data' });

        const fileContent = fs.readFileSync(fullPath, 'utf8');
        if (fileContent.trim().length === 0) return res.status(400).json({ success: false, error: 'Empty file' });

        const modelData = JSON.parse(fileContent);
        res.json(modelData);
    } catch (error) {
        console.error('Error loading model:', error);
        res.status(500).json({ success: false, error: 'Failed to load model data' });
    }
});

// --- Delete Models ---
router.post('/delete-models', (req, res) => {
    const { files } = req.body;
    if (!Array.isArray(files)) return res.status(400).json({ success: false, error: 'No files provided' });

    const modelsDir = getAbsoluteModelsPath();
    let deleted = [];
    let errors = [];
    files.forEach(file => {
        const filePath = path.join(modelsDir, file);
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                deleted.push(file);
            }
        } catch (err) {
            errors.push({ file, error: err.message });
        }
    });
    res.json({ success: errors.length === 0, deleted, errors });
});

// --- Verify File Path ---
router.post('/verify-file', (req, res) => maintenanceController.verifyFile(req, res));

// --- Validate 3MF ---
router.get('/validate-3mf', (req, res) => maintenanceController.validate3mf(req, res));

// --- Gemini Suggest ---
router.post('/gemini-suggest', (req, res) => modelController.suggestModel(req, res));

// --- Delete Models (Complex) ---
router.delete('/models/delete', (req, res) => mutationController.deleteModels(req, res));

// --- Backup Service Integration ---
const backupController = require('../../controllers/legacy/backupController');

// --- Backup Munchie Files ---
router.post('/backup-munchie-files', (req, res) => backupController.createBackup(req, res));

// --- Restore Munchie Files ---
router.post('/restore-munchie-files', (req, res) => backupController.restoreBackup(req, res));

// --- Restore Upload ---
router.post('/restore-munchie-files/upload', upload.single('backupFile'), (req, res) => backupController.restoreBackupUpload(req, res));

// --- Model Metadata Update ---
// (Duplicate /model/metadata removed)


// ==========================================
// RESTful ID Routes (Must be last to avoid shadowing)
// ==========================================

// GET /api/models/:id - Load model by ID (RESTful)
router.get('/models/:id', (req, res) => {
    return modelController.loadModel(req, res);
});

// PATCH /api/models/:id - Update model (Modern)
router.patch('/models/:id', (req, res) => {
    // Adapt request for MutationController.saveModel which expects { id, changes } in body
    if (req.body) {
        req.body.id = req.params.id;
        const flatChanges = { ...req.body };
        req.body = {
            id: req.params.id,
            changes: flatChanges
        };
    }
    return mutationController.saveModel(req, res);
});

module.exports = router;

// --- Model Metadata Update ---
router.post('/model/metadata', (req, res) => mutationController.updateMetadata(req, res));

// --- Upload Document / Project Assets ---
router.post('/upload-document', upload.array('files'), (req, res) => mutationController.uploadDocument(req, res));

// --- Generate Thumbnails ---
router.post('/generate-thumbnails', (req, res) => maintenanceController.generateThumbnails(req, res));

// --- List Model Folders ---
router.get('/model-folders', (req, res) => modelController.listFolders(req, res));

// --- Create Model Folder ---
router.post('/create-model-folder', express.json(), (req, res) => mutationController.createModelFolder(req, res));

// --- Munchie Files List ---
router.get('/munchie-files', (req, res) => modelController.listMunchieFiles(req, res));
