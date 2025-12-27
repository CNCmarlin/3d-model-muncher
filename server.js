// Simple Express server for 3D Model Muncher backend API
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const multer = require('multer');
try { require('dotenv').config(); } catch (e) { /* dotenv not installed or not needed in production */ }
const { scanDirectory } = require('./dist-backend/utils/threeMFToJson');
const { ConfigManager } = require('./dist-backend/utils/configManager');
const { CollectionQueue } = require('./server-utils/collectionQueue');
const { scanDirectory: scanCollections } = require('./server-utils/collectionScanner');
const collectionScanner = require('./server-utils/collectionScanner');
const { generateThumbnail } = require('./dist-backend/utils/thumbnailGenerator');
const app = express();
const PORT = process.env.PORT || 3001;
let activeThumbnailJob = null; // Stores the AbortController for cancellation

const collectionQueue = new CollectionQueue(loadCollections, saveCollections);

// Startup diagnostic: show which GenAI env vars are present (sanitized)
safeLog('GenAI env presence:', {
  GEMINI_PROVIDER: !!process.env.GEMINI_PROVIDER,
  GOOGLE_API_KEY: !!process.env.GOOGLE_API_KEY,
  GOOGLE_APPLICATION_CREDENTIALS: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
  OPENAI_API_KEY: !!process.env.OPENAI_API_KEY
});

// Helper: sanitize objects before logging to avoid dumping large base64 images
function sanitizeForLog(value, options = {}) {
  const maxStringLength = options.maxStringLength || 200; // truncate long strings
  const base64Pattern = /^(data:\w+\/[\w+.-]+;base64,)?[A-Za-z0-9+/=\s]{200,}$/; // heuristic

  function sanitize(v, seen = new Set()) {
    if (v == null) return v;
    if (typeof v === 'string') {
      // If looks like base64 or very long, truncate and replace
      const trimmed = v.trim();
      if (trimmed.length > maxStringLength || base64Pattern.test(trimmed)) {
        return trimmed.substring(0, 64) + '...[TRUNCATED ' + trimmed.length + ' chars]';
      }
      return v;
    }
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    if (Array.isArray(v)) {
      return v.map(i => sanitize(i, seen));
    }
    if (typeof v === 'object') {
      if (seen.has(v)) return '[Circular]';
      seen.add(v);
      const out = {};
      for (const k of Object.keys(v)) {
        // Skip very large keys that commonly contain image data
        if (/(thumbnail|image|data|base64)/i.test(k) && typeof v[k] === 'string') {
          const s = v[k].trim();
          if (s.length > 40 || base64Pattern.test(s)) {
            out[k] = '[BASE64 TRUNCATED ' + s.length + ' chars]';
            continue;
          }
        }
        out[k] = sanitize(v[k], seen);
      }
      return out;
    }
    return v;
  }

  try {
    return sanitize(value);
  } catch (e) {
    return '[Unable to sanitize]';
  }
}

function safeLog(...args) {
  const sanitized = args.map(a => {
    if (typeof a === 'object' && a !== null) return sanitizeForLog(a);
    if (typeof a === 'string' && a.length > 400) return a.substring(0, 200) + '...[TRUNCATED ' + a.length + ' chars]';
    return a;
  });
  console.log.apply(console, sanitized);
}

// Resolve server-side config path, supporting per-test worker overrides to avoid
// concurrent test interference. If a worker-specific config exists, prefer it;
// otherwise fall back to the global data/config.json.
function getServerConfigPath() {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    const globalPath = path.join(dataDir, 'config.json');
    // Prefer Vitest worker-specific config when available
    const vitestWorkerId = process.env.VITEST_WORKER_ID;
    if (vitestWorkerId) {
      const workerPath = path.join(dataDir, `config.vitest-${vitestWorkerId}.json`);
      if (fs.existsSync(workerPath)) return workerPath;
    }
    // Fallback: Jest worker (not used here, but safe to include)
    const jestWorkerId = process.env.JEST_WORKER_ID;
    if (jestWorkerId) {
      const workerPath = path.join(dataDir, `config.jest-${jestWorkerId}.json`);
      if (fs.existsSync(workerPath)) return workerPath;
    }
    return globalPath;
  } catch (e) {
    // On error, fall back to default global path
    return path.join(process.cwd(), 'data', 'config.json');
  }
}

// Helper: conditional debug logging controlled by server-side config (data/config.json)
function isServerDebugEnabled() {
  try {
    const cfgPath = getServerConfigPath();
    if (fs.existsSync(cfgPath)) {
      const raw = fs.readFileSync(cfgPath, 'utf8');
      const parsed = JSON.parse(raw || '{}');
      return !!(parsed && parsed.settings && parsed.settings.verboseScanLogs);
    }
  } catch (e) {
    // ignore parse/read errors and fall back
  }
  try {
    const cfg = ConfigManager.loadConfig();
    return !!(cfg && cfg.settings && cfg.settings.verboseScanLogs);
  } catch (e) {
    return false;
  }
}

function serverDebug(...args) {
  if (isServerDebugEnabled()) {
    const sanitized = args.map(a => (typeof a === 'object' && a !== null) ? sanitizeForLog(a) : a);
    console.debug.apply(console, sanitized);
  }
}

// Configure multer for backup file uploads
// Increase fileSize limit to support larger model files (1GB by default)
// This can be overridden with the environment variable MAX_UPLOAD_BYTES (bytes)
const MAX_UPLOAD_BYTES = process.env.MAX_UPLOAD_BYTES ? parseInt(process.env.MAX_UPLOAD_BYTES, 10) : (1 * 1024 * 1024 * 1024);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES } // configurable via env MAX_UPLOAD_BYTES
});

app.use(cors());
app.use(express.json({ limit: '100mb' })); // Increased limit for large model payloads

app.use('/models', (req, res, next) => {
  ensureModelsStaticHandler();
  // Debug log to confirm exactly where we are looking
  if (req.method === 'GET') {
    console.log(`[Static Serve] Request: ${req.url} | Serving from: ${currentModelsPath}`);
  }
  return currentModelsStaticHandler(req, res, next);
});

// Collections storage helpers (persist under data/collections.json)
// Allow override via env var and use a test-specific file when running under Vitest/Node test env.
const collectionsFilePath = (() => {
  const defaultPath = path.join(process.cwd(), 'data', 'collections.json');
  try {
    const envPath = process.env.COLLECTIONS_FILE;
    if (envPath && typeof envPath === 'string' && envPath.trim()) {
      return path.isAbsolute(envPath) ? envPath : path.join(process.cwd(), envPath);
    }
    if (process.env.NODE_ENV === 'test') {
      return path.join(process.cwd(), 'data', 'collections.test.json');
    }
  } catch {}
  return defaultPath;
})();

function loadCollections() {
  try {
    if (!fs.existsSync(collectionsFilePath)) return [];
    const raw = fs.readFileSync(collectionsFilePath, 'utf8');
    if (!raw || raw.trim() === '') return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.collections) ? parsed.collections : []);
  } catch (e) {
    console.warn('Failed to load collections.json:', e);
    return [];
  }
}

function saveCollections(collections) {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const tmp = collectionsFilePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(collections, null, 2), 'utf8');
    fs.renameSync(tmp, collectionsFilePath);
    return true;
  } catch (e) {
    console.error('Failed to save collections.json:', e);
    return false;
  }
}

// Reconcile model hidden flags: any model that is not a member of any collection
// should not remain hidden. We scan all collections to compute the complete set
// of member IDs, then iterate munchie files and clear `hidden` when an ID is
// not present in any collection. This is intended to keep the main library
// visible unless a model is part of a set/collection.
function reconcileHiddenFlags() {
  try {
    const cols = loadCollections();
    const inAnyCollection = new Set();
    for (const c of cols) {
      const ids = Array.isArray(c?.modelIds) ? c.modelIds : [];
      for (const id of ids) {
        if (typeof id === 'string' && id) inAnyCollection.add(id);
      }
    }

    const modelsRoot = getAbsoluteModelsPath();
    (function scan(dir) {
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { /* ignore */ }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(full);
          continue;
        }
        if (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json')) {
          try {
            const raw = fs.readFileSync(full, 'utf8');
            const data = raw ? JSON.parse(raw) : null;
            if (!data || typeof data !== 'object') continue;
            const id = data.id;
            if (!id || typeof id !== 'string') continue;

            let changed = false;
            const shouldBeHidden = inAnyCollection.has(id);

            // Rule A: If in a collection but visible -> HIDE IT
            if (shouldBeHidden && data.hidden !== true) {
              data.hidden = true;
              changed = true;
            }
            // Rule B: If not in a collection but hidden -> SHOW IT
            else if (!shouldBeHidden && data.hidden === true) {
              data.hidden = false;
              changed = true;
            }

            if (changed) {
              try { data.lastModified = new Date().toISOString(); } catch { }
              const safeTarget = protectModelFileWrite(full);
              const tmp = safeTarget + '.tmp';
              fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
              fs.renameSync(tmp, safeTarget);
              // Optional: Post-process to ensure data integrity
              try { postProcessMunchieFile(safeTarget); } catch { }
            }
          } catch { /* ignore per-file errors */ }
        }
      }
    })(modelsRoot);
  } catch (e) {
    console.warn('reconcileHiddenFlags error:', e && e.message ? e.message : e);
  }
}

function makeId(prefix = 'col') {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${ts}-${rnd}`;
}

// Health check endpoint for Docker/Unraid
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '0.1.0'
  });
});

// --- Collections API ---
// List all collections
app.get('/api/collections', (req, res) => {
  try {
    const cols = loadCollections();
    res.json({ success: true, collections: cols });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to load collections' });
  }
});

// --- Spoolman Integration Proxy ---

// Helper to get Spoolman URL
function getSpoolmanUrl() {
  const config = ConfigManager.loadConfig();
  // Allow env var override for Docker power users
  let url = process.env.SPOOLMAN_URL || config.integrations?.spoolman?.url || '';
  // Remove trailing slash for consistency
  return url.replace(/\/$/, '');
}

// 1. Health Check (Verify Connection)
app.get('/api/spoolman/status', async (req, res) => {
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
app.get('/api/spoolman/spools', async (req, res) => {
  const url = getSpoolmanUrl();
  if (!url) return res.status(400).json({ error: 'Spoolman not configured' });

  try {
    // Fetch active spools (allow_archived=false)
    const response = await fetch(`${url}/api/v1/spool?allow_archived=false`);

    if (!response.ok) throw new Error(`Spoolman Error: ${response.status}`);

    const data = await response.json();

    // Transform data slightly for our UI if needed, or pass raw
    // Spoolman returns a rich object: { id, filament: { vendor, name, material, price, weight... }, remaining_weight }
    res.json({ success: true, spools: data });
  } catch (e) {
    console.error('Spoolman proxy error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// 3. Save Spoolman Config
app.post('/api/spoolman/config', (req, res) => {
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

    ConfigManager.saveConfig(config);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to save config' });
  }
});

// 4. Use Filament (Deduct weight)
app.post('/api/spoolman/use', async (req, res) => {
  const url = getSpoolmanUrl();
  if (!url) return res.status(400).json({ error: 'Spoolman not configured' });

  const { spoolId, weight } = req.body;
  if (!spoolId || !weight) return res.status(400).json({ error: 'Missing spoolId or weight' });

  try {
    // 1. Get current spool data to find remaining weight
    const getResponse = await fetch(`${url}/api/v1/spool/${spoolId}`);
    if (!getResponse.ok) throw new Error('Failed to fetch spool info');
    const spool = await getResponse.json();

    // 2. Calculate new weight
    // Spoolman expects "remaining_weight" in the PATCH payload
    const currentWeight = parseFloat(spool.remaining_weight);
    const deductAmount = parseFloat(weight);
    const newWeight = Math.max(0, currentWeight - deductAmount); // Prevent negative

    // 3. Send update to Spoolman
    const patchResponse = await fetch(`${url}/api/v1/spool/${spoolId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        remaining_weight: newWeight
      })
    });

    if (!patchResponse.ok) {
      const err = await patchResponse.text();
      throw new Error(`Spoolman update failed: ${err}`);
    }

    const updatedSpool = await patchResponse.json();

    console.log(`[Spoolman] Deducted ${weight}g from spool ${spoolId}. Remaining: ${updatedSpool.remaining_weight}`);
    res.json({ success: true, spool: updatedSpool });

  } catch (e) {
    console.error('Spoolman deduct error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create or update a collection
app.post('/api/collections', async (req, res) => {
  try {
    const { id, name, description = '', modelIds = [], childCollectionIds = [], parentId = null, coverModelId, category = '', tags = [], images = [], createOnDisk } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    // [NEW] Setup variables for Folder Creation
    let finalId = id;
    let finalCategory = category;

    // [NEW] Logic for creating physical folder (Only if requested AND it's a new collection)
    if ((!finalId || finalId === '') && createOnDisk) {
      const modelsDir = getAbsoluteModelsPath();
      let parentDir = modelsDir;

      // 1. Resolve Parent Path
      if (parentId && parentId !== 'root') {
        const currentCols = loadCollections();
        const parentCol = currentCols.find(c => c.id === parentId);
        if (parentCol) {
          // Try to decode path from ID if it's an auto-collection (col_...)
          if (parentCol.id.startsWith('col_')) {
            try {
              const b64 = parentCol.id.substring(4);
              // Decode base64 to get relative path
              const relPath = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
              parentDir = path.join(modelsDir, relPath);
            } catch (e) {
              console.warn("Could not decode parent path from ID, defaulting to root");
            }
          } else {
            // Manual collection parent: we can't physically nest inside a virtual collection
            console.log("Parent is manual collection, creating folder at root models dir.");
          }
        }
      }

      // 2. Create the Directory on Disk
      // Sanitize name for filesystem safety
      const safeName = name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim();
      const newDirPath = path.join(parentDir, safeName);

      if (!fs.existsSync(newDirPath)) {
        fs.mkdirSync(newDirPath, { recursive: true });
        console.log(`[Collection] Created physical folder: ${newDirPath}`);
      }

      // 3. Generate ID consistent with Auto-Import Scanner
      // This ensures that if the auto-scanner runs later, it will generate the SAME ID and match this collection.
      const rel = path.relative(modelsDir, newDirPath);
      const normalized = rel.replace(/\\/g, '/');
      // 'col_' + base64(path)
      finalId = `col_${Buffer.from(normalized).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;

      // Force category to 'Auto-Imported' so it behaves like a system collection
      finalCategory = 'Auto-Imported';
    } else if (!finalId) {
      // Fallback for standard manual collections
      finalId = makeId();
    }

    // [EXISTING] The safe update task
    const updateTask = (currentCols) => {
      const now = new Date().toISOString();
      const normalizedIds = Array.from(new Set(modelIds.filter(x => typeof x === 'string' && x.trim() !== '')));
      const normalizedChildren = Array.isArray(childCollectionIds) ? childCollectionIds.filter(x => typeof x === 'string') : [];

      let updatedCols = [...currentCols];

      // Check if ID exists (using our calculated finalId)
      const idx = updatedCols.findIndex(c => c.id === finalId);

      if (idx !== -1) {
        // UPDATE Existing
        const prev = updatedCols[idx];
        const updated = {
          ...prev,
          name, description, modelIds: normalizedIds, childCollectionIds: normalizedChildren,
          parentId: (parentId === 'root' ? null : parentId), // Ensure 'root' becomes null
          coverModelId, lastModified: now
        };
        // Only update these if provided (or if forced by folder creation)
        if (finalCategory) updated.category = finalCategory;
        if (tags) updated.tags = tags;
        if (images) updated.images = images;

        updatedCols[idx] = updated;
      } else {
        // CREATE New
        const newCol = {
          id: finalId, // Use the ID we determined above
          name, description, modelIds: normalizedIds, childCollectionIds: normalizedChildren,
          parentId: (parentId === 'root' ? null : parentId),
          coverModelId,
          category: finalCategory,
          tags, images,
          created: now, lastModified: now
        };
        updatedCols.push(newCol);
      }

      return updatedCols;
    };

    // Execute via Queue
    await collectionQueue.add(updateTask);

    // Fetch result
    const freshCols = loadCollections();
    const savedItem = freshCols.find(c => c.id === finalId);

    setTimeout(() => { try { reconcileHiddenFlags(); } catch { } }, 10);

    res.json({ success: true, collection: savedItem });

  } catch (e) {
    console.error('/api/collections error:', e);
    const status = e.message === 'Collection not found' ? 404 : 500;
    res.status(status).json({ success: false, error: e.message || 'Server error' });
  }
});

// Delete a collection
app.delete('/api/collections/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const deleteTask = (currentCols) => {
      const idx = currentCols.findIndex(c => c.id === id);
      if (idx === -1) throw new Error('Not found');

      const updatedCols = [...currentCols];
      updatedCols.splice(idx, 1);
      return updatedCols;
    };

    await collectionQueue.add(deleteTask);
    try { reconcileHiddenFlags(); } catch { }
    res.json({ success: true, deletedId: id });

  } catch (e) {
    const status = e.message === 'Not found' ? 404 : 500;
    res.status(status).json({ success: false, error: e.message });
  }
});

// API: Auto-Import Collections from Directory
app.post('/api/collections/auto-import', async (req, res) => {
  try {
    const { targetFolder, strategy = 'smart', clearPrevious = false } = req.body;
    const modelsDir = getAbsoluteModelsPath();

    // 1. Determine directory to scan
    let scanRoot = modelsDir;
    if (targetFolder) {
      if (targetFolder.includes('..')) return res.status(400).json({ success: false, error: 'Invalid path' });
      scanRoot = path.join(modelsDir, targetFolder);
    }

    if (!fs.existsSync(scanRoot)) {
      return res.status(404).json({ success: false, error: 'Directory not found' });
    }

    console.log(`[Auto-Import] Scanning ${scanRoot} (Strategy: ${strategy}, ClearPrevious: ${clearPrevious})`);

    // 2. Run the Scanner
    // Dynamic require to ensure we get the latest version if files changed
    delete require.cache[require.resolve('./server-utils/collectionScanner')];
    const { scanDirectory: scanCollections } = require('./server-utils/collectionScanner');

    const discoveredCollections = scanCollections(scanRoot, modelsDir, { strategy });

    // 3. Queue the Merge Logic
    const mergeTask = (currentCols) => {
      let updatedCols = [...currentCols];

      // Step A: If requested, prune old auto-collections
      if (clearPrevious) {
        const beforeCount = updatedCols.length;
        updatedCols = updatedCols.filter(c => {
          // Check 1: Explicit Category match (case-insensitive)
          const isAutoCategory = (c.category || '').trim().toLowerCase() === 'auto-imported';

          // Check 2: ID Pattern match
          // Manual collections use "col-timestamp-random" (hyphens).
          // Auto scanner uses "col_base64" (underscore).
          // This catches legacy auto-collections that might be missing the category.
          const isAutoId = c.id && typeof c.id === 'string' && c.id.startsWith('col_');

          // If it matches either criteria, it is an auto-collection.
          // We KEEP it only if it is NOT an auto-collection.
          return !isAutoCategory && !isAutoId;
        });
        console.log(`[Auto-Import] Pruned ${beforeCount - updatedCols.length} old auto-collections.`);
      }

      let added = 0;
      let updated = 0;

      for (const importCol of discoveredCollections) {
        const existingIdx = updatedCols.findIndex(c => c.id === importCol.id);

        if (existingIdx !== -1) {
          // UPDATE existing
          const existing = updatedCols[existingIdx];
          // Merge modelIds (keep existing ones plus new ones)
          const mergedIds = [...new Set([...existing.modelIds, ...importCol.modelIds])];

          updatedCols[existingIdx] = {
            ...existing,
            modelIds: mergedIds,
            // Force category to Auto-Imported so it can be cleaned up next time
            category: 'Auto-Imported',
            parentId: existing.parentId || importCol.parentId,
            lastModified: new Date().toISOString()
          };
          updated++;
        } else {
          // CREATE new
          updatedCols.push(importCol);
          added++;
        }
      }
      console.log(`[Auto-Import] Merge complete. Added: ${added}, Updated: ${updated}`);
      return updatedCols;
    };

    await collectionQueue.add(mergeTask);

    try { reconcileHiddenFlags(); } catch (e) { console.warn('Auto-import reconcile failed', e); }

    res.json({
      success: true,
      count: discoveredCollections.length,
      message: `Import complete. ${clearPrevious ? 'Reset performed. ' : ''}Processed ${discoveredCollections.length} collections.`
    });

  } catch (e) {
    console.error('[Auto-Import] Error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// --- API: Generate Collection Covers (Mosaic or Single Fallback) ---
let activeCoverJob = null;

app.post('/api/collections/generate-covers', async (req, res) => {
  if (activeCoverJob) {
    activeCoverJob.abort();
  }
  activeCoverJob = new AbortController();
  const signal = activeCoverJob.signal;

  try {
    const { collectionIds, force = false } = req.body;
    const modelsDir = getAbsoluteModelsPath();
    const dataDir = path.join(process.cwd(), 'data');
    const coversDir = path.join(dataDir, 'covers');

    let generateCover;
    try {
      generateCover = require('./server-utils/coverGenerator').generateCover;
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Failed to load generator. Did you install "sharp"?' });
    }

    // 1. Build Index
    console.log('[Covers] Building model index...');
    const idToPathMap = {};
    function scanIndex(dir) {
      if (signal.aborted) return;
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { }

      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanIndex(full);
        } else if (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json')) {
          try {
            const raw = fs.readFileSync(full, 'utf8');
            const data = JSON.parse(raw);
            if (data.id) idToPathMap[data.id] = full;
          } catch (e) { }
        }
      }
    }
    scanIndex(modelsDir);

    // 2. Get Targets
    let collections = loadCollections();
    let targets = collections;
    if (collectionIds && Array.isArray(collectionIds) && collectionIds.length > 0) {
      targets = collections.filter(c => collectionIds.includes(c.id));
    }

    console.log(`[Covers] Processing ${targets.length} collections...`);
    let processed = 0;
    let skipped = 0;
    let errors = [];

    for (const col of targets) {
      if (signal.aborted) break;

      // Skip if cover exists and not forced (unless cover is missing entirely)
      const existingPath = path.join(coversDir, `${col.id}.jpg`);
      if (!force && col.coverImage && (fs.existsSync(existingPath) || !col.coverImage.includes('/data/covers/'))) {
        skipped++;
        continue;
      }

      try {
        // Attempt 1: Generate 2x2 Mosaic
        const result = await generateCover(col, modelsDir, coversDir, idToPathMap);

        // Find fresh index in case array mutated (rare but safe)
        const idx = collections.findIndex(c => c.id === col.id);
        if (idx === -1) continue;

        if (result.success) {
          // --- Success: Mosaic Created ---
          collections[idx].coverImage = result.path;
          collections[idx].lastModified = new Date().toISOString();
          processed++;
        } else {
          // --- Fallback: Select Single Image ---
          // If < 4 models, pick the first available thumbnail from the member models
          let singleImage = null;
          const candidates = col.modelIds || [];

          for (const mid of candidates) {
            const jsonPath = idToPathMap[mid];
            if (!jsonPath || !fs.existsSync(jsonPath)) continue;
            try {
              const mData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
              // Check standard image fields
              const img = (mData.parsedImages && mData.parsedImages[0]) ||
                (mData.images && mData.images[0]) ||
                mData.thumbnail;

              // Use if it's a valid path (skip heavy data URIs for covers if possible)
              if (img && typeof img === 'string' && !img.startsWith('data:')) {
                singleImage = img;
                break; // Found one!
              }
            } catch (e) { }
          }

          if (singleImage) {
            collections[idx].coverImage = singleImage;
            collections[idx].lastModified = new Date().toISOString();
            processed++;
          } else {
            skipped++; // Collection is truly empty or has no images
          }
        }
      } catch (err) {
        console.error(`[Covers] Failed ${col.name}:`, err.message);
        errors.push({ id: col.id, name: col.name, error: err.message });
      }
    }

    // 3. Save
    saveCollections(collections);

    activeCoverJob = null;
    res.json({ success: true, processed, skipped, errors, aborted: signal.aborted });

  } catch (e) {
    activeCoverJob = null;
    console.error('[Covers] Fatal error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// --- API: Secure File Download (Fixes Bulk/Zip Issues) ---
app.get('/api/download', async (req, res) => {
  try {
    const { path: targetPath } = req.query;
    if (!targetPath || typeof targetPath !== 'string') {
      return res.status(400).send('Missing path');
    }

    // Handle Remote URLs (Proxy)
    if (targetPath.startsWith('http://') || targetPath.startsWith('https://')) {
      try {
        const fetch = (await import('node-fetch')).default; // Dynamic import if using ESM or native fetch in Node 18+
        const response = await fetch(targetPath);
        if (!response.ok) throw new Error(`Remote fetch failed: ${response.status}`);

        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(targetPath)}"`);
        return response.body.pipe(res);
      } catch (e) {
        // Fallback for Node without native fetch or if fetch fails
        return res.status(502).send('Failed to fetch remote file');
      }
    }

    // Handle Local Files
    // Normalize: remove /models/ prefix if present to get filesystem path
    let relPath = targetPath;
    if (relPath.startsWith('/models/')) relPath = relPath.substring(8);
    if (relPath.startsWith('models/')) relPath = relPath.substring(7);

    // Security: Prevent traversal
    if (relPath.includes('..')) return res.status(403).send('Access denied');

    const modelsDir = getAbsoluteModelsPath();
    const absPath = path.join(modelsDir, relPath);

    if (!fs.existsSync(absPath)) {
      return res.status(404).send('File not found');
    }

    res.download(absPath);
  } catch (e) {
    console.error('Download error:', e);
    if (!res.headersSent) res.status(500).send('Server error');
  }
});

// Serve model files from the models directory. The configured directory can be
// updated at runtime by saving `data/config.json`. We create a small wrapper
// that ensures the static handler points at the current configured directory.
let currentModelsStaticHandler = null;
let currentModelsPath = null;

function ensureModelsStaticHandler() {
  try {
    const abs = getAbsoluteModelsPath();
    if (currentModelsPath !== abs) {
      console.log(`Updating /models static handler to serve from: ${abs}`);
      currentModelsPath = abs;
      currentModelsStaticHandler = express.static(abs);
    }
  } catch (e) {
    console.warn('Failed to ensure models static handler:', e);
    currentModelsStaticHandler = (req, res, next) => next();
  }
}

// --- API: Cancel Thumbnail Generation ---
app.post('/api/cancel-thumbnails', (req, res) => {
  if (activeThumbnailJob) {
    console.log('🛑 Received cancellation request. Stopping thumbnail generation...');
    activeThumbnailJob.abort(); // Triggers the signal in the generator
    activeThumbnailJob = null;
    res.json({ success: true, message: 'Cancellation signal sent.' });
  } else {
    res.json({ success: false, message: 'No generation job is currently running.' });
  }
});

// Helper function to get the models directory (always from source)
function getModelsDirectory() {
  // Prefer server-side `data/config.json` when present (written by /api/save-config).
  try {
    const serverConfigPath = getServerConfigPath();
    if (fs.existsSync(serverConfigPath)) {
      const raw = fs.readFileSync(serverConfigPath, 'utf8');
      const parsed = JSON.parse(raw || '{}');
      if (parsed && parsed.settings && typeof parsed.settings.modelDirectory === 'string' && parsed.settings.modelDirectory.trim() !== '') {
        return parsed.settings.modelDirectory;
      }
    }
  } catch (e) {
    console.warn('Failed to read server-side data/config.json:', e);
  }
  const config = ConfigManager.loadConfig();
  return (config.settings && config.settings.modelDirectory) || './models';
}

function getAbsoluteModelsPath() {
  const dir = getModelsDirectory();
  return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

// Helper to ensure we never write directly to .3mf or .stl files. If a caller
// provides a target path that points at a model file, map it to the
// corresponding munchie JSON filename instead and return that path. This
// centralizes the protection so restore/upload code won't accidentally
// overwrite raw model files.
function protectModelFileWrite(targetPath) {
  try {
    if (!targetPath || typeof targetPath !== 'string') return targetPath;
    if (/\.3mf$/i.test(targetPath)) {
      const mapped = targetPath.replace(/\.3mf$/i, '-munchie.json');
      console.warn('Attempted write to .3mf detected; remapping to munchie JSON:', targetPath, '->', mapped);
      return mapped;
    }
    if (/\.stl$/i.test(targetPath)) {
      const mapped = targetPath.replace(/\.stl$/i, '-stl-munchie.json');
      console.warn('Attempted write to .stl detected; remapping to -stl-munchie JSON:', targetPath, '->', mapped);
      return mapped;
    }
  } catch (e) {
    // If anything goes wrong, fall back to returning original so caller can
    // make a final decision; avoid throwing here to not break restore flows.
    console.warn('protectModelFileWrite error:', e && e.message ? e.message : e);
  }
  return targetPath;
}

// Helper: ensure munchie JSON has userDefined.thumbnail and imageOrder when appropriate
async function postProcessMunchieFile(absoluteFilePath) {
  try {
    if (!fs.existsSync(absoluteFilePath)) return;
    const raw = fs.readFileSync(absoluteFilePath, 'utf8');
    if (!raw || raw.trim().length === 0) return;
    let data;
    try { data = JSON.parse(raw); } catch (e) { return; }

    const parsedImages = Array.isArray(data.parsedImages) ? data.parsedImages : (Array.isArray(data.images) ? data.images : []);
    // Normalize legacy userDefined shapes:
    // - array (old generator produced [ { ... } ])
    // - object that contains numeric keys like '0' (previous saves produced object with '0')
    let changed = false;
    let udExists = data.userDefined && typeof data.userDefined === 'object';
    try {
      if (Array.isArray(data.userDefined)) {
        // Convert array -> single object using first entry
        data.userDefined = data.userDefined.length > 0 && typeof data.userDefined[0] === 'object' ? { ...(data.userDefined[0]) } : {};
        udExists = true;
        changed = true;
      } else if (udExists && Object.prototype.hasOwnProperty.call(data.userDefined, '0')) {
        // Convert object with numeric '0' key into normal object shape
        const zero = data.userDefined['0'] && typeof data.userDefined['0'] === 'object' ? { ...(data.userDefined['0']) } : {};
        // preserve any top-level fields (images, thumbnail, imageOrder) that exist
        const imgs = Array.isArray(data.userDefined.images) ? data.userDefined.images : undefined;
        const thumb = typeof data.userDefined.thumbnail !== 'undefined' ? data.userDefined.thumbnail : undefined;
        const order = Array.isArray(data.userDefined.imageOrder) ? data.userDefined.imageOrder : undefined;
        const normalized = { ...zero };
        if (typeof imgs !== 'undefined') normalized.images = imgs;
        if (typeof thumb !== 'undefined') normalized.thumbnail = thumb;
        if (typeof order !== 'undefined') normalized.imageOrder = order;
        data.userDefined = normalized;
        udExists = true;
        changed = true;
      }
    } catch (e) {
      // if normalization fails, don't block post-processing
      console.warn('Failed to normalize legacy userDefined shape:', e);
    }

    if (parsedImages && parsedImages.length > 0) {
      // Ensure userDefined object exists
      if (!udExists) {
        data.userDefined = {};
        changed = true;
      }
      // Ensure thumbnail descriptor exists
      if (!data.userDefined.thumbnail) {
        data.userDefined.thumbnail = 'parsed:0';
        changed = true;
      }
      // Ensure imageOrder exists and lists parsed images first
      if (!Array.isArray(data.userDefined.imageOrder) || data.userDefined.imageOrder.length === 0) {
        const imageOrder = [];
        for (let i = 0; i < parsedImages.length; i++) imageOrder.push(`parsed:${i}`);
        const userImgs = Array.isArray(data.userDefined.images) ? data.userDefined.images : [];
        for (let i = 0; i < userImgs.length; i++) imageOrder.push(`user:${i}`);
        data.userDefined.imageOrder = imageOrder;
        changed = true;
      }
    }

    if (changed) {
      // Protect against accidental writes to raw model files
      const safeTarget = protectModelFileWrite(absoluteFilePath);
      const tmpPath = safeTarget + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmpPath, safeTarget);
      console.log('Post-processed munchie file to include userDefined.thumbnail/imageOrder:', safeTarget);
    }
  } catch (e) {
    console.warn('postProcessMunchieFile error for', absoluteFilePath, e);
  }
}

// API endpoint to save a model to its munchie.json file
app.post('/api/save-model', async (req, res) => {
  let { filePath, id, ...changes } = req.body || {};

  // Require at least an id or a filePath so we know where to save
  if (!filePath && !id) {
    console.log('No filePath or id provided');
    return res.status(400).json({ success: false, error: 'No filePath or id provided' });
  }

  // If filePath is a model file (.stl/.3mf), convert to munchie.json
  if (filePath && /\.stl$/i.test(filePath)) {
    filePath = filePath.replace(/\.stl$/i, '-stl-munchie.json');
  } else if (filePath && /\.3mf$/i.test(filePath)) {
    filePath = filePath.replace(/\.3mf$/i, '-munchie.json');
  }

  // Refuse to write to raw model files
  if (filePath && (/\.stl$/i.test(filePath) || /\.3mf$/i.test(filePath))) {
    console.error('Refusing to write to model file:', filePath);
    return res.status(400).json({ success: false, error: 'Refusing to write to model file' });
  }
  try {
    // If an id was provided without a filePath, try to locate the munchie JSON file by scanning the models directory
    let absoluteFilePath;
    if (!filePath && id) {
      try {
        const modelsRoot = getAbsoluteModelsPath();
        let found = null;
        function walk(dir) {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (found) break;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walk(full);
            } else if (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json')) {
              try {
                const raw = fs.readFileSync(full, 'utf8');
                const parsed = raw ? JSON.parse(raw) : null;
                if (parsed && (parsed.id === id || parsed.name === id)) {
                  found = full;
                  break;
                }
              } catch (e) {
                // ignore parse errors for individual files
              }
            }
          }
        }
        walk(modelsRoot);
        if (!found) {
          return res.status(404).json({ success: false, error: 'Model id not found' });
        }
        absoluteFilePath = found;
        // populate filePath (relative) for logging and downstream use
        filePath = path.relative(modelsRoot, found).replace(/\\/g, '/');
      } catch (e) {
        console.error('Error searching for munchie by id:', e);
        return res.status(500).json({ success: false, error: 'Internal error locating model by id' });
      }
    } else {
      // Resolve provided filePath to absolute path
      if (path.isAbsolute(filePath)) {
        absoluteFilePath = filePath;
      } else {
        absoluteFilePath = path.join(getAbsoluteModelsPath(), filePath);
      }
    }

    console.log('Resolved file path for saving:', absoluteFilePath);

    // Require relative filePath and ensure the target is inside the configured models directory
    if (path.isAbsolute(filePath) && !(filePath && filePath.startsWith('./') === false)) {
      // If the client sent an absolute filePath string, reject it outright for safety
      console.warn('Rejected absolute filePath in /api/save-model:', filePath);
      return res.status(400).json({ success: false, error: 'Absolute file paths are not allowed' });
    }

    try {
      const resolvedTarget = path.resolve(absoluteFilePath);
      const modelsDirResolved = path.resolve(getAbsoluteModelsPath());
      const relative = path.relative(modelsDirResolved, resolvedTarget);
      if (relative.startsWith('..') || (relative === '' && resolvedTarget !== modelsDirResolved)) {
        console.warn('Attempt to save model outside models directory blocked:', resolvedTarget, 'relativeToModelsDir=', relative);
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
    } catch (e) {
      console.error('Error resolving paths for save-model containment check:', e);
      return res.status(400).json({ success: false, error: 'Invalid file path' });
    }

    // Load existing model JSON (be defensive against corrupt or partial files)
    let existing = {};
    if (fs.existsSync(absoluteFilePath)) {
      try {
        const raw = fs.readFileSync(absoluteFilePath, 'utf-8');
        existing = raw ? JSON.parse(raw) : {};
      } catch (parseErr) {
        console.error(`Failed to parse existing model JSON at ${absoluteFilePath}:`, parseErr);
        // If file is corrupted or partially written, continue with an empty object so we can
        // overwrite with a clean, valid JSON. Do NOT hard-fail here to avoid blocking UI actions.
        existing = {};
      }
    }

    // Migration: if an existing file accidentally contains a top-level `changes` object
    // (caused by the previous API mismatch where the client sent { filePath, changes: {...} }),
    // merge that object into the top-level and remove the wrapper so the file doesn't
    // continue to contain a "changes" wrapper.
    if (existing && typeof existing === 'object' && !Array.isArray(existing) && existing.changes && typeof existing.changes === 'object') {
      try {
        const migrated = { ...existing, ...existing.changes };
        delete migrated.changes;
        existing = migrated;
        console.log(`Migrated embedded 'changes' object for ${absoluteFilePath}`);
      } catch (e) {
        console.warn(`Failed to migrate embedded 'changes' for ${absoluteFilePath}:`, e);
      }
    }

    // Some clients send { filePath, changes: { ... } } while others send flattened top-level change fields.
    // Support both shapes: prefer req.body.changes when present, otherwise use the flattened rest.
    let incomingChanges = changes;
    if (req.body && req.body.changes && typeof req.body.changes === 'object') {
      incomingChanges = req.body.changes;
    }

    // Remove filePath and other computed properties from incomingChanges to prevent them from being saved
    const { filePath: _, modelUrl: __, ...cleanChanges } = incomingChanges;

    // Determine target type based on the resolved filePath (3MF vs STL munchie)
    const targetIsStlMunchie = typeof filePath === 'string' && /-stl-munchie\.json$/i.test(filePath);
    const targetIs3mfMunchie = typeof filePath === 'string' && /-munchie\.json$/i.test(filePath) && !/-stl-munchie\.json$/i.test(filePath);

    // Business rule: print settings (layerHeight, infill, nozzle, etc.) are only user-editable for STL models.
    // For 3MF models, these values are derived from the .3mf and should not be overridden by saves.
    if (targetIs3mfMunchie && cleanChanges && typeof cleanChanges === 'object' && cleanChanges.printSettings) {
      // Drop any attempted edits to printSettings for 3MF targets
      try {
        delete cleanChanges.printSettings;
      } catch (e) {
        // ignore
      }
    }
    // Sanitize and log the cleaned changes to help debug whether nested thumbnails
    // were included by the client. Avoid printing base64 images directly.
    try {
      const preview = JSON.parse(JSON.stringify(cleanChanges, (k, v) => {
        if (typeof v === 'string' && v.length > 200) return `[long string ${v.length} chars]`;
        if (Array.isArray(v) && v.length > 0 && v.every(it => typeof it === 'string' && it.startsWith('data:'))) return `[${v.length} base64 images]`;
        return v;
      }));
      // console.log('[server] cleanChanges preview:', preview);
    } catch (e) {
      console.warn('[server] Failed to build cleanChanges preview', e);
    }

    // Normalize tags if provided: trim and dedupe case-insensitively while preserving
    // the original casing of the first occurrence.
    function normalizeTags(tags) {
      if (!Array.isArray(tags)) return tags;
      const seen = new Set();
      const out = [];
      for (const t of tags) {
        if (typeof t !== 'string') continue;
        const trimmed = t.trim();
        const key = trimmed.toLowerCase();
        if (!seen.has(key) && trimmed !== '') {
          seen.add(key);
          out.push(trimmed);
        }
      }
      return out;
    }

    if (cleanChanges.tags) {
      cleanChanges.tags = normalizeTags(cleanChanges.tags);
    }

    function normalizeRelatedFiles(arr) {
      const cleaned = [];
      const rejected = [];
      if (!Array.isArray(arr)) return { cleaned, rejected };
      const seen = new Set();
      for (let raw of arr) {
        if (typeof raw !== 'string') continue;
        let s = raw.trim();
        if (s === '') {
          rejected.push(raw);
          continue; // drop empty entries
        }

        // Reject path traversal
        if (s.includes('..')) {
          rejected.push(raw);
          continue;
        }

        // Normalize backslashes to forward slashes for consistent URLs
        s = s.replace(/\\/g, '/');

        // Reject UNC paths (starting with //) for security reasons
        if (s.startsWith('//')) {
          rejected.push(raw);
          continue;
        }

        // Reject absolute Windows drive paths (e.g., C:/ or C:\) for security
        if (/^[a-zA-Z]:\//.test(s) || /^[a-zA-Z]:\\/.test(raw)) {
          // treat as rejected
          rejected.push(raw);
          continue;
        } else {
          // Strip a single leading slash if present to make it relative to /models when used
          if (s.startsWith('/')) s = s.substring(1);
          if (s.startsWith('/')) s = s.substring(1); // double-check
        }

        // Deduplicate by normalized form
        const key = s.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          cleaned.push(s);
        } else {
          // duplicate silently dropped
        }
      }
      return { cleaned, rejected };
    }

    let rejectedRelatedFiles = [];
    if (cleanChanges.related_files) {
      const nf = normalizeRelatedFiles(cleanChanges.related_files);
      cleanChanges.related_files = nf.cleaned;
      rejectedRelatedFiles = nf.rejected;
    }

    // Normalize incoming userDefined shape (accept array, object-with-'0', or object)
    try {
      if (cleanChanges.userDefined) {
        if (Array.isArray(cleanChanges.userDefined) && cleanChanges.userDefined.length > 0) {
          cleanChanges.userDefined = cleanChanges.userDefined[0];
        } else if (typeof cleanChanges.userDefined === 'object' && Object.prototype.hasOwnProperty.call(cleanChanges.userDefined, '0')) {
          // Merge numeric '0' into top-level and keep other top-level fields
          const zero = cleanChanges.userDefined['0'] && typeof cleanChanges.userDefined['0'] === 'object' ? { ...(cleanChanges.userDefined['0']) } : {};
          const imgs = Array.isArray(cleanChanges.userDefined.images) ? cleanChanges.userDefined.images : undefined;
          const thumb = typeof cleanChanges.userDefined.thumbnail !== 'undefined' ? cleanChanges.userDefined.thumbnail : undefined;
          const order = Array.isArray(cleanChanges.userDefined.imageOrder) ? cleanChanges.userDefined.imageOrder : undefined;
          const normalized = { ...zero };
          if (typeof imgs !== 'undefined') normalized.images = imgs;
          if (typeof thumb !== 'undefined') normalized.thumbnail = thumb;
          if (typeof order !== 'undefined') normalized.imageOrder = order;
          cleanChanges.userDefined = normalized;
        }
      }

    } catch (e) {
      console.warn('Failed to normalize incoming userDefined in save-model:', e);
    }

    // At this point we've computed the cleaned changes. Log a concise message:
    const hasUserImages = cleanChanges.userDefined && (
      (Array.isArray(cleanChanges.userDefined.images) && cleanChanges.userDefined.images.length > 0) ||
      (Array.isArray(cleanChanges.userDefined.imageOrder) && cleanChanges.userDefined.imageOrder.length > 0)
    );

    // Ensure userDefined.thumbnail is set if images are present and thumbnail is missing
    if (hasUserImages && cleanChanges.userDefined && !cleanChanges.userDefined.thumbnail) {
      cleanChanges.userDefined.thumbnail = 'user:0';
    }

    if (!cleanChanges || Object.keys(cleanChanges).length === 0) {
      if (hasUserImages) {
        // safeLog('Save model request: Forcing save for userDefined.images/imageOrder', { filePath });
      } else {
        // safeLog('Save model request: No changes to apply for', { filePath });
        console.log('No changes to apply for', absoluteFilePath);
        return res.json({ success: true, message: 'No changes' });
      }
    } else {
      // Only log the cleaned changes (no computed props) to avoid noisy or nested payloads
      // safeLog('Save model request:', { filePath, changes: sanitizeForLog(cleanChanges) });
    }

    // Merge changes carefully. We specially merge `userDefined` so that
    // we don't blindly overwrite existing user data (which could strip images
    // or imageOrder). The client is expected to write descriptors into
    // `userDefined.imageOrder` (no legacy top-level imageOrder support).
    const updated = { ...existing };
    for (const key of Object.keys(cleanChanges)) {
      if (key === 'userDefined') continue; // handle after loop
      updated[key] = cleanChanges[key];
    }

    // Merge userDefined carefully. Support legacy cases where existing.userDefined
    // might be an array (generation produced [ { ... } ]) and where the client
    // may send either an array or an object. Normalize both sides to a single
    // object by using the first element of any array as the base object.
    if (cleanChanges.userDefined) {
      // Build base from existing data
      let existingUDObj = {};
      try {
        if (Array.isArray(existing.userDefined) && existing.userDefined.length > 0 && typeof existing.userDefined[0] === 'object') {
          existingUDObj = { ...(existing.userDefined[0] || {}) };
        } else if (existing.userDefined && typeof existing.userDefined === 'object') {
          existingUDObj = { ...(existing.userDefined) };
        }
      } catch (e) {
        existingUDObj = {};
      }

      // Build incoming object (accept array or object)
      let incomingUDObj = {};
      try {
        if (Array.isArray(cleanChanges.userDefined) && cleanChanges.userDefined.length > 0 && typeof cleanChanges.userDefined[0] === 'object') {
          incomingUDObj = { ...(cleanChanges.userDefined[0] || {}) };
        } else if (cleanChanges.userDefined && typeof cleanChanges.userDefined === 'object') {
          incomingUDObj = { ...(cleanChanges.userDefined) };
        }
      } catch (e) {
        incomingUDObj = {};
      }

      // Shallow merge: incoming fields override existing ones; arrays like
      // images and imageOrder will be replaced if provided by incomingUDObj.
      const mergedUDObj = { ...existingUDObj, ...incomingUDObj };
      // Special handling: client can request clearing the nested description
      // by sending description: null. If so, delete the property from the
      // merged object so the saved file no longer contains it.
      try {
        if (Object.prototype.hasOwnProperty.call(incomingUDObj, 'description') && incomingUDObj.description === null) {
          if (Object.prototype.hasOwnProperty.call(mergedUDObj, 'description')) delete mergedUDObj.description;
        }
      } catch (e) {
        // ignore
      }
      updated.userDefined = mergedUDObj;
    }

    // Ensure the directory exists
    const dir = path.dirname(absoluteFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // REMOVE LEGACY FIELDS: Remove top-level thumbnail and images from the final saved data
    // These fields are deprecated in favor of parsedImages (for parsed content) 
    // and userDefined.images (for user-added content)
    if (updated.hasOwnProperty('thumbnail')) {
      console.log('Removing deprecated top-level thumbnail field from saved data');
      delete updated.thumbnail;
    }
    if (updated.hasOwnProperty('images')) {
      console.log('Removing deprecated top-level images field from saved data');
      delete updated.images;
    }

    // Set created if missing and update lastModified
    try {
      const now = new Date().toISOString();
      if (!existing || !existing.created) {
        updated.created = now;
      } else if (existing.created) {
        updated.created = existing.created;
      }
      updated.lastModified = now;
    } catch (e) {
      // ignore timestamp errors
    }

    // Write atomically: write to a temp file then rename it into place to avoid
    // readers seeing a truncated/partial file during concurrent writes.
    // Protect against accidental writes to raw model files
    const safeTargetPath = protectModelFileWrite(absoluteFilePath);
    const tmpPath = safeTargetPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(updated, null, 2), 'utf8');
    fs.renameSync(tmpPath, safeTargetPath);
    console.log('Model updated and saved to:', safeTargetPath);
    // Ensure newly saved munchie is post-processed to have canonical userDefined
    try {
      await postProcessMunchieFile(safeTargetPath);
    } catch (e) {
      console.warn('postProcessMunchieFile failed after save for', safeTargetPath, e);
    }
    // Read back the saved file and return it as the authoritative refreshed model
    let refreshedModel = undefined;
    try {
      const rawAfter = fs.readFileSync(safeTargetPath, 'utf8');
      refreshedModel = rawAfter ? JSON.parse(rawAfter) : undefined;
    } catch (e) {
      console.warn('Failed to read back refreshed model after save:', e);
      refreshedModel = undefined;
    }

    // Return cleaned/rejected related_files and refreshedModel for client feedback
    res.json({ success: true, cleaned_related_files: cleanChanges.related_files || [], rejected_related_files: rejectedRelatedFiles, refreshedModel });
  } catch (err) {
    console.error('Error saving model:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API endpoint to get all model data
app.get('/api/models', async (req, res) => {
  try {
    const absolutePath = getAbsoluteModelsPath();
    serverDebug(`API /models scanning directory: ${absolutePath}`);

    let models = [];

    // Function to recursively scan directories
    function scanForModels(directory) {
      serverDebug(`Scanning directory: ${directory}`);
      const entries = fs.readdirSync(directory, { withFileTypes: true });
      serverDebug(`Found ${entries.length} entries in ${directory}`);

      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
          // Recursively scan subdirectories (debug only)
          serverDebug(`Scanning subdirectory: ${fullPath}`);
          scanForModels(fullPath);
        } else if (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json')) {
          // Load and parse each munchie file
          // console.log(`Found munchie file: ${fullPath}`);
          try {
            const fileContent = fs.readFileSync(fullPath, 'utf8');
            const model = JSON.parse(fileContent);
            // Add relative path information for proper URL construction
            const relativePath = path.relative(absolutePath, fullPath);

            // Handle both 3MF and STL file types
            let modelUrl, filePath;
            if (entry.name.endsWith('-stl-munchie.json')) {
              // STL file - check if corresponding .stl file exists
              // Only process files with proper naming format: [name]-stl-munchie.json
              const fileName = entry.name;

              // Skip files with malformed names (e.g., containing duplicate suffixes)
              if (fileName.includes('-stl-munchie.json_')) {
                serverDebug(`Skipping malformed STL JSON file: ${fullPath}`);
              } else {
                const baseFilePath = relativePath.replace('-stl-munchie.json', '');
                // Try both .stl and .STL extensions
                let stlFilePath = baseFilePath + '.stl';
                let absoluteStlPath = path.join(absolutePath, stlFilePath);

                if (!fs.existsSync(absoluteStlPath)) {
                  // Try uppercase extension
                  stlFilePath = baseFilePath + '.STL';
                  absoluteStlPath = path.join(absolutePath, stlFilePath);
                }

                if (fs.existsSync(absoluteStlPath)) {
                  modelUrl = '/models/' + stlFilePath.replace(/\\/g, '/');
                  filePath = stlFilePath;

                  model.modelUrl = modelUrl;
                  model.filePath = filePath;

                  // console.log(`Added STL model: ${model.name} with URL: ${model.modelUrl} and filePath: ${model.filePath}`);
                  models.push(model);
                } else {
                  serverDebug(`Skipping ${fullPath} - corresponding .stl/.STL file not found`);
                }
              }
            } else {
              // 3MF file - check if corresponding .3mf file exists
              // Only process files with proper naming format: [name]-munchie.json
              const fileName = entry.name;

              // Skip files with malformed names
              if (fileName.includes('-munchie.json_')) {
                serverDebug(`Skipping malformed 3MF JSON file: ${fullPath}`);
              } else {
                const threeMfFilePath = relativePath.replace('-munchie.json', '.3mf');
                const absoluteThreeMfPath = path.join(absolutePath, threeMfFilePath);

                if (fs.existsSync(absoluteThreeMfPath)) {
                  modelUrl = '/models/' + threeMfFilePath.replace(/\\/g, '/');
                  filePath = threeMfFilePath;

                  model.modelUrl = modelUrl;
                  model.filePath = filePath;

                  // console.log(`Added 3MF model: ${model.name} with URL: ${model.modelUrl} and filePath: ${model.filePath}`);
                  models.push(model);
                } else {
                  serverDebug(`Skipping ${fullPath} - corresponding .3mf file not found at ${absoluteThreeMfPath}`);
                }
              }
            }
          } catch (error) {
            console.error(`Error reading model file ${fullPath}:`, error);
          }
        }
      }
    }

    // Start the recursive scan
    scanForModels(absolutePath);

    // Summary: concise result for normal logs (debug contains per-directory details)
    console.log(`API /models scan complete: found ${models.length} model(s)`);

    res.json(models);
  } catch (error) {
    console.error('Error loading models:', error);
    res.status(500).json({ success: false, message: 'Failed to load models', error: error.message });
  }
});

// API endpoint to trigger model directory scan and JSON generation
app.post('/api/scan-models', async (req, res) => {
  try {
    const { fileType = "3mf", stream = false } = req.body; // "3mf" or "stl" only
    const dir = getModelsDirectory();
    const result = await scanDirectory(dir, fileType);

    // After scanning, also run legacy image migration on munchie files so that
    // generated files do not contain top-level `thumbnail` or `images` fields.
    const modelsDir = getAbsoluteModelsPath();
    const migrated = [];
    const skipped = [];
    const errors = [];

    // Helper to perform migration for a single file (returns true if changed)
    function migrateFile(full) {
      try {
        const raw = fs.readFileSync(full, 'utf8');
        if (!raw || raw.trim().length === 0) { skipped.push({ file: full, reason: 'empty' }); return false; }
        let data = JSON.parse(raw);
        let changed = false;

        // Legacy top-level images -> parsedImages
        if (Array.isArray(data.images) && (!Array.isArray(data.parsedImages) || data.parsedImages.length === 0)) {
          data.parsedImages = data.images.slice();
          try { delete data.images; } catch (e) { }
          changed = true;
        }

        // Legacy top-level thumbnail handling
        if (data.thumbnail && typeof data.thumbnail === 'string') {
          if (data.thumbnail.startsWith('data:')) {
            if (!Array.isArray(data.parsedImages)) data.parsedImages = [];
            const existingIdx = data.parsedImages.findIndex(p => p === data.thumbnail || (p && p.data === data.thumbnail));
            if (existingIdx !== -1) data.parsedImages.splice(existingIdx, 1);
            data.parsedImages.unshift(data.thumbnail);
            try { delete data.thumbnail; } catch (e) { }
            changed = true;
          } else if (!data.userDefined) {
            if (/^parsed:\d+|^user:\d+/.test(data.thumbnail)) {
              data.userDefined = { thumbnail: data.thumbnail };
            } else if (Array.isArray(data.parsedImages) && data.parsedImages.indexOf(data.thumbnail) !== -1) {
              const idx = data.parsedImages.indexOf(data.thumbnail);
              data.userDefined = { thumbnail: `parsed:${idx}` };
            } else {
              data.userDefined = { thumbnail: data.thumbnail };
            }
            try { delete data.thumbnail; } catch (e) { }
            changed = true;
          } else {
            try { delete data.thumbnail; } catch (e) { }
            changed = true;
          }
        }

        // Ensure userDefined.images exists
        if (data.userDefined && typeof data.userDefined === 'object') {
          if (!Array.isArray(data.userDefined.images)) data.userDefined.images = [];
        }

        // Reuse existing postProcess logic to ensure userDefined.thumbnail and imageOrder
        const parsedImages = Array.isArray(data.parsedImages) ? data.parsedImages : (Array.isArray(data.images) ? data.images : []);
        let udExists = data.userDefined && typeof data.userDefined === 'object';
        // Normalize legacy userDefined shapes
        if (Array.isArray(data.userDefined)) {
          data.userDefined = data.userDefined.length > 0 && typeof data.userDefined[0] === 'object' ? { ...(data.userDefined[0]) } : {};
          udExists = true;
          changed = true;
        } else if (udExists && Object.prototype.hasOwnProperty.call(data.userDefined, '0')) {
          const zero = data.userDefined['0'] && typeof data.userDefined['0'] === 'object' ? { ...(data.userDefined['0']) } : {};
          const imgs = Array.isArray(data.userDefined.images) ? data.userDefined.images : undefined;
          const thumb = typeof data.userDefined.thumbnail !== 'undefined' ? data.userDefined.thumbnail : undefined;
          const order = Array.isArray(data.userDefined.imageOrder) ? data.userDefined.imageOrder : undefined;
          const normalized = { ...zero };
          if (typeof imgs !== 'undefined') normalized.images = imgs;
          if (typeof thumb !== 'undefined') normalized.thumbnail = thumb;
          if (typeof order !== 'undefined') normalized.imageOrder = order;
          data.userDefined = normalized;
          udExists = true;
          changed = true;
        }

        if (parsedImages && parsedImages.length > 0) {
          if (!udExists) {
            data.userDefined = {};
            udExists = true;
            changed = true;
          }
          if (!data.userDefined.thumbnail) {
            data.userDefined.thumbnail = 'parsed:0';
            changed = true;
          }
          if (!Array.isArray(data.userDefined.imageOrder) || data.userDefined.imageOrder.length === 0) {
            const order = [];
            for (let i = 0; i < parsedImages.length; i++) order.push(`parsed:${i}`);
            const userImgs = Array.isArray(data.userDefined.images) ? data.userDefined.images : [];
            for (let i = 0; i < userImgs.length; i++) order.push(`user:${i}`);
            data.userDefined.imageOrder = order;
            changed = true;
          }
        }

        // Remove any lingering legacy top-level fields
        if (Object.prototype.hasOwnProperty.call(data, 'images')) {
          try { delete data.images; changed = true; } catch (e) { }
        }
        if (Object.prototype.hasOwnProperty.call(data, 'thumbnail')) {
          try { delete data.thumbnail; changed = true; } catch (e) { }
        }

        if (changed) {
          const tmp = full + '.tmp';
          fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
          fs.renameSync(tmp, full);
          migrated.push(full);
          return true;
        } else {
          skipped.push(full);
          return false;
        }
      } catch (e) {
        errors.push({ file: full, error: e.message || String(e) });
        return false;
      }
    }

    // Walk the models directory and migrate munchie files
    function scanAndMigrate(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanAndMigrate(full);
        } else if (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json')) {
          const changed = migrateFile(full);
          // If client requested streaming, send a progress line
          if (stream) {
            try {
              res.write(JSON.stringify({ type: 'migrate-file', file: path.relative(modelsDir, full).replace(/\\/g, '/'), changed: !!changed }) + '\n');
            } catch (e) { /* ignore write errors */ }
          }
        }
      }
    }

    if (stream) {
      // Stream NDJSON progress lines to the client
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      // Start with an initial line containing scan result
      res.write(JSON.stringify({ type: 'scan-complete', processed: result.processed, skipped: result.skipped }) + '\n');
      try {
        scanAndMigrate(modelsDir);
      } catch (e) {
        console.warn('Migration during scan failed:', e);
        res.write(JSON.stringify({ type: 'error', error: String(e) }) + '\n');
      }
      // Final summary
      res.write(JSON.stringify({ type: 'done', success: true, processed: result.processed, skipped: result.skipped, skippedFiles: skipped.length, errors }) + '\n');
      return res.end();
    } else {
      // Non-streaming: run migration and respond with final JSON
      try {
        scanAndMigrate(modelsDir);
      } catch (e) {
        console.warn('Migration during scan failed:', e);
      }
      // Post-process any remaining munchie files (defensive)
      try {
        function findAndPostProcess(directory) {
          const entries = fs.readdirSync(directory, { withFileTypes: true });
          for (const entry of entries) {
            const full = path.join(directory, entry.name);
            if (entry.isDirectory()) {
              findAndPostProcess(full);
            } else if (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json')) {
              try { postProcessMunchieFile(full); } catch (e) { /* ignore */ }
            }
          }
        }
        findAndPostProcess(modelsDir);
      } catch (e) {
        console.warn('Post-processing after migration failed:', e);
      }

      // Detect orphan munchie.json files (munchie exists but corresponding .3mf/.stl missing)
      const orphanMunchies = [];
      try {
        function findOrphans(directory) {
          const entries = fs.readdirSync(directory, { withFileTypes: true });
          for (const entry of entries) {
            const full = path.join(directory, entry.name);
            if (entry.isDirectory()) {
              findOrphans(full);
            } else if (entry.isFile() && (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json'))) {
              // compute expected model filename
              const base = entry.name.replace(/-munchie\.json$/i, '').replace(/-stl-munchie\.json$/i, '');
              const threeMfCandidate = path.join(path.dirname(full), base + '.3mf');
              const stlCandidate = path.join(path.dirname(full), base + '.stl');
              if (!fs.existsSync(threeMfCandidate) && !fs.existsSync(stlCandidate)) {
                orphanMunchies.push(path.relative(modelsDir, full).replace(/\\/g, '/'));
              }
            }
          }
        }
        findOrphans(modelsDir);
      } catch (e) {
        console.warn('Orphan munchie detection failed:', e);
      }

      res.json({ success: true, message: 'Model JSON files generated and updated successfully.', processed: result.processed, skipped: result.skipped, skippedFiles: skipped.length, errors, orphanMunchies });
    }
  } catch (error) {
    console.error('Model JSON generation error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate model JSON files.', error: error.message });
  }
});

// NOTE: Migration of legacy images is now performed as part of /api/scan-models
// The old /api/migrate-legacy-images endpoint has been removed.

// API endpoint to save app configuration to data/config.json
app.post('/api/save-config', (req, res) => {
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
    let configPath = (function() {
      try {
        const vitestWorkerId = process.env.VITEST_WORKER_ID;
        if (vitestWorkerId) return path.join(dataDir, `config.vitest-${vitestWorkerId}.json`);
        const jestWorkerId = process.env.JEST_WORKER_ID;
        if (jestWorkerId) return path.join(dataDir, `config.jest-${jestWorkerId}.json`);
      } catch {}
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
app.get('/api/load-config', (req, res) => {
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
    } catch {}
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

// API endpoint to regenerate munchie files for specific models
app.post('/api/regenerate-munchie-files', async (req, res) => {
  try {
    const { modelIds, filePaths } = req.body || {};
    if ((!Array.isArray(modelIds) || modelIds.length === 0) && (!Array.isArray(filePaths) || filePaths.length === 0)) {
      return res.status(400).json({ success: false, error: 'No model IDs or file paths provided' });
    }

    const modelsDir = getAbsoluteModelsPath();
    const { parse3MF, parseSTL, computeMD5 } = require('./dist-backend/utils/threeMFToJson');
    let processed = 0;
    let errors = [];

    // Build a list of existing munchie files (with filePath and jsonPath)
    let allModels = [];
    function scanForModels(directory) {
      const entries = fs.readdirSync(directory, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          scanForModels(fullPath);
        } else if (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json')) {
          try {
            const fileContent = fs.readFileSync(fullPath, 'utf8');
            const model = JSON.parse(fileContent);
            const relativePath = path.relative(modelsDir, fullPath);
            if (entry.name.endsWith('-stl-munchie.json')) {
              model.filePath = relativePath.replace('-stl-munchie.json', '.stl');
            } else {
              model.filePath = relativePath.replace('-munchie.json', '.3mf');
            }
            model.jsonPath = fullPath;
            allModels.push(model);
          } catch (e) {
            console.warn('Skipping invalid munchie file during regenerate scan:', fullPath, e);
          }
        }
      }
    }

    scanForModels(modelsDir);

    // Helper to regenerate from an absolute model file path and target jsonPath
    async function regenerateFromPaths(modelFilePath, jsonPath, idForModel) {
      try {
        if (!fs.existsSync(modelFilePath)) {
          return { error: 'Model file not found' };
        }

        // Backup user-managed fields from existing JSON if present
        let currentData = {};
        if (jsonPath && fs.existsSync(jsonPath)) {
          try { currentData = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch (e) { /* ignore */ }
        }
        const userDataBackup = {
          tags: currentData.tags || [],
          isPrinted: currentData.isPrinted || false,
          printTime: currentData.printTime || "",
          filamentUsed: currentData.filamentUsed || "",
          category: currentData.category || "",
          notes: currentData.notes || "",
          license: currentData.license || "",
          hidden: currentData.hidden || false,
          source: currentData.source || "",
          price: currentData.price || 0,
          related_files: Array.isArray(currentData.related_files) ? currentData.related_files : [],
          userDefined: currentData.userDefined && typeof currentData.userDefined === 'object' ? currentData.userDefined : {}
        };

        const buffer = fs.readFileSync(modelFilePath);
        const hash = computeMD5(buffer);
        let newMetadata;
        if (modelFilePath.toLowerCase().endsWith('.3mf')) {
          newMetadata = await parse3MF(modelFilePath, idForModel, hash);
        } else if (modelFilePath.toLowerCase().endsWith('.stl')) {
          newMetadata = await parseSTL(modelFilePath, idForModel, hash);
        } else {
          return { error: 'Unsupported file type' };
        }

        // Preserve STL printSettings (user-managed) but let 3MF refresh them from parsed metadata
        let mergedMetadata = { ...newMetadata, ...userDataBackup, id: idForModel, hash };
        try {
          const lower = String(modelFilePath).toLowerCase();
          if (lower.endsWith('.stl')) {
            // If existing STL had printSettings, prefer those; otherwise keep newMetadata defaults
            const cd = currentData && currentData.printSettings && typeof currentData.printSettings === 'object' ? currentData.printSettings : undefined;
            const nd = newMetadata && newMetadata.printSettings && typeof newMetadata.printSettings === 'object' ? newMetadata.printSettings : {};
            const prefer = (a, b) => {
              const sa = typeof a === 'string' ? a : '';
              const sb = typeof b === 'string' ? b : '';
              return sa.trim() !== '' ? sa : (sb.trim() !== '' ? sb : '');
            };
            mergedMetadata.printSettings = {
              layerHeight: prefer(cd && cd.layerHeight, nd.layerHeight),
              infill: prefer(cd && cd.infill, nd.infill),
              nozzle: prefer(cd && cd.nozzle, nd.nozzle),
              printer: (() => {
                const cp = cd && cd.printer;
                const np = nd && nd.printer;
                return typeof cp === 'string' && cp.trim() !== ''
                  ? cp
                  : (typeof np === 'string' && np.trim() !== '' ? np : undefined);
              })()
            };
          } else if (lower.endsWith('.3mf')) {
            // For 3MF, ensure printSettings come from parsed data, ignoring any previous user-edits
            // Nothing to do; mergedMetadata already pulls from newMetadata which is parsed.
          }
        } catch (e) {
          // ignore preservation error
        }
        // Ensure created/lastModified timestamps for regenerated file
        try {
          const now = new Date().toISOString();
          if (!mergedMetadata.created) mergedMetadata.created = now;
          mergedMetadata.lastModified = now;
        } catch (e) {
          // ignore
        }

        // Rebuild imageOrder so descriptors point to correct indexes
        try {
          const parsed = Array.isArray(mergedMetadata.parsedImages) ? mergedMetadata.parsedImages : (Array.isArray(mergedMetadata.images) ? mergedMetadata.images : []);
          const userArr = Array.isArray(mergedMetadata.userDefined?.images) ? mergedMetadata.userDefined.images : [];
          const getUserImageData = (entry) => {
            if (!entry) return '';
            if (typeof entry === 'string') return entry;
            if (typeof entry === 'object' && typeof entry.data === 'string') return entry.data;
            return '';
          };

          const rebuiltOrder = [];
          for (let i = 0; i < parsed.length; i++) rebuiltOrder.push(`parsed:${i}`);
          for (let i = 0; i < userArr.length; i++) rebuiltOrder.push(`user:${i}`);

          if (!mergedMetadata.userDefined || typeof mergedMetadata.userDefined !== 'object') mergedMetadata.userDefined = {};
          mergedMetadata.userDefined = { ...(mergedMetadata.userDefined || {}), imageOrder: rebuiltOrder };
        } catch (e) {
          console.warn('Failed to rebuild userDefined.imageOrder during regeneration:', e);
        }

        // Ensure target jsonPath is defined
        if (!jsonPath) {
          return { error: 'No target JSON path provided' };
        }

        // Ensure directory exists for jsonPath
        const dir = path.dirname(jsonPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // Write the regenerated file and post-process
        fs.writeFileSync(jsonPath, JSON.stringify(mergedMetadata, null, 2), 'utf8');
        await postProcessMunchieFile(jsonPath);
        return { success: true };
      } catch (error) {
        return { error: error && error.message ? error.message : String(error) };
      }
    }

    // First, handle any requested modelIds (existing munchie-based regeneration)
    if (Array.isArray(modelIds) && modelIds.length > 0) {
      for (const modelId of modelIds) {
        const model = allModels.find(m => m.id === modelId);
        if (!model) {
          errors.push({ modelId, error: 'Model not found' });
          continue;
        }

        try {
          const modelFilePath = path.join(modelsDir, model.filePath);
          if (!fs.existsSync(modelFilePath)) {
            errors.push({ modelId, error: 'Model file not found' });
            continue;
          }

          const resObj = await regenerateFromPaths(modelFilePath, model.jsonPath, model.id);
          if (resObj && resObj.error) errors.push({ modelId, error: resObj.error }); else processed++;
        } catch (error) {
          console.error(`Error regenerating munchie file for model ${modelId}:`, error);
          errors.push({ modelId, error: error.message });
        }
      }
    }

    // Next, handle any provided filePaths (relative to models dir)
    if (Array.isArray(filePaths) && filePaths.length > 0) {
      for (const rawPath of filePaths) {
        try {
          if (!rawPath || typeof rawPath !== 'string') { errors.push({ filePath: rawPath, error: 'Invalid path' }); continue; }
          let rel = rawPath.replace(/\\/g, '/').replace(/^\//, '');
          if (rel.includes('..')) { errors.push({ filePath: rawPath, error: 'Path traversal not allowed' }); continue; }

          const modelFilePath = path.join(modelsDir, rel);

          if (!fs.existsSync(modelFilePath)) { errors.push({ filePath: rawPath, error: 'Model file not found' }); continue; }

          // Compute expected JSON path
          let jsonRel;
          if (rel.toLowerCase().endsWith('.3mf')) jsonRel = rel.replace(/\.3mf$/i, '-munchie.json');
          else if (rel.toLowerCase().endsWith('.stl')) jsonRel = rel.replace(/\.stl$/i, '-stl-munchie.json');
          else { errors.push({ filePath: rawPath, error: 'Unsupported file type' }); continue; }

          const jsonPath = path.join(modelsDir, jsonRel);
          // Derive a sensible id from filename if none exists
          const derivedId = path.basename(rel).replace(/\.3mf$/i, '').replace(/\.stl$/i, '');

          const resObj = await regenerateFromPaths(modelFilePath, jsonPath, derivedId);
          if (resObj && resObj.error) errors.push({ filePath: rawPath, error: resObj.error }); else processed++;
        } catch (error) {
          errors.push({ filePath: rawPath, error: error && error.message ? error.message : String(error) });
        }
      }
    }

    res.json({ success: errors.length === 0, processed, errors, message: `Regenerated ${processed} munchie files${errors.length > 0 ? ` with ${errors.length} errors` : ''}` });
  } catch (error) {
    console.error('Munchie file regeneration error:', error);
    res.status(500).json({ success: false, message: 'Failed to regenerate munchie files.', error: error.message });
  }
});

// --- API: Generate Thumbnails (The Photo Shoot) ---
app.post('/api/generate-thumbnails', async (req, res) => {
  // 1. Setup AbortController for cancellation
  if (activeThumbnailJob) {
    activeThumbnailJob.abort(); // Auto-cancel previous job if a new one starts
  }
  activeThumbnailJob = new AbortController();
  const signal = activeThumbnailJob.signal;

  try {
    const { modelIds, force = false } = req.body;
    const modelsDir = getAbsoluteModelsPath();

    // We need the server's own URL so Puppeteer can visit it
    const baseUrl = `http://127.0.0.1:${PORT}`;

    const config = ConfigManager.loadConfig();
    // Robust check: try accessing it via .settings, or directly, or fallback
    const globalDefaultColor = config?.settings?.defaultModelColor || config?.defaultModelColor || '#6366f1';

    let processed = 0;
    let errors = [];
    let skipped = 0;
    let targets = [];

    function findTargets(dir) {
      if (signal.aborted) return; // Stop recursion if cancelled

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          findTargets(fullPath);
        } else if (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json')) {
          try {
            const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            // Filter by IDs if provided
            if (modelIds && modelIds.length > 0 && !modelIds.includes(data.id)) continue;

            // Determine Source File (.3mf or .stl)
            let sourceFile;
            if (entry.name.endsWith('-stl-munchie.json')) {
              sourceFile = fullPath.replace('-stl-munchie.json', '.stl');
              if (!fs.existsSync(sourceFile)) sourceFile = fullPath.replace('-stl-munchie.json', '.STL');
            } else {
              sourceFile = fullPath.replace('-munchie.json', '.3mf');
            }

            if (fs.existsSync(sourceFile)) {
              targets.push({ jsonPath: fullPath, sourcePath: sourceFile, data });
            }
          } catch (e) { }
        }
      }
    }
    findTargets(modelsDir);

    console.log(`📸 Starting photo shoot for ${targets.length} models...`);

    const MAX_CONSECUTIVE_ERRORS = 5;
    let consecutiveErrors = 0;

    for (const target of targets) {
      // 2. CHECK FOR CANCELLATION INSIDE LOOP
      if (signal.aborted) {
        console.log('🛑 Job aborted by user.');
        break;
      }

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.warn(`🚨 Aborting thumbnail generation: ${MAX_CONSECUTIVE_ERRORS} consecutive errors detected.`);
        break;
      }
      try {
        const thumbName = path.basename(target.sourcePath) + '-thumb.png';
        const thumbPath = path.join(path.dirname(target.sourcePath), thumbName);
        const relativeThumbUrl = '/models/' + path.relative(modelsDir, thumbPath).replace(/\\/g, '/');

        // Skip if exists and not forced
        if (fs.existsSync(thumbPath) && !force) {
          skipped++;
          continue;
        }

        const modelColor = target.data.userDefined?.color || target.data.color || globalDefaultColor;

        // 3. PASS THE SIGNAL TO THE GENERATOR
        await generateThumbnail(target.sourcePath, thumbPath, baseUrl, modelColor, modelsDir, signal);

        // Update JSON to point to new image
        let json = target.data;
        let changed = false;

        if (!json.images) json.images = [];

        // Add if not present
        if (!json.images.includes(relativeThumbUrl)) {
          json.images.unshift(relativeThumbUrl); // Make it first!
          changed = true;
        }

        if (changed) {
          fs.writeFileSync(target.jsonPath, JSON.stringify(json, null, 2));
        }

        processed++;
        consecutiveErrors = 0;
      } catch (err) {
        // Don't count manual cancellation as an error
        if (err.message && err.message.includes('cancelled')) {
          break;
        }
        console.error("Thumbnail error:", err);
        errors.push({ id: target.data.id, error: err.message });
        consecutiveErrors++;
      }
    }

    activeThumbnailJob = null;

    res.json({
      success: true,
      processed,
      skipped,
      errors,
      aborted: signal.aborted || consecutiveErrors >= MAX_CONSECUTIVE_ERRORS
    });

  } catch (error) {
    activeThumbnailJob = null;
    console.error('General generation error:', error);
    if (error.message && error.message.includes('cancelled')) {
      return res.json({ success: false, aborted: true, message: 'Cancelled by user' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Spoolman Integration Proxy ---

// Helper to get Spoolman URL from config
function getSpoolmanUrl() {
  const config = ConfigManager.loadConfig();
  // Allow env var override for Docker power users
  let url = process.env.SPOOLMAN_URL || config.integrations?.spoolman?.url || '';
  // Remove trailing slash for consistency
  return url.replace(/\/$/, '');
}

// 1. Health Check (Verify Connection)
app.get('/api/spoolman/status', async (req, res) => {
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
app.get('/api/spoolman/spools', async (req, res) => {
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
app.post('/api/spoolman/config', (req, res) => {
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
    res.status(500).json({ success: false, error: 'Failed to save config' });
  }
});

// --- API: Import from Thingiverse ---
app.post('/api/import/thingiverse', async (req, res) => {
  try {
    const { thingId, targetFolder = 'imported', collectionId, category } = req.body;

    if (!thingId) return res.status(400).json({ success: false, error: 'No Thing ID provided' });
    const config = ConfigManager.loadConfig();
    const token = config.integrations?.thingiverse?.token || process.env.THINGIVERSE_TOKEN;
    if (!token) return res.status(500).json({ success: false, error: 'Server missing THINGIVERSE_TOKEN' });

    // Import Utility - Dynamic require allows server to start even if backend isn't built yet
    let ThingiverseImporter;
    try {
      const module = require('./dist-backend/utils/thingiverseImporter');
      ThingiverseImporter = module.ThingiverseImporter;
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Backend not rebuilt. Run "npm run build:backend"' });
    }

    // 1. Perform Import
    const importer = new ThingiverseImporter(token);
    const modelData = await importer.importThing(thingId, getAbsoluteModelsPath(), targetFolder);

    // 2. Apply User Category (if selected)
    if (category && category !== 'Uncategorized') {
      modelData.category = category;
      const modelsRoot = getAbsoluteModelsPath();
      // Construct full path to the json file we just wrote
      const jsonPath = modelData.filePath.endsWith('.json')
        ? modelData.filePath
        : modelData.filePath.replace(/\.(3mf|stl)$/i, modelData.filePath.toLowerCase().endsWith('.stl') ? '-stl-munchie.json' : '-munchie.json');

      const fullJsonPath = path.join(modelsRoot, jsonPath);
      fs.writeFileSync(fullJsonPath, JSON.stringify(modelData, null, 2));
    }

    // 3. Add to Collection (if selected)
    if (collectionId) {
      const cols = loadCollections();
      const colIndex = cols.findIndex(c => c.id === collectionId);
      if (colIndex !== -1) {
        const col = cols[colIndex];
        if (!col.modelIds.includes(modelData.id)) {
          col.modelIds.push(modelData.id);
          if (!col.coverModelId) col.coverModelId = modelData.id;
          saveCollections(cols);
        }
      }
    }

    res.json({ success: true, model: modelData });
  } catch (e) {
    console.error('Thingiverse Import Error:', e);
    res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

// --- API: Verify Thingiverse Token ---
app.post('/api/thingiverse/verify', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, error: 'Token required' });
  try {
    const fetch = (await import('node-fetch')).default;
    const resp = await fetch('https://api.thingiverse.com/users/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (resp.ok) {
      const data = await resp.json();
      return res.json({ success: true, username: data.name || 'Unknown User' });
    }
    return res.status(resp.status).json({ success: false, error: `Verification failed (${resp.status})` });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// API endpoint to upload .3mf / .stl files and generate their munchie.json files
app.post('/api/upload-models', upload.array('files'), async (req, res) => {
  try {
    const files = req.files || [];
    if (!Array.isArray(files) || files.length === 0) return res.status(400).json({ success: false, error: 'No files uploaded' });

    const modelsDir = getAbsoluteModelsPath();
    const uploadsDir = path.join(modelsDir, 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const createCollection = req.body.createCollection === 'true';
    const collectionDescription = req.body.collectionDescription || '';
    const collectionTags = req.body.collectionTags ? JSON.parse(req.body.collectionTags) : [];

    const { parse3MF, parseSTL, computeMD5 } = require('./dist-backend/utils/threeMFToJson');

    const saved = [];
    const processed = [];
    const errors = [];
    const affectedFolders = new Map();

    // Parse optional destinations JSON (array aligned with files order)
    let destinations = null;
    try {
      if (req.body && req.body.destinations) {
        destinations = JSON.parse(req.body.destinations);
        if (!Array.isArray(destinations)) destinations = null;
      }
    } catch (e) {
      destinations = null;
    }

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const f = files[fileIndex];
      try {
        // multer memoryStorage provides buffer
        const buffer = f.buffer;
        const original = (f.originalname || 'upload').replace(/\\/g, '/');
        // sanitize filename
        let base = path.basename(original).replace(/[^a-zA-Z0-9_.\- ]/g, '_');

        // Check for G-code archives FIRST before general .3mf check (order matters!)
        const lowerBase = base.toLowerCase();
        if (lowerBase.endsWith('.gcode.3mf') || lowerBase.endsWith('.3mf.gcode')) {
          errors.push({ file: original, error: 'G-code archives (.gcode.3mf) should be uploaded via the G-code analysis dialog, not the model upload dialog' });
          continue;
        }

        // Now check for valid extensions
        if (!/\.3mf$/i.test(base) && !/\.stl$/i.test(base)) {
          errors.push({ file: original, error: 'Unsupported file extension' });
          continue;
        }
        // Determine destination folder (if provided) relative to models dir
        let destFolder = 'uploads';
        if (destinations && Array.isArray(destinations) && typeof destinations[fileIndex] === 'string' && destinations[fileIndex].trim() !== '') {
          // normalize and prevent traversal
          let candidate = destinations[fileIndex].replace(/\\/g, '/').replace(/^\/*/, '');
          if (candidate.includes('..')) candidate = 'uploads';
          destFolder = candidate || 'uploads';
        }

        const destDir = path.join(modelsDir, destFolder);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

        if (!affectedFolders.has(destDir)) {
          affectedFolders.set(destDir, []);
        }

        let targetPath = path.join(destDir, base);
        // avoid collisions by appending timestamp when necessary
        if (fs.existsSync(targetPath)) {
          const name = base.replace(/(\.[^.]+)$/, '');
          const ext = path.extname(base);
          const ts = Date.now();
          base = `${name}-${ts}${ext}`;
          targetPath = path.join(destDir, base);
        }

        // Write uploaded file atomically: write to tmp then rename. Protect
        // against a race where another process creates the same filename
        // between our exists-check and the rename. If the target exists at
        // rename-time, pick a new unique name and rename there instead.
        const tmpUploadPath = targetPath + '.tmp';
        fs.writeFileSync(tmpUploadPath, buffer);

        // If targetPath was created between our earlier exists check and now,
        // avoid overwriting: choose a new name with a timestamp/random suffix.
        if (fs.existsSync(targetPath)) {
          const name = base.replace(/(\.[^.]+)$/, '');
          const ext = path.extname(base);
          const ts = Date.now();
          const rnd = Math.floor(Math.random() * 10000);
          base = `${name}-${ts}-${rnd}${ext}`;
          targetPath = path.join(destDir, base);
        }
        fs.renameSync(tmpUploadPath, targetPath);
        saved.push(path.relative(modelsDir, targetPath).replace(/\\/g, '/'));

        // Now generate munchie.json for the saved file (reuse regeneration logic)
        try {
          const modelFilePath = targetPath;
          const rel = path.relative(modelsDir, modelFilePath).replace(/\\/g, '/');
          let jsonRel;
          if (rel.toLowerCase().endsWith('.3mf')) jsonRel = rel.replace(/\.3mf$/i, '-munchie.json');
          else if (rel.toLowerCase().endsWith('.stl')) jsonRel = rel.replace(/\.stl$/i, '-stl-munchie.json');
          else {
            errors.push({ file: rel, error: 'Unsupported file type for processing' });
            continue;
          }

          const jsonPath = path.join(modelsDir, jsonRel);
          const derivedId = path.basename(rel).replace(/\.3mf$/i, '').replace(/\.stl$/i, '');

          affectedFolders.get(destDir).push(derivedId);

          const fileBuf = fs.readFileSync(modelFilePath);
          const hash = computeMD5(fileBuf);
          let newMetadata;
          if (modelFilePath.toLowerCase().endsWith('.3mf')) {
            newMetadata = await parse3MF(modelFilePath, derivedId, hash);
          } else {
            newMetadata = await parseSTL(modelFilePath, derivedId, hash);
          }

          const mergedMetadata = { ...newMetadata, id: derivedId, hash };
          // Ensure created/lastModified timestamps for newly uploaded file
          try {
            const now = new Date().toISOString();
            if (!mergedMetadata.created) mergedMetadata.created = now;
            mergedMetadata.lastModified = now;
          } catch (e) { /* ignore */ }

          // Rebuild imageOrder similar to regeneration logic
          try {
            const parsed = Array.isArray(mergedMetadata.parsedImages) ? mergedMetadata.parsedImages : (Array.isArray(mergedMetadata.images) ? mergedMetadata.images : []);
            const userArr = Array.isArray(mergedMetadata.userDefined?.images) ? mergedMetadata.userDefined.images : [];
            const rebuiltOrder = [];
            for (let i = 0; i < parsed.length; i++) rebuiltOrder.push(`parsed:${i}`);
            for (let i = 0; i < userArr.length; i++) rebuiltOrder.push(`user:${i}`);
            if (!mergedMetadata.userDefined || typeof mergedMetadata.userDefined !== 'object') mergedMetadata.userDefined = {};
            mergedMetadata.userDefined = { ...(mergedMetadata.userDefined || {}), imageOrder: rebuiltOrder };
          } catch (e) {
            console.warn('Failed to rebuild userDefined.imageOrder during upload processing:', e);
          }

          // Ensure directory exists for jsonPath
          const jdir = path.dirname(jsonPath);
          if (!fs.existsSync(jdir)) fs.mkdirSync(jdir, { recursive: true });
          fs.writeFileSync(jsonPath, JSON.stringify(mergedMetadata, null, 2), 'utf8');
          try {

            const thumbName = path.basename(modelFilePath) + '-thumb.png';
            const thumbPath = path.join(path.dirname(modelFilePath), thumbName);

            const BASE_URL = process.env.HOST_URL || `http://localhost:${PORT}`;
            console.log(`📸 Auto-generating thumbnail for: ${derivedId}`);

            // Await generation so the thumbnail exists when the UI refreshes
            await generateThumbnail(modelFilePath, thumbPath, BASE_URL, undefined, modelsDir);
            // Update JSON to include the new thumbnail image
            const relativeThumbUrl = '/models/' + path.relative(modelsDir, thumbPath).replace(/\\/g, '/');
            const freshJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

            if (!freshJson.images) freshJson.images = [];
            // Add to the START of the images list so it becomes the default
            freshJson.images.unshift(relativeThumbUrl);

            fs.writeFileSync(jsonPath, JSON.stringify(freshJson, null, 2), 'utf8');
          } catch (genErr) {
            // Don't fail the upload if just the image generation fails
            console.error("Auto-thumbnail failed:", genErr);
          }
          // -------------------------------

          await postProcessMunchieFile(jsonPath);
          processed.push(jsonRel);
        } catch (e) {
          errors.push({ file: base, error: e && e.message ? e.message : String(e) });
        }
      } catch (e) {
        errors.push({ file: f.originalname || 'unknown', error: e && e.message ? e.message : String(e) });
      }
    }

    if (affectedFolders.size > 0) {
      const currentCols = loadCollections();
      let colsUpdated = false;

      // Iterate the Map: folderPath -> array of newModelIds
      for (const [folderPath, newModelIds] of affectedFolders.entries()) {
        const rel = path.relative(modelsDir, folderPath);
        if (!rel || rel === '' || rel === '.') continue;

        // Generate standard ID
        const normalized = rel.replace(/\\/g, '/');
        const colId = `col_${Buffer.from(normalized).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;

        const existingIdx = currentCols.findIndex(c => c.id === colId);
        const folderName = path.basename(folderPath);

        if (createCollection || existingIdx === -1) {
          // CASE 1: Create New or Overwrite Collection (Group Upload)
          const newCol = existingIdx !== -1 ? currentCols[existingIdx] : {
            id: colId,
            name: folderName,
            modelIds: [],
            created: new Date().toISOString(),
            category: 'Auto-Imported'
          };

          // [CRITICAL FIX] Add the new IDs immediately
          const existingIds = new Set(newCol.modelIds || []);
          newModelIds.forEach(id => existingIds.add(id));
          newCol.modelIds = Array.from(existingIds);

          // Add Description/Tags if requested
          if (createCollection && collectionDescription) {
            newCol.description = collectionDescription;
          }
          if (collectionTags.length > 0) {
            newCol.tags = Array.from(new Set([...(newCol.tags || []), ...collectionTags]));
          }

          newCol.lastModified = new Date().toISOString();

          if (existingIdx !== -1) currentCols[existingIdx] = newCol;
          else currentCols.push(newCol);

          colsUpdated = true;
        } else {
          // CASE 2: Uploading to existing collection (Standard Upload)
          // We must manually append the IDs here too, or they won't appear until a full re-scan
          const existingCol = currentCols[existingIdx];
          const existingIds = new Set(existingCol.modelIds || []);

          let changed = false;
          newModelIds.forEach(id => {
            if (!existingIds.has(id)) {
              existingIds.add(id);
              changed = true;
            }
          });

          if (changed) {
            existingCol.modelIds = Array.from(existingIds);
            existingCol.lastModified = new Date().toISOString();
            colsUpdated = true;
          }
        }
      }

      if (colsUpdated) {
        saveCollections(currentCols);
      }
    }

    // This ensures modelIds are populated before the frontend refreshes
    await collectionQueue.add((cols) => {
      return collectionScanner.scanDirectory(getAbsoluteModelsPath(), getAbsoluteModelsPath(), { strategy: 'strict' });
    });

    try { reconcileHiddenFlags(); } catch (e) { console.warn('Post-upload reconcile failed', e); }


    res.json({ success: errors.length === 0, saved, processed, errors });
  } catch (e) {
    console.error('Upload processing error:', e);
    res.status(500).json({ success: false, error: e && e.message ? e.message : String(e) });
  }
});

// API endpoint to parse G-code files and extract metadata
app.post('/api/parse-gcode', upload.single('file'), async (req, res) => {
  try {
    const { modelFilePath, modelFileUrl, storageMode, overwrite, gcodeFilePath } = req.body;

    if (!modelFilePath || typeof modelFilePath !== 'string') {
      return res.status(400).json({ success: false, error: 'modelFilePath is required' });
    }

    if (!storageMode || !['parse-only', 'save-and-link'].includes(storageMode)) {
      return res.status(400).json({ success: false, error: 'storageMode must be "parse-only" or "save-and-link"' });
    }

    const modelsDir = getAbsoluteModelsPath();
    const { parseGcode, extractGcodeFrom3MF } = require('./dist-backend/utils/gcodeParser');

    let gcodeContent = '';
    let targetGcodePath = null;
    const warnings = [];

    // Case 1: Re-analyzing existing G-code file
    if (gcodeFilePath && typeof gcodeFilePath === 'string') {
      // Path traversal validation: reject paths containing '..'
      if (gcodeFilePath.includes('..')) {
        return res.status(403).json({ success: false, error: 'Access denied: invalid G-code file path' });
      }

      // Reject absolute paths (only relative paths within models directory are allowed)
      if (path.isAbsolute(gcodeFilePath)) {
        return res.status(403).json({ success: false, error: 'Access denied: absolute paths not allowed' });
      }

      // Reject UNC paths (starting with //)
      if (gcodeFilePath.startsWith('//') || gcodeFilePath.startsWith('\\\\')) {
        return res.status(403).json({ success: false, error: 'Access denied: UNC paths not allowed' });
      }

      // Reject Windows drive paths (e.g., C:/ or C:\)
      if (/^[a-zA-Z]:[/\\]/.test(gcodeFilePath)) {
        return res.status(403).json({ success: false, error: 'Access denied: absolute paths not allowed' });
      }

      // Resolve path relative to modelsDir and validate it stays within
      const resolvedModelsDir = path.resolve(modelsDir);
      const absGcodePath = path.resolve(modelsDir, gcodeFilePath);

      if (!absGcodePath.startsWith(resolvedModelsDir + path.sep) && absGcodePath !== resolvedModelsDir) {
        return res.status(403).json({ success: false, error: 'Access denied: path outside models directory' });
      }

      if (!fs.existsSync(absGcodePath)) {
        return res.status(404).json({ success: false, error: 'G-code file not found' });
      }

      gcodeContent = fs.readFileSync(absGcodePath, 'utf8');
      targetGcodePath = gcodeFilePath;
    }
    // Case 2: New file upload
    else if (req.file && req.file.buffer) {
      const buffer = req.file.buffer;
      const originalName = req.file.originalname || 'upload.gcode';

      // Check if it's a .gcode.3mf file (must check this before generic .3mf check)
      if (originalName.toLowerCase().endsWith('.gcode.3mf') || originalName.toLowerCase().endsWith('.3mf.gcode')) {
        try {
          // Extract G-code for parsing, but keep the original buffer for saving
          gcodeContent = extractGcodeFrom3MF(buffer);
        } catch (error) {
          return res.status(400).json({
            success: false,
            error: `Failed to extract G-code from 3MF: ${error.message}`
          });
        }
      } else {
        gcodeContent = buffer.toString('utf8');
      }

      // If save-and-link mode, determine target path and check for existing file
      if (storageMode === 'save-and-link') {
        // Use modelFileUrl (the actual .3mf/.stl path) if provided, otherwise fall back to modelFilePath
        const modelPathForGcode = modelFileUrl || modelFilePath;
        serverDebug('[G-code Save] modelFileUrl:', modelFileUrl);
        serverDebug('[G-code Save] modelFilePath:', modelFilePath);
        serverDebug('[G-code Save] Using path:', modelPathForGcode);

        // Normalize the path: remove leading /models/ or models/ prefix
        let normalizedPath = modelPathForGcode.replace(/^\/models\//, '').replace(/^models\//, '');
        serverDebug('[G-code Save] Normalized path:', normalizedPath);

        // Path traversal validation for modelPathForGcode
        if (normalizedPath.includes('..')) {
          return res.status(403).json({ success: false, error: 'Access denied: invalid model file path' });
        }
        if (/^[a-zA-Z]:[/\\]/.test(normalizedPath) || normalizedPath.startsWith('//') || normalizedPath.startsWith('\\\\')) {
          return res.status(403).json({ success: false, error: 'Access denied: absolute paths not allowed' });
        }

        const resolvedModelsDir = path.resolve(modelsDir);
        const absModelPath = path.resolve(modelsDir, normalizedPath);
        serverDebug('[G-code Save] Absolute model path:', absModelPath);

        // Validate absModelPath stays within modelsDir
        if (!absModelPath.startsWith(resolvedModelsDir + path.sep) && absModelPath !== resolvedModelsDir) {
          return res.status(403).json({ success: false, error: 'Access denied: path outside models directory' });
        }

        const modelDir = path.dirname(absModelPath);
        const modelBasename = path.basename(absModelPath, path.extname(absModelPath));

        // Determine the G-code file extension based on uploaded filename
        // If user uploaded .gcode.3mf, preserve that; otherwise use .gcode
        const uploadedName = originalName.toLowerCase();
        const gcodeExtension = uploadedName.endsWith('.gcode.3mf') || uploadedName.endsWith('.3mf.gcode')
          ? '.gcode.3mf'
          : '.gcode';

        targetGcodePath = path.join(modelDir, `${modelBasename}${gcodeExtension}`);
        serverDebug('[G-code Save] Target G-code path:', targetGcodePath);

        // Check if file exists and overwrite not explicitly approved
        if (fs.existsSync(targetGcodePath) && overwrite !== 'true' && overwrite !== true) {
          serverDebug('[G-code Save] File exists, prompting for overwrite');
          return res.json({
            success: false,
            fileExists: true,
            existingPath: path.relative(modelsDir, targetGcodePath).replace(/\\/g, '/')
          });
        }

        // Save the G-code file
        serverDebug('[G-code Save] Writing file to:', targetGcodePath);

        // Ensure the directory exists
        const targetDir = path.dirname(targetGcodePath);
        if (!fs.existsSync(targetDir)) {
          serverDebug('[G-code Save] Creating directory:', targetDir);
          fs.mkdirSync(targetDir, { recursive: true });
        }

        // Write the file: use original buffer for .gcode.3mf, or gcodeContent for plain .gcode
        // uploadedName already declared above when determining gcodeExtension
        if ((uploadedName.endsWith('.gcode.3mf') || uploadedName.endsWith('.3mf.gcode')) && buffer) {
          // Preserve the original .gcode.3mf archive as binary
          fs.writeFileSync(targetGcodePath, buffer);
          serverDebug('[G-code Save] Saved original .gcode.3mf archive');
        } else {
          // Save plain text G-code
          fs.writeFileSync(targetGcodePath, gcodeContent, 'utf8');
          serverDebug('[G-code Save] Saved plain text G-code');
        }
        serverDebug('[G-code Save] File written successfully');
        targetGcodePath = path.relative(modelsDir, targetGcodePath).replace(/\\/g, '/');
        serverDebug('[G-code Save] Saved successfully, relative path:', targetGcodePath);
      }
    } else {
      return res.status(400).json({ success: false, error: 'No file uploaded or gcodeFilePath provided' });
    }

    // Parse the G-code content
    let gcodeData;
    try {
      const filenameForParser = targetGcodePath || (req.file ? req.file.originalname : 'unknown.gcode');
      gcodeData = parseGcode(gcodeContent, filenameForParser);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: `Failed to parse G-code: ${error.message}`
      });
    }

    // Add gcodeFilePath to the result if we saved it
    if (targetGcodePath) {
      gcodeData.gcodeFilePath = targetGcodePath;
    }

    // 2. [CRITICAL FIX] Automatically update the munchie.json file with these new stats
    // This ensures Layer Height, Infill, etc. are persisted to disk immediately.
    if (storageMode === 'save-and-link' && (modelFilePath || modelFileUrl)) {
      try {
        const pathRef = modelFileUrl || modelFilePath;
        // Normalize path to find the JSON file
        let relativeModelPath = pathRef.replace(/^\/models\//, '').replace(/^models\//, '');
        const absModelPath = path.resolve(modelsDir, relativeModelPath);

        let jsonPath = null;
        if (absModelPath.toLowerCase().endsWith('.stl')) {
          jsonPath = absModelPath.replace(/\.stl$/i, '-stl-munchie.json');
        } else if (absModelPath.toLowerCase().endsWith('.3mf')) {
          jsonPath = absModelPath.replace(/\.3mf$/i, '-munchie.json');
        }

        if (jsonPath && fs.existsSync(jsonPath)) {
          const raw = fs.readFileSync(jsonPath, 'utf8');
          const modelData = JSON.parse(raw);
          let changed = false;

          // A. Update Print Settings (Layer Height, Infill, Nozzle, Printer)
          if (gcodeData.printSettings) {
            modelData.printSettings = {
              ...(modelData.printSettings || {}), // Keep existing user edits
              ...gcodeData.printSettings          // Overwrite with G-code data
            };
            // Ensure defaults to prevent UI "Unknown"
            if (!modelData.printSettings.layerHeight) modelData.printSettings.layerHeight = 'Unknown';
            if (!modelData.printSettings.infill) modelData.printSettings.infill = 'Unknown';
            if (!modelData.printSettings.nozzle) modelData.printSettings.nozzle = 'Unknown';
            changed = true;
          }

          // B. Update Top-Level Stats (Time, Weight)
          if (gcodeData.printTime) {
            modelData.printTime = gcodeData.printTime;
            changed = true;
          }
          if (gcodeData.totalFilamentWeight) {
            modelData.filamentUsed = gcodeData.totalFilamentWeight;
            changed = true;
          }

          // C. Save Detailed G-code Data (for Spoolman Widget)
          modelData.gcodeData = gcodeData;
          changed = true;

          if (changed) {
            fs.writeFileSync(jsonPath, JSON.stringify(modelData, null, 2), 'utf8');
            console.log(`[G-code Parser] Auto-updated metadata for: ${path.basename(jsonPath)}`);
            console.log(`[G-code Parser] Saved Settings:`, JSON.stringify(gcodeData.printSettings));
          }
        }
      } catch (err) {
        console.error("[G-code Parser] Failed to auto-update model JSON:", err);
        // Don't fail the request, just log the error
      }
    }

    res.json({
      success: true,
      gcodeData,
      fileExists: false,
      warnings
    });

  } catch (error) {
    console.error('G-code parsing error:', error);
    res.status(500).json({
      success: false,
      error: error && error.message ? error.message : String(error)
    });
  }
});

// API endpoint to list model folders (for upload destination selection)
app.get('/api/model-folders', (req, res) => {
  try {
    const modelsDir = getAbsoluteModelsPath();
    const folders = [];

    function walk(dir, rel = '') {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subRel = rel ? (rel + '/' + entry.name) : entry.name;
          folders.push(subRel);
          try { walk(path.join(dir, entry.name), subRel); } catch (e) { /* ignore */ }
        }
      }
    }

    // include root 'uploads' by default
    folders.push('uploads');
    if (fs.existsSync(modelsDir)) {
      walk(modelsDir);
    }
    // Deduplicate and sort
    const uniq = Array.from(new Set(folders)).sort();
    res.json({ success: true, folders: uniq });
  } catch (e) {
    console.error('Failed to list model folders:', e);
    res.status(500).json({ success: false, error: e && e.message ? e.message : String(e) });
  }
});

// API endpoint to create a new folder under the models directory
app.post('/api/create-model-folder', express.json(), (req, res) => {
  try {
    const { folder } = req.body || {};
    if (!folder || typeof folder !== 'string' || folder.trim() === '') return res.status(400).json({ success: false, error: 'No folder provided' });
    // sanitize and validate: ensure folder is within modelsDir
    const modelsDir = getAbsoluteModelsPath();
    // Remove leading/trailing whitespace and slashes
    let candidate = folder.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    // Resolve the absolute path of the target folder
    const target = path.resolve(modelsDir, candidate);
    // Ensure the target is within modelsDir
    if (!target.startsWith(modelsDir)) {
      return res.status(400).json({ success: false, error: 'Invalid folder path' });
    }
    if (fs.existsSync(target)) return res.json({ success: true, created: false, path: path.relative(modelsDir, target).replace(/\\/g, '/') });
    fs.mkdirSync(target, { recursive: true });
    res.json({ success: true, created: true, path: path.relative(modelsDir, target).replace(/\\/g, '/') });
  } catch (e) {
    console.error('Failed to create model folder:', e);
    res.status(500).json({ success: false, error: e && e.message ? e.message : String(e) });
  }
});

// --- API: Get all -munchie.json files and their hashes ---
app.get('/api/munchie-files', (req, res) => {
  const modelsDir = getAbsoluteModelsPath();
  try { console.log('[debug] /api/munchie-files scanning modelsDir=', modelsDir); } catch (e) {}
  let result = [];

  function scanDirectory(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDirectory(fullPath);
        } else if (entry.name.toLowerCase().endsWith('-munchie.json')) {
          try {
            const data = fs.readFileSync(fullPath, 'utf8');
            const json = JSON.parse(data);
            // Get path relative to models directory for the URL
            const relativePath = path.relative(modelsDir, fullPath);
            const item = {
              fileName: entry.name,
              hash: json.hash,
              modelUrl: '/models/' + relativePath.replace(/\\/g, '/')
            };
            try { console.log('[debug] /api/munchie-files item', { fileName: item.fileName, hash: item.hash, modelUrl: item.modelUrl }); } catch (e) {}
            result.push(item);
          } catch (e) {
            // skip unreadable or invalid files
            console.error(`Error reading file ${fullPath}:`, e);
          }
        }
      }
    } catch (e) {
      console.error(`Error scanning directory ${dir}:`, e);
    }
  }

  try {
    scanDirectory(modelsDir);
    try { console.log('[debug] /api/munchie-files found', Array.isArray(result) ? result.length : 0, 'items'); } catch (e) {}
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Failed to read models directory' });
  }
});

// --- API: Hash check for all .3mf files and their -munchie.json ---
app.post('/api/hash-check', async (req, res) => {
  try {
    const { fileType = "3mf" } = req.body; // "3mf" or "stl" only
    const modelsDir = getAbsoluteModelsPath();
    try { console.log('[debug] /api/hash-check fileType=', fileType, 'modelsDir=', modelsDir); } catch (e) {}
    const { computeMD5 } = require('./dist-backend/utils/threeMFToJson');
    let result = [];
    let seenHashes = new Set();
    let hashToFiles = {};
    let errors = [];
    let modelMap = {};

    // Recursively scan directories
    // --- ROBUST SYNC SCANNER (Direct Replacement) ---
    function scanDirectory(dir) {
      // 1. Safety: Try to read the directory. If it fails, log and SKIP (don't crash).
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (err) {
        console.warn(`[Scanner] ⚠️ SKIPPING FOLDER (Access Denied): ${dir}`);
        return; 
      }

      console.log(`[Scanner] 📂 Scanning: ${dir} (${entries.length} items)`);

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // 2. Safety: Skip hidden system folders that often crash scanners
        if (entry.name.startsWith('.') || entry.name === 'System Volume Information' || entry.name === '$RECYCLE.BIN') {
            continue; 
        }

        if (entry.isDirectory()) {
          // Recurse deeper
          scanDirectory(fullPath);
        } else {
          const relativePath = path.relative(modelsDir, fullPath);

          // [DEBUG] Log the file we are looking at
          // console.log(`[Scanner] 🔎 Checking file: ${entry.name}`);

          if (fileType === "3mf") {
            const lowerPath = relativePath.toLowerCase();
            // Skip G-code archives
            if ((lowerPath.endsWith('.gcode.3mf') || lowerPath.endsWith('.3mf.gcode'))) {
              console.log(`[Scanner] 🚫 Ignored G-code archive: ${entry.name}`);
              continue;
            }
            if (lowerPath.endsWith('.3mf')) {
              console.log(`[Scanner] ✅ Found 3MF: ${entry.name}`);
              const base = relativePath.replace(/\.3mf$/i, '');
              modelMap[base] = modelMap[base] || {};
              modelMap[base].threeMF = relativePath;
            } else if (lowerPath.endsWith('-munchie.json')) {
              const base = relativePath.replace(/-munchie\.json$/i, '');
              modelMap[base] = modelMap[base] || {};
              modelMap[base].json = relativePath;
            }
          } else if (fileType === "stl") {
            const lowerPath = relativePath.toLowerCase();
            if (lowerPath.endsWith('.stl')) {
              console.log(`[Scanner] ✅ Found STL: ${entry.name}`);
              const base = relativePath.replace(/\.stl$/i, '');
              modelMap[base] = modelMap[base] || {};
              modelMap[base].stl = relativePath;
            } else if (lowerPath.endsWith('-stl-munchie.json')) {
              const base = relativePath.replace(/-stl-munchie\.json$/i, '');
              modelMap[base] = modelMap[base] || {};
              modelMap[base].json = relativePath;
            }
          }
        }
      }
    }

    // Start recursive scan
    scanDirectory(modelsDir);

    // Clean up the modelMap to only include entries that have the expected file type
    const cleanedModelMap = {};
    for (const base in modelMap) {
      const entry = modelMap[base];
      if (fileType === "3mf" && entry.threeMF) {
        // Only include 3MF entries when in 3MF mode
        cleanedModelMap[base] = entry;
      } else if (fileType === "stl" && entry.stl) {
        // Only include STL entries when in STL mode
        cleanedModelMap[base] = entry;
      }
    }

    // Process all found models
    try { console.log('[debug] /api/hash-check base entries count=', Object.keys(cleanedModelMap).length); } catch (e) {}
    for (const base in cleanedModelMap) {
      const entry = cleanedModelMap[base];
      const threeMFPath = entry.threeMF ? path.join(modelsDir, entry.threeMF) : null;
      const stlPath = entry.stl ? path.join(modelsDir, entry.stl) : null;
      const jsonPath = entry.json ? path.join(modelsDir, entry.json) : null;
      const modelPath = threeMFPath || stlPath; // Prefer 3MF, but use STL if no 3MF
      let status = 'ok';
      let details = '';
      let hash = null;
      let storedHash = null;

      try {
        if (!modelPath || !fs.existsSync(modelPath)) {
          status = 'missing';
          details = 'Model file not found';
        } else {
          const buffer = fs.readFileSync(modelPath);
          try {
            hash = computeMD5(buffer);
          } catch (e) {
            hash = null;
            status = 'error';
            details = 'Failed to compute hash: ' + (e && e.message ? e.message : String(e));
          }

          // Try reading stored hash from munchie JSON if present
          if (jsonPath && fs.existsSync(jsonPath)) {
            try {
              const raw = fs.readFileSync(jsonPath, 'utf8');
              if (raw && raw.trim().length > 0) {
                const parsed = JSON.parse(raw);
                // Common stored hash field names: hash, md5, fileHash
                storedHash = parsed && (parsed.hash || parsed.md5 || parsed.fileHash || null);
              }
            } catch (e) {
              // ignore parse errors, but record details
              if (!details) details = 'Failed to read munchie JSON: ' + (e && e.message ? e.message : String(e));
            }
          } else {
            // munchie JSON is missing for this model
            if (!details) {
              details = 'Munchie JSON file missing';
            }
            if (status === 'ok') {
              status = 'missing_munchie';
            }
          }

          // Compare hashes if both present
          if (hash && storedHash && hash !== storedHash) {
            status = 'changed';
            details = details ? details + '; hash mismatch' : 'Hash mismatch: file changed since last recorded';
          }
        }
      } catch (e) {
        status = 'error';
        details = e && e.message ? e.message : String(e);
      }

      // Store hash for duplicate checking (but don't change status for duplicates)
      if (hash) {
        if (hashToFiles[hash]) {
          hashToFiles[hash].push(base);
        } else {
          hashToFiles[hash] = [base];
        }
      }

      result.push({
        baseName: base,
        threeMF: entry.threeMF || null,
        stl: entry.stl || null,
        json: entry.json || null,
        hash,
        storedHash,
        status,
        details
      });
    }

    // Add info about which files share duplicate hashes
    result.forEach(r => {
      if (r.hash && hashToFiles[r.hash] && hashToFiles[r.hash].length > 1) {
        r.duplicates = hashToFiles[r.hash].filter(b => b !== r.baseName);
      }
    });

    res.json({ success: true, results: result });
  } catch (e) {
    console.error('Hash check error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// API endpoint to load a model from a munchie.json file
app.get('/api/load-model', async (req, res) => {
  try {
    const { filePath, id } = req.query;
    // Prefer id-based lookup when provided (more robust)
    const modelsDir = path.resolve(getModelsDirectory());
    try { console.log('[debug] /api/load-model modelsDir=', modelsDir, 'id=', id); } catch (e) {}

    // If `id` provided, try scanning for a munchie.json with matching id
    if (id && typeof id === 'string' && id.trim().length > 0) {
      safeLog('Load model by id requested', { id });
      // Recursively search munchie files for matching id
      function findById(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            const r = findById(full);
            if (r) return r;
          } else if (entry.name.toLowerCase().endsWith('-munchie.json') || entry.name.toLowerCase().endsWith('-stl-munchie.json')) {
            try {
              const raw = fs.readFileSync(full, 'utf8');
              if (!raw || raw.trim().length === 0) continue;
              const parsed = JSON.parse(raw);
              try { console.log('[debug] /api/load-model inspecting', full, 'parsed.id=', parsed && parsed.id, 'parsed.name=', parsed && parsed.name); } catch (e) {}
              if (parsed && (parsed.id === id || parsed.name === id)) {
                try { console.log('[debug] /api/load-model matched id at', full); } catch (e) {}
                return full;
              }
            } catch (e) {
              // ignore parse/read errors
            }
          }
        }
        return null;
      }

      try {
        const found = findById(modelsDir);
        if (found) {
          const content = fs.readFileSync(found, 'utf8');
          const parsed = JSON.parse(content);
          return res.json(parsed);
        }
        try { console.log('[debug] /api/load-model no match found for id', id); } catch (e) {}
        // If search completed without finding a match, return 404 to indicate not found
        return res.status(404).json({ success: false, error: 'Model not found for id' });
      } catch (e) {
        console.error('Error during id lookup for /api/load-model (falling back to filePath):', e);
        // On unexpected errors, fall through to filePath handling below
      }
    }

    console.log('Load model request for filePath:', filePath, 'id:', id);

    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing file path' });
    }

    // If filePath is absolute, resolve it directly. If relative, treat it as relative to the models directory
    let fullPath;
    if (path.isAbsolute(filePath)) {
      fullPath = path.resolve(filePath);
    } else {
      // Normalize incoming slashes and strip leading slash if present
      let rel = filePath.replace(/\\/g, '/').replace(/^\//, '');
      // Prevent traversal attempts
      if (rel.includes('..')) return res.status(400).json({ success: false, error: 'Invalid relative path' });
      fullPath = path.join(modelsDir, rel);
    }
    safeLog('Resolved path for /api/load-model', { resolved: fullPath });

    // Ensure the path is within the models directory for security
    const resolvedModelsDir = modelsDir.endsWith(path.sep) ? modelsDir : modelsDir + path.sep;
    const resolvedFull = fullPath;
    if (!resolvedFull.startsWith(modelsDir) && !resolvedFull.startsWith(resolvedModelsDir)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      console.log('File not found:', fullPath);
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    // Validate that we're only loading JSON files
    if (!fullPath.toLowerCase().endsWith('.json')) {
      console.log('Attempt to load non-JSON file as model data:', fullPath);
      return res.status(400).json({ success: false, error: 'Only JSON files can be loaded as model data' });
    }

    // Read the file content first to check if it's valid
    const fileContent = fs.readFileSync(fullPath, 'utf8');
    if (fileContent.trim().length === 0) {
      console.log('Empty file detected:', fullPath);
      return res.status(400).json({ success: false, error: 'Empty file' });
    }

    // Read and parse the JSON file
    const modelData = JSON.parse(fileContent);
    res.json(modelData);
  } catch (error) {
    console.error('Error loading model:', error);
    res.status(500).json({ success: false, error: 'Failed to load model data' });
  }
});

app.post('/api/delete-models', (req, res) => {
  const { files } = req.body; // array of file paths relative to models dir
  if (!Array.isArray(files)) {
    return res.status(400).json({ success: false, error: 'No files provided' });
  }
  const modelsDir = getAbsoluteModelsPath();
  let deleted = [];
  let errors = [];
  files.forEach(file => {
    const filePath = path.join(modelsDir, file);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted.push(file);
      }
    } catch (err) {
      errors.push({ file, error: err.message });
    }
  });
  res.json({ success: errors.length === 0, deleted, errors });
});

// API endpoint to verify a related file path (used by frontend Verify button)
app.post('/api/verify-file', (req, res) => {
  try {
    const { path: incomingPath } = req.body || {};
    if (!incomingPath || typeof incomingPath !== 'string') {
      return res.status(400).json({ success: false, error: 'Path required' });
    }

    // Basic normalization similar to other server helpers
    let s = incomingPath.trim();
    if (s === '') return res.status(400).json({ success: false, error: 'Empty path' });
    // Strip quotes
    if (/^['"].*['"]$/.test(s)) s = s.replace(/^['"]|['"]$/g, '').trim();
    // Reject traversal
    if (s.includes('..')) return res.status(400).json({ success: false, error: 'Path traversal not allowed' });
    // Normalize slashes
    s = s.replace(/\\/g, '/');
    // Reject UNC
    if (s.startsWith('//')) return res.status(400).json({ success: false, error: 'UNC paths not allowed' });
    // Reject Windows drive-letter absolutes
    if (/^[a-zA-Z]:\//.test(s) || /^[a-zA-Z]:\\/.test(incomingPath)) return res.status(400).json({ success: false, error: 'Absolute Windows paths not allowed' });
    // Strip leading slash to make relative
    if (s.startsWith('/')) s = s.substring(1);

    const modelsDir = getAbsoluteModelsPath();
    const candidate = path.join(modelsDir, s);
    // Ensure candidate path is within models dir
    const resolved = path.resolve(candidate);
    if (!resolved.startsWith(path.resolve(modelsDir))) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (!fs.existsSync(resolved)) {
      return res.json({ success: true, exists: false, path: s });
    }

    const stat = fs.statSync(resolved);
    return res.json({ success: true, exists: true, isFile: stat.isFile(), isDirectory: stat.isDirectory(), size: stat.size, path: s });
  } catch (err) {
    console.error('verify-file error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// API endpoint to validate a specific 3MF file
app.get('/api/validate-3mf', async (req, res) => {
  const { file } = req.query;

  if (!file) {
    return res.status(400).json({ error: 'File path required' });
  }

  try {
    const { parse3MF } = require('./dist-backend/utils/threeMFToJson');
    const filePath = path.isAbsolute(file) ? file : path.join(getAbsoluteModelsPath(), file);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Try to parse the 3MF file
    const metadata = await parse3MF(filePath, 0);

    res.json({
      valid: true,
      file: file,
      size: fs.statSync(filePath).size,
      metadata: {
        name: metadata.name,
        thumbnail: metadata.thumbnail ? 'present' : 'missing',
        fileSize: metadata.fileSize
      }
    });
  } catch (error) {
    console.error('3MF validation error:', error.message);
    res.json({
      valid: false,
      file: file,
      error: error.message,
      suggestion: error.message.includes('rels') || error.message.includes('relationship')
        ? 'This 3MF file appears to be missing relationship files. Try re-exporting from your 3D software.'
        : 'This 3MF file may be corrupted or in an unsupported format.'
    });
  }
});

// Helper function to get all models
async function getAllModels(modelsDirectory) {
  const absolutePath = modelsDirectory;
  let models = [];

  // Function to recursively scan directories
  function scanForModels(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        scanForModels(fullPath);
      } else if (entry.name.endsWith('-munchie.json')) {
        // Load and parse each munchie file
        try {
          const fileContent = fs.readFileSync(fullPath, 'utf8');
          const model = JSON.parse(fileContent);
          // Add relative path information for proper URL construction
          const relativePath = path.relative(absolutePath, fullPath);
          model.modelUrl = '/models/' + relativePath.replace(/\\/g, '/').replace('-munchie.json', '.3mf');

          // Set the filePath property for deletion purposes
          model.filePath = relativePath.replace('-munchie.json', '.3mf');

          models.push(model);
        } catch (error) {
          console.error(`Error reading model file ${fullPath}:`, error);
        }
      }
    }
  }

  if (fs.existsSync(absolutePath)) {
    scanForModels(absolutePath);
  }

  return models;
}

// API endpoint: Gemini suggestion (provider-backed with mock fallback)
app.post('/api/gemini-suggest', async (req, res) => {
  try {
    const { imageBase64, mimeType, prompt, config } = req.body || {};

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }

    // imageBase64 is optional; validate shape if provided
    if (imageBase64 && typeof imageBase64 !== 'string') {
      return res.status(400).json({ success: false, error: 'imageBase64 must be a base64 string' });
    }

    const requestedProvider = (req.body && req.body.provider) || process.env.GEMINI_PROVIDER;
    safeLog('Received /api/gemini-suggest request', { prompt, mimeType, provider: requestedProvider });

    // Try provider adapter (pass requested provider)
    let genaiResult = null;
    try {
      // Resolve relative to this file's directory so the module loads regardless of process.cwd()
      const adapterPath = path.join(__dirname, 'server-utils', 'genaiAdapter');
      const adapter = require(adapterPath);
      genaiResult = await adapter.suggest({ prompt, imageBase64, mimeType, provider: requestedProvider, config: config || {} });
    } catch (e) {
      console.warn('GenAI adapter error or not configured:', e && e.message);
      genaiResult = null;
    }

    if (genaiResult) {
      // Normalize result
      const suggestion = {
        description: genaiResult.description || '',
        category: genaiResult.category || '',
        tags: Array.isArray(genaiResult.tags) ? genaiResult.tags : []
      };
      return res.json({ success: true, suggestion, raw: genaiResult.raw || null });
    }

    // Fallback mock behavior (previous heuristic)
    const lower = prompt.toLowerCase();
    const words = Array.from(new Set(lower.replace(/[\W_]+/g, ' ').split(/\s+/).filter(w => w.length > 3)));
    const tags = words.slice(0, 6);
    const description = `AI suggestion (mock) based on prompt: ${prompt}`;
    const category = tags.length ? tags[0] : '';

    const suggestion = {
      description,
      category,
      tags
    };

    return res.json({ success: true, suggestion, raw: null });
  } catch (err) {
    console.error('/api/gemini-suggest error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// API endpoint to delete models by ID (deletes specified file types)
app.delete('/api/models/delete', async (req, res) => {
  const { modelIds, fileTypes } = req.body;

  if (!Array.isArray(modelIds) || modelIds.length === 0) {
    return res.status(400).json({ success: false, error: 'No model IDs provided' });
  }

  // Default to deleting both file types if not specified (backward compatibility)
  const typesToDelete = Array.isArray(fileTypes) && fileTypes.length > 0 ? fileTypes : ['3mf', 'json'];
  console.log(`File types to delete: ${typesToDelete.join(', ')}`);

  try {
    const modelsDir = getAbsoluteModelsPath();
    let deleted = [];
    let errors = [];

    // Scan for all models (both 3MF and STL) using the same logic as the main API
    let allModels = [];

    function scanForModels(directory) {
      const entries = fs.readdirSync(directory, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
          scanForModels(fullPath);
        } else if (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json')) {
          try {
            const fileContent = fs.readFileSync(fullPath, 'utf8');
            const model = JSON.parse(fileContent);
            const relativePath = path.relative(modelsDir, fullPath);

            // Set the correct filePath based on model type
            if (entry.name.endsWith('-stl-munchie.json')) {
              // STL model
              model.filePath = relativePath.replace('-stl-munchie.json', '.stl');
            } else {
              // 3MF model
              model.filePath = relativePath.replace('-munchie.json', '.3mf');
            }

            allModels.push(model);
          } catch (error) {
            console.error(`Error reading model file ${fullPath}:`, error);
          }
        }
      }
    }

    scanForModels(modelsDir);

    for (const modelId of modelIds) {
      const model = allModels.find(m => m.id === modelId);
      console.log(`Processing model ID: ${modelId}`);

      if (!model) {
        console.log(`Model not found for ID: ${modelId}`);
        errors.push({ modelId, error: 'Model not found' });
        continue;
      }

      console.log(`Found model: ${model.name}, filePath: ${model.filePath}`);

      const filesToDelete = [];

      // Check if model has a valid filePath
      if (!model.filePath) {
        console.log(`Model ${modelId} has no file path`);
        errors.push({ modelId, error: 'Model has no file path' });
        continue;
      }

      // Add the .3mf file only if requested and model is a 3MF model
      if (typesToDelete.includes('3mf') && model.filePath.endsWith('.3mf')) {
        const threeMfPath = path.isAbsolute(model.filePath)
          ? model.filePath
          : path.join(modelsDir, model.filePath);
        filesToDelete.push({ type: '3mf', path: threeMfPath });
      }

      // Add the .stl file only if requested and model is an STL model
      if (typesToDelete.includes('stl') && (model.filePath.endsWith('.stl') || model.filePath.endsWith('.STL'))) {
        const stlPath = path.isAbsolute(model.filePath)
          ? model.filePath
          : path.join(modelsDir, model.filePath);
        filesToDelete.push({ type: 'stl', path: stlPath });
      }

      // Add the corresponding munchie.json file only if requested
      if (typesToDelete.includes('json')) {
        let jsonFileName;
        if (model.filePath.endsWith('.3mf')) {
          jsonFileName = model.filePath.replace(/\.3mf$/i, '-munchie.json');
        } else if (model.filePath.endsWith('.stl') || model.filePath.endsWith('.STL')) {
          jsonFileName = model.filePath.replace(/\.stl$/i, '-stl-munchie.json').replace(/\.STL$/i, '-stl-munchie.json');
        }

        if (jsonFileName) {
          const jsonPath = path.isAbsolute(jsonFileName)
            ? jsonFileName
            : path.join(modelsDir, jsonFileName);
          filesToDelete.push({ type: 'json', path: jsonPath });
        }
      }

      console.log(`Files to delete for ${modelId}:`, filesToDelete);

      // Delete each file
      for (const fileInfo of filesToDelete) {
        try {
          console.log(`Attempting to delete file: ${fileInfo.path}`);
          if (fs.existsSync(fileInfo.path)) {
            fs.unlinkSync(fileInfo.path);
            console.log(`Successfully deleted: ${fileInfo.path}`);
            deleted.push({ modelId, type: fileInfo.type, path: path.relative(modelsDir, fileInfo.path) });
          } else {
            console.log(`File does not exist: ${fileInfo.path}`);
          }
        } catch (err) {
          console.error(`Error deleting file ${fileInfo.path}:`, err.message);
          errors.push({ modelId, type: fileInfo.type, error: err.message });
        }
      }
    }

    console.log(`Deletion summary: ${deleted.length} files deleted, ${errors.length} errors`);
    safeLog('Deleted files:', deleted);
    safeLog('Errors:', errors);

    res.json({
      success: errors.length === 0,
      deleted,
      errors,
      summary: `Deleted ${deleted.length} files for ${modelIds.length} models`
    });

  } catch (error) {
    console.error('Error deleting models:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint to create a backup of all munchie.json files
app.post('/api/backup-munchie-files', async (req, res) => {
  try {
    const modelsDir = getAbsoluteModelsPath();
    const backup = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      files: [],
      // Include collections.json when present so collections are preserved in backup
      collections: undefined
    };

    // Recursively find all munchie.json files
    function findMunchieFiles(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          findMunchieFiles(fullPath);
        } else if (entry.name.endsWith('-munchie.json')) {
          try {
            const relativePath = path.relative(modelsDir, fullPath);
            const content = fs.readFileSync(fullPath, 'utf8');
            const jsonData = JSON.parse(content);

            backup.files.push({
              relativePath: relativePath.replace(/\\/g, '/'), // Normalize path separators
              originalPath: relativePath.replace(/\\/g, '/'), // Store original path for restoration
              content: jsonData,
              hash: jsonData.hash || null, // Use hash for matching during restore
              size: Buffer.byteLength(content, 'utf8')
            });
          } catch (error) {
            console.error(`Error reading munchie file ${fullPath}:`, error);
          }
        }
      }
    }

    findMunchieFiles(modelsDir);

    // Try to include collections.json if it exists
    try {
      const collectionsPath = path.join(process.cwd(), 'data', 'collections.json');
      if (fs.existsSync(collectionsPath)) {
        const raw = fs.readFileSync(collectionsPath, 'utf8');
        if (raw && raw.trim() !== '') {
          const parsed = JSON.parse(raw);
          // Normalize to an array in case file contains { collections: [...] }
          const cols = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.collections) ? parsed.collections : []);
          backup.collections = cols;
        } else {
          backup.collections = [];
        }
      }
    } catch (e) {
      console.warn('Failed to read collections.json for backup:', e && e.message ? e.message : e);
    }

    // Compress the backup data
    const jsonString = JSON.stringify(backup, null, 2);
    const compressed = zlib.gzipSync(Buffer.from(jsonString, 'utf8'));

    // Set headers for file download
    const timestamp = backup.timestamp.replace(/[:.]/g, '-').slice(0, 19);
    const filename = `munchie-backup-${timestamp}.gz`;

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', compressed.length);

    res.send(compressed);

    const colCount = Array.isArray(backup.collections) ? backup.collections.length : 0;
    console.log(`Backup created: ${backup.files.length} munchie.json files, ${colCount} collections, ${(compressed.length / 1024).toFixed(2)} KB compressed`);

  } catch (error) {
    console.error('Backup creation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint to restore munchie.json files from backup
app.post('/api/restore-munchie-files', async (req, res) => {
  try {
    const { backupData, strategy = 'hash-match', collectionsStrategy = 'merge' } = req.body;

    if (!backupData) {
      return res.status(400).json({ success: false, error: 'No backup data provided' });
    }

    let backup;
    try {
      // Parse the backup data (should be uncompressed JSON)
      backup = typeof backupData === 'string' ? JSON.parse(backupData) : backupData;
    } catch (error) {
      return res.status(400).json({ success: false, error: 'Invalid backup data format' });
    }

    if (!backup.files || !Array.isArray(backup.files)) {
      return res.status(400).json({ success: false, error: 'Invalid backup structure' });
    }

    const modelsDir = getAbsoluteModelsPath();
    const results = {
      restored: [],
      skipped: [],
      errors: [],
      strategy: strategy,
      collections: { restored: 0, skipped: 0, strategy: collectionsStrategy }
    };

    // Create a map of existing 3MF files by their hashes for hash-based matching
    const { computeMD5 } = require('./dist-backend/utils/threeMFToJson');
    const existingFiles = new Map(); // hash -> { munchieJsonPath, threeMFPath, currentHash }

    function mapExistingFiles(dir) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            mapExistingFiles(fullPath);
          } else if (entry.name.endsWith('.3mf')) {
            try {
              // Calculate the current hash of the 3MF file
              const currentHash = computeMD5(fullPath);
              const relativePath = path.relative(modelsDir, fullPath);

              // Find the corresponding munchie.json file
              const munchieJsonPath = fullPath.replace(/\.3mf$/i, '-munchie.json');

              if (fs.existsSync(munchieJsonPath)) {
                existingFiles.set(currentHash, {
                  munchieJsonPath: munchieJsonPath,
                  threeMFPath: fullPath,
                  relativeMunchieJsonPath: relativePath.replace(/\.3mf$/i, '-munchie.json').replace(/\\/g, '/'),
                  currentHash: currentHash
                });
              }
            } catch (error) {
              console.error(`Error processing 3MF file ${fullPath}:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`Error scanning directory ${dir}:`, error);
      }
    }

    mapExistingFiles(modelsDir);

    // Restore collections first (optional)
    try {
      if (backup.collections && Array.isArray(backup.collections)) {
        const existing = loadCollections();
        let next = [];
        if (collectionsStrategy === 'replace') {
          next = backup.collections;
        } else {
          // merge by id (prefer backup for matching IDs), append new ones
          const byId = new Map(existing.map(c => [c && c.id, c]).filter(([k]) => typeof k === 'string' && k));
          for (const c of backup.collections) {
            if (c && typeof c.id === 'string' && c.id) {
              byId.set(c.id, c);
            } else {
              // no id, assign one to avoid collisions
              const assigned = { ...c, id: makeId() };
              next.push(assigned);
            }
          }
          next = [...new Set(next.concat(Array.from(byId.values()).filter(Boolean)))];
        }
        if (!Array.isArray(next)) next = [];
        if (saveCollections(next)) {
          results.collections.restored = Array.isArray(next) ? next.length : 0;
        } else {
          results.collections.skipped = Array.isArray(backup.collections) ? backup.collections.length : 0;
        }
      }
    } catch (e) {
      console.warn('Failed to restore collections from backup:', e && e.message ? e.message : e);
      results.errors.push({ originalPath: 'collections.json', error: 'Failed to restore collections: ' + (e && e.message ? e.message : e) });
    }

    // Process each file in the backup
    for (const backupFile of backup.files) {
      try {
        let targetPath;
        let shouldRestore = false;
        let reason = '';

        if (strategy === 'hash-match' && backupFile.hash) {
          // Try to match by 3MF file hash first
          const existing = existingFiles.get(backupFile.hash);
          if (existing) {
            targetPath = existing.munchieJsonPath;
            shouldRestore = true;
            reason = `Hash match: ${backupFile.hash.substring(0, 8)}... -> ${path.basename(existing.threeMFPath)}`;
          } else {
            // If no hash match, try original path
            const originalPath = path.join(modelsDir, backupFile.originalPath);
            if (fs.existsSync(originalPath)) {
              targetPath = originalPath;
              shouldRestore = true;
              reason = 'Path match (no hash match found)';
            } else {
              results.skipped.push({
                originalPath: backupFile.originalPath,
                reason: 'No matching file found (hash or path)'
              });
              continue;
            }
          }
        } else if (strategy === 'path-match') {
          // Match by original path
          const originalPath = path.join(modelsDir, backupFile.originalPath);
          if (fs.existsSync(originalPath)) {
            targetPath = originalPath;
            shouldRestore = true;
            reason = 'Path match';
          } else {
            results.skipped.push({
              originalPath: backupFile.originalPath,
              reason: 'Original path not found'
            });
            continue;
          }
        } else {
          // Force restore to original path (create if necessary)
          targetPath = path.join(modelsDir, backupFile.originalPath);

          // Create directory if it doesn't exist
          const dir = path.dirname(targetPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }

          shouldRestore = true;
          reason = 'Force restore to original path';
        }

        if (shouldRestore) {
          // Protect against accidentally writing to .3mf/.stl files by remapping
          // any model file path to its corresponding munchie JSON file.
          const safeTarget = protectModelFileWrite(targetPath);

          // Write the restored file (atomic via .tmp -> rename)
          const restoredContent = JSON.stringify(backupFile.content, null, 2);
          const tmp = safeTarget + '.tmp';
          fs.writeFileSync(tmp, restoredContent, 'utf8');
          fs.renameSync(tmp, safeTarget);

          results.restored.push({
            originalPath: backupFile.originalPath,
            restoredPath: path.relative(modelsDir, safeTarget).replace(/\\/g, '/'),
            reason: reason,
            size: backupFile.size
          });
        }

      } catch (error) {
        results.errors.push({
          originalPath: backupFile.originalPath,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      ...results,
      summary: `Restored ${results.restored.length} files, skipped ${results.skipped.length}, ${results.errors.length} errors`
    });

    console.log(`Restore completed: ${results.restored.length} restored, ${results.skipped.length} skipped, ${results.errors.length} errors`);
    safeLog('Restore details:', results);

  } catch (error) {
    console.error('Restore error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint to restore munchie.json files from uploaded backup file
app.post('/api/restore-munchie-files/upload', upload.single('backupFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No backup file provided' });
    }

    const { strategy = 'hash-match', collectionsStrategy = 'merge' } = req.body;
    let backupData;

    // Check if file is gzipped
    if (req.file.originalname.endsWith('.gz')) {
      try {
        const decompressed = zlib.gunzipSync(req.file.buffer);
        backupData = decompressed.toString('utf8');
      } catch (error) {
        return res.status(400).json({ success: false, error: 'Failed to decompress backup file' });
      }
    } else {
      backupData = req.file.buffer.toString('utf8');
    }

    let backup;
    try {
      backup = JSON.parse(backupData);
    } catch (error) {
      return res.status(400).json({ success: false, error: 'Invalid backup file format' });
    }

    if (!backup.files || !Array.isArray(backup.files)) {
      return res.status(400).json({ success: false, error: 'Invalid backup structure' });
    }

    // Use the same restore logic as the JSON endpoint
    const modelsDir = getAbsoluteModelsPath();
    const results = {
      restored: [],
      skipped: [],
      errors: [],
      strategy: strategy,
      collections: { restored: 0, skipped: 0, strategy: collectionsStrategy }
    };

    // Create a map of existing 3MF files by their hashes for hash-based matching
    const { computeMD5 } = require('./dist-backend/utils/threeMFToJson');
    const existingFiles = new Map(); // hash -> { munchieJsonPath, threeMFPath, currentHash }

    function mapExistingFiles(dir) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            mapExistingFiles(fullPath);
          } else if (entry.name.endsWith('.3mf')) {
            try {
              // Calculate the current hash of the 3MF file
              const currentHash = computeMD5(fullPath);
              const relativePath = path.relative(modelsDir, fullPath);

              // Find the corresponding munchie.json file
              const munchieJsonPath = fullPath.replace(/\.3mf$/i, '-munchie.json');

              if (fs.existsSync(munchieJsonPath)) {
                existingFiles.set(currentHash, {
                  munchieJsonPath: munchieJsonPath,
                  threeMFPath: fullPath,
                  relativeMunchieJsonPath: relativePath.replace(/\.3mf$/i, '-munchie.json').replace(/\\/g, '/'),
                  currentHash: currentHash
                });
              }
            } catch (error) {
              console.error(`Error processing 3MF file ${fullPath}:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`Error scanning directory ${dir}:`, error);
      }
    }

    mapExistingFiles(modelsDir);

    // Restore collections first (optional)
    try {
      if (backup.collections && Array.isArray(backup.collections)) {
        const existing = loadCollections();
        let next = [];
        if (collectionsStrategy === 'replace') {
          next = backup.collections;
        } else {
          const byId = new Map(existing.map(c => [c && c.id, c]).filter(([k]) => typeof k === 'string' && k));
          for (const c of backup.collections) {
            if (c && typeof c.id === 'string' && c.id) {
              byId.set(c.id, c);
            } else {
              const assigned = { ...c, id: makeId() };
              next.push(assigned);
            }
          }
          next = [...new Set(next.concat(Array.from(byId.values()).filter(Boolean)))];
        }
        if (!Array.isArray(next)) next = [];
        if (saveCollections(next)) {
          results.collections.restored = Array.isArray(next) ? next.length : 0;
        } else {
          results.collections.skipped = Array.isArray(backup.collections) ? backup.collections.length : 0;
        }
      }
    } catch (e) {
      console.warn('Failed to restore collections from uploaded backup:', e && e.message ? e.message : e);
      results.errors.push({ originalPath: 'collections.json', error: 'Failed to restore collections: ' + (e && e.message ? e.message : e) });
    }

    // Process each file in the backup
    for (const backupFile of backup.files) {
      try {
        let targetPath;
        let shouldRestore = false;
        let reason = '';

        if (strategy === 'hash-match' && backupFile.hash) {
          // Try to match by 3MF file hash first
          const existing = existingFiles.get(backupFile.hash);
          if (existing) {
            targetPath = existing.munchieJsonPath;
            shouldRestore = true;
            reason = `Hash match: ${backupFile.hash.substring(0, 8)}... -> ${path.basename(existing.threeMFPath)}`;
          } else {
            // If no hash match, try original path
            const originalPath = path.join(modelsDir, backupFile.originalPath);
            if (fs.existsSync(originalPath)) {
              targetPath = originalPath;
              shouldRestore = true;
              reason = 'Path match (no hash match found)';
            } else {
              results.skipped.push({
                originalPath: backupFile.originalPath,
                reason: 'No matching file found (hash or path)'
              });
              continue;
            }
          }
        } else if (strategy === 'path-match') {
          // Match by original path
          const originalPath = path.join(modelsDir, backupFile.originalPath);
          if (fs.existsSync(originalPath)) {
            targetPath = originalPath;
            shouldRestore = true;
            reason = 'Path match';
          } else {
            results.skipped.push({
              originalPath: backupFile.originalPath,
              reason: 'Original path not found'
            });
            continue;
          }
        } else {
          // Force restore to original path (create if necessary)
          targetPath = path.join(modelsDir, backupFile.originalPath);

          // Create directory if it doesn't exist
          const dir = path.dirname(targetPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }

          shouldRestore = true;
          reason = 'Force restore to original path';
        }

        if (shouldRestore) {
          // Protect against accidentally writing to .3mf/.stl files by remapping
          // any model file path to its corresponding munchie JSON file.
          const safeTarget = protectModelFileWrite(targetPath);

          // Write the restored file atomically
          const restoredContent = JSON.stringify(backupFile.content, null, 2);
          const tmp = safeTarget + '.tmp';
          fs.writeFileSync(tmp, restoredContent, 'utf8');
          fs.renameSync(tmp, safeTarget);

          results.restored.push({
            originalPath: backupFile.originalPath,
            restoredPath: path.relative(modelsDir, safeTarget).replace(/\\/g, '/'),
            reason: reason,
            size: backupFile.size
          });
        }

      } catch (error) {
        results.errors.push({
          originalPath: backupFile.originalPath,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      ...results,
      summary: `Restored ${results.restored.length} files, skipped ${results.skipped.length}, ${results.errors.length} errors`
    });

    console.log(`File upload restore completed: ${results.restored.length} restored, ${results.skipped.length} skipped, ${results.errors.length} errors`);
    safeLog('File upload restore details:', results);

  } catch (error) {
    console.error('File upload restore error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint to update model metadata (e.g., preferred spool, notes, tags)
app.post('/api/model/metadata', async (req, res) => {
  try {
    const { filePath, updates } = req.body; // filePath e.g. "SciFi/Octopus.stl"

    if (!filePath || !updates) {
      return res.status(400).json({ success: false, message: 'Missing filePath or updates' });
    }

    const modelsDir = getAbsoluteModelsPath();
    const absoluteModelPath = path.join(modelsDir, filePath);
    const dirName = path.dirname(absoluteModelPath);
    const baseName = path.basename(absoluteModelPath);

    // Determine the JSON filename logic (matching your scan logic)
    let jsonPath;

    if (baseName.toLowerCase().endsWith('.stl')) {
      // Logic: MyModel.stl -> MyModel-stl-munchie.json
      const jsonName = baseName.replace(/\.stl$/i, '-stl-munchie.json');
      jsonPath = path.join(dirName, jsonName);
    } else if (baseName.toLowerCase().endsWith('.3mf')) {
      // Logic: MyModel.3mf -> MyModel-munchie.json
      const jsonName = baseName.replace(/\.3mf$/i, '-munchie.json');
      jsonPath = path.join(dirName, jsonName);
    } else {
      // Fallback: try to guess or just append
      const jsonName = baseName + '-munchie.json';
      jsonPath = path.join(dirName, jsonName);
    }

    if (!fs.existsSync(jsonPath)) {
      console.error(`[Metadata Update] Could not find JSON file at: ${jsonPath}`);
      return res.status(404).json({ success: false, message: 'Metadata file not found' });
    }

    // Read, Update, Save
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const data = JSON.parse(raw);

    // Ensure userDefined exists
    if (!data.userDefined) data.userDefined = {};

    // Merge updates (e.g. { preferredSpoolId: "12" })
    Object.assign(data.userDefined, updates);

    // Write back
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[Metadata Update] Updated ${path.basename(jsonPath)} with keys: ${Object.keys(updates).join(', ')}`);

    res.json({ success: true, model: data });

  } catch (error) {
    console.error('Metadata update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});


// Helper: Build multipart body manually to avoid 'form-data' dependency
function createMultipartBody(fileBuffer, fileName) {
  const boundary = '----MuncherBoundary' + Date.now().toString(16);
  const start = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
  const end = `\r\n--${boundary}--`;
  const body = Buffer.concat([Buffer.from(start), fileBuffer, Buffer.from(end)]);
  return { body, boundary };
}

app.post('/api/printer/config', (req, res) => {
  const config = ConfigManager.loadConfig();
  if (!config.integrations) config.integrations = {};
  config.integrations.printer = req.body;
  ConfigManager.saveConfig(config);
  res.json({ success: true });
});

// [FIXED] Smart Printer Status - Supports Multi-Printer Array
app.get('/api/printer/status', async (req, res) => {
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

  // CASE 2: Return list of all configured printers (for Hub & Drawer)
  const config = ConfigManager.loadConfig();
  
  // Combine legacy 'printer' object and new 'printers' array
  const legacy = config.integrations?.printer;
  const list = config.integrations?.printers || [];
  
  // If user has a legacy printer set but no array, treat it as Printer 1
  let allPrinters = [...list];
  if (legacy && legacy.url && allPrinters.length === 0) {
      allPrinters.push(legacy);
  }

  // Filter valid configs
  const validPrinters = allPrinters
    .map((p, index) => ({ ...p, index }))
    .filter(p => p.url); // Must have URL

  if (validPrinters.length === 0) {
      return res.json({ status: 'disabled', printers: [] });
  }

  // Check status of ALL printers in parallel
  const results = await Promise.all(validPrinters.map(async (p) => {
    try {
      const cleanUrl = p.url.replace(/\/$/, '');
      const target = p.type === 'moonraker' ? `${cleanUrl}/printer/info` : `${cleanUrl}/api/version`;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000); // Fast 2s timeout per printer
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

app.post('/api/printer/print', async (req, res) => {
  const { filePath, printerIndex } = req.body; // Expect printerIndex (0, 1, 2...)
  const config = ConfigManager.loadConfig();
  
  // Get the specific printer config
  const printerList = config.integrations?.printers || (config.integrations?.printer ? [config.integrations.printer] : []);
  
  // Default to index 0 if not provided (legacy fallback), but prefer explicit index
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

// TARGETED UPDATE: server.js - Replace the previous /api/printer/job-status endpoint

app.get('/api/printer/job-status', async (req, res) => {
  const config = ConfigManager.loadConfig();
  // Support both legacy single printer and new array
  const printerList = config.integrations?.printers || (config.integrations?.printer ? [config.integrations.printer] : []);
  
  if (printerList.length === 0) return res.json({ printers: [] });

  // Helper to fetch status for one printer
  const checkPrinter = async (p, index) => {
    if (!p || !p.url) return null;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000); // Short 2s timeout per printer
    
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
      // Return error state so UI knows it's offline
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

// [FIX] Explicitly serve the capture.html file for Puppeteer
// Check if it's in 'public' (standard) or root
app.get('/capture.html', (req, res) => {
  const publicPath = path.join(__dirname, 'public', 'capture.html');
  const rootPath = path.join(__dirname, 'capture.html');

  if (fs.existsSync(publicPath)) {
    res.sendFile(publicPath);
  } else if (fs.existsSync(rootPath)) {
    res.sendFile(rootPath);
  } else {
    res.status(404).send('Capture file not found on server');
  }
});

// Serve static files from the build directory
app.use(express.static(path.join(__dirname, 'build')));
app.use('/data/covers', express.static(path.join(process.cwd(), 'data', 'covers')));

// Error handler for multipart/form-data upload errors (Multer)
// This ensures clients receive JSON errors (e.g., file too large) instead of an HTML error page.
app.use(function (err, req, res, next) {
  try {
    if (err) {
      // Multer exposes a MulterError type with code property
      if (err.name === 'MulterError' || err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_PART_COUNT' || err.code === 'LIMIT_FILE_COUNT') {
        const message = err.message || 'File upload error';
        console.warn('Multer error during upload:', err.code || err.name, err.message);
        return res.status(413).json({ success: false, error: message, code: err.code || err.name });
      }

      // For other errors, pass through to default handler
      console.error('Unhandled error in middleware:', err && err.message ? err.message : err);
      return res.status(500).json({ success: false, error: err.message || String(err) });
    }
  } catch (handlerErr) {
    console.error('Error handler failed:', handlerErr);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
  return next();
});

// Handle React Router - catch all GET requests that aren't API or model routes
app.get(/^(?!\/api|\/models).*$/, (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`3D Model Muncher backend API running on port ${PORT}`);
    console.log(`Frontend served from build directory`);
  });
}

// Export app for testing (so tests can import and run requests against it)
module.exports = app;
