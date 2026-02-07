const fs = require('fs');
const path = require('path');
const { parseGcode, extractGcodeFrom3MF } = require('../dist-backend/utils/gcodeParser');
const { safeWriteJson } = require('./dataAccess');

/**
 * Service to handle G-code parsing, saving, and metadata updates
 * Extracted from server.js to reduce monolith size.
 */
async function processGcodeRequest({ file, body }, modelsDir) {
    const { modelFilePath, modelFileUrl, storageMode, overwrite, gcodeFilePath } = body;

    // --- Validation ---
    if (!modelFilePath || typeof modelFilePath !== 'string') {
        throw new Error('modelFilePath is required');
    }
    if (!storageMode || !['parse-only', 'save-and-link'].includes(storageMode)) {
        throw new Error('storageMode must be "parse-only" or "save-and-link"');
    }

    let gcodeContent = '';
    let targetGcodePath = null;
    const warnings = [];

    // --- Case 1: Re-analyzing existing G-code file ---
    if (gcodeFilePath && typeof gcodeFilePath === 'string') {
        // Path safety check
        if (gcodeFilePath.includes('..') || path.isAbsolute(gcodeFilePath) || gcodeFilePath.startsWith('//') || /^[a-zA-Z]:[/\\]/.test(gcodeFilePath)) {
            throw new Error('Access denied: invalid G-code file path');
        }

        const resolvedModelsDir = path.resolve(modelsDir);
        const absGcodePath = path.resolve(modelsDir, gcodeFilePath);

        if (!absGcodePath.startsWith(resolvedModelsDir + path.sep) && absGcodePath !== resolvedModelsDir) {
            throw new Error('Access denied: path outside models directory');
        }
        if (!fs.existsSync(absGcodePath)) {
            throw new Error('G-code file not found');
        }

        gcodeContent = fs.readFileSync(absGcodePath, 'utf8');
        targetGcodePath = gcodeFilePath;
    }
    // --- Case 2: New file upload ---
    else if (file && file.buffer) {
        const buffer = file.buffer;
        const originalName = file.originalname || 'upload.gcode';

        // Check if it's a .gcode.3mf file
        if (originalName.toLowerCase().endsWith('.gcode.3mf') || originalName.toLowerCase().endsWith('.3mf.gcode')) {
            try {
                gcodeContent = extractGcodeFrom3MF(buffer);
            } catch (error) {
                throw new Error(`Failed to extract G-code from 3MF: ${error.message}`);
            }
        } else {
            gcodeContent = buffer.toString('utf8');
        }

        // --- Save and Link Logic ---
        if (storageMode === 'save-and-link') {
            const modelPathForGcode = modelFileUrl || modelFilePath;
            let normalizedPath = modelPathForGcode.replace(/^\/models\//, '').replace(/^models\//, '');

            // Path Validation
            if (normalizedPath.includes('..') || /^[a-zA-Z]:[/\\]/.test(normalizedPath) || normalizedPath.startsWith('//')) {
                throw new Error('Access denied: invalid model file path');
            }

            const resolvedModelsDir = path.resolve(modelsDir);
            const absModelPath = path.resolve(modelsDir, normalizedPath);

            if (!absModelPath.startsWith(resolvedModelsDir + path.sep) && absModelPath !== resolvedModelsDir) {
                throw new Error('Access denied: path outside models directory');
            }

            const modelDir = path.dirname(absModelPath);
            const modelBasename = path.basename(absModelPath, path.extname(absModelPath));
            const uploadedName = originalName.toLowerCase();
            const gcodeExtension = uploadedName.endsWith('.gcode.3mf') || uploadedName.endsWith('.3mf.gcode')
                ? '.gcode.3mf' : '.gcode';

            targetGcodePath = path.join(modelDir, `${modelBasename}${gcodeExtension}`);

            // Overwrite Check
            if (fs.existsSync(targetGcodePath) && overwrite !== 'true' && overwrite !== true) {
                return {
                    success: false,
                    fileExists: true,
                    existingPath: path.relative(modelsDir, targetGcodePath).replace(/\\/g, '/')
                };
            }

            // Create Directory
            const targetDir = path.dirname(targetGcodePath);
            if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

            // Write File
            if ((uploadedName.endsWith('.gcode.3mf') || uploadedName.endsWith('.3mf.gcode')) && buffer) {
                fs.writeFileSync(targetGcodePath, buffer);
            } else {
                fs.writeFileSync(targetGcodePath, gcodeContent, 'utf8');
            }

            targetGcodePath = path.relative(modelsDir, targetGcodePath).replace(/\\/g, '/');
        }
    } else {
        throw new Error('No file uploaded or gcodeFilePath provided');
    }

    // --- Parse G-Code Content ---
    let gcodeData;
    try {
        const filenameForParser = targetGcodePath || (file ? file.originalname : 'unknown.gcode');
        gcodeData = parseGcode(gcodeContent, filenameForParser);
    } catch (error) {
        throw new Error(`Failed to parse G-code: ${error.message}`);
    }

    if (targetGcodePath) {
        gcodeData.gcodeFilePath = targetGcodePath;
    }

    // --- Metadata Update ---
    if (storageMode === 'save-and-link' && (modelFilePath || modelFileUrl)) {
        try {
            const pathRef = modelFileUrl || modelFilePath;
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

                // A. Update Print Settings
                if (gcodeData.printSettings) {
                    modelData.printSettings = {
                        ...(modelData.printSettings || {}),
                        ...gcodeData.printSettings
                    };
                    if (!modelData.printSettings.layerHeight) modelData.printSettings.layerHeight = 'Unknown';
                    if (!modelData.printSettings.infill) modelData.printSettings.infill = 'Unknown';
                    if (!modelData.printSettings.nozzle) modelData.printSettings.nozzle = 'Unknown';
                    changed = true;
                }

                // B. Update Top-Level Stats
                if (gcodeData.printTime) {
                    modelData.printTime = gcodeData.printTime;
                    changed = true;
                }
                if (gcodeData.totalFilamentWeight) {
                    modelData.filamentUsed = gcodeData.totalFilamentWeight;
                    changed = true;
                }

                // C. Save Detailed G-code Data
                modelData.gcodeData = gcodeData;
                changed = true;

                if (changed) {
                    // await fs.promises.writeFile(jsonPath, JSON.stringify(modelData, null, 2), 'utf8');
                    // SAFE WRITE: Use retry logic for network shares
                    await safeWriteJson(jsonPath, modelData);
                }
            }
        } catch (err) {
            console.error("[G-code Service] Failed to auto-update model JSON:", err);
            // Don't fail the request, just log
        }
    }

    return {
        success: true,
        gcodeData,
        fileExists: false,
        warnings
    };
}

module.exports = { processGcodeRequest };
