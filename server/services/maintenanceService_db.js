const fs = require('fs');
const path = require('path');
const { getAbsoluteModelsPath, protectModelFileWrite, safeWriteJson } = require('../../../server-utils/dataAccess');
const { generateThumbnail } = require('../../../dist-backend/utils/thumbnailGenerator');
const { ConfigManager } = require('../../../dist-backend/utils/configManager');
const { extractEmbeddedThumbnail } = require('../../../server-utils/thumbnailExtraction');

class MaintenanceServiceLegacy {
    constructor() {
        this.activeThumbnailJob = null;
    }

    /**
     * Verify if a file exists and is within models directory
     * @param {string} incomingPath 
     */
    verifyFile(incomingPath) {
        if (!incomingPath || typeof incomingPath !== 'string') throw new Error('Path required');

        let s = incomingPath.trim();
        if (s === '') throw new Error('Empty path');
        if (/^['"].*['"]$/.test(s)) s = s.replace(/^['"]|['"]$/g, '').trim();
        if (s.includes('..')) throw new Error('Path traversal not allowed');
        s = s.replace(/\\/g, '/');
        if (s.startsWith('//')) throw new Error('UNC paths not allowed');
        if (/^[a-zA-Z]:\//.test(s) || /^[a-zA-Z]:\\/.test(incomingPath)) throw new Error('Absolute Windows paths not allowed');
        if (s.startsWith('/')) s = s.substring(1);

        const modelsDir = getAbsoluteModelsPath();
        const candidate = path.join(modelsDir, s);
        const resolved = path.resolve(candidate);
        if (!resolved.startsWith(path.resolve(modelsDir))) throw new Error('Access denied');

        if (!fs.existsSync(resolved)) return { success: true, exists: false, path: s };

        const stat = fs.statSync(resolved);
        return { success: true, exists: true, isFile: stat.isFile(), isDirectory: stat.isDirectory(), size: stat.size, path: s };
    }

    /**
     * Generate thumbnails for models
     */
    async generateThumbnails({ modelIds, force = false, skipEmbedded = false, baseUrl }) {
        if (this.activeThumbnailJob) {
            this.activeThumbnailJob.abort();
        }
        this.activeThumbnailJob = new AbortController();
        const signal = this.activeThumbnailJob.signal;

        try {
            const modelsDir = getAbsoluteModelsPath();
            const config = ConfigManager.loadConfig();
            const globalDefaultColor = config?.settings?.defaultModelColor || config?.defaultModelColor || '#6366f1';

            let processed = 0;
            let errors = [];
            let skipped = 0;
            let targets = [];

            function findTargets(dir) {
                if (signal.aborted) return;

                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        findTargets(fullPath);
                    } else if (entry.name.endsWith('-munchie.json') || entry.name.endsWith('-stl-munchie.json')) {
                        try {
                            const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                            if (modelIds && modelIds.length > 0 && !modelIds.includes(data.id)) continue;

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
                    if (fs.existsSync(thumbPath) && !force) {
                        skipped++;
                        continue;
                    }

                    // [NEW] "Use Embedded" Logic (formerly skipEmbedded)
                    let extractionSuccess = false;
                    let finalThumbPath = thumbPath; // Default to standard -thumb.png

                    if (skipEmbedded) {
                        const isStl = target.sourcePath.toLowerCase().endsWith('.stl');
                        // STLs don't have embedded thumbnails.

                        if (!isStl) {
                            const embeddedName = path.basename(target.sourcePath) + '-embedded-thumb.png';
                            const embeddedPath = path.join(path.dirname(target.sourcePath), embeddedName);

                            // Try to extract embedded thumbnail
                            try {
                                extractionSuccess = await extractEmbeddedThumbnail(target.sourcePath, embeddedPath);
                                if (extractionSuccess) {
                                    if (fs.existsSync(embeddedPath)) {
                                        finalThumbPath = embeddedPath;
                                    } else {
                                        extractionSuccess = false;
                                    }
                                }
                            } catch (err) {
                                console.warn(`    -> Failed to extract embedded thumb for ${path.basename(target.sourcePath)}:`, err.message);
                                extractionSuccess = false;
                            }
                        }
                    }

                    if (!extractionSuccess) {
                        const modelColor = target.data.userDefined?.color || target.data.color || globalDefaultColor;
                        await generateThumbnail(target.sourcePath, thumbPath, baseUrl, modelColor, modelsDir, signal);
                        finalThumbPath = thumbPath;
                    }

                    const relativeThumbUrl = '/models/' + path.relative(modelsDir, finalThumbPath).replace(/\\/g, '/');

                    let json = target.data;
                    let changed = false;
                    if (!json.images) json.images = [];
                    if (!json.images.includes(relativeThumbUrl)) {
                        json.images.unshift(relativeThumbUrl);
                        changed = true;
                    }

                    // If we extracted an embedded one, ensure it's set as the userDefined thumbnail to take precedence immediately
                    if (extractionSuccess) {
                        if (!json.userDefined) json.userDefined = {};
                        // Find the index of our new image to set the pointer correctly (e.g. "parsed:0")
                        // But finding the exact index in 'parsedImages' + 'images' hybrid in the frontend is tricky.
                        // For the backend, 'images' is the source of truth for local images.
                        json.userDefined.thumbnail = relativeThumbUrl;
                        // Note: Frontend usually expects "parsed:X" or a URL. URL works too in most updated views.
                        changed = true;
                    }

                    if (changed) {
                        const safeTarget = protectModelFileWrite(target.jsonPath);
                        await safeWriteJson(safeTarget, json);
                    }

                    processed++;
                    consecutiveErrors = 0;
                } catch (err) {
                    if (err.message && err.message.includes('cancelled')) break;
                    console.error("Thumbnail error:", err);
                    errors.push({ id: target.data.id, error: err.message });
                    consecutiveErrors++;
                }
            }

            this.activeThumbnailJob = null;
            return {
                success: true,
                processed,
                skipped,
                errors,
                aborted: signal.aborted || consecutiveErrors >= MAX_CONSECUTIVE_ERRORS
            };

        } catch (error) {
            this.activeThumbnailJob = null;
            if (error.message && error.message.includes('cancelled')) {
                return { success: false, aborted: true, message: 'Cancelled by user' };
            }
            throw error;
        }
    }
}

module.exports = new MaintenanceServiceLegacy();
