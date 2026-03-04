const fs = require('fs');
const path = require('path');

/**
 * @typedef {Object} LegacyEntity
 * @property {string} id
 * @property {string} name
 * @property {string} type - 'PROJECT_ROOT' | 'PROJECT_PART' | 'LOOSE_MODEL'
 * @property {string} filePath - Path to the munchie.json
 * @property {string} folderPath - Path to the containing folder
 * @property {Object} data - The raw JSON content
 * @property {string} [parentId] - ID of the parent project (if PART)
 * @property {string[]} [warnings] - List of consistency warnings found during scan
 * @property {Object} mapped - The mapped data ready for DB comparison
 */

class LegacySourceScanner {
    constructor(modelsDir) {
        this.modelsDir = modelsDir;
        this.entities = [];
        this.projectMap = new Map(); // path -> projectId
    }

    /**
     * Main Entry Point
     * @returns {Promise<LegacyEntity[]>}
     */
    async scan() {
        console.log(`[Scanner] Starting Legacy Scan on: ${this.modelsDir}`);
        this.entities = [];
        this.projectMap.clear();

        await this._scanRecursive(this.modelsDir);

        // Post-Processing: Link Parts to Roots
        this._linkProjectParts();

        return this.entities;
    }

    /**
     * Recursive directory walker
     * @param {string} currentDir 
     */
    async _scanRecursive(currentDir) {
        let entries;
        try {
            entries = fs.readdirSync(currentDir, { withFileTypes: true });
        } catch (e) {
            console.error(`[Scanner] Failed to read ${currentDir}: ${e.message}`);
            return;
        }

        // 1. Detect if this is a "Project Folder" (Marked by project.json OR if we want to infer it later)
        // For strict parity, we rely on munchie data primarily, but folder context helps.
        const isProjectFolder = fs.existsSync(path.join(currentDir, 'project.json'));

        // 2. Scan for munchie files
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (!entry.name.startsWith('.')) {
                    await this._scanRecursive(path.join(currentDir, entry.name));
                }
            } else if (entry.name.endsWith('munchie.json') && entry.name !== 'project.json') {
                this._processMunchieFile(currentDir, entry.name, isProjectFolder);
            }
        }
    }

    /**
     * Process a single JSON file
     */
    _processMunchieFile(dir, filename, isProjectFolder) {
        const fullPath = path.join(dir, filename);
        let data;
        try {
            const raw = fs.readFileSync(fullPath, 'utf8');
            data = JSON.parse(raw);
        } catch (e) {
            console.warn(`[Scanner] Invalid JSON: ${fullPath}`);
            return;
        }

        if (!data.id) return;

        // Determine Type
        let type = 'LOOSE_MODEL';

        if (data.isProjectRoot === true) {
            type = 'PROJECT_ROOT';
            this.projectMap.set(dir, data.id); // Register this folder as belonging to this ProjectID
        }
        else if (data.isRelatedPart === true) {
            type = 'PROJECT_PART';
        }
        else if (isProjectFolder && !data.isProjectRoot) {
            // Implicit assignment if inside a marked project folder
            type = 'PROJECT_PART';
        }

        // --- EXTENSION COLLISION DETECTION ---
        // Mirror heal function logic: detect if a sibling munchie exists for the same
        // baseName but different extension (e.g. cam_bed-munchie.json + cam_bed-stl-munchie.json)
        const isExplicitStl = filename.toLowerCase().includes('-stl-munchie.json');
        const munchieBaseName = filename.replace(/(-stl)?-munchie\.json$/i, '');

        const folderMunchies = fs.readdirSync(dir)
            .filter(f => f.endsWith('munchie.json') && !f.endsWith('.bak') && f !== 'project.json');

        const hasExtensionSibling = folderMunchies.some(f => {
            if (f === filename) return false; // skip self
            const otherBase = f.replace(/(-stl)?-munchie\.json$/i, '');
            return otherBase.toLowerCase() === munchieBaseName.toLowerCase();
        });

        // --- NAME RECOVERY ---
        // Fix models stuck with default "New Model" name from createInitialModelMetadata.
        let resolvedName = data.name || munchieBaseName;
        if (resolvedName === 'New Model' && data.filePath) {
            resolvedName = path.basename(data.filePath, path.extname(data.filePath));
        }

        // --- NAME DISAMBIGUATION ---
        if (hasExtensionSibling && data.filePath) {
            const ext = path.extname(data.filePath).replace('.', '').toUpperCase();
            const baseName = path.basename(data.filePath, path.extname(data.filePath));
            // Only disambiguate if name matches baseName (avoid clobbering user-edited names)
            if (resolvedName === baseName || resolvedName === munchieBaseName) {
                resolvedName = `${baseName} (${ext})`;
            }
        }

        // Map Fields for Parity Check
        const galleryAssets = this._scanGalleryAssets(dir);

        // [FIX] For LOOSE_MODELs, we must NOT assign the entire folder's gallery (orphans) 
        // because multiple loose models share the same folder. 
        // They should only "own" images explicitly named after them (thumbnails) 
        // or their user-defined assignments.
        let assignedGallery = galleryAssets.gallery;
        let assignedImages = galleryAssets.images;
        let assignedThumbnails = galleryAssets.thumbnails;

        if (type === 'LOOSE_MODEL') {
            assignedGallery = [];
            assignedImages = [];
        } else if (type === 'PROJECT_ROOT') {
            // [FIX] PROJECT_ROOT should show the general gallery and generic images,
            // but it should NOT claim the specific thumbnails of its sub-components (parts).
            // Sub-components will claim their own thumbnails when they are processed.
            assignedThumbnails = {};
        }

        // Ensure backward compatible modelUrl mapping
        let modelUrl = data.modelUrl || data.filePath || null;
        if (modelUrl) {
            modelUrl = modelUrl.replace(/\\/g, '/');
            if (modelUrl.startsWith('models/')) modelUrl = '/' + modelUrl;
            if (!modelUrl.startsWith('/models/')) modelUrl = '/models/' + modelUrl;
        }

        const mapped = {
            id: data.id,
            name: resolvedName,
            // Promoted columns (Batch 1)
            category: data.category || null,
            modelUrl: modelUrl,
            price: typeof data.price === 'number' ? data.price : null,
            // Promoted columns (Batch 2 - print settings)
            layerHeight: data.printSettings?.layerHeight || null,
            infill: data.printSettings?.infill || null,
            nozzle: data.printSettings?.nozzle || null,
            printer: data.printSettings?.printer || null,
            material: data.printSettings?.material || null,
            fileSize: data.fileSize || null,
            description: data.description || '',
            source: data.source || null,
            notes: data.notes || null,
            tags: Array.isArray(data.tags) ? data.tags : [], // NEW: Map Tags
            isHidden: (type === 'LOOSE_MODEL' && dir.replace(/\\/g, '/') === this.modelsDir.replace(/\\/g, '/')) ? false : (data.hidden || false),
            isComponent: type === 'PROJECT_PART', // Derived
            printTime: this._parsePrintTime(data.printTime),
            filamentUsage: this._parseFilamentUsage(data.filamentUsed),
            // Promoted from metadata (Batch 3 - G-code Analysis)
            gcodeFilePath: data.gcodeData?.gcodeFilePath || null,
            gcodePrintTime: data.gcodeData?.printTime || null,
            gcodeTotalWeight: data.gcodeData?.totalFilamentWeight || null,
            gcodeFilaments: data.gcodeData?.filaments ? JSON.stringify(data.gcodeData.filaments) : null,
            isPrinted: data.isPrinted || false,
            isFavorite: data.favorite || false, // Note: legacy might call it 'favorite' or 'isFavorite'
            thumbnailPath: this._findCoverImage(data, dir, { isExplicitStl, munchieBaseName }),  // Maps to `thumbnail_path` column
            pathHash: this._generatePathHash(dir, filename),
            // Complex objects stored in metadata (only userDefined remains after Batch 6)
            metadata: {
                userDefined: data.userDefined || {}
            },
            // Promoted data passed as top-level for MigrationEngine linking
            _relatedFiles: data.related_files || [],
            _images: assignedImages,
            _gallery: assignedGallery,
            _thumbnails: assignedThumbnails
        };

        const entity = {
            id: data.id,
            name: mapped.name,
            type: type,
            filePath: fullPath,
            folderPath: dir,
            data: data,
            mapped: mapped,
            warnings: []
        };

        this.entities.push(entity);
    }

    /**
     * Second Pass: Connect Orphans
     */
    _linkProjectParts() {
        for (const entity of this.entities) {
            if (entity.type === 'PROJECT_PART') {
                const rootId = this.projectMap.get(entity.folderPath);

                if (rootId) {
                    entity.parentId = rootId;
                    entity.mapped.collectionId = null; // Will be assigned by Root's collection logic
                } else {
                    entity.warnings.push('Orphaned Part: Inside a folder with no marked Project Root');
                }
            }
        }
    }

    // --- Helpers ---

    _parsePrintTime(timeInput) {
        if (timeInput === undefined || timeInput === null) return 0;
        if (typeof timeInput === 'number') return timeInput;

        const timeStr = String(timeInput);

        // Check if it's just a number in string form
        const pureNumber = parseFloat(timeStr);
        if (!isNaN(pureNumber) && /^\d+(\.\d+)?$/.test(timeStr)) {
            return pureNumber;
        }

        // Format: "1h 42m 23s"
        let totalSeconds = 0;
        const h = timeStr.match(/(\d+)h/);
        const m = timeStr.match(/(\d+)m/);
        const s = timeStr.match(/(\d+)s/);

        if (h) totalSeconds += parseInt(h[1]) * 3600;
        if (m) totalSeconds += parseInt(m[1]) * 60;
        if (s) totalSeconds += parseInt(s[1]);

        return totalSeconds;
    }

    _parseFilamentUsage(filamentInput) {
        if (filamentInput === undefined || filamentInput === null) return 0.0;
        if (typeof filamentInput === 'number') return filamentInput;

        const filamentStr = String(filamentInput);
        // Format: "14.17g"
        const clean = filamentStr.replace('g', '').trim();
        const val = parseFloat(clean);
        return isNaN(val) ? 0.0 : val;
    }

    _findCoverImage(data, dir, extContext = {}) {
        const { isExplicitStl, munchieBaseName } = extContext;
        let candidates = [];

        // 0. PRIORITY: Try extension-matched thumbnail first
        // e.g. cam_bed.stl -> cam_bed.stl-thumb.png, cam_bed.3mf -> cam_bed.3mf-thumb.png
        if (data.filePath) {
            const modelFile = path.basename(data.filePath);
            const expectedThumb = `${modelFile}-thumb.png`;
            const thumbPath = path.join(dir, expectedThumb);
            if (fs.existsSync(thumbPath) && fs.statSync(thumbPath).isFile()) {
                return path.relative(this.modelsDir, thumbPath).replace(/\\/g, '/');
            }

            // Also check for embedded thumb
            const baseName = path.basename(data.filePath, path.extname(data.filePath));
            const embeddedThumb = `${baseName}-embedded-thumb.png`;
            const embeddedPath = path.join(dir, embeddedThumb);
            if (fs.existsSync(embeddedPath) && fs.statSync(embeddedPath).isFile()) {
                return path.relative(this.modelsDir, embeddedPath).replace(/\\/g, '/');
            }
        }

        // 1. Gather Candidate Paths from JSON
        if (data.coverImage) candidates.push(data.coverImage);
        if (data.userDefined?.thumbnail && !data.userDefined.thumbnail.startsWith('parsed:')) {
            candidates.push(data.userDefined.thumbnail);
        }
        if (data.parsedImages && Array.isArray(data.parsedImages)) {
            candidates.push(...data.parsedImages);
        }

        // Helper to resolve and verify file existence
        const tryResolve = (candidate) => {
            if (!candidate) return null;

            // Extension filtering: don't resolve thumbnails belonging to the other extension variant
            if (munchieBaseName) {
                const candFile = path.basename(candidate).toLowerCase();
                // If we're the STL munchie, skip 3MF resources (.3mf thumbs or embedded thumbs)
                if (isExplicitStl && (candFile.includes('.3mf') || candFile.includes('-embedded-thumb'))) return null;
                // If we're the non-STL munchie, skip .stl thumbnails (when sibling exists)
                if (!isExplicitStl && extContext.munchieBaseName && candFile.includes('.stl')) {
                    // Only skip if there's actually a STL sibling
                    const hasStlSibling = fs.readdirSync(dir).some(f =>
                        f.toLowerCase().includes('-stl-munchie.json') &&
                        f.replace(/(-stl)?-munchie\.json$/i, '').toLowerCase() === munchieBaseName.toLowerCase()
                    );
                    if (hasStlSibling) return null;
                }
            }

            // Strategy A: Direct Join (Relative to Folder)
            let absPath = path.join(dir, candidate);
            if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) return absPath;

            // Strategy B: Absolute URL path (e.g. /models/foo/bar.jpg) -> Convert to File System Path
            // Remove '/models/' prefix if present
            const cleanCandidate = candidate.replace(/^(\/|\\)models(\/|\\)/i, '');
            // Only try if it looks like it might be relative to models root
            const absFromRoot = path.join(this.modelsDir, cleanCandidate);
            if (fs.existsSync(absFromRoot) && fs.statSync(absFromRoot).isFile()) return absFromRoot;

            // Strategy B2: Basename in local folder (Common for moved files)
            const baseName = path.basename(candidate);
            const absBase = path.join(dir, baseName);
            if (fs.existsSync(absBase) && fs.statSync(absBase).isFile()) return absBase;

            return null;
        };

        // 2. Try to resolve candidates
        for (const cand of candidates) {
            const result = tryResolve(cand);
            if (result) {
                return path.relative(this.modelsDir, result).replace(/\\/g, '/');
            }
        }

        // 3. FALLBACK: Scan folder for ANY valid image
        try {
            const files = fs.readdirSync(dir);
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

            const validImage = files.find(f => {
                const ext = path.extname(f).toLowerCase();
                return imageExtensions.includes(ext) && !f.endsWith('-thumb.png');
            });

            if (validImage) {
                const absPath = path.join(dir, validImage);
                return path.relative(this.modelsDir, absPath).replace(/\\/g, '/');
            }
        } catch (e) { }

        return null; // No image found
    }

    _generatePathHash(dir, filename) {
        const full = path.join(dir, filename);
        return Buffer.from(full).toString('base64');
    }

    /**
     * Scans for all valid image files and categorizes them into:
     * - thumbnails: Strictly linked to a specific model file (e.g. Door.stl-thumb.png -> Door.stl)
     * - gallery: General images (orphans, covers, prints)
     * - images: All images (legacy flat list)
     */
    _scanGalleryAssets(dir) {
        const result = {
            images: [],
            gallery: [],
            thumbnails: {}
        };

        try {
            const files = fs.readdirSync(dir);
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

            // Filter valid images
            const imageFiles = files.filter(f => imageExtensions.includes(path.extname(f).toLowerCase()));

            for (const file of imageFiles) {
                const absPath = path.join(dir, file);
                const relPath = path.relative(this.modelsDir, absPath).replace(/\\/g, '/');

                // Add to legacy list
                result.images.push(relPath);

                let isThumbnail = false;
                const lower = file.toLowerCase();

                // 1. Functional Thumbnails (Generated): [filename]-thumb.png
                // Strict check: The prefix MUST exist as a file in the directory
                if (lower.endsWith('-thumb.png') && !lower.endsWith('-embedded-thumb.png')) {
                    // Extract potential source file name (case-insensitive search in directory)
                    const sourceName = file.substring(0, file.length - '-thumb.png'.length);
                    // Check if source exists (exact match preferred, but finding the actual casing if inaccurate)
                    const actualSource = files.find(f => f.toLowerCase() === sourceName.toLowerCase());

                    if (actualSource) {
                        if (!result.thumbnails[actualSource]) result.thumbnails[actualSource] = [];
                        result.thumbnails[actualSource].push(relPath);
                        isThumbnail = true;
                    }
                }

                // 2. Embedded Thumbnails: [basename]-embedded-thumb.png
                // Only valid for .3mf files
                if (!isThumbnail && lower.endsWith('-embedded-thumb.png')) {
                    const baseName = file.substring(0, file.length - '-embedded-thumb.png'.length);
                    // Look for [baseName].3mf
                    const candidate3mf = files.find(f => f.toLowerCase() === (baseName + '.3mf').toLowerCase());

                    if (candidate3mf) {
                        if (!result.thumbnails[candidate3mf]) result.thumbnails[candidate3mf] = [];
                        result.thumbnails[candidate3mf].push(relPath);
                        isThumbnail = true;
                    }
                }

                // 3. Gallery (Orphans)
                if (!isThumbnail) {
                    result.gallery.push(relPath);
                }
            }

            return result;
        } catch (e) {
            console.warn(`[Scanner] Gallery scan failed for ${dir}:`, e.message);
            return result;
        }
    }
}

module.exports = LegacySourceScanner;
