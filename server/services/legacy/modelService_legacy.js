const fs = require('fs');
const path = require('path');
const { scanForModels } = require('../../../server-utils/legacyScanner');
const { findById } = require('../../../server-utils/legacyFinder');
const { getAbsoluteModelsPath } = require('../../../server-utils/dataAccess');

class ModelServiceLegacy {

    /**
     * Get all models inside the models path
     * @returns {Array} List of models
     */
    getAllModels() {
        const absolutePath = getAbsoluteModelsPath();
        console.log(`[ModelService] Scanning count: ${absolutePath}`);
        // scanForModels takes (directory, rootPath). Here they are the same.
        return scanForModels(absolutePath, absolutePath);
    }

    /**
     * Get a model by ID or filePath
     * @param {string} id - optional: model ID
     * @param {string} filePath - optional: relative or absolute path
     * @returns {Object} The model data
     * @throws {Error} if not found or invalid
     */
    getModel(id, filePath) {
        const modelsDir = getAbsoluteModelsPath();

        // 1. Try by ID
        if (id && typeof id === 'string' && id.trim().length > 0) {
            const found = findById(modelsDir, id);
            if (found) {
                const content = fs.readFileSync(found, 'utf8');
                return JSON.parse(content);
            }
            // CRITICAL FIX: If ID was provided but not found, DO NOT fall through to filePath check.
            // Throw 404 immediately so controller catches it as "Model not found for id".
            throw new Error('Model not found for id');
        }

        // 2. Try by File Path
        if (!filePath || typeof filePath !== 'string') {
            throw new Error('Missing file path');
        }

        let fullPath;
        if (path.isAbsolute(filePath)) fullPath = path.resolve(filePath);
        else {
            let rel = filePath.replace(/\\/g, '/').replace(/^\//, '');
            if (rel.includes('..')) throw new Error('Invalid path'); // Simpler error than full route check?
            fullPath = path.join(modelsDir, rel);
        }

        if (!fullPath.startsWith(modelsDir)) throw new Error('Access denied');
        if (!fs.existsSync(fullPath)) throw new Error('File not found');

        const content = fs.readFileSync(fullPath, 'utf8');
        return JSON.parse(content);
    }
    /**
     * List all folders in the models directory
     * @returns {Array} List of folder paths relative to models root
     */
    listFolders() {
        const modelsDir = getAbsoluteModelsPath();
        const folders = [];

        function walk(dir, rel = '') {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const subRel = rel ? (rel + '/' + entry.name) : entry.name;
                    folders.push(subRel);
                    try { walk(path.join(dir, entry.name), subRel); } catch (e) { }
                }
            }
        }

        folders.push('uploads');
        if (fs.existsSync(modelsDir)) {
            walk(modelsDir);
        }
        return Array.from(new Set(folders)).sort();
    }

    /**
     * List all munchie JSON files with basic hash/url info
     * @returns {Array} List of munchie file summaries
     */
    listMunchieFiles() {
        const modelsDir = getAbsoluteModelsPath();
        const result = [];

        function scanDirectory(dir) {
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        scanDirectory(fullPath);
                    } else if (entry.name.toLowerCase().endsWith('-munchie.json')) {
                        try {
                            const data = fs.readFileSync(fullPath, 'utf8');
                            const json = JSON.parse(data);
                            const relativePath = path.relative(modelsDir, fullPath);
                            const item = {
                                fileName: entry.name,
                                hash: json.hash,
                                modelUrl: '/models/' + relativePath.replace(/\\/g, '/')
                            };
                            result.push(item);
                        } catch (e) { console.error(`Error reading file ${fullPath}:`, e); }
                    }
                }
            } catch (e) { console.error(`Error scanning directory ${dir}:`, e); }
        }

        try {
            scanDirectory(modelsDir);
            return result;
        } catch (e) {
            throw new Error('Failed to read models directory');
        }
    }
}

module.exports = new ModelServiceLegacy();
