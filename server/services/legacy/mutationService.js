const fs = require('fs');
const path = require('path');
const { getAbsoluteModelsPath, protectModelFileWrite, safeWriteJson, loadCollections, saveCollections } = require('../../../server-utils/dataAccess');

// Helper to load ProjectService dynamically or statically
let ProjectService = null;
try {
    const projectModule = require('../../../dist-backend/utils/ProjectService');
    ProjectService = projectModule.ProjectService || projectModule.default;
} catch (e) {
    console.warn('ProjectService not found, uploadDocument may fail.');
}

class MutationServiceLegacy {

    // Helper: Normalize Tags
    normalizeTags(tags) {
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

    // Helper: Normalize Related Files
    normalizeRelatedFiles(arr) {
        const cleaned = [];
        const rejected = [];
        if (!Array.isArray(arr)) return { cleaned, rejected };
        const seen = new Set();
        for (let raw of arr) {
            if (typeof raw !== 'string') continue;
            let s = raw.trim();
            if (s === '' || s.includes('..')) { rejected.push(raw); continue; }
            s = s.replace(/\\/g, '/');
            if (s.startsWith('//') || /^[a-zA-Z]:\//.test(s)) { rejected.push(raw); continue; }
            if (s.startsWith('/')) s = s.substring(1);
            const key = s.toLowerCase();
            if (!seen.has(key)) { seen.add(key); cleaned.push(s); }
        }
        return { cleaned, rejected };
    }

    /**
     * Create a new model folder
     */
    async createModelFolder(folder) {
        if (!folder || typeof folder !== 'string' || folder.trim() === '') throw new Error('No folder provided');

        const modelsDir = getAbsoluteModelsPath();
        let candidate = folder.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        const target = path.resolve(modelsDir, candidate);

        if (!target.startsWith(modelsDir)) throw new Error('Invalid folder path');

        if (fs.existsSync(target)) return { success: true, created: false, path: path.relative(modelsDir, target).replace(/\\/g, '/') };

        fs.mkdirSync(target, { recursive: true });
        return { success: true, created: true, path: path.relative(modelsDir, target).replace(/\\/g, '/') };
    }

    /**
     * Upload Document / Project Assets
     */
    /**
     * Upload Documents / Project Assets (Batch)
     */
    async uploadDocuments(modelId, filePath, files) {
        if (!ProjectService) throw new Error('ProjectService utility not found.');

        const modelsBaseDir = getAbsoluteModelsPath();
        const relativeFolder = path.dirname(filePath);
        const absoluteTargetDir = path.join(modelsBaseDir, relativeFolder);

        if (!fs.existsSync(absoluteTargetDir)) fs.mkdirSync(absoluteTargetDir, { recursive: true });

        // Process all files
        const fileArray = Array.isArray(files) ? files : [files];

        for (const file of fileArray) {
            const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
            const filename = `${Date.now()}_${safeName}`;
            const targetPath = path.join(absoluteTargetDir, filename);
            fs.writeFileSync(targetPath, file.buffer);
        }

        const allFiles = fs.readdirSync(absoluteTargetDir).filter(f => f.endsWith('.stl') || f.endsWith('.3mf'));

        const updatedData = await ProjectService.finalizeProject({
            mode: 'generic',
            destDir: absoluteTargetDir,
            modelsRoot: modelsBaseDir,
            importedFiles: allFiles,
            meta: {
                id: modelId,
                name: path.basename(absoluteTargetDir)
            }
        });

        return { success: true, model: updatedData };
    }

    /**
     * Save Model (Update Metadata with Parity Logic)
     */
    async saveModel(data) {
        const modelsDir = getAbsoluteModelsPath();
        let { id, filePath, changes } = data;

        // FIX: If 'changes' is missing, assume 'data' itself contains the updates (flat structure)
        if (!changes && (data.tags || data.userDefined || data.related_files || data.description)) {
            changes = { ...data };
            delete changes.id;
            delete changes.filePath;
        }

        // ID Lookup Logic (Parity with Legacy PATCH)
        if (!filePath && id) {
            const { findById } = require('../../../server-utils/legacyFinder');
            const found = findById(modelsDir, id);
            if (!found) throw new Error('Model not found');
            // filePath is relative path expecting forward slashes
            filePath = path.relative(modelsDir, found).replace(/\\/g, '/');
        }

        if (!filePath) {
            console.error(`[MutationService] ID lookup failed for ID: ${id}. Search Root: ${modelsDir}`);
            throw new Error(`Missing File Path (and ID lookup failed or not provided) - ID: ${id}`);
        }

        let absoluteFilePath = path.join(modelsDir, filePath);

        // FIX: If absoluteFilePath points to a model file, resolve its munchie JSON sidecar
        if (filePath.toLowerCase().endsWith('.stl')) {
            absoluteFilePath = path.join(path.dirname(absoluteFilePath), path.basename(absoluteFilePath).replace(/\.stl$/i, '-stl-munchie.json'));
        } else if (filePath.toLowerCase().endsWith('.3mf')) {
            absoluteFilePath = path.join(path.dirname(absoluteFilePath), path.basename(absoluteFilePath).replace(/\.3mf$/i, '-munchie.json'));
        } else if (!filePath.toLowerCase().endsWith('.json')) {
            // Fallback for other extensions
            absoluteFilePath = path.join(path.dirname(absoluteFilePath), path.basename(absoluteFilePath) + '-munchie.json');
        }

        if (!fs.existsSync(absoluteFilePath)) {
            // If the JSON doesn't exist, check if the raw model file exists? 
            // Actually, we expect the metadata to exist for a promotion.
            // But if we generated the path wrong, throw.
            throw new Error(`Model metadata file not found at ${absoluteFilePath}`);
        }


        const existing = JSON.parse(fs.readFileSync(absoluteFilePath, 'utf8'));

        // Deep clone changes to avoid mutation source
        let cleanChanges = JSON.parse(JSON.stringify(changes || {}));

        // Tag Normalization
        if (cleanChanges.tags) {
            // FIX: Handle Delta (add/remove object) from Bulk Edit
            if (!Array.isArray(cleanChanges.tags) && typeof cleanChanges.tags === 'object' && (cleanChanges.tags.add || cleanChanges.tags.remove)) {
                const currentTags = new Set(Array.isArray(existing.tags) ? existing.tags : []);
                if (Array.isArray(cleanChanges.tags.add)) cleanChanges.tags.add.forEach(t => currentTags.add(t));
                if (Array.isArray(cleanChanges.tags.remove)) cleanChanges.tags.remove.forEach(t => currentTags.delete(t));
                cleanChanges.tags = Array.from(currentTags);
            }
            cleanChanges.tags = this.normalizeTags(cleanChanges.tags);
        }

        // Related Files Normalization
        if (cleanChanges.related_files) {
            const nf = this.normalizeRelatedFiles(cleanChanges.related_files);
            cleanChanges.related_files = nf.cleaned;
            // rejected files silently ignored in legacy, or we could log them
        }

        // User Defined Normalization
        try {
            if (cleanChanges.userDefined) {
                if (Array.isArray(cleanChanges.userDefined) && cleanChanges.userDefined.length > 0) {
                    cleanChanges.userDefined = cleanChanges.userDefined[0];
                } else if (typeof cleanChanges.userDefined === 'object' && cleanChanges.userDefined['0']) {
                    const zero = cleanChanges.userDefined['0'] || {};
                    const normalized = { ...zero, ...cleanChanges.userDefined };
                    delete normalized['0'];
                    cleanChanges.userDefined = normalized;
                }
            }
        } catch (e) { }

        // Project Root Handling (Demotion)
        if (cleanChanges.isProjectRoot === true) {
            const parentDir = path.dirname(absoluteFilePath);
            try {
                const peers = fs.readdirSync(parentDir).filter(f => f.endsWith('munchie.json') && path.join(parentDir, f) !== absoluteFilePath);
                for (const p of peers) {
                    const pPath = path.join(parentDir, p);
                    const pData = JSON.parse(fs.readFileSync(pPath, 'utf8'));
                    if (pData.isProjectRoot) {
                        pData.isProjectRoot = false;
                        pData.isRelatedPart = true;
                        pData.hidden = true;
                        if (pData.thumbnail) delete pData.thumbnail;
                        fs.writeFileSync(pPath, JSON.stringify(pData, null, 2));
                    }
                }
            } catch (e) { console.warn("Demotion failed", e); }
        }

        const updated = { ...existing, ...cleanChanges };
        updated.lastModified = new Date().toISOString();

        const safeTarget = protectModelFileWrite(absoluteFilePath);
        await safeWriteJson(safeTarget, updated);

        // --- FIX: Robust Collection Sync ---
        // Ensure the parent collection is aware of the new main model and correct IDs.
        try {
            const { refreshProjectInCollection } = require('../../../server-utils/collectionScanner');
            const dataDir = path.join(process.cwd(), 'data');
            const collectionsPath = path.join(dataDir, 'collections.json');
            // We use the parent directory of the modified file (which is the project folder)
            const projectDir = path.dirname(absoluteFilePath);

            refreshProjectInCollection(projectDir, modelsDir, collectionsPath);
        } catch (e) {
            console.warn("[MutationService] Collection refresh failed:", e);
        }

        return { success: true, refreshedModel: updated };
    }

    /**
     * Update Model Metadata (Simpler generic update)
     */
    async updateMetadata(filePath, updates) {
        const modelsDir = getAbsoluteModelsPath();
        const absoluteModelPath = path.join(modelsDir, filePath);
        const dirName = path.dirname(absoluteModelPath);
        let jsonPath;

        if (baseName.toLowerCase().endsWith('.stl')) {
            jsonPath = path.join(dirName, baseName.replace(/\.stl$/i, '-stl-munchie.json'));
        } else if (baseName.toLowerCase().endsWith('.3mf')) {
            jsonPath = path.join(dirName, baseName.replace(/\.3mf$/i, '-munchie.json'));
        } else {
            jsonPath = path.join(dirName, baseName + '-munchie.json');
        }

        if (!fs.existsSync(jsonPath)) throw new Error('Metadata file not found');

        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (!data.userDefined) data.userDefined = {};
        Object.assign(data.userDefined, updates);
        fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');

        return { success: true, model: data };
    }

    /**
     * Bulk Update Models
     */
    async bulkUpdateModels(ids, updates) {
        let successCount = 0;
        let failCount = 0;
        const errors = [];

        // If moveFiles is requested (collection update)
        // We might need special logic, but for now we just rely on saveModel handling collection ID updates
        // Note: Legacy saveModel doesn't automatically move files on disk unless we implement that logic there or here.
        // For phase 1 parity, we'll assume updates are metadata only or simple collection tagging.
        // If physical move is needed, that logic should be in saveModel or a separate move service.

        // Simple iteration to re-use existing save logic
        for (const id of ids) {
            try {
                await this.saveModel({ id, changes: updates });
                successCount++;
            } catch (e) {
                console.error(`Failed to update model ${id}:`, e);
                failCount++;
                errors.push({ id, error: e.message });
            }
        }

        return { success: true, successCount, failCount, errors };
    }
}

module.exports = new MutationServiceLegacy();
