const mutationService = require('../../services/legacy/mutationService');
const { deleteModels } = require('../../../server-utils/modelService');

class MutationController {

    async createModelFolder(req, res) {
        try {
            const { folder } = req.body || {};
            const result = await mutationService.createModelFolder(folder);
            res.json(result);
        } catch (e) {
            console.error('Failed to create model folder:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async uploadDocument(req, res) {
        try {
            const { modelId, filePath } = req.body;
            // Support both multiple files (new) and single file (legacy fallback if needed)
            const files = req.files || (req.file ? [req.file] : []);

            if (!files || files.length === 0) return res.status(400).json({ success: false, error: 'No files provided' });

            const result = await mutationService.uploadDocuments(modelId, filePath, files);
            res.json(result);
        } catch (e) {
            console.error("Asset Upload Error:", e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async saveModel(req, res) {
        try {
            const result = await mutationService.saveModel(req.body);
            res.json(result);
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async updateMetadata(req, res) {
        try {
            const { filePath, updates } = req.body;
            if (!filePath || !updates) return res.status(400).json({ success: false, message: 'Missing filePath or updates' });

            const result = await mutationService.updateMetadata(filePath, updates);
            res.json(result);
        } catch (e) {
            console.error('Metadata update error:', e);
            res.status(500).json({ success: false, message: e.message });
        }
    }

    async deleteModels(req, res) {
        try {
            const { modelIds, fileTypes } = req.body;
            if (!Array.isArray(modelIds) || modelIds.length === 0) return res.status(400).json({ success: false, error: 'No model IDs provided' });

            const result = await deleteModels(modelIds, fileTypes);
            res.json(result);
        } catch (e) {
            console.error('Error deleting models:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async bulkUpdateModels(req, res) {
        try {
            // Frontend sends { modelIds, data } - map to ids/updates
            const ids = req.body.ids || req.body.modelIds;
            const updates = req.body.updates || req.body.data;

            if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ success: false, error: 'No IDs provided' });
            if (!updates) return res.status(400).json({ success: false, error: 'No updates provided' });

            const result = await mutationService.bulkUpdateModels(ids, updates);
            res.json(result);
        } catch (e) {
            console.error('Bulk update error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    }
}

module.exports = new MutationController();
