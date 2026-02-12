const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const collectionsFile = path.join(process.cwd(), 'data', 'collections.json');

function readCollectionsFile() {
    try {
        if (fs.existsSync(collectionsFile)) {
            const data = fs.readFileSync(collectionsFile, 'utf8');
            return JSON.parse(data);
        }
        return { collections: [] };
    } catch (error) {
        console.error('Error reading collections.json:', error);
        return { collections: [] };
    }
}

/**
 * LEGACY MODE: Tags API Routes
 * Extracts unique tags from all models in collections
 * Returns Tag[] format for compatibility: [{id, name}]
 */

// GET /api/tags - Get all unique tags from munchie files
router.get('/tags', async (req, res) => {
    try {
        console.log('[Legacy API] GET /api/tags');
        const modelService = require('../services/legacy/modelService_legacy');

        // Scan all models directly from file system
        const allModels = modelService.getAllModels();
        const tagSet = new Set();

        allModels.forEach(model => {
            if (model.tags && Array.isArray(model.tags)) {
                model.tags.forEach(tag => {
                    if (tag && typeof tag === 'string') {
                        tagSet.add(tag);
                    }
                });
            }
        });

        // Convert to array and sort
        const tags = Array.from(tagSet).sort((a, b) =>
            a.localeCompare(b, undefined, { sensitivity: 'base' })
        ).map((name, index) => ({
            id: `tag_${index}`,
            name
        }));

        console.log(`[Legacy API] GET /api/tags complete: found ${tags.length} unique tags`);
        res.json(tags);
    } catch (error) {
        console.error('[Legacy API] Error fetching tags:', error);
        res.status(500).json({ error: 'Failed to fetch tags' });
    }
});

module.exports = router;
