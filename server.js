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
const routeSelector = require('./server-utils/routeSelector'); // Phase 3: Dual-Running System

// Phase 3: Load appropriate collection scanner based on mode
const collectionScanner = routeSelector.getCollectionScanner();
const { scanDirectory: scanCollections } = collectionScanner;

const { generateThumbnail } = require('./dist-backend/utils/thumbnailGenerator');
const app = express();
const PORT = process.env.PORT || 3001;
// Ensure downstream modules (like ProjectService) see the correct port
process.env.PORT = PORT;

// Phase 3: Log current backend mode on startup
routeSelector.logStartupMode();

let activeThumbnailJob = null; // Stores the AbortController for cancellation

const {
  loadCollections,
  saveCollections,
  getModelsDirectory,
  getAbsoluteModelsPath,
  safeWriteJson,
  protectModelFileWrite
} = require('./server-utils/dataAccess');
const { collectionQueue } = require('./server-utils/sharedQueue');

// Phase 3: Load appropriate models router based on mode
const modelsRouter = routeSelector.getModelRoutes();

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const COLLECTION_IMAGES_DIR = path.join(DATA_DIR, 'images', 'collections');
const COLLECTION_DOCS_DIR = path.join(DATA_DIR, 'documents', 'collections');
const UPLOADS_DIR = path.join(getAbsoluteModelsPath(), 'uploads');
if (!fs.existsSync(COLLECTION_DOCS_DIR)) fs.mkdirSync(COLLECTION_DOCS_DIR, { recursive: true });
if (!fs.existsSync(COLLECTION_IMAGES_DIR)) fs.mkdirSync(COLLECTION_IMAGES_DIR, { recursive: true });
if (!fs.existsSync(COLLECTION_DOCS_DIR)) fs.mkdirSync(COLLECTION_DOCS_DIR, { recursive: true });

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
  } catch (e) { }
  try {
    const cfg = ConfigManager.loadConfig();
    return !!(cfg && cfg.settings && cfg.settings.verboseScanLogs);
  } catch (e) { return false; }
}

function serverDebug(...args) {
  if (isServerDebugEnabled()) {
    const sanitized = args.map(a => (typeof a === 'object' && a !== null) ? sanitizeForLog(a) : a);
    console.debug.apply(console, sanitized);
  }
}

// Configure multer for backup file uploads
const MAX_UPLOAD_BYTES = process.env.MAX_UPLOAD_BYTES ? parseInt(process.env.MAX_UPLOAD_BYTES, 10) : (1 * 1024 * 1024 * 1024);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES }
});

app.use('/api/images', express.static(path.join(DATA_DIR, 'images')));
app.use('/api/documents', express.static(path.join(DATA_DIR, 'documents')));
app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Serve model files (dynamic path support)
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

app.use('/models', (req, res, next) => {
  ensureModelsStaticHandler();
  if (req.method === 'GET' && isServerDebugEnabled()) {
    console.log(`[Static Serve] Request: ${req.url} | Serving from: ${currentModelsPath}`);
  }
  return currentModelsStaticHandler(req, res, next);
});

// --- Mount Routes ---
app.use('/api', routeSelector.getSystemRoutes());

// Phase 3: Load appropriate collection routes based on mode
const collectionsRouter = routeSelector.getCollectionRoutes();
app.use('/api', collectionsRouter); // Database routes have /collections prefix, legacy routes will be updated

app.use('/api', routeSelector.getImportRoutes());
app.use('/api/admin', routeSelector.getAdminRoutes());
app.use('/api', routeSelector.getConfigRoutes()); // New Config Router
app.use('/api', routeSelector.getIntegrationRoutes()); // New Integrations Router
app.use('/api', modelsRouter); // Models Router

// Tags Router (extracts from munchie files in legacy, from DB in database mode)
const tagsRouter = routeSelector.getTagRoutes();
app.use('/api', tagsRouter);

// Database-centric Projects feature
app.use('/api', routeSelector.getProjectRoutes());

// [FIX] Explicitly serve the capture.html file for Puppeteer
app.get('/capture.html', (req, res) => {
  const publicPath = path.join(__dirname, 'public', 'capture.html');
  const rootPath = path.join(__dirname, 'capture.html');
  if (fs.existsSync(publicPath)) res.sendFile(publicPath);
  else if (fs.existsSync(rootPath)) res.sendFile(rootPath);
  else res.status(404).send('Capture file not found on server');
});

// Serve static files from the build directory
app.use(express.static(path.join(__dirname, 'build')));
app.use('/data/covers', express.static(path.join(process.cwd(), 'data', 'covers')));
app.use('/data/images', express.static(path.join(process.cwd(), 'data', 'images')));

// Error handler for multipart/form-data upload errors (Multer)
app.use(function (err, req, res, next) {
  try {
    if (err) {
      if (err.name === 'MulterError' || err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_PART_COUNT' || err.code === 'LIMIT_FILE_COUNT') {
        const message = err.message || 'File upload error';
        console.warn('Multer error during upload:', err.code || err.name, err.message);
        return res.status(413).json({ success: false, error: message, code: err.code || err.name });
      }
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

module.exports = app;
