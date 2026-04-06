const fs = require('fs');
const path = require('path');

/**
 * Configuration Helper
 * Centralized utility for determining which backend mode (Legacy vs Database) to use.
 * 
 * Priority Order:
 * 1. Environment Variable: USE_DATABASE_API (true/false)
 * 2. Config File: data/config.json → settings.useDatabaseBackend
 * 3. Default: false (Legacy mode for safety)
 */

let cachedConfig = null;
let configLastRead = 0;
const CACHE_TTL = 5000; // 5 seconds

/**
 * Reads config.json with caching to avoid excessive file I/O
 */
function readConfig() {
    const now = Date.now();
    if (cachedConfig && (now - configLastRead) < CACHE_TTL) {
        return cachedConfig;
    }

    try {
        const configPath = path.join(process.cwd(), 'data', 'config.json');
        const raw = fs.readFileSync(configPath, 'utf8');
        cachedConfig = JSON.parse(raw);
        configLastRead = now;
        return cachedConfig;
    } catch (error) {
        console.warn('[configHelper] Failed to read config.json, using defaults:', error.message);
        return { settings: {} };
    }
}

/**
 * Determines if the application should use the Database backend
 * @returns {boolean} true if using database mode, false if using legacy JSON mode
 */
function isDatabaseMode() {
    // 1. Check environment variable first (highest priority)
    if (process.env.USE_DATABASE_API !== undefined) {
        return process.env.USE_DATABASE_API === 'true';
    }

    // 2. Check config file
    const config = readConfig();
    if (config.settings && typeof config.settings.useDatabaseBackend === 'boolean') {
        return config.settings.useDatabaseBackend;
    }

    // 3. Default to legacy JSON mode (safest)
    return false;
}

/**
 * Gets the current backend mode as a human-readable string
 * @returns {'DATABASE' | 'LEGACY'}
 */
function getBackendMode() {
    return isDatabaseMode() ? 'DATABASE' : 'LEGACY';
}

/**
 * Checks if verbose logging is enabled
 * @returns {boolean}
 */
function shouldLogVerbose() {
    const config = readConfig();
    return !!config?.settings?.verboseScanLogs;
}

/**
 * Conditional logger for Database operations
 * Only logs if verboseScanLogs is true
 * @param {string} msg 
 * @param  {...any} args 
 */
function dbLog(msg, ...args) {
    if (shouldLogVerbose()) {
        console.log(msg, ...args);
    }
}

/**
 * Invalidate the config cache (call this after updating config.json)
 */
function invalidateCache() {
    cachedConfig = null;
    configLastRead = 0;
}

module.exports = {
    isDatabaseMode,
    getBackendMode,
    invalidateCache,
    readConfig,
    shouldLogVerbose,
    dbLog
};

