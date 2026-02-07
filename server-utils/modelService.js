const fs = require('fs');
const path = require('path');
const { computeMD5, parse3MF, parseSTL } = require('../dist-backend/utils/threeMFToJson');
const { getAbsoluteModelsPath, protectModelFileWrite, safeWriteJson } = require('./dataAccess');

// Helper: Scan directory recursively and migrate files
async function migrateModels(fileType = "3mf", onProgress) {
    const modelsDir = getAbsoluteModelsPath();
    const migrated = [];
    const skipped = [];
    const errors = [];

    // Helper to perform migration for a single file
    async function migrateFile(full) {
        try {
            const raw = fs.readFileSync(full, 'utf8');
            if (!raw || raw.trim().length === 0) { skipped.push({ file: full, reason: 'empty' }); return false; }
            let data = JSON.parse(raw);
            let changed = false;

            // Legacy top-level images -> parsedImages
            if (Array.isArray(data.images) && (!Array.isArray(data.parsedImages) || data.parsedImages.length === 0)) {
                data.parsedImages = data.images.slice();
                try { delete data.images; } catch (e) { }
                changed = true;
            }

            // Legacy top-level thumbnail handling
            if (data.thumbnail && typeof data.thumbnail === 'string') {
                if (data.thumbnail.startsWith('data:')) {
                    if (!Array.isArray(data.parsedImages)) data.parsedImages = [];
                    const existingIdx = data.parsedImages.findIndex(p => p === data.thumbnail || (p && p.data === data.thumbnail));
                    if (existingIdx !== -1) data.parsedImages.splice(existingIdx, 1);
                    data.parsedImages.unshift(data.thumbnail);
                    try { delete data.thumbnail; } catch (e) { }
                    changed = true;
                } else if (!data.userDefined) {
                    data.userDefined = { thumbnail: data.thumbnail };
                    try { delete data.thumbnail; } catch (e) { }
                    changed = true;
                } else {
                    try { delete data.thumbnail; } catch (e) { }
                    changed = true;
                }
            }

            if (changed) {
                const safeTarget = protectModelFileWrite(full);
                await safeWriteJson(safeTarget, data);
                migrated.push(full);
                return true;
            } else {
                skipped.push(full);
                return false;
            }
        } catch (e) {
            errors.push({ file: full, error: e.message || String(e) });
            return false;
        }
    }

    async function scanAndMigrate(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await scanAndMigrate(full);
            } else if (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json')) {
                const changed = await migrateFile(full);
                if (onProgress) onProgress({ file: path.relative(modelsDir, full).replace(/\\/g, '/'), changed });
            }
        }
    }

    await scanAndMigrate(modelsDir);
    return { processed: migrated.length, skipped: skipped.length, errors, migrated };
}

async function regenerateMetadata(modelIds, filePaths) {
    const modelsDir = getAbsoluteModelsPath();
    let allModels = [];

    function scanForModels(directory) {
        const entries = fs.readdirSync(directory, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                scanForModels(fullPath);
            } else if (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json')) {
                try {
                    const fileContent = fs.readFileSync(fullPath, 'utf8');
                    const model = JSON.parse(fileContent);
                    const relativePath = path.relative(modelsDir, fullPath);
                    if (entry.name.endsWith('-stl-munchie.json')) {
                        model.filePath = relativePath.replace('-stl-munchie.json', '.stl');
                    } else {
                        model.filePath = relativePath.replace('-munchie.json', '.3mf');
                    }
                    model.jsonPath = fullPath;
                    allModels.push(model);
                } catch (e) { }
            }
        }
    }
    scanForModels(modelsDir);

    let targets = [];
    if (modelIds && modelIds.length > 0) {
        targets = allModels.filter(m => modelIds.includes(m.id));
    }
    // filePaths logic omitted/simplified as in original route

    let processed = 0;
    let errors = [];

    for (const model of targets) {
        try {
            const modelFilePath = path.join(modelsDir, model.filePath);
            if (!fs.existsSync(modelFilePath)) continue;

            const buffer = fs.readFileSync(modelFilePath);
            const hash = computeMD5(buffer);
            let newMetadata;

            if (modelFilePath.toLowerCase().endsWith('.3mf')) {
                newMetadata = await parse3MF(modelFilePath, model.id, hash);
            } else if (modelFilePath.toLowerCase().endsWith('.stl')) {
                newMetadata = await parseSTL(modelFilePath, model.id, hash);
            } else { continue; }

            let merged = { ...newMetadata, ...model };
            if (newMetadata.parseError) merged.parseError = newMetadata.parseError;

            const safeTarget = protectModelFileWrite(model.jsonPath);
            await safeWriteJson(safeTarget, merged);
            processed++;
        } catch (e) {
            errors.push({ id: model.id, error: e.message });
        }
    }
    return { processed, errors };
}

async function performHashCheck(fileType = "3mf") {
    const modelsDir = getAbsoluteModelsPath();
    const hashToFiles = {};
    const result = [];
    const modelMap = {};

    function scanDirectory(dir) {
        let entries = [];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (e) {
            return; // Skip folders we can't read
        }
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.name.startsWith('.') || entry.name === 'System Volume Information' || entry.name === '$RECYCLE.BIN') continue;

            if (entry.isDirectory()) {
                scanDirectory(fullPath);
            } else {
                const relativePath = path.relative(modelsDir, fullPath);
                if (fileType === "3mf") {
                    const lowerPath = relativePath.toLowerCase();
                    if ((lowerPath.endsWith('.gcode.3mf') || lowerPath.endsWith('.3mf.gcode'))) continue;
                    if (lowerPath.endsWith('.3mf')) {
                        const base = relativePath.replace(/\.3mf$/i, '');
                        modelMap[base] = modelMap[base] || {};
                        modelMap[base].threeMF = relativePath;
                    } else if (lowerPath.endsWith('-munchie.json')) {
                        const base = relativePath.replace(/-munchie\.json$/i, '');
                        modelMap[base] = modelMap[base] || {};
                        modelMap[base].json = relativePath;
                    }
                } else if (fileType === "stl") {
                    const lowerPath = relativePath.toLowerCase();
                    if (lowerPath.endsWith('.stl')) {
                        const base = relativePath.replace(/\.stl$/i, '');
                        modelMap[base] = modelMap[base] || {};
                        modelMap[base].stl = relativePath;
                    } else if (lowerPath.endsWith('-stl-munchie.json')) {
                        const base = relativePath.replace(/-stl-munchie\.json$/i, '');
                        modelMap[base] = modelMap[base] || {};
                        modelMap[base].json = relativePath;
                    }
                }
            }
        }
    }
    scanDirectory(modelsDir);

    const cleanedModelMap = {};
    for (const base in modelMap) {
        const entry = modelMap[base];
        if (fileType === "3mf" && entry.threeMF) cleanedModelMap[base] = entry;
        else if (fileType === "stl" && entry.stl) cleanedModelMap[base] = entry;
    }

    for (const base in cleanedModelMap) {
        const entry = cleanedModelMap[base];
        const threeMFPath = entry.threeMF ? path.join(modelsDir, entry.threeMF) : null;
        const stlPath = entry.stl ? path.join(modelsDir, entry.stl) : null;
        const jsonPath = entry.json ? path.join(modelsDir, entry.json) : null;
        const modelPath = threeMFPath || stlPath;
        let status = 'ok';
        let details = '';
        let hash = null;
        let storedHash = null;

        try {
            if (!modelPath || !fs.existsSync(modelPath)) {
                status = 'missing';
                details = 'Model file not found';
            } else {
                const buffer = fs.readFileSync(modelPath);
                try { hash = computeMD5(buffer); }
                catch (e) { hash = null; status = 'error'; details = 'Failed to compute hash: ' + (e && e.message); }

                if (jsonPath && fs.existsSync(jsonPath)) {
                    try {
                        const raw = fs.readFileSync(jsonPath, 'utf8');
                        if (raw && raw.trim().length > 0) {
                            const parsed = JSON.parse(raw);
                            storedHash = parsed && (parsed.hash || parsed.md5 || parsed.fileHash || null);
                        }
                    } catch (e) { if (!details) details = 'Failed to read munchie JSON'; }
                } else {
                    if (!details) details = 'Munchie JSON file missing';
                    if (status === 'ok') status = 'missing_munchie';
                }

                if (hash && storedHash && hash !== storedHash) {
                    status = 'changed';
                    details = details ? details + '; hash mismatch' : 'Hash mismatch: file changed since last recorded';
                }
            }
        } catch (e) { status = 'error'; details = e.message; }

        if (hash) {
            if (hashToFiles[hash]) hashToFiles[hash].push(base);
            else hashToFiles[hash] = [base];
        }

        result.push({
            baseName: base,
            threeMF: entry.threeMF || null,
            stl: entry.stl || null,
            json: entry.json || null,
            hash, storedHash, status, details
        });
    }

    result.forEach(r => {
        if (r.hash && hashToFiles[r.hash] && hashToFiles[r.hash].length > 1) {
            r.duplicates = hashToFiles[r.hash].filter(b => b !== r.baseName);
        }
    });

    return result;
}

async function deleteModels(modelIds, fileTypes) {
    if (!Array.isArray(modelIds) || modelIds.length === 0) throw new Error('No model IDs provided');

    const typesToDelete = Array.isArray(fileTypes) && fileTypes.length > 0 ? fileTypes : ['3mf', 'stl', 'json'];
    const modelsDir = getAbsoluteModelsPath();
    let deleted = [];
    let errors = [];
    let allModels = [];

    function scanForModels(directory) {
        const entries = fs.readdirSync(directory, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                scanForModels(fullPath);
            } else if (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json')) {
                try {
                    const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                    const modelObj = {
                        ...data,
                        jsonPath: fullPath,
                        fullModelPath: data.filePath ? path.join(modelsDir, data.filePath) : null
                    };
                    allModels.push(modelObj);
                } catch (error) { }
            }
        }
    }
    scanForModels(modelsDir);

    const targets = allModels.filter(m => modelIds.includes(m.id));
    const keepers = allModels.filter(m => !modelIds.includes(m.id));

    for (const model of targets) {
        const filesToDelete = [];
        const modelParentDir = path.dirname(model.jsonPath);

        if (model.filePath) {
            const absPath = path.join(modelsDir, model.filePath);
            if (typesToDelete.some(t => absPath.toLowerCase().endsWith(t))) {
                filesToDelete.push({ type: 'model', path: absPath });
            }
        }

        if (typesToDelete.includes('json')) {
            const assetPaths = [
                ...(model.parsedImages || []),
                ...(model.userDefined?.images || []),
                ...(model.related_files || [])
            ];

            assetPaths.forEach(asset => {
                if (typeof asset !== 'string') return;
                let relPath = asset.startsWith('/models/') ? asset.substring(8) : asset;
                filesToDelete.push({ type: 'asset', path: path.join(modelsDir, relPath) });
            });

            filesToDelete.push({ type: 'json', path: model.jsonPath });
            const thumbPath = model.jsonPath.replace(/(-stl)?-munchie\.json$/, (m) => m.includes('stl') ? '.stl-thumb.png' : '.3mf-thumb.png');
            if (fs.existsSync(thumbPath)) filesToDelete.push({ type: 'thumbnail', path: thumbPath });
        }

        for (const fileInfo of filesToDelete) {
            try {
                if (!fs.existsSync(fileInfo.path)) continue;

                const isShared = keepers.some(k => {
                    const kAssets = [
                        k.filePath,
                        ...(k.parsedImages || []),
                        ...(k.userDefined?.images || []),
                        ...(k.related_files || [])
                    ].map(p => p?.startsWith('/models/') ? p.substring(8) : p);

                    const relTarget = path.relative(modelsDir, fileInfo.path).replace(/\\/g, '/');
                    return kAssets.includes(relTarget);
                });

                if (isShared) continue;

                fs.unlinkSync(fileInfo.path);
                deleted.push({ modelId: model.id, type: fileInfo.type, path: path.relative(modelsDir, fileInfo.path) });

            } catch (err) {
                errors.push({ modelId: model.id, error: err.message });
            }
        }

        const relativeParent = path.relative(modelsDir, modelParentDir);
        const systemFolders = ['', '.', 'uploads', 'imported'];

        if (!systemFolders.includes(relativeParent)) {
            try {
                if (fs.existsSync(modelParentDir)) {
                    const remainingEntries = fs.readdirSync(modelParentDir);
                    const hasOtherModels = remainingEntries.some(f => f.endsWith('munchie.json'));

                    if (!hasOtherModels) {
                        remainingEntries.forEach(entry => {
                            const entryPath = path.join(modelParentDir, entry);
                            if (fs.statSync(entryPath).isFile()) fs.unlinkSync(entryPath);
                        });
                        fs.rmdirSync(modelParentDir);
                    }
                }
            } catch (e) { }
        }
    }
    return { success: errors.length === 0, deleted, errors };
}

module.exports = {
    migrateModels,
    regenerateMetadata,
    performHashCheck,
    deleteModels
};
