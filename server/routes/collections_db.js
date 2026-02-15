const express = require('express');
const router = express.Router();
const { z } = require('zod');
const collectionService = require('../services/collectionService_db');
const { dbLog } = require('../../server-utils/configHelper');

/**
 * DATABASE VERSION: Collection Routes
 * Handles collection operations (CRUD + Hierarchy)
 */

// --- MIDDLEWARE: Zod Error Handler ---
function handleZodError(error, res) {
    if (error instanceof z.ZodError) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: error.errors.map(e => ({
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

// --- GET /api/collections ---
// Get all collections as a flat list (Legacy Parity)
router.get('/collections', async (req, res) => {
    try {
        dbLog('[DB API] GET /api/collections (Flat)');
        // Legacy frontend expects a flat list and builds hierarchy client-side
        const collections = await collectionService.getAllCollections({ flattenHierarchy: true });
        res.json(collections);
    } catch (error) {
        handleZodError(error, res);
    }
});

// --- GET /api/collections/tree ---
// Get full collection hierarchy (Tree structure)
router.get('/collections/tree', async (req, res) => {
    try {
        dbLog('[DB API] GET /api/collections/tree');
        const hierarchy = await collectionService.getCollectionTree(null);
        res.json(hierarchy);
    } catch (error) {
        handleZodError(error, res);
    }
});

// --- POST /api/collections ---
// Create a new collection
router.post('/collections', async (req, res) => {
    try {
        dbLog('[DB API] POST /api/collections');
        const collection = await collectionService.createCollection(req.body);

        res.json({
            success: true,
            data: collection,
            message: 'Collection created successfully'
        });
    } catch (error) {
        handleZodError(error, res);
    }
});

// --- GET /api/collections/flat ---
// Get flat list of collections (useful for dropdowns)
// --- GET /api/collections/flat ---
// Get flat list of collections (useful for dropdowns)
router.get('/collections/flat', async (req, res) => {
    try {
        dbLog('[DB API] GET /api/collections/flat');
        const collections = await collectionService.getAllCollections({ flattenHierarchy: true });
        res.json(collections);
    } catch (error) {
        handleZodError(error, res);
    }
});

// --- CONSTANTS & UPLOAD SETUP ---
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Replicate constants from file-based controller
const DATA_DIR = path.join(process.cwd(), 'data');
const COLLECTION_IMAGES_DIR = path.join(DATA_DIR, 'images', 'collections');
const COLLECTION_DOCS_DIR = path.join(DATA_DIR, 'documents', 'collections');

// Ensure dirs exist
[COLLECTION_IMAGES_DIR, COLLECTION_DOCS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});


// --- GET /api/collections/:id ---
// Get single collection with details
router.get('/collections/:id', async (req, res) => {
    try {
        dbLog(`[DB API] GET /api/collections/${req.params.id}`);
        const col = await collectionService.getCollectionById(req.params.id);

        if (!col) {
            return res.status(404).json({ success: false, error: 'Collection not found' });
        }

        // Transform for frontend compatibility (modelIds array instead of models object)
        const transformed = {
            ...col,
            modelIds: col.models ? col.models.map(m => m.id) : []
        };
        delete transformed.models; // Remove raw relation

        res.json({ success: true, collection: transformed });
    } catch (error) {
        handleZodError(error, res);
    }
});

// --- PUT /api/collections/:id ---
// Update collection metadata
router.put('/collections/:id', async (req, res) => {
    try {
        dbLog(`[DB API] PUT /api/collections/${req.params.id}`);
        const col = await collectionService.updateCollection(req.params.id, req.body);

        // Transform
        const transformed = {
            ...col,
            modelIds: col.models ? col.models.map(m => m.id) : (req.body.modelIds || [])
        };

        res.json({ success: true, collection: transformed });
    } catch (error) {
        handleZodError(error, res);
    }
});

// --- DELETE /api/collections/:id ---
// Delete collection
router.delete('/collections/:id', async (req, res) => {
    try {
        dbLog(`[DB API] DELETE /api/collections/${req.params.id}`);
        await collectionService.deleteCollection(req.params.id, req.query.cascade === 'true');
        res.json({ success: true });
    } catch (error) {
        handleZodError(error, res);
    }
});

// --- MEDIA ROUTES ---

// POST /api/collections/:id/images
// Upload gallery images or cover
router.post('/collections/:id/images', upload.single('image'), async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

        const ext = path.extname(req.file.originalname) || '.jpg';
        const filename = `${Date.now()}_${Math.random().toString(36).substr(2, 5)}${ext}`;
        const targetDir = path.join(COLLECTION_IMAGES_DIR, id);

        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        const filePath = path.join(targetDir, filename);
        fs.writeFileSync(filePath, req.file.buffer);

        const publicPath = `/api/images/collections/${id}/${filename}`;

        // Return path (frontend usually updates collection metadata separately, 
        // OR we can auto-update 'images' list here if we fetched the collection first.
        // Legacy behavior mostly returns path and client updates list.)

        res.json({ success: true, imagePath: publicPath });
    } catch (error) {
        dbLog('Upload Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/collections/:id/images/:filename
router.delete('/collections/:id/images/:filename', async (req, res) => {
    try {
        const { id, filename } = req.params;
        const filePath = path.join(COLLECTION_IMAGES_DIR, id, filename);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        } else {
            console.warn(`File not found: ${filePath}`);
        }

        // Logic to remove from DB 'images' array is handled by Client in legacy, 
        // but robust API should probably do it. 
        // However, `update` endpoint handles metadata sync.

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/collections/:id/documents
router.post('/collections/:id/documents', upload.single('file'), async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

        const filename = req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const targetDir = path.join(COLLECTION_DOCS_DIR, id);

        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        const filePath = path.join(targetDir, filename);
        fs.writeFileSync(filePath, req.file.buffer);

        const publicPath = `/api/documents/collections/${id}/${filename}`;

        res.json({ success: true, filePath: publicPath });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/collections/:id/documents/:filename
router.delete('/collections/:id/documents/:filename', async (req, res) => {
    try {
        const { id, filename } = req.params;
        const filePath = path.join(COLLECTION_DOCS_DIR, id, filename);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
