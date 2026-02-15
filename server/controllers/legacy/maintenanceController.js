const fs = require('fs');
const path = require('path');
const maintenanceService = require('../../services/legacy/maintenanceService');
const { regenerateMetadata, performHashCheck, migrateModels } = require('../../../server-utils/modelService');
const { parse3MF } = require('../../../dist-backend/utils/threeMFToJson');
const { getAbsoluteModelsPath } = require('../../../server-utils/dataAccess');

class MaintenanceController {

    // POST /api/scan-models (Legacy Migration)
    async scanModels(req, res) {
        try {
            const { fileType = "3mf", stream = false } = req.body;
            if (stream) {
                res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
                res.write(JSON.stringify({ type: 'scan-complete', processed: 0, skipped: 0 }) + '\n');

                const result = await migrateModels(fileType, (progress) => {
                    res.write(JSON.stringify({ type: 'migrate-file', ...progress }) + '\n');
                });

                res.write(JSON.stringify({ type: 'done', success: true }) + '\n');
                res.end();
            } else {
                const result = await migrateModels(fileType);
                res.json(result);
            }
        } catch (e) {
            console.error('Scan error:', e);
            if (!res.headersSent) res.status(500).json({ success: false, error: e.message });
        }
    }

    // POST /api/verify-file
    verifyFile(req, res) {
        try {
            const { path: incomingPath } = req.body || {};
            const result = maintenanceService.verifyFile(incomingPath);
            res.json(result);
        } catch (error) {
            if (error.message === 'Path required' || error.message === 'Empty path' || error.message === 'Path traversal not allowed' || error.message === 'UNC paths not allowed' || error.message === 'Absolute Windows paths not allowed') {
                return res.status(400).json({ success: false, error: error.message });
            }
            if (error.message === 'Access denied') {
                return res.status(403).json({ success: false, error: error.message });
            }
            console.error('verify-file error:', error);
            res.status(500).json({ success: false, error: 'Server error' });
        }
    }

    // POST /api/generate-thumbnails
    async generateThumbnails(req, res) {
        try {
            const { modelIds, force = false, skipEmbedded = false } = req.body;
            const port = process.env.PORT || 3001;
            const baseUrl = `http://127.0.0.1:${port}`;

            const result = await maintenanceService.generateThumbnails({ modelIds, force, skipEmbedded, baseUrl });
            res.json(result);
        } catch (error) {
            console.error('General generation error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // POST /api/regenerate-munchie-files
    async regenerateMunchieFiles(req, res) {
        try {
            // Using the simpler service-base implementation (logic from models.js line 995+)
            const { modelIds, filePaths, force = false } = req.body || {};
            if ((!Array.isArray(modelIds) || modelIds.length === 0) && (!Array.isArray(filePaths) || filePaths.length === 0)) {
                return res.status(400).json({ success: false, error: 'No model IDs or file paths provided' });
            }

            const { processed, errors } = await regenerateMetadata(modelIds, filePaths);
            res.json({ success: true, processed, errors });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    }

    // POST /api/hash-check
    async hashCheck(req, res) {
        try {
            const { fileType = "3mf" } = req.body;
            const result = await performHashCheck(fileType);
            res.json({ success: true, results: result });
        } catch (e) {
            console.error('Hash check error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    // GET /api/models/validate
    validatePath(req, res) {
        const { file } = req.query;
        if (!file) return res.status(400).json({ error: 'File required' });
        res.json({ valid: true, file });
    }

    // GET /api/validate-3mf
    async validate3mf(req, res) {
        const { file } = req.query;
        if (!file) return res.status(400).json({ error: 'File path required' });

        try {
            const filePath = path.isAbsolute(file) ? file : path.join(getAbsoluteModelsPath(), file);

            if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

            const metadata = await parse3MF(filePath, 0);

            res.json({
                valid: true,
                file: file,
                size: fs.statSync(filePath).size,
                metadata: {
                    name: metadata.name,
                    thumbnail: metadata.thumbnail ? 'present' : 'missing',
                    fileSize: metadata.fileSize
                }
            });
        } catch (error) {
            console.error('3MF validation error:', error.message);
            res.json({
                valid: false,
                file: file,
                error: error.message,
                suggestion: error.message.includes('rels') || error.message.includes('relationship')
                    ? 'This 3MF file appears to be missing relationship files. Try re-exporting from your 3D software.'
                    : 'This 3MF file may be corrupted or in an unsupported format.'
            });
        }
    }
}

module.exports = new MaintenanceController();
