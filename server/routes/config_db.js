const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { ConfigManager } = require('../../dist-backend/utils/configManager');

// API endpoint to save app configuration to data/config.json
router.post('/save-config', (req, res) => {
    try {
        const config = req.body;
        console.log('[server] POST /api/save-config called, incoming lastModified=', config && config.lastModified);
        if (!config) {
            return res.status(400).json({ success: false, error: 'No configuration provided' });
        }

        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // During tests, prefer writing to a per-worker config to avoid clobbering the real config.json
        let configPath = (function () {
            try {
                const vitestWorkerId = process.env.VITEST_WORKER_ID;
                if (vitestWorkerId) return path.join(dataDir, `config.vitest-${vitestWorkerId}.json`);
                const jestWorkerId = process.env.JEST_WORKER_ID;
                if (jestWorkerId) return path.join(dataDir, `config.jest-${jestWorkerId}.json`);
            } catch { }
            return path.join(dataDir, 'config.json');
        })();
        // Ensure lastModified is updated on server-side save
        const finalConfig = { ...config, lastModified: new Date().toISOString() };
        fs.writeFileSync(configPath, JSON.stringify(finalConfig, null, 2), 'utf8');
        console.log('[server] Saved configuration to', configPath, 'server lastModified=', finalConfig.lastModified);
        res.json({ success: true, path: configPath, config: finalConfig });
    } catch (err) {
        console.error('Failed to save config to data/config.json:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// API endpoint to load config.json from the data directory
router.get('/load-config', (req, res) => {
    try {
        // Mirror getServerConfigPath behavior: prefer per-worker file when present
        const dataDir = path.join(process.cwd(), 'data');
        let configPath;
        try {
            const vitestWorkerId = process.env.VITEST_WORKER_ID;
            if (vitestWorkerId) {
                const workerPath = path.join(dataDir, `config.vitest-${vitestWorkerId}.json`);
                if (fs.existsSync(workerPath)) configPath = workerPath;
            }
            if (!configPath) {
                const jestWorkerId = process.env.JEST_WORKER_ID;
                if (jestWorkerId) {
                    const workerPath = path.join(dataDir, `config.jest-${jestWorkerId}.json`);
                    if (fs.existsSync(workerPath)) configPath = workerPath;
                }
            }
        } catch { }
        if (!configPath) configPath = path.join(dataDir, 'config.json');
        if (!fs.existsSync(configPath)) {
            return res.status(404).json({ success: false, error: 'No server-side config found' });
        }

        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(raw);
        console.log('[server] GET /api/load-config served, server lastModified=', parsed.lastModified);
        res.json({ success: true, config: parsed });
    } catch (err) {
        console.error('Failed to load config from data/config.json:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
