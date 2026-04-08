const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { ConfigManager } = require('../../dist-backend/utils/configManager');

// Helper to get Models Path (matches server.js logic)
function getModelsDirectory() {
    if (process.env.MODELS_PATH) return process.env.MODELS_PATH;
    try {
        const dataDir = path.join(process.cwd(), 'data');
        const globalPath = path.join(dataDir, 'config.json');
        if (fs.existsSync(globalPath)) {
            const parsed = JSON.parse(fs.readFileSync(globalPath, 'utf8') || '{}');
            if (parsed?.settings?.modelDirectory) return parsed.settings.modelDirectory;
        }
    } catch (e) { }
    const config = ConfigManager.loadConfig();
    return (config.settings && config.settings.modelDirectory) || './models';
}

function getAbsoluteModelsPath() {
    const dir = getModelsDirectory();
    return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

// Helper: Build multipart body manually to avoid 'form-data' dependency
// Used for Printer Uploads (OctoPrint/Klipper)
function createMultipartBody(fileBuffer, fileName) {
    const boundary = '----MuncherBoundary' + Date.now().toString(16);
    const start = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
    const end = `\r\n--${boundary}--`;
    const body = Buffer.concat([Buffer.from(start), fileBuffer, Buffer.from(end)]);
    return { body, boundary };
}

// --- Health Check ---
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '0.1.0'
    });
});

// --- System Utilities ---

// POST /api/system/wipe-and-scan
// Query Param: ?dryRun=true
router.post('/system/wipe-and-scan', async (req, res) => {
    const isDryRun = req.query.dryRun === 'true';
    console.log(`🔥 [System] Wipe & Scan Requested (DryRun: ${isDryRun})`);

    try {
        const prisma = require('../../server-utils/db'); // Lazy load

        if (!isDryRun) {
            // 0. Ensure DB Schema exists (Critical for first-time Docker migrations where container startup push may have been bypassed)
            try {
                const { execSync } = require('child_process');
                console.log("🔥 [System] Verifying Database schema before wipe...");
                execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
                console.log("✅ [System] Database schema verified.");
            } catch (err) {
                console.warn(`⚠️ [System] Non-fatal error verifying schema: ${err.message}`);
            }

            // 1. Wipe DB (Transactions) - ONLY IN REAL RUN
            try {
                await prisma.$transaction([
                    prisma.modelFile.deleteMany(),
                    prisma.modelTag.deleteMany(),
                    prisma.modelCollection.deleteMany(), // New table
                    prisma.model.deleteMany(),
                    prisma.collection.deleteMany(),
                    prisma.tag.deleteMany(),
                ]);
                console.log("✅ [System] Database Wiped");
            } catch (wipeErr) {
                if (wipeErr.code === 'P2021' || (wipeErr.message && wipeErr.message.includes('does not exist'))) {
                    console.log("⚠️ [System] Tables did not exist to wipe. Emptiness guaranteed.");
                } else {
                    throw wipeErr;
                }
            }
        }

        // 2. Trigger Migration
        const MigrationEngine = require('../../server-utils/MigrationEngine');
        const engine = new MigrationEngine();
        const stats = await engine.run(isDryRun);

        res.json({ success: true, stats, dryRun: isDryRun });
    } catch (e) {
        console.error("❌ [System] Wipe & Scan Failed:", e);
        res.status(500).json({ success: false, error: e.stack });
    }
});

// List folders in models directory (used by Auto-Import)
router.get('/model-folders', (req, res) => {
    try {
        const root = getAbsoluteModelsPath();
        if (!fs.existsSync(root)) return res.json([]);

        // Read directories
        const items = fs.readdirSync(root, { withFileTypes: true });
        const folders = items
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name)
            .filter(name => !name.startsWith('.') && name !== 'uploads'); // Exclude hidden & uploads

        res.json(folders);
    } catch (e) {
        console.error('[System] Error listing folders:', e);
        res.status(500).json({ error: e.message });
    }
});

// --- Printer Routes ---

router.post('/printer/config', (req, res) => {
    const config = ConfigManager.loadConfig();
    if (!config.integrations) config.integrations = {};
    config.integrations.printer = req.body;
    ConfigManager.saveConfig(config);
    res.json({ success: true });
});

// Smart Printer Status - Supports Multi-Printer Array
router.get('/printer/status', async (req, res) => {
    const { type, url, apiKey } = req.query;

    // CASE 1: Test specific credentials (from Settings "Test" button)
    if (url) {
        try {
            const cleanUrl = url.replace(/\/$/, '');
            const target = type === 'moonraker' ? `${cleanUrl}/printer/info` : `${cleanUrl}/api/version`;

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const headers = apiKey ? { 'X-Api-Key': apiKey } : {};

            const resp = await fetch(target, { headers, signal: controller.signal });
            clearTimeout(timeout);

            if (resp.ok) return res.json({ status: 'connected' });
            return res.json({ status: 'error', message: `HTTP ${resp.status}: ${resp.statusText}` });
        } catch (e) {
            return res.json({ status: 'error', message: e.message });
        }
    }

    // CASE 2: Return list of all configured printers
    const config = ConfigManager.loadConfig();
    const legacy = config.integrations?.printer;
    const list = config.integrations?.printers || [];

    let allPrinters = [...list];
    if (legacy && legacy.url && allPrinters.length === 0) {
        allPrinters.push(legacy);
    }

    const validPrinters = allPrinters
        .map((p, index) => ({ ...p, index }))
        .filter(p => p.url);

    if (validPrinters.length === 0) {
        return res.json({ status: 'disabled', printers: [] });
    }

    const results = await Promise.all(validPrinters.map(async (p) => {
        try {
            const cleanUrl = p.url.replace(/\/$/, '');
            const target = p.type === 'moonraker' ? `${cleanUrl}/printer/info` : `${cleanUrl}/api/version`;

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2000);
            const headers = p.apiKey ? { 'X-Api-Key': p.apiKey } : {};

            const resp = await fetch(target, { headers, signal: controller.signal });
            clearTimeout(timeout);

            return {
                index: p.index,
                name: p.name || `Printer ${p.index + 1}`,
                type: p.type,
                status: resp.ok ? 'connected' : 'error'
            };
        } catch (e) {
            return {
                index: p.index,
                name: p.name || `Printer ${p.index + 1}`,
                type: p.type,
                status: 'offline'
            };
        }
    }));

    res.json({ status: 'active', printers: results });
});

router.post('/printer/print', async (req, res) => {
    const { filePath, printerIndex } = req.body;
    const config = ConfigManager.loadConfig();

    const printerList = config.integrations?.printers || (config.integrations?.printer ? [config.integrations.printer] : []);
    const targetIndex = (typeof printerIndex === 'number') ? printerIndex : 0;
    const p = printerList[targetIndex];

    if (!p || !p.url || !filePath) return res.status(400).json({ error: "Invalid printer selection or missing file" });

    try {
        const modelsDir = getAbsoluteModelsPath();
        const absPath = path.join(modelsDir, filePath);
        if (!fs.existsSync(absPath)) throw new Error("File not found on server");

        const fileBuffer = fs.readFileSync(absPath);
        const fileName = path.basename(absPath);
        const cleanUrl = p.url.replace(/\/$/, '');

        if (p.type === 'moonraker') {
            const { body, boundary } = createMultipartBody(fileBuffer, fileName);
            const resp = await fetch(`${cleanUrl}/server/files/upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': body.length
                },
                body: body
            });
            if (!resp.ok) throw new Error(`Klipper upload failed: ${resp.status}`);
            return res.json({ success: true, message: `Sent to ${p.name || 'Klipper'}` });
        }
        else if (p.type === 'octoprint') {
            const { body, boundary } = createMultipartBody(fileBuffer, fileName);
            const resp = await fetch(`${cleanUrl}/api/files/local`, {
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'X-Api-Key': p.apiKey,
                    'Content-Length': body.length
                },
                body: body
            });
            if (!resp.ok) throw new Error(`OctoPrint upload failed: ${resp.status}`);
            return res.json({ success: true, message: `Sent to ${p.name || 'OctoPrint'}` });
        }

        res.json({ success: false, error: "Unknown printer type" });

    } catch (e) {
        console.error("Print error:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/printer/job-status', async (req, res) => {
    const config = ConfigManager.loadConfig();
    const printerList = config.integrations?.printers || (config.integrations?.printer ? [config.integrations.printer] : []);

    if (printerList.length === 0) return res.json({ printers: [] });

    const checkPrinter = async (p, index) => {
        if (!p || !p.url) return null;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);

        try {
            const cleanUrl = p.url.replace(/\/$/, '');
            let status = 'idle';
            let progress = 0;
            let timeLeft = null;
            let filename = '';

            if (p.type === 'moonraker') {
                const queryUrl = `${cleanUrl}/printer/objects/query?print_stats&display_status`;
                const resp = await fetch(queryUrl, { signal: controller.signal });
                clearTimeout(timeout);
                if (!resp.ok) throw new Error('Unreachable');
                const data = await resp.json();
                const stats = data.result?.status?.print_stats || {};
                const display = data.result?.status?.display_status || {};

                const kState = stats.state || 'standby';
                if (kState === 'printing') status = 'printing';
                else if (kState === 'paused') status = 'paused';
                else if (kState === 'error') status = 'error';

                progress = (display.progress || 0) * 100;
                filename = stats.filename || '';
            }
            else {
                // OctoPrint
                const headers = p.apiKey ? { 'X-Api-Key': p.apiKey } : {};
                const resp = await fetch(`${cleanUrl}/api/job`, { headers, signal: controller.signal });
                clearTimeout(timeout);
                if (!resp.ok) throw new Error('Unreachable');
                const data = await resp.json();
                const state = (data.state || '').toLowerCase();

                if (state.includes('printing')) status = 'printing';
                else if (state.includes('paused')) status = 'paused';
                else if (state.includes('error') || state.includes('offline')) status = 'error';

                progress = data.progress?.completion || 0;
                timeLeft = data.progress?.printTimeLeft || null;
                filename = data.job?.file?.name || '';
            }

            return { index, status, progress, timeLeft, filename, name: p.name || `Printer ${index + 1}` };
        } catch (e) {
            clearTimeout(timeout);
            return { index, status: 'disconnected', error: e.message, name: p.name || `Printer ${index + 1}` };
        }
    };

    try {
        const results = await Promise.all(printerList.map((p, idx) => checkPrinter(p, idx)));
        res.json({ printers: results.filter(r => r !== null) });
    } catch (e) {
        res.json({ printers: [] });
    }
});

// --- Auto-Backup (Safe Restore) Routes (Moved from admin_db.js for Legacy Parity) ---

// GET /api/admin/db-safe-restores
// Lists all available safeRestore.bak.X files returning metadata so we can show them in UI
router.get('/admin/db-safe-restores', async (req, res) => {
    try {
        const prismaDir = path.join(process.cwd(), 'prisma');
        const files = fs.readdirSync(prismaDir).filter(f => f.startsWith('safeRestore.bak.'));

        const backups = files.map(file => {
            const stat = fs.statSync(path.join(prismaDir, file));
            return {
                name: file,
                size: stat.size,
                timestamp: stat.mtime.toISOString(),
            };
        }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        res.json({ success: true, backups });
    } catch (e) {
        console.error('Error listing DB safe restores:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/admin/db-safe-restore/:filename
// Overwrites modellibrary.db with the selected backup and cleans up WAL/SHM files
router.post('/admin/db-safe-restore/:filename', async (req, res) => {
    const filename = req.params.filename;
    // Basic security check to prevent directory traversal
    if (!filename.match(/^safeRestore\.bak\.[1-9]$/)) {
        return res.status(400).json({ success: false, error: 'Invalid backup filename.' });
    }

    try {
        const prismaDir = path.join(process.cwd(), 'prisma');
        const sourceFile = path.join(prismaDir, filename);
        const targetDb = path.join(prismaDir, 'modellibrary.db');

        if (!fs.existsSync(sourceFile)) {
            return res.status(404).json({ success: false, error: 'Backup file not found.' });
        }

        console.log(`[DB Admin] Starting safe restore from ${filename}...`);

        // Safely disconnect Prisma to release file locks
        const prisma = require('../../server-utils/db');
        await prisma.$disconnect();

        // Perform the copy
        fs.copyFileSync(sourceFile, targetDb);

        // Clean up write-ahead logs to avoid corruption across completely swapped DB states
        const shmPath = path.join(prismaDir, 'modellibrary.db-shm');
        const walPath = path.join(prismaDir, 'modellibrary.db-wal');
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);

        console.log(`[DB Admin] Safe restore from ${filename} complete. Restarting process to ensure clean Prisma connection.`);

        res.json({ success: true, message: 'Database restored successfully! The server is restarting.' });

        // Give the response 100ms to send before we kill the process to allow the manager (pm2/nodemon) to boot us back up
        setTimeout(() => {
            process.exit(0);
        }, 100);

    } catch (e) {
        console.error(`[DB Admin] Safe restore error:`, e);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
