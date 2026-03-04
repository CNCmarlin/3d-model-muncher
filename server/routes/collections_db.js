const express = require('express');
const router = express.Router();
const { z } = require('zod');
// const fs = require('fs'); // Removed duplicate
// const path = require('path'); // Removed duplicate
const sharp = require('sharp'); // Needed for generate-covers
const collectionService = require('../services/collectionService_db');
const { generateCollections } = require('../../server-utils/collectionScanner_db');
const { generateCoverForCollection } = require('../../server-utils/coverGenerator_db');
const { getAbsoluteModelsPath } = require('../../server-utils/dataAccess');
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
const multer = require('multer');
const fs = require('fs');
const path = require('path');

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

        // Transform for frontend compatibility 
        // 1. Hoist modelIds
        // 2. Hoist images/documents from metadata IF they don't exist on root

        let meta = {};
        try {
            meta = typeof col.metadata === 'string' ? JSON.parse(col.metadata) : (col.metadata || {});
        } catch (e) { }

        const transformed = {
            ...col,
            modelIds: col.models ? col.models.map(m => m.id) : [],
            images: col.images || meta.images || [],
            documents: col.documents || meta.documents || [],
            metadata: meta // Ensure it is an object
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

// --- POST /api/collections/auto-import ---
// Trigger auto-import scan for a specific path
router.post('/collections/auto-import', async (req, res) => {
    try {
        const { targetPath, strategy } = req.body;

        if (!targetPath) {
            return res.status(400).json({ success: false, error: 'Target path is required' });
        }

        const modelsDir = getAbsoluteModelsPath();
        const scanRoot = path.isAbsolute(targetPath) ? targetPath : path.join(modelsDir, targetPath);

        if (!fs.existsSync(scanRoot)) {
            return res.status(404).json({ success: false, error: 'Target path does not exist' });
        }

        console.log(`[DB Auto-Import] Scanning: ${scanRoot}`);
        const collections = await generateCollections(scanRoot, modelsDir, { strategy: strategy || 'smart' });

        res.json({
            success: true,
            data: collections,
            message: `Imported ${collections.length} collections`
        });
    } catch (error) {
        console.error('[DB Auto-Import] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- POST /api/collections/generate-covers ---
// Generate covers for all collections or a specific one
router.post('/collections/generate-covers', async (req, res) => {
    try {
        const { collectionId, force } = req.body;
        console.log(`[DB Covers] Generating covers${collectionId ? ` for ${collectionId}` : ' for all collections'}...`);

        // 1. Get collections
        let targets = [];
        if (collectionId) {
            const c = await collectionService.getCollectionById(collectionId);
            if (c) targets.push(c);
        } else {
            targets = await collectionService.getAllCollections({ includeModels: true });
        }

        let processed = 0;
        let skipped = 0;

        // 2. Process each collection
        for (const col of targets) {
            // Skip if already has cover, unless forced
            // (Note: The inner service also prevents overwriting manual user uploads)
            if (col.coverImagePath && !force) {
                skipped++;
                continue;
            }

            const modelIds = col.models ? col.models.map(m => m.id) : (col.modelIds || []);
            if (modelIds.length < 4) {
                skipped++;
                continue;
            }

            const result = await generateCoverForCollection(col.id, force);
            if (result.success) {
                processed++;
            } else {
                skipped++;
                console.log(`[DB Covers] Skipping ${col.name}: ${result.reason}`);
            }
        }

        res.json({ success: true, processed, skipped, message: `Generated ${processed} covers` });
    } catch (error) {
        console.error('[DB Covers] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- POST /api/collections/:id/images ---
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

        // Return path & Update metadata
        const relativePath = publicPath.replace('/api/images/collections/', 'images/collections/');
        const finalPath = relativePath;

        // Update metadata.images AND set coverImagePath
        const oldCol = await collectionService.getCollectionById(req.params.id);
        let images = [];
        let existingMetadata = {};
        try {
            existingMetadata = JSON.parse(oldCol.metadata || '{}');
            images = existingMetadata.images || [];
        } catch (e) {
            console.warn(`[DB API] Error parsing metadata for collection ${req.params.id}:`, e.message);
        }

        images.push(finalPath);

        await collectionService.updateCollection(req.params.id, {
            coverImagePath: finalPath,
            metadata: { ...existingMetadata, images }
        });

        res.json({
            success: true,
            filePath: finalPath,
            message: 'Image uploaded and metadata updated'
        });
    } catch (error) {
        handleZodError(error, res);
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

        // Update metadata.documents
        const oldCol = await collectionService.getCollectionById(req.params.id);
        let documents = [];
        let existingMetadata = {};
        try {
            existingMetadata = JSON.parse(oldCol.metadata || '{}');
            documents = existingMetadata.documents || [];
        } catch (e) {
            console.warn(`[DB API] Error parsing metadata for collection ${req.params.id}:`, e.message);
        }

        const relativePath = `documents/collections/${id}/${filename}`;
        documents.push(relativePath);

        await collectionService.updateCollection(req.params.id, {
            metadata: { ...existingMetadata, documents }
        });

        res.json({
            success: true,
            filePath: relativePath,
            message: 'Document uploaded and metadata updated'
        });
    } catch (error) {
        console.error('[DB API] Document Upload Error:', error);
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

// --- POST /api/collections/purge-covers-preview ---
// Preview how many covers will be deleted
router.post('/collections/purge-covers-preview', async (req, res) => {
    try {
        dbLog('[DB Covers] Preview Purge');
        const prisma = require('../../server-utils/db');
        const collections = await prisma.collection.findMany({
            where: { coverImagePath: { not: null } },
            select: { name: true, coverImagePath: true }
        });

        const processCwd = process.cwd();
        let totalSize = 0;
        const files = [];

        for (const col of collections) {
            if (col.coverImagePath && col.coverImagePath.startsWith('/data/covers/')) {
                const relPath = col.coverImagePath.substring(1);
                const absPath = path.join(processCwd, relPath);

                if (fs.existsSync(absPath)) {
                    const stats = fs.statSync(absPath);
                    totalSize += stats.size;
                    files.push({
                        collectionName: col.name,
                        filename: path.basename(absPath),
                        size: stats.size
                    });
                }
            }
        }

        res.json({ success: true, totalCount: files.length, totalSize, files });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- POST /api/collections/purge-covers ---
// Delete all collection covers (auto-generated only)
router.post('/collections/purge-covers', async (req, res) => {
    try {
        dbLog('[DB Covers] Purging All Covers');
        const prisma = require('../../server-utils/db');

        // 1. Find all collections with auto-generated covers
        const targets = await prisma.collection.findMany({
            where: { coverImagePath: { startsWith: '/data/covers/' } },
            select: { id: true, coverImagePath: true }
        });

        // 2. Delete files
        let deletedCount = 0;
        const processCwd = process.cwd();

        for (const col of targets) {
            if (col.coverImagePath) {
                const relPath = col.coverImagePath.substring(1);
                const absPath = path.join(processCwd, relPath);

                if (fs.existsSync(absPath)) {
                    try {
                        fs.unlinkSync(absPath);
                        deletedCount++;
                    } catch (e) {
                        console.warn(`[DB Purge] Failed to delete ${absPath}:`, e.message);
                    }
                }
            }
        }

        // 3. Update DB (always unlink even if file was already missing)
        const updateResult = await prisma.collection.updateMany({
            where: { coverImagePath: { startsWith: '/data/covers/' } },
            data: { coverImagePath: null }
        });

        res.json({ success: true, deleted: deletedCount, collectionsUpdated: updateResult.count });
    } catch (error) {
        console.error('[DB Purge] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
