const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { loadCollections, saveCollections } = require('./dataAccess');
const { computeMD5 } = require('../dist-backend/utils/threeMFToJson');

// Helper to prevent partial writes
function protectModelFileWrite(filePath) {
    if (filePath.toLowerCase().endsWith('.3mf') || filePath.toLowerCase().endsWith('.stl')) {
        const ext = path.extname(filePath).toLowerCase();
        let jsonPath;
        if (ext === '.stl') {
            jsonPath = filePath.substring(0, filePath.length - 4) + '-stl-munchie.json';
        } else {
            jsonPath = filePath.substring(0, filePath.length - 4) + '-munchie.json';
        }
        return jsonPath;
    }
    return filePath;
}

function safeLog(msg, data) {
    try {
        const sanitised = JSON.parse(JSON.stringify(data, (key, value) => {
            if (typeof value === 'string' && value.length > 200) return value.substring(0, 200) + '...';
            return value;
        }));
        console.log(msg, sanitised);
    } catch (e) { console.log(msg, data); }
}

async function createBackup(modelsDir) {
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
                        originalPath: relativePath.replace(/\\/g, '/'), // Legacy support
                        content: jsonData,
                        hash: jsonData.hash || null,
                        size: Buffer.byteLength(content, 'utf8')
                    });
                } catch (error) { console.error(`Error reading munchie file ${fullPath}:`, error); }
            }
        }
    }
    findMunchieFiles(modelsDir);

    try {
        const collectionsPath = path.join(process.cwd(), 'data', 'collections.json');
        if (fs.existsSync(collectionsPath)) {
            const raw = fs.readFileSync(collectionsPath, 'utf8');
            if (raw && raw.trim() !== '') {
                const parsed = JSON.parse(raw);
                const cols = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.collections) ? parsed.collections : []);
                backup.collections = cols;
            } else {
                backup.collections = [];
            }
        }
    } catch (e) { console.warn('Failed to read collections.json for backup:', e.message); }

    const jsonString = JSON.stringify(backup, null, 2);
    const compressed = zlib.gzipSync(Buffer.from(jsonString, 'utf8'));

    const timestamp = backup.timestamp.replace(/[:.]/g, '-').slice(0, 19);
    const filename = `munchie-backup-${timestamp}.gz`;

    return { compressed, filename, count: backup.files.length };
}

async function restoreBackup(backupData, modelsDir, strategy = 'hash-match', collectionsStrategy = 'merge') {
    let backup;
    try { backup = typeof backupData === 'string' ? JSON.parse(backupData) : backupData; }
    catch (error) { throw new Error('Invalid backup data format'); }

    if (!backup.files || !Array.isArray(backup.files)) throw new Error('Invalid backup structure');

    const results = { restored: [], skipped: [], errors: [], strategy, collections: { restored: 0, skipped: 0, strategy: collectionsStrategy } };
    const existingFiles = new Map();

    function mapExistingFiles(dir) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    mapExistingFiles(fullPath);
                } else if (entry.name.endsWith('.3mf')) {
                    try {
                        const currentHash = computeMD5(fullPath);
                        const relativePath = path.relative(modelsDir, fullPath);
                        const munchieJsonPath = fullPath.replace(/\.3mf$/i, '-munchie.json');
                        if (fs.existsSync(munchieJsonPath)) {
                            existingFiles.set(currentHash, {
                                munchieJsonPath, threeMFPath: fullPath,
                                relativeMunchieJsonPath: relativePath.replace(/\.3mf$/i, '-munchie.json').replace(/\\/g, '/'),
                                currentHash
                            });
                        }
                    } catch (e) { }
                }
            }
        } catch (e) { }
    }
    mapExistingFiles(modelsDir);

    // Collections Restore
    try {
        if (backup.collections && Array.isArray(backup.collections)) {
            const existing = loadCollections();
            let next = [];
            if (collectionsStrategy === 'replace') {
                next = backup.collections;
            } else {
                const byId = new Map(existing.map(c => [c && c.id, c]).filter(([k]) => typeof k === 'string' && k));
                for (const c of backup.collections) {
                    if (c && typeof c.id === 'string' && c.id) byId.set(c.id, c);
                    else next.push({ ...c, id: Date.now().toString(36) + Math.random().toString(36).substr(2) });
                }
                next = [...new Set(next.concat(Array.from(byId.values()).filter(Boolean)))];
            }
            if (saveCollections(next)) results.collections.restored = next.length;
            else results.collections.skipped = backup.collections.length;
        }
    } catch (e) { results.errors.push({ originalPath: 'collections.json', error: 'Failed to restore collections: ' + e.message }); }

    // File Restore
    for (const backupFile of backup.files) {
        try {
            let targetPath;
            let shouldRestore = false;
            let reason = '';

            if (strategy === 'hash-match' && backupFile.hash) {
                const existing = existingFiles.get(backupFile.hash);
                if (existing) {
                    targetPath = existing.munchieJsonPath;
                    shouldRestore = true;
                    reason = `Hash match`;
                } else {
                    const originalPath = path.join(modelsDir, backupFile.originalPath);
                    if (fs.existsSync(originalPath)) {
                        targetPath = originalPath;
                        shouldRestore = true;
                        reason = 'Path match (no hash)';
                    } else {
                        results.skipped.push({ originalPath: backupFile.originalPath, reason: 'No match found' });
                        continue;
                    }
                }
            } else if (strategy === 'path-match') {
                const originalPath = path.join(modelsDir, backupFile.originalPath);
                if (fs.existsSync(originalPath)) {
                    targetPath = originalPath;
                    shouldRestore = true;
                    reason = 'Path match';
                } else {
                    results.skipped.push({ originalPath: backupFile.originalPath, reason: 'Original path not found' });
                    continue;
                }
            } else {
                targetPath = path.join(modelsDir, backupFile.originalPath);
                const dir = path.dirname(targetPath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                shouldRestore = true;
                reason = 'Force restore';
            }

            if (shouldRestore) {
                const safeTarget = protectModelFileWrite(targetPath);
                const restoredContent = JSON.stringify(backupFile.content, null, 2);
                const tmp = safeTarget + '.tmp';
                fs.writeFileSync(tmp, restoredContent, 'utf8');
                fs.renameSync(tmp, safeTarget);

                results.restored.push({
                    originalPath: backupFile.originalPath,
                    restoredPath: path.relative(modelsDir, safeTarget).replace(/\\/g, '/'),
                    reason,
                    size: backupFile.size
                });
            }
        } catch (error) {
            results.errors.push({ originalPath: backupFile.originalPath, error: error.message });
        }
    }

    safeLog('Restore details:', results);
    return results;
}

module.exports = { createBackup, restoreBackup };
