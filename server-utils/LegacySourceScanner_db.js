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

        const mapped = {
            id: data.id,
            name: data.name || filename.replace(/-munchie\.json$/, ''),
            description: data.description || '',
            tags: Array.isArray(data.tags) ? data.tags : [], // NEW: Map Tags
            isHidden: data.hidden || false,     // Direct Map
            isComponent: type === 'PROJECT_PART', // Derived
            printTime: this._parsePrintTime(data.printTime),
            filamentUsage: this._parseFilamentUsage(data.filamentUsed),
            isPrinted: data.isPrinted || false,
            isFavorite: data.favorite || false, // Note: legacy might call it 'favorite' or 'isFavorite'
            coverImagePath: this._findCoverImage(data, dir),
            pathHash: this._generatePathHash(dir, filename),
            // Complex objects stored in metadata
            metadata: {
                gcodeData: data.gcodeData || null,
                printSettings: data.printSettings || null,
                userDefined: data.userDefined || {},
                related_files: data.related_files || [],
                images: assignedImages,
                gallery: assignedGallery,
                thumbnails: assignedThumbnails
            }
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

    _findCoverImage(data, dir) {
        let candidates = [];

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

            // Prioritize "cover" or "thumbnail" naming? Maybe later. For now, just find one.
            const validImage = files.find(f => {
                const ext = path.extname(f).toLowerCase();
                return imageExtensions.includes(ext) && !f.endsWith('-thumb.png'); // Exclude generated thumbs if possible? Or include them?
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
