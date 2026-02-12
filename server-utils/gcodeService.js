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

    // --- Metadata Update (SKIPPED) ---
    // We do NOT update the JSON here because the frontend (useGcodeHandler) will 
    // immediately call /api/save-model with the new data.
    // Doing it here creates a race condition where the file is being written to 
    // twice simultaneously, leading to potential corruption or empty reads during scans.

    // if (storageMode === 'save-and-link' && (modelFilePath || modelFileUrl)) { ... }

    return {
        success: true,
        gcodeData,
        fileExists: false,
        warnings
    };
}

module.exports = { processGcodeRequest };
