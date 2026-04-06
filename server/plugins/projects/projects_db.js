const express = require('express');
const router = express.Router();
const projectService = require('./projectService_db');
const { dbLog } = require('../../../server-utils/configHelper');

// --- Middleware ---
function handleError(error, res) {
    console.error('[Project API Error]:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
}

// --- Projects ---

// GET /api/projects - Get all projects
router.get('/projects', async (req, res) => {
    try {
        dbLog('[DB API] GET /api/projects');
        const projects = await projectService.getAllProjects();
        const serialized = JSON.parse(JSON.stringify(projects, (key, value) => typeof value === 'bigint' ? Number(value) : value));
        res.json({ success: true, projects: serialized });
    } catch (e) { handleError(e, res); }
});

// GET /api/projects/:id - Get specific project full tree
router.get('/projects/:id', async (req, res) => {
    try {
        dbLog(`[DB API] GET /api/projects/${req.params.id}`);
        const project = await projectService.getProjectById(req.params.id);
        if (!project) return res.status(404).json({ success: false, error: "Project not found" });
        const serialized = JSON.parse(JSON.stringify(project, (key, value) => typeof value === 'bigint' ? Number(value) : value));
        res.json({ success: true, project: serialized });
    } catch (e) { handleError(e, res); }
});

// POST /api/projects - Create new project
router.post('/projects', async (req, res) => {
    try {
        dbLog('[DB API] POST /api/projects');
        const { name, description, status } = req.body;
        if (!name) return res.status(400).json({ success: false, error: "Name is required" });

        const project = await projectService.createProject({ name, description, status });
        res.json({ success: true, project });
    } catch (e) { handleError(e, res); }
});

// DELETE /api/projects/:id - Delete project
router.delete('/projects/:id', async (req, res) => {
    try {
        dbLog(`[DB API] DELETE /api/projects/${req.params.id}`);
        await projectService.deleteProject(req.params.id);
        res.json({ success: true, message: "Project deleted" });
    } catch (e) { handleError(e, res); }
});

// --- Build Plates ---

// POST /api/projects/:id/plates - Create plate
router.post('/projects/:id/plates', async (req, res) => {
    try {
        dbLog(`[DB API] POST /api/projects/${req.params.id}/plates`);
        const { name, width, height, customName } = req.body;
        const plate = await projectService.createBuildPlate(req.params.id, {
            name: name || "New Plate",
            width: width ? parseFloat(width) : undefined,
            height: height ? parseFloat(height) : undefined,
            customName
        });
        res.json({ success: true, buildPlate: plate });
    } catch (e) { handleError(e, res); }
});

// PUT /api/plates/:id - Update plate
router.put('/plates/:id', async (req, res) => {
    try {
        dbLog(`[DB API] PUT /api/plates/${req.params.id}`);
        // Ensure width/height are floats if provided
        const payload = { ...req.body };
        if (payload.width !== undefined) payload.width = parseFloat(payload.width);
        if (payload.height !== undefined) payload.height = parseFloat(payload.height);

        const plate = await projectService.updateBuildPlate(req.params.id, payload);
        res.json({ success: true, buildPlate: plate });
    } catch (e) { handleError(e, res); }
});

// DELETE /api/plates/:id - Delete plate
router.delete('/plates/:id', async (req, res) => {
    try {
        dbLog(`[DB API] DELETE /api/plates/${req.params.id}`);
        await projectService.deleteBuildPlate(req.params.id); // Triggers complex manual return of inventory
        res.json({ success: true, message: "Plate deleted and inventory returned" });
    } catch (e) { handleError(e, res); }
});

// --- Assignments ---

// POST /api/projects/:id/items - Stage items (Bulk Add)
router.post('/projects/:id/items', async (req, res) => {
    try {
        dbLog(`[DB API] POST /api/projects/${req.params.id}/items`);
        const { modelIds, quantityDesired = 1 } = req.body;
        if (!modelIds || !Array.isArray(modelIds)) return res.status(400).json({ success: false, error: "Invalid modelIds" });

        const results = await projectService.stageModelsToProject(req.params.id, modelIds, quantityDesired);
        res.json({ success: true, stagedItems: results });
    } catch (e) { handleError(e, res); }
});

// POST /api/plates/:id/assign - Assign Staged Item to Plate
router.post('/plates/:id/assign', async (req, res) => {
    try {
        dbLog(`[DB API] POST /api/plates/${req.params.id}/assign`);
        const { projectItemId, quantity = 1 } = req.body;

        await projectService.assignItemToPlate(req.params.id, projectItemId, quantity);
        res.json({ success: true, message: "Assigned successfully" });
    } catch (e) { handleError(e, res); }
});

// DELETE /api/plate-items/:id - Unassign item from plate
router.delete('/plate-items/:id', async (req, res) => {
    try {
        dbLog(`[DB API] DELETE /api/plate-items/${req.params.id}`);
        await projectService.unassignItemFromPlate(req.params.id);
        res.json({ success: true, message: "Unassigned successfully" });
    } catch (e) { handleError(e, res); }
});

// PUT /api/plates/:id/transforms - Bulk update item transforms on a plate
router.put('/plates/:id/transforms', async (req, res) => {
    try {
        dbLog(`[DB API] PUT /api/plates/${req.params.id}/transforms`);
        const { transforms } = req.body;
        if (!transforms || !Array.isArray(transforms)) {
            return res.status(400).json({ success: false, error: "Invalid transforms array" });
        }

        const results = await projectService.updatePlateItemTransforms(transforms);
        res.json({ success: true, updated: results });
    } catch (e) { handleError(e, res); }
});

// POST /api/plate-items/:id/clone - Duplicate an item on the plate
router.post('/plate-items/:id/clone', async (req, res) => {
    try {
        dbLog(`[DB API] POST /api/plate-items/${req.params.id}/clone`);
        const cloned = await projectService.cloneBuildPlateItem(req.params.id);
        res.json({ success: true, item: cloned });
    } catch (e) { handleError(e, res); }
});

// PUT /api/plate-items/:id/color - Change color of specific plate item
router.put('/plate-items/:id/color', async (req, res) => {
    try {
        dbLog(`[DB API] PUT /api/plate-items/${req.params.id}/color`);
        const { colorHex } = req.body;
        const updated = await projectService.updatePlateItemColor(req.params.id, colorHex);
        res.json({ success: true, item: updated });
    } catch (e) { handleError(e, res); }
});

// PUT /api/project-items/:id/color - Change default color of project item
router.put('/project-items/:id/color', async (req, res) => {
    try {
        dbLog(`[DB API] PUT /api/project-items/${req.params.id}/color`);
        const { colorHex } = req.body;
        const updated = await projectService.updateProjectItemColor(req.params.id, colorHex);
        res.json({ success: true, item: updated });
    } catch (e) { handleError(e, res); }
});

// PUT /api/project-items/:id/quantity - Change desired quantity
router.put('/project-items/:id/quantity', async (req, res) => {
    try {
        dbLog(`[DB API] PUT /api/project-items/${req.params.id}/quantity`);
        const { quantityDesired } = req.body;
        const updated = await projectService.updateProjectItemQuantity(req.params.id, quantityDesired);
        res.json({ success: true, item: updated });
    } catch (e) { handleError(e, res); }
});

module.exports = router;
