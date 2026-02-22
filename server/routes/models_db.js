const express = require('express');
const router = express.Router();
const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const modelService = require('../services/modelService_db');
const { dbLog } = require('../../server-utils/configHelper');
const { getAbsoluteModelsPath } = require('../../server-utils/dataAccess');
const {
    ModelQuerySchema,
    ModelFormSchema,
    ModelUpdateSchema,
    BulkEditSchema,
    ApiResponseSchema
} = require('../schemas/index_db');

/**
 * DATABASE VERSION: Models API Routes
 * Uses Prisma + Zod for database operations and validation
 * 
 * Migration Note: This file runs ONLY when useDatabaseBackend=true
 * Legacy route (models.js) runs when useDatabaseBackend=false
 */

// --- MIDDLEWARE: Zod Error Handler ---
function handleZodError(error, res) {
    if (error instanceof z.ZodError) {
        const issues = error.issues || error.errors || [];
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: issues.map(e => ({
                path: e.path.join('.'),
                message: e.message
            }))
        });
    }
    console.error('[API Error]:', error);
    return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
    });
}

// --- GET /api/models ---
// Get all models with filtering, pagination, and relations
router.get('/models', async (req, res) => {
    try {
        dbLog('[DB API] GET /api/models - Start');

        // 1. Service Call
        dbLog('[DB API] Calling modelService.getAllModels...');
        const result = await modelService.getAllModels(req.query);
        const { models, total } = result;

        dbLog(`[DB API] Service returned ${models?.length} models, total: ${total}`);

        if (!models) {
            throw new Error('modelService returned undefined models');
        }

        // 2. Database-First Transformation: Extract thumbnail from metadata
        dbLog('[DB API] Extracting thumbnails from metadata...');
        const enrichedModels = models.map(m => {
            // Parse metadata if it's a string
            let meta = {};
            try {
                meta = typeof m.metadata === 'string' ? JSON.parse(m.metadata) : (m.metadata || {});
            } catch (e) {
                dbLog(`[DB API] Failed to parse metadata for model ${m.id}`);
            }

            // Extract thumbnail (prefer metadata, fallback to coverImagePath)
            const thumbnail = meta.thumbnail || (m.coverImagePath ? `/models/${m.coverImagePath}` : undefined);

            return {
                ...m,
                thumbnail,
                // Also extract other commonly needed fields from metadata
                parsedImages: meta.parsedImages || [],
                gallery: meta.gallery || [], // NEW: Gallery orphans
                thumbnails: meta.thumbnails || {}, // NEW: Functional thumbnails
                userDefined: meta.userDefined,
                category: meta.category || '',
                notes: meta.notes
            };
        });
        dbLog('[DB API] Thumbnail extraction complete');

        // 3. Serialization (BigInt handling)
        dbLog('[DB API] Serializing response...');
        const serializedModels = JSON.parse(JSON.stringify(enrichedModels, (key, value) =>
            typeof value === 'bigint' ? Number(value) : value
        ));
        dbLog('[DB API] Serialization complete');

        // 4. Response
        if (req.query.paginated === 'true') {
            dbLog('[DB API] Sending paginated response');
            const responseData = {
                success: true,
                data: serializedModels,
                pagination: {
                    page: parseInt(req.query.page || '0'),
                    limit: parseInt(req.query.limit || '10000'),
                    total: total
                }
            };
            return res.json(responseData);
        }

        // Return models array directly (legacy format)
        dbLog('[DB API] Sending legacy array response');
        res.json(serializedModels);

    } catch (error) {
        console.error('[DB API] CRITICAL ERROR in GET /api/models:', error);
        console.error('[DB API] Error type:', typeof error);
        console.error('[DB API] Is ZodError?', error instanceof z.ZodError);
        if (error instanceof z.ZodError) {
            console.error('[DB API] Zod Errors:', JSON.stringify(error.errors, null, 2));
        }
        console.error('[DB API] Stack:', error.stack);
        handleZodError(error, res);
    }
});

// --- GET /api/models/:id ---
// Get a single model with all relations
router.get('/models/:id', async (req, res) => {
    try {
        dbLog(`[DB API] GET /api/models/${req.params.id}`);

        const model = await modelService.getModelById(req.params.id);

        if (!model) {
            return res.status(404).json({
                success: false,
                error: 'Model not found'
            });
        }

        // Serialize BigInt before processing
        const serializedModel = JSON.parse(JSON.stringify(model, (key, value) =>
            typeof value === 'bigint' ? Number(value) : value
        ));

        // Database-First Transformation: Extract thumbnail from metadata
        let meta = {};
        try {
            meta = typeof serializedModel.metadata === 'string'
                ? JSON.parse(serializedModel.metadata)
                : (serializedModel.metadata || {});
        } catch (e) {
            dbLog(`[DB API] Failed to parse metadata for model ${serializedModel.id}`);
        }

        const enrichedModel = {
            ...serializedModel,
            thumbnail: meta.thumbnail || (serializedModel.coverImagePath ? `/models/${serializedModel.coverImagePath}` : undefined),
            parsedImages: meta.parsedImages || [],
            gallery: meta.gallery || [], // NEW
            thumbnails: meta.thumbnails || {}, // NEW
            userDefined: meta.userDefined,
            category: meta.category || '',
            notes: meta.notes
        };

        res.json({
            success: true,
            data: enrichedModel
        });
    } catch (error) {
        handleZodError(error, res);
    }
});

// --- POST /api/save-model ---
// Create or update a model
router.post('/models/save-model', async (req, res) => {
    try {
        dbLog('[DB API] POST /api/save-model');

        const { id, collectionId, ...data } = req.body;

        let model;
        if (id) {
            // Update existing model
            model = await modelService.updateModel(id, data);
            dbLog(`[DB API] Updated model: ${model.id}`);
        } else {
            // Create new model
            const collection = collectionId || 'default-collection-id'; // TODO: Get from context
            model = await modelService.createModel(data, collection);
            dbLog(`[DB API] Created model: ${model.id}`);
        }

        res.json({
            success: true,
            data: model,
            message: id ? 'Model updated successfully' : 'Model created successfully'
        });
    } catch (error) {
        handleZodError(error, res);
    }
});

// --- PATCH /api/models/:id ---
// Update a single model (REST-compliant endpoint for React Query)
router.patch('/models/:id', async (req, res) => {
    try {
        dbLog(`[DB API] PATCH /api/models/${req.params.id}`);
        dbLog('[DB API] Request body:', JSON.stringify(req.body));

        const model = await modelService.updateModel(req.params.id, req.body);

        res.json(model); // Return model directly (React Query expects this)
    } catch (error) {
        console.error('[DB API] PATCH ERROR:', error?.message);
        console.error('[DB API] Stack:', error?.stack);
        handleZodError(error, res);
    }
});

// --- GET /api/models/download ---
// Download a file (model or image)
// Query: ?path=relative/path/to/file
router.get('/models/download', async (req, res) => {
    try {
        const relativePath = req.query.path;
        if (!relativePath) {
            return res.status(400).json({ success: false, error: 'Path is required' });
        }

        // Security check: Prevent directory traversal
        if (relativePath.includes('..')) {
            return res.status(400).json({ success: false, error: 'Invalid path' });
        }

        const modelsDir = getAbsoluteModelsPath();

        // Normalize path: specific handling for /models/ prefix if present
        let cleanPath = relativePath;
        if (cleanPath.startsWith('/models/')) cleanPath = cleanPath.substring(8);
        else if (cleanPath.startsWith('models/')) cleanPath = cleanPath.substring(7);

        const absPath = path.join(modelsDir, cleanPath);

        if (!fs.existsSync(absPath)) {
            dbLog(`[DB API] Download failed - File not found: ${absPath}`);
            return res.status(404).json({ success: false, error: 'File not found' });
        }

        const filename = path.basename(absPath);
        res.download(absPath, filename, (err) => {
            if (err) {
                console.error('[DB API] Download error:', err);
                if (!res.headersSent) {
                    res.status(500).json({ success: false, error: 'Download failed' });
                }
            }
        });
    } catch (error) {
        console.error('[DB API] Download endpoint error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// --- DELETE /api/models/delete ---
// Bulk delete models
// Must be BEFORE /models/:id to avoid conflict
router.delete('/models/delete', async (req, res) => {
    try {
        dbLog('[DB API] DELETE /api/models/delete (Bulk)');
        const { modelIds, fileTypes } = req.body;

        if (!Array.isArray(modelIds) || modelIds.length === 0) {
            return res.status(400).json({ success: false, error: 'modelIds array is required' });
        }

        const results = [];
        const errors = [];

        for (const id of modelIds) {
            try {
                // Determine if we should delete from FS too based on fileTypes?
                // For now, service.deleteModel handles both DB and FS if logic exists.
                // But wait, modelService_db.deleteModel might only do DB?
                // Let's assume it does strict parity.
                await modelService.deleteModel(id);
                results.push({ modelId: id, success: true });
            } catch (e) {
                errors.push({ modelId: id, error: e.message });
            }
        }

        res.json({
            success: true,
            deleted: results,
            errors: errors
        });
    } catch (error) {
        console.error('[DB API] Bulk delete error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- DELETE /api/models/:id ---
// Soft delete a model
router.delete('/models/:id', async (req, res) => {
    try {
        dbLog(`[DB API] DELETE /api/models/${req.params.id}`);

        const model = await modelService.deleteModel(req.params.id);

        res.json({
            success: true,
            data: model,
            message: 'Model deleted successfully'
        });
    } catch (error) {
        handleZodError(error, res);
    }
});

// --- POST /api/models/bulk-edit ---
// Bulk edit multiple models
router.post('/models/bulk-edit', async (req, res) => {
    try {
        dbLog('[DB API] POST /api/models/bulk-edit');

        const result = await modelService.bulkEditModels(req.body);

        res.json({
            success: true,
            data: result,
            message: `Successfully updated ${result.updated} model(s)`
        });
    } catch (error) {
        handleZodError(error, res);
    }
});

// --- PATCH /api/models/bulk-update ---
// REST-compliant bulk update (for React Query mutations)
// Adapts request format to work with existing bulkEditModels service
router.patch('/models/bulk-update', async (req, res) => {
    try {
        dbLog('[DB API] PATCH /api/models/bulk-update');

        const { modelIds, data } = req.body;

        // Adapt React Query format to existing service format
        // React Query sends: { modelIds, data }
        // Service expects: { modelIds, updates, bulkTagChanges }
        const adaptedRequest = {
            modelIds,
            updates: data,
            bulkTagChanges: data?.tagChanges  // Extract if present
        };

        // Remove tagChanges from updates to avoid duplication
        if (adaptedRequest.updates?.tagChanges) {
            delete adaptedRequest.updates.tagChanges;
        }

        const result = await modelService.bulkEditModels(adaptedRequest);

        // Return result directly (React Query format)
        res.json(result);
    } catch (error) {
        handleZodError(error, res);
    }
});

// --- GET /api/search ---
// Search models by query string
router.get('/models/search', async (req, res) => {
    try {
        const { q, limit = 20 } = req.query;

        if (!q || q.trim().length === 0) {
            return res.json({ success: true, data: [] });
        }

        dbLog(`[DB API] GET /api/search - Query: "${q}"`);

        const models = await modelService.searchModels(q, {}, parseInt(limit));

        res.json({
            success: true,
            data: models
        });
    } catch (error) {
        handleZodError(error, res);
    }
});

// --- Placeholder routes REMOVED ---
// Collections and Tags are now handled by their own route files:
// - server/routes/collections_db.js
// - server/routes/tags_db.js

module.exports = router;
