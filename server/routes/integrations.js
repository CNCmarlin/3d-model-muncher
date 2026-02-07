const express = require('express');
const router = express.Router();
const { ConfigManager } = require('../../dist-backend/utils/configManager');

// Helper to get Spoolman URL from config
function getSpoolmanUrl() {
    const config = ConfigManager.loadConfig();
    // Allow env var override for Docker power users
    let url = process.env.SPOOLMAN_URL || config.integrations?.spoolman?.url || '';
    // Remove trailing slash for consistency
    return url.replace(/\/$/, '');
}

// 1. Health Check (Verify Connection)
router.get('/spoolman/status', async (req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.json({ status: 'disabled' });

    try {
        // Spoolman exposes a /health endpoint
        const response = await fetch(`${url}/health`);
        if (response.ok) {
            res.json({ status: 'connected', url });
        } else {
            res.status(502).json({ status: 'error', message: 'Spoolman reachable but returned error' });
        }
    } catch (e) {
        res.status(502).json({ status: 'error', message: 'Failed to connect to Spoolman' });
    }
});

// 2. Get Active Spools (The core data)
router.get('/spoolman/spools', async (req, res) => {
    const url = getSpoolmanUrl();
    if (!url) return res.status(400).json({ error: 'Spoolman not configured' });

    try {
        // Fetch active spools (allow_archived=false)
        const response = await fetch(`${url}/api/v1/spool?allow_archived=false`);

        if (!response.ok) throw new Error(`Spoolman Error: ${response.status}`);

        const data = await response.json();
        res.json({ success: true, spools: data });
    } catch (e) {
        console.error('Spoolman proxy error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 3. Save Spoolman Config
router.post('/spoolman/config', (req, res) => {
    const { url } = req.body;
    // Simple validation
    if (url && !url.startsWith('http')) {
        return res.status(400).json({ success: false, error: 'URL must start with http:// or https://' });
    }

    try {
        const config = ConfigManager.loadConfig();
        if (!config.integrations) config.integrations = {};
        if (!config.integrations.spoolman) config.integrations.spoolman = {};

        config.integrations.spoolman.url = url;
        config.lastModified = new Date().toISOString();

        // Save to disk
        ConfigManager.saveConfig(config);
        res.json({ success: true });
    } catch (e) {
        console.warn('Failed to save spoolman config', e);
        res.status(500).json({ success: false, error: 'Failed to save config' });
    }
});

module.exports = router;
