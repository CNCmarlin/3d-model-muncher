const modelService = require('../services/modelService_db');

const fs = require('fs');
const path = require('path');
const { getAbsoluteModelsPath } = require('../../server-utils/dataAccess');
// gcodeService might be needed if not dynamic
// genaiAdapter might be needed if not dynamic

class ModelControllerDB {

    // GET /api/models
    listModels(req, res) {
        try {
            const models = modelService.getAllModels();
            console.log(`API /models scan complete: found ${models.length} model(s)`);
            res.json(models);
        } catch (error) {
            console.error('Error loading models:', error);
            res.status(500).json({ success: false, message: 'Failed to load models', error: error.message });
        }
    }

    // GET /api/models/load
    loadModel(req, res) {
        try {
            // Support both query param (legacy) and route param (REST)
            const id = req.params?.id || req.query.id;
            const { filePath } = req.query;

            console.log(`[ModelController] loadModel called with id: "${id}", filePath: "${filePath}"`);
            const model = modelService.getModel(id, filePath);
            res.json(model);
        } catch (error) {
            // Map errors to status codes
            const msg = error.message;
            if (msg === 'Model not found for id' || msg === 'File not found') {
                return res.status(404).json({ success: false, error: msg });
            }
            if (msg === 'Missing file path' || msg === 'Invalid path') {
                return res.status(400).json({ success: false, error: msg });
            }
            if (msg === 'Access denied') {
                return res.status(403).json({ success: false, error: msg });
            }

            res.status(500).json({ success: false, error: msg });
        }
    }

    // GET /api/model-folders
    listFolders(req, res) {
        try {
            const folders = modelService.listFolders();
            res.json({ success: true, folders });
        } catch (error) {
            console.error('Failed to list model folders:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // GET /api/munchie-files
    listMunchieFiles(req, res) {
        const modelsDir = require('../../server-utils/dataAccess').getAbsoluteModelsPath(); // Hack: Just to match legacy log if needed, or service handles it.
        // Legacy code logged: [debug] /api/munchie-files scanning modelsDir=...
        // Service should handle logging if needed, or we skip it.
        try {
            const result = modelService.listMunchieFiles();
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: 'Failed to read models directory' });
        }
    }
    // GET /api/models/download
    async downloadModel(req, res) {
        try {
            const { path: targetPath } = req.query;
            if (!targetPath) return res.status(400).send('Missing path');

            let relPath = targetPath;
            // Clean up path
            if (relPath.startsWith('/models/')) relPath = relPath.substring(8);
            else if (relPath.startsWith('models/')) relPath = relPath.substring(7);

            // Security check
            if (relPath.includes('..') || path.isAbsolute(relPath) && !relPath.startsWith(getAbsoluteModelsPath())) {
                return res.status(403).send('Access denied');
            }

            const modelsDir = getAbsoluteModelsPath();
            // Ensure we don't double join if relPath is already absolute (but inside modelsDir)
            const absPath = path.isAbsolute(relPath) ? relPath : path.join(modelsDir, relPath);

            if (!fs.existsSync(absPath)) {
                console.warn(`[Download] File not found: ${absPath}`);
                return res.status(404).send('Not found');
            }

            const filename = path.basename(absPath);
            // console.log(`[Download] Serving: ${filename} from ${absPath}`);
            res.download(absPath, filename, (err) => {
                if (err && !res.headersSent) {
                    // console.error(`[Download] Error sending file: ${err.message}`); 
                }
            });
        } catch (e) {
            console.error('[Download] Server error:', e);
            if (!res.headersSent) res.status(500).send('Server error');
        }
    }

    // POST /api/parse-gcode
    async parseGcode(req, res) {
        try {
            const { processGcodeRequest } = require('../../server-utils/gcodeService');
            const modelsDir = getAbsoluteModelsPath();
            const result = await processGcodeRequest({ file: req.file, body: req.body }, modelsDir);
            res.json(result);
        } catch (e) {
            console.error('G-code parsing error:', e);
            const msg = e.message || '';
            if (msg.includes('Access denied')) return res.status(403).json({ success: false, error: msg });
            if (msg.includes('required') || msg.includes('must be')) return res.status(400).json({ success: false, error: msg });
            if (msg.includes('not found')) return res.status(404).json({ success: false, error: msg });
            res.status(500).json({ success: false, error: msg });
        }
    }

    // POST /api/models/suggest
    async suggestModel(req, res) {
        try {
            const { imageBase64, mimeType, prompt, config } = req.body || {};
            if (!prompt || typeof prompt !== 'string') return res.status(400).json({ success: false, error: 'Prompt is required' });

            const requestedProvider = (req.body && req.body.provider) || process.env.GEMINI_PROVIDER;
            let genaiResult = null;
            try {
                const adapterPath = path.join(__dirname, '../../server-utils', 'genaiAdapter');
                const adapter = require(adapterPath);
                genaiResult = await adapter.suggest({ prompt, imageBase64, mimeType, provider: requestedProvider, config: config || {} });
            } catch (e) {
                console.warn('GenAI adapter error:', e && e.message);
                genaiResult = null;
            }

            if (genaiResult) {
                const suggestion = {
                    description: genaiResult.description || '',
                    category: genaiResult.category || '',
                    tags: Array.isArray(genaiResult.tags) ? genaiResult.tags : []
                };
                return res.json({ success: true, suggestion, raw: genaiResult.raw || null });
            }

            // Fallback
            const lower = prompt.toLowerCase();
            const words = Array.from(new Set(lower.replace(/[\W_]+/g, ' ').split(/\s+/).filter(w => w.length > 3)));
            const tags = words.slice(0, 6);
            res.json({ success: true, suggestion: { description: `AI suggestion (mock) based on prompt: ${prompt}`, category: tags[0] || '', tags }, raw: null });
        } catch (err) {
            console.error('/gemini-suggest error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    }
}

module.exports = new ModelControllerDB();
