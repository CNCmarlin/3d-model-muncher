const express = require('express');
const router = express.Router();
const { z } = require('zod');
const tagService = require('../services/tagService_db');
const { dbLog } = require('../../server-utils/configHelper');

/**
 * DATABASE VERSION: Tag Routes
 * Handles tag operations
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

// --- GET /api/tags ---
router.get('/tags', async (req, res) => {
    try {
        dbLog('[DB API] GET /api/tags');
        const tags = await tagService.getAllTags();
        // Legacy API returns simple array of objects
        res.json(tags);
    } catch (error) {
        handleZodError(error, res);
    }
});

// --- POST /api/tags/bulk-assign ---
router.post('/tags/bulk-assign', async (req, res) => {
    try {
        dbLog('[DB API] POST /api/tags/bulk-assign');
        const result = await tagService.bulkAssignTags(req.body);

        res.json({
            success: true,
            data: result,
            message: `Successfully updated tags for ${result.updated} models`
        });
    } catch (error) {
        handleZodError(error, res);
    }
});

module.exports = router;
