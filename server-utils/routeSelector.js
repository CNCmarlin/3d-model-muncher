/**
 * Route Selector Utility
 * Conditionally loads either legacy JSON/munchie routes OR new database routes
 * based on the useDatabaseBackend feature flag.
 * 
 * Usage in server.js:
 *   const routeSelector = require('./server-utils/routeSelector');
 *   app.use('/api', routeSelector.getModelRoutes());
 */

const { isDatabaseMode, getBackendMode } = require('./configHelper');

/**
 * Get the appropriate model routes based on current backend mode
 * @returns {Router} Express router for model endpoints
 */
function getModelRoutes() {
    if (isDatabaseMode()) {
        console.log('📊 [RouteSelector] Loading DATABASE model routes (models_db.js)');
        try {
            return require('../server/routes/models_db');
        } catch (error) {
            console.warn('⚠️  [RouteSelector] models_db.js not found, falling back to legacy:', error.message);
            return require('../server/routes/models');
        }
    } else {
        console.log('📁 [RouteSelector] Loading LEGACY model routes (legacy/models.js)');
        return require('../server/routes/legacy/models');
    }
}

/**
 * Get the appropriate collection routes based on current backend mode
 * @returns {Router} Express router for collection endpoints
 */
function getCollectionRoutes() {
    if (isDatabaseMode()) {
        console.log('📊 [RouteSelector] Loading DATABASE collection routes (collections_db.js)');
        try {
            return require('../server/routes/collections_db');
        } catch (error) {
            console.warn('⚠️  [RouteSelector] collections_db.js not found, falling back to legacy:', error.message);
            return require('../server/routes/collections');
        }
    } else {
        console.log('📁 [RouteSelector] Loading LEGACY collection routes (collections.js)');
        return require('../server/routes/collections');
    }
}

/**
 * Get the appropriate tag routes based on current backend mode
 * @returns {Router} Express router for tag endpoints
 */
function getTagRoutes() {
    if (isDatabaseMode()) {
        console.log('📊 [RouteSelector] Loading DATABASE tag routes (tags_db.js)');
        try {
            return require('../server/routes/tags_db');
        } catch (error) {
            console.warn('⚠️  [RouteSelector] tags_db.js not found, falling back to legacy:', error.message);
            return require('../server/routes/tags');
        }
    } else {
        console.log('📁 [RouteSelector] Loading LEGACY tag routes (tags.js)');
        return require('../server/routes/tags');
    }
}

/**
 * Get the appropriate collection scanner based on current backend mode
 * @returns {Object} Scanner module
 */
function getCollectionScanner() {
    if (isDatabaseMode()) {
        console.log('📊 [RouteSelector] Loading DATABASE collection scanner (collectionScanner_db.js)');
        try {
            return require('./collectionScanner_db');
        } catch (error) {
            console.warn('⚠️  [RouteSelector] collectionScanner_db.js not found, falling back to legacy:', error.message);
            return require('./collectionScanner');
        }
    } else {
        console.log('📁 [RouteSelector] Loading LEGACY collection scanner (collectionScanner.js)');
        return require('./collectionScanner');
    }
}

/**
 * Log the current backend mode on startup
 */
/**
 * Get the appropriate system routes based on current backend mode
 * @returns {Router} Express router for system endpoints
 */
function getSystemRoutes() {
    // ALWAYS force database system routes, since legacy mode now embeds the DB Migration tab
    // which requires /api/system/wipe-and-scan and other DB endpoints.
    console.log('📊 [RouteSelector] Loading DATABASE system routes (system_db.js)');
    try {
        return require('../server/routes/system_db');
    } catch (error) {
        console.warn('⚠️  [RouteSelector] system_db.js not found, falling back to legacy:', error.message);
        return require('../server/routes/system');
    }
}

/**
 * Get the appropriate admin routes based on current backend mode
 * @returns {Router} Express router for admin endpoints
 */
function getAdminRoutes() {
    if (isDatabaseMode()) {
        console.log('📊 [RouteSelector] Loading DATABASE admin routes (admin_db.js)');
        try {
            return require('../server/routes/admin_db');
        } catch (error) {
            console.warn('⚠️  [RouteSelector] admin_db.js not found, falling back to legacy:', error.message);
            return require('../server/routes/admin');
        }
    } else {
        console.log('📁 [RouteSelector] Loading LEGACY admin routes (admin.js)');
        return require('../server/routes/admin');
    }
}

/**
 * Get the appropriate import routes based on current backend mode
 * @returns {Router} Express router for import endpoints
 */
function getImportRoutes() {
    if (isDatabaseMode()) {
        console.log('📊 [RouteSelector] Loading DATABASE import routes (imports_db.js)');
        try {
            return require('../server/routes/imports_db');
        } catch (error) {
            console.warn('⚠️  [RouteSelector] imports_db.js not found, falling back to legacy:', error.message);
            return require('../server/routes/imports');
        }
    } else {
        console.log('📁 [RouteSelector] Loading LEGACY import routes (imports.js)');
        return require('../server/routes/imports');
    }
}

/**
 * Get the appropriate config routes based on current backend mode
 * @returns {Router} Express router for config endpoints
 */
function getConfigRoutes() {
    if (isDatabaseMode()) {
        console.log('📊 [RouteSelector] Loading DATABASE config routes (config_db.js)');
        return require('../server/routes/config_db');
    }
    console.log('📁 [RouteSelector] Loading Shared Config routes (config.js)');
    return require('../server/routes/config');
}

/**
 * Get the appropriate integrations routes based on current backend mode
 * @returns {Router} Express router for integrations endpoints
 */
function getIntegrationRoutes() {
    if (isDatabaseMode()) {
        console.log('📊 [RouteSelector] Loading DATABASE integration routes (integrations_db.js)');
        return require('../server/routes/integrations_db');
    }
    console.log('📁 [RouteSelector] Loading Shared Integration routes (integrations.js)');
    return require('../server/routes/integrations');
}

function logStartupMode() {
    const mode = getBackendMode();
    const emoji = mode === 'DATABASE' ? '📊' : '📁';
    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log(`${emoji}  3D Model Muncher Backend Mode: ${mode}`);
    console.log('═══════════════════════════════════════════════════');
    console.log('');
}

module.exports = {
    getModelRoutes,
    getCollectionRoutes,
    getTagRoutes,
    getSystemRoutes,
    getAdminRoutes,
    getImportRoutes,
    getConfigRoutes,
    getIntegrationRoutes,
    getCollectionScanner,
    logStartupMode
};
