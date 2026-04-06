const fs = require('fs');
const path = require('path');
const { ConfigManager } = require('../dist-backend/utils/configManager');

// Collections storage helpers (persist under data/collections.json)
// Allow override via env var and use a test-specific file when running under Vitest/Node test env.
const collectionsFilePath = (() => {
    const defaultPath = path.join(process.cwd(), 'data', 'collections.json');
    try {
        const envPath = process.env.COLLECTIONS_FILE;
        if (envPath && typeof envPath === 'string' && envPath.trim()) {
            return path.isAbsolute(envPath) ? envPath : path.join(process.cwd(), envPath);
        }
        if (process.env.NODE_ENV === 'test') {
            return path.join(process.cwd(), 'data', 'collections.test.json');
        }
    } catch { }
    return defaultPath;
})();

function loadCollections() {
    try {
        if (!fs.existsSync(collectionsFilePath)) return [];
        const raw = fs.readFileSync(collectionsFilePath, 'utf8');
        if (!raw || raw.trim() === '') return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.collections) ? parsed.collections : []);
    } catch (e) {
        console.warn('Failed to load collections.json:', e);
        return [];
    }
}

function saveCollections(collections) {
    try {
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        const tmp = collectionsFilePath + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(collections, null, 2), 'utf8');
        fs.renameSync(tmp, collectionsFilePath);
        return true;
    } catch (e) {
        console.error('Failed to save collections.json:', e);
        return false;
    }
}

// --- Shared File Helpers ---

// Helper: Safe JSON Write with Retry (for Network Drives)
async function safeWriteJson(filePath, data, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
            return;
        } catch (e) {
            if (i === retries - 1) throw e;
            if (e.code === 'EPERM' || e.code === 'EBUSY') {
                console.warn(`[SafeWrite] Locked file ${path.basename(filePath)}, retrying (${i + 1}/${retries})...`);
                await new Promise(r => setTimeout(r, 1000 * (i + 1)));
            } else {
                throw e;
            }
        }
    }
}

// Helper: Ensure 3mf/stl write protection
function protectModelFileWrite(targetPath) {
    try {
        if (!targetPath || typeof targetPath !== 'string') return targetPath;
        if (/\.3mf$/i.test(targetPath)) {
            return targetPath.replace(/\.3mf$/i, '-munchie.json');
        }
        if (/\.stl$/i.test(targetPath)) {
            return targetPath.replace(/\.stl$/i, '-stl-munchie.json');
        }
    } catch (e) { console.warn('protectModelFileWrite error:', e); }
    return targetPath;
}

// Helper: Get Models Directory
// Priority order (DB mode — config.json is authoritative IF the path resolves):
//   1. data/config.json → settings.modelDirectory  (set via UI Settings page)
//      ONLY used if the resolved path actually exists on disk
//   2. MODELS_PATH env var                          (Docker / headless fallback)
//   3. ConfigManager compiled default               (last resort)
function getModelsDirectory() {
    try {
        const globalPath = path.join(process.cwd(), 'data', 'config.json');
        if (fs.existsSync(globalPath)) {
            const parsed = JSON.parse(fs.readFileSync(globalPath, 'utf8') || '{}');
            const dir = parsed?.settings?.modelDirectory;
            if (dir) {
                // Only use config.json value if the path actually exists on disk.
                // This prevents a stale test path from silently breaking the whole server.
                const absDir = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
                if (fs.existsSync(absDir)) return dir;
            }
        }
    } catch (e) { }
    // Fall back to env var (Docker / CI, or when config.json has an invalid path)
    if (process.env.MODELS_PATH) return process.env.MODELS_PATH;
    const config = ConfigManager.loadConfig();
    return (config.settings && config.settings.modelDirectory) || './models';
}

function getAbsoluteModelsPath() {
    const dir = getModelsDirectory();
    return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

module.exports = {
    loadCollections,
    saveCollections,
    safeWriteJson,
    protectModelFileWrite,
    getModelsDirectory,
    getAbsoluteModelsPath,
    collectionsFilePath
};
