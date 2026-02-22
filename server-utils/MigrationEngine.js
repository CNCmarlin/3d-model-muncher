const LegacySourceScanner = require('./LegacySourceScanner_db');
const prisma = require('./db');
const { getAbsoluteModelsPath } = require('./dataAccess');
const path = require('path');
const fs = require('fs');

/**
 * Migration Engine
 * Orchestrates the "Extract", "Transform", and "Load" (Verify/Execute) phases.
 */

class MigrationEngine {
    constructor() {
        this.modelsDir = getAbsoluteModelsPath();
        this.scanner = new LegacySourceScanner(this.modelsDir);
        this.appsDir = path.dirname(this.modelsDir); // Assuming 3d-model-muncher root
        this.errorLogPath = path.join(process.cwd(), 'migration_errors.log');
        this.stats = {
            models: { created: 0, updated: 0, skipped: 0 },
            collections: { created: 0, updated: 0, skipped: 0 },
            files: { created: 0, skipped: 0 },
            warnings: [],
            discrepancies: [] // New: Structural differences
        };
    }

    _initErrorLog() {
        try {
            fs.writeFileSync(this.errorLogPath, `[${new Date().toISOString()}] Migration Error Log Initialized\n==================================================\n`);
        } catch (e) {
            console.error('[MigrationEngine] Failed to initialize error log:', e);
        }
    }

    _logError(type, entityName, message, error = null) {
        const timestamp = new Date().toISOString();
        const errStack = error ? `\nStack: ${error.stack}` : '';
        const logEntry = `[${timestamp}] [${type}] [${entityName}]\nMessage: ${message}${errStack}\n--------------------------------------------------\n`;

        try {
            fs.appendFileSync(this.errorLogPath, logEntry);
        } catch (e) {
            console.error('[MigrationEngine] Failed to write to error log:', e);
        }
    }

    /**
     * Run the Migration (Dry Run or Execute)
     * @param {boolean} dryRun 
     */
    async run(dryRun = true) {
        console.log(`[MigrationEngine] Starting Run (DryRun: ${dryRun})`);

        if (!dryRun) {
            this._initErrorLog();
            console.log(`[MigrationEngine] logging errors to: ${this.errorLogPath}`);
        }

        // --- STEP 1: SCAN COLLECTIONS (Using Legacy Logic for Parity) ---
        const collectionScanner = require('./collectionScanner');
        const expectedCollections = collectionScanner.generateCollections(this.modelsDir, this.modelsDir, { strategy: 'strict' });

        console.log(`[MigrationEngine] Scanned ${expectedCollections.length} expected collections.`);

        // --- STEP 2: SCAN MODELS (Using Strict Logic) ---
        const sourceEntities = await this.scanner.scan();
        console.log(`[MigrationEngine] Scanned ${sourceEntities.length} model entities.`);

        // --- STEP 3: PREPARE STATS STRUCTURE ---
        this.stats = {
            summary: {
                totalModels: sourceEntities.length,
                totalCollections: expectedCollections.length,
                totalFiles: 0,
                // Comparative Stats (Source vs Target)
                legacy: {
                    withTags: 0,
                    withDescription: 0,
                    withPrintTime: 0,
                    withFilament: 0,
                    hidden: 0,
                    favorites: 0,
                    projectRoots: 0,
                    projectParts: 0
                },
                // Dry Run Projection (What WILL be)
                dryRun: {
                    withTags: 0,
                    withDescription: 0,
                    withPrintTime: 0,
                    withFilament: 0,
                    hidden: 0,
                    favorites: 0,
                    projectRoots: 0,
                    projectParts: 0
                },
                // Current DB Context (What IS)
                current: {
                    withTags: 0,
                    withDescription: 0,
                    withPrintTime: 0,
                    withFilament: 0,
                    hidden: 0,
                    favorites: 0,
                    projectRoots: 0,
                    projectParts: 0
                }
            },
            deltas: {
                // Stores arrays of { name, id, reason } for drill-down
                withTags: [],
                withDescription: [],
                withPrintTime: [],
                withFilament: [],
                hidden: [],
                favorites: [],
                projectRoots: [],
                projectParts: []
            },
            actions: {
                models: { created: 0, updated: 0, skipped: 0 },
                collections: { created: 0, updated: 0, skipped: 0 },
                files: { created: 0, skipped: 0 }
            },
            critical: [], // Missing files, corrupted data
            warnings: [], // Minor issues
            transformations: [] // "Hidden field moved", "Tag updated"
        };

        // --- STEP 4: PROCESS COLLECTIONS ---
        // Fix: CollectionScanner returns children before parents (post-order). 
        // We must reverse to ensure parents exist before children (pre-order).
        const sortedCollections = [...expectedCollections].reverse();
        for (const col of sortedCollections) {
            if (dryRun) {
                this.stats.actions.collections.created++;
            } else {
                await this._ensureCollection(col);
            }
        }

        // --- STEP 5: PROCESS MODELS ---
        for (const entity of sourceEntities) {
            await this._processEntity(entity, dryRun);
        }

        return this.stats;
    }

    async _processEntity(entity, dryRun) {
        const { mapped, data, folderPath } = entity;

        // Models need a Collection ID. 
        // FIX: CollectionScanner skips generating collections for 'Project Folders' (folders with project.json).
        // Therefore, if this model is in a Project Folder, it belongs to the PARENT folder's collection.
        let targetCollPath = folderPath;
        if (fs.existsSync(path.join(folderPath, 'project.json'))) {
            targetCollPath = path.dirname(folderPath);
        }

        const collectionId = this._generateCollectionId(targetCollPath);

        // 2. Model Upsert
        if (dryRun) {
            this.stats.actions.models.created++;

            // Populate Comparative Stats

            // 1. LEGACY (Raw JSON presence)
            const legTags = data.tags && data.tags.length > 0;
            const legDesc = !!data.description;
            const legPrint = !!data.printTime;
            const legFilament = !!data.filamentUsed;
            const legHidden = !!data.hidden;
            const legFav = !!(data.favorite || data.isFavorite);
            const legRoot = !!data.isProjectRoot;
            const legPart = !!data.isRelatedPart;

            if (legTags) this.stats.summary.legacy.withTags++;
            if (legDesc) this.stats.summary.legacy.withDescription++;
            if (legPrint) this.stats.summary.legacy.withPrintTime++;
            if (legFilament) this.stats.summary.legacy.withFilament++;
            if (legHidden) this.stats.summary.legacy.hidden++;
            if (legFav) this.stats.summary.legacy.favorites++;
            if (legRoot) this.stats.summary.legacy.projectRoots++;
            if (legPart) this.stats.summary.legacy.projectParts++;

            // 2. DRY RUN PROJECTION (Mapped properties)
            const dryTags = mapped.tags && mapped.tags.length > 0;
            const dryDesc = !!mapped.description;
            const dryPrint = mapped.printTime > 0;
            const dryFilament = mapped.filamentUsage > 0;
            const dryHidden = !!mapped.isHidden;
            const dryFav = !!mapped.isFavorite;
            const dryRoot = entity.type === 'PROJECT_ROOT';
            const dryPart = entity.type === 'PROJECT_PART';

            if (dryTags) this.stats.summary.dryRun.withTags++;
            if (dryDesc) this.stats.summary.dryRun.withDescription++;
            if (dryPrint) this.stats.summary.dryRun.withPrintTime++;
            if (dryFilament) this.stats.summary.dryRun.withFilament++;
            if (dryHidden) this.stats.summary.dryRun.hidden++;
            if (dryFav) this.stats.summary.dryRun.favorites++;
            if (dryRoot) this.stats.summary.dryRun.projectRoots++;
            if (dryPart) this.stats.summary.dryRun.projectParts++;

            // 3. Record Deltas (Legacy vs Dry Run)
            // We compare what we HAVE (legacy) vs what we WILL HAVE (dryRun)
            // The 'current' DB state is irrelevant for the delta calculation of the migration process itself.
            this._checkDelta('withTags', entity, legTags, dryTags);
            this._checkDelta('withDescription', entity, legDesc, dryDesc);
            this._checkDelta('withPrintTime', entity, legPrint, dryPrint);
            this._checkDelta('withFilament', entity, legFilament, dryFilament);
            this._checkDelta('hidden', entity, legHidden, dryHidden);
            this._checkDelta('favorites', entity, legFav, dryFav);
            this._checkDelta('projectRoots', entity, legRoot, dryRoot);
            this._checkDelta('projectParts', entity, legPart, dryPart);

            // Check Transformations (Transformations)
            if (data.hidden !== undefined && data.hidden !== mapped.isHidden) {
                if (data.hidden && this.stats.transformations.length < 50) {
                    this.stats.transformations.push({ file: entity.name, message: `Model marked 'hidden' in file, will be 'isHidden' in DB.` });
                }
            }

        } else {
            // EXECUTE: Upsert Model & Link Files
            try {
                // Pass collection name for recovery fallback
                const collectionName = path.basename(targetCollPath) || 'Recovered Collection';
                const modelCreated = await this._upsertModel(mapped, collectionId, collectionName);
                if (modelCreated) {
                    await this._linkFiles(entity, false);
                } else {
                    console.warn(`⚠️ [MigrationEngine] Skipping file linking for ${entity.name} because model creation failed.`);
                    this._logError('WARN', entity.name, 'Skipping file linking because model creation failed.');
                }
            } catch (err) {
                console.error(`❌ [MigrationEngine] Failed to process ${entity.name}:`, err);
                this._logError('CRITICAL', entity.name, `Migration Failed: ${err.message}`, err);
                this.stats.critical.push({
                    file: entity.name,
                    message: `Migration Failed: ${err.message}`,
                    error: err.stack
                });
            }
        }

        // File Validation (Always run for stats)
        if (dryRun) {
            await this._linkFiles(entity, true);
        }
    }

    // --- Helpers ---


    _checkDelta(key, entity, legacyVal, destVal) {
        if (legacyVal !== destVal) {
            // Only store up to 100 examples per category to keep payload sane
            if (this.stats.deltas[key] && this.stats.deltas[key].length < 100) {
                this.stats.deltas[key].push({
                    name: entity.name,
                    id: entity.mapped.id,
                    legacy: legacyVal,
                    dest: destVal
                });
            }
        }
    }

    _generateCollectionId(folderPath) {
        const rel = path.relative(this.modelsDir, folderPath);
        const normalized = rel.replace(/\\/g, '/');
        if (!normalized) return 'root';
        return `col_${Buffer.from(normalized).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
    }

    async _ensureCollection(col) {
        try {
            await prisma.collection.upsert({
                where: { id: col.id },
                create: {
                    id: col.id,
                    name: col.name,
                    type: 'folder',
                    parentId: col.parentId
                },
                update: {
                    name: col.name,
                    parentId: col.parentId
                }
            });
            this.stats.actions.collections.created++;
        } catch (e) {
            this.stats.warnings.push({ file: col.name, message: `Collection Error: ${e.message}` });
            this._logError('COLLECTION_ERROR', col.name, e.message, e);
        }
    }

    async _upsertModel(mapped, collectionId, collectionName) {
        // Separate tags from the main payload because they require relation handling
        const { tags, ...modelData } = mapped;

        try {
            await prisma.model.upsert({
                where: { id: mapped.id },
                create: {
                    ...modelData,
                    collectionId: collectionId,
                    metadata: JSON.stringify(mapped.metadata)
                },
                update: {
                    ...modelData,
                    collectionId: collectionId,
                    metadata: JSON.stringify(mapped.metadata)
                }
            });

            // Handle Tags (Many-to-Many via ModelTag)
            if (tags && Array.isArray(tags)) {
                await this._linkTags(mapped.id, tags);
            }

            return true; // Success

        } catch (e) {
            // Error P2003: Foreign key constraint failed (Missing Collection ID)
            // SQLite returns field_name: 'foreign key', so we can't reliably check for 'collection_id'.
            // Since this is the only FK in this upsert, we assume it's the collection.
            if (e.code === 'P2003') {
                console.warn(`⚠️ [MigrationEngine] Missing Collection ${collectionId} for model ${mapped.name}. Creating fallback.`);

                // Fallback: Create the missing collection strictly to satisfy the key
                try {
                    console.log(`[MigrationEngine] RECOVERY: Creating collection ${collectionId} for Model ${mapped.id}`);
                    await prisma.collection.upsert({
                        where: { id: collectionId },
                        create: {
                            id: collectionId,
                            name: collectionName || 'Recovered Collection',
                            type: 'folder',
                            category: 'Recovered'
                        },
                        update: {}
                    });

                    // Retry Model Upsert
                    await prisma.model.upsert({
                        where: { id: mapped.id },
                        create: {
                            ...modelData,
                            collectionId: collectionId,
                            metadata: JSON.stringify(mapped.metadata)
                        },
                        update: {
                            ...modelData,
                            collectionId: collectionId, // Still force it
                            metadata: JSON.stringify(mapped.metadata)
                        }
                    });

                    // Retry Tags
                    if (tags && Array.isArray(tags)) {
                        await this._linkTags(mapped.id, tags);
                    }
                    return true; // Success after recovery

                } catch (retryErr) {
                    console.error(`❌ [MigrationEngine] Model Recovery Failed for ${mapped.name}:`, retryErr); // LOG error
                    this._logError('RECOVERY_FAILED', mapped.name, `Model Recovery Failed: ${retryErr.message}`, retryErr);
                    this.stats.warnings.push({ file: mapped.name, message: `Model Recovery Failed: ${retryErr.message}` });
                    return false;
                }
            }

            console.error(`❌ [MigrationEngine] Model Upsert Error for ${mapped.name}:`, e); // LOG error
            this._logError('UPSERT_FAILED', mapped.name, `Model Error: ${e.message}`, e);
            this.stats.warnings.push({ file: mapped.name, message: `Model Error: ${e.message}` });
            return false;
        }
    }

    async _linkTags(modelId, tags) {
        for (const tagName of tags) {
            try {
                // 1. Ensure Tag Exists
                const tagRecord = await prisma.tag.upsert({
                    where: { name: tagName },
                    create: { name: tagName },
                    update: {}
                });

                // 2. Link Model -> Tag
                await prisma.modelTag.upsert({
                    where: {
                        modelId_tagId: {
                            modelId: modelId,
                            tagId: tagRecord.id
                        }
                    },
                    create: {
                        modelId: modelId,
                        tagId: tagRecord.id
                    },
                    update: {}
                });
            } catch (e) {
                this.stats.warnings.push({ file: 'TagLink', message: `Failed to link tag ${tagName}: ${e.message}` });
            }
        }
    }

    async _linkFiles(entity, dryRun = false) {
        const { mapped, filePath, folderPath } = entity; // filePath here is the MUNCHIE .json file path
        let filesCount = 0;
        let primaryFileFound = false;

        // Track added files to avoid duplicates
        const addedFiles = new Set();

        console.log(`[MigrationEngine] Linking files for Model ID: ${mapped.id}`);

        // --- LOGIC PORTED FROM admin.js (runHealLogic) ---
        // 1. Derive Ground Truth Base Name from the Munchie Filename
        const munchieFileName = path.basename(filePath);
        const munchieBaseName = munchieFileName.replace(/(-stl)?-munchie\.json$/i, '');

        // Helper to check if a file is the intended primary model
        const isIntendedPrimary = (fileName) => {
            const low = fileName.toLowerCase();
            if (!['.stl', '.obj', '.3mf'].includes(path.extname(low))) return false;

            // Strict match: Must start with the munchie base name
            if (!low.startsWith(munchieBaseName.toLowerCase())) return false;

            return true;
        };

        // Helper to add file
        const addFile = async (absPath, isPrimaryCandidate) => {
            if (!fs.existsSync(absPath)) return false;
            const fileName = path.basename(absPath);

            if (addedFiles.has(fileName)) return false; // Skip duplicates

            const ext = path.extname(absPath).toLowerCase().replace('.', '');
            const isSupported = ['stl', 'obj', '3mf'].includes(ext);

            // LOGIC FIX: Is this the primary file?
            let isPrimary = false;

            // If we explicitly passed true (legacy logic), OR we found it via our new smart logic
            if (isPrimaryCandidate && !primaryFileFound && isSupported) {
                isPrimary = true;
                primaryFileFound = true;
            }

            if (!dryRun) {
                // Check DB for existing file to avoid Unique Constraint errors if re-running
                // (Though usually we cleared files before this, or it's a fresh migration)
                // For safety in this simpler engine, we just create.
                try {
                    await prisma.modelFile.create({
                        data: {
                            filename: fileName,
                            filePath: this._getRelativePath(absPath),
                            size: BigInt(fs.statSync(absPath).size),
                            modelId: mapped.id,
                            isPrimary: isPrimary,
                            isSupported: isSupported
                        }
                    });
                } catch (e) {
                    // Ignore if already exists (shouldn't happen in clean migration)
                }
            }
            filesCount++;
            addedFiles.add(fileName);
            return true;
        };

        // 1. Scan the folder to find the BEST primary candidate first
        // This avoids "first come first served" seizing the primary slot incorrectly
        let bestPrimaryCandidate = null;
        try {
            const files = fs.readdirSync(folderPath);

            // A. Exact Name Match (Highest Priority)
            bestPrimaryCandidate = files.find(f => {
                const base = path.basename(f, path.extname(f));
                return base.toLowerCase() === munchieBaseName.toLowerCase() &&
                    ['.stl', '.obj', '.3mf'].includes(path.extname(f).toLowerCase());
            });

            // B. Starts-With Match (Secondary)
            if (!bestPrimaryCandidate) {
                bestPrimaryCandidate = files.find(f => {
                    return f.toLowerCase().startsWith(munchieBaseName.toLowerCase()) &&
                        ['.stl', '.obj', '.3mf'].includes(path.extname(f).toLowerCase());
                });
            }
        } catch (e) { }

        // 2. Add the Best Primary Candidate FIRST
        if (bestPrimaryCandidate) {
            await addFile(path.join(folderPath, bestPrimaryCandidate), true);
        }

        // 3. Process Related Files (Expected 3D files from metadata)
        const related = mapped.metadata.related_files || [];
        for (const relPath of related) {
            let absPath = path.resolve(this.modelsDir, relPath);
            if (!fs.existsSync(absPath)) absPath = path.resolve(folderPath, relPath);

            // Skip metadata
            if (absPath.endsWith('.json')) continue;

            await addFile(absPath, false);
        }

        // 4. Last Resort Scan (orphans in the folder)
        try {
            const files = fs.readdirSync(folderPath);
            for (const f of files) {
                if (f.endsWith('.json') || f.endsWith('.bak')) continue;
                const absPath = path.join(folderPath, f);

                // If we somehow missed the primary (e.g. no match found on name), 
                // and this is a supported file, allow it to become primary as a fallback.
                // But only if we haven't found one yet.
                const ext = path.extname(f).toLowerCase();
                const isSupported = ['.stl', '.obj', '.3mf'].includes(ext);

                await addFile(absPath, isSupported && !primaryFileFound);
            }
        } catch (e) { }

        if (!primaryFileFound && !dryRun) {
            this.stats.warnings.push({ file: mapped.name, message: `No primary 3D file found.` });
        }

        this.stats.actions.files.created += filesCount;
    }

    /**
     * "Expensive" Deep Scan of Current Database Stats
     * Populates this.stats.summary.dest with REAL database values instead of just dry-run projections.
     */
    async _scanCurrentDBStats() {
        if (!prisma) return;

        try {
            console.log("📊 [MigrationEngine] Deep Scanning Current Database...");

            const models = await prisma.model.findMany({
                select: {
                    tags: true,
                    description: true,
                    printTime: true,
                    filamentUsage: true,
                    isHidden: true,
                    isFavorite: true,
                    files: { select: { type: true } }
                }
            });

            // Reset Dest Stats (we will overwrite the empty projection with real data)
            this.stats.summary.current = {
                withTags: 0,
                withDescription: 0,
                withPrintTime: 0,
                withFilament: 0,
                hidden: 0,
                favorites: 0,
                projectRoots: 0,
                projectParts: 0
            };

            for (const m of models) {
                if (m.tags && m.tags.length > 0) this.stats.summary.current.withTags++;
                if (m.description) this.stats.summary.current.withDescription++;
                if (m.printTime > 0) this.stats.summary.current.withPrintTime++;
                if (m.filamentUsage > 0) this.stats.summary.current.withFilament++;
                if (m.isHidden) this.stats.summary.current.hidden++;
                if (m.isFavorite) this.stats.summary.current.favorites++;

                // Identify Project Roots/Parts based on file types
                // (Note: The DB schema doesn't have explicit 'isProjectRoot' flag on Model, 
                // but we can infer roots if they have children, or just rely on file metadata)
                // Actually, the best way for now is checking if it 'looks' like a root (has parts)
                const hasParts = m.files.some(f => f.type === 'part');
                if (hasParts) this.stats.summary.current.projectRoots++;

                // Parts themselves are usually Models in the DB too? 
                // Wait, your schema might treat parts as just files attached to a model.
                // If parts are 'ModelFile' records, we count them here:
                const partCount = m.files.filter(f => f.type === 'part').length;
                this.stats.summary.current.projectParts += partCount;
            }

            console.log("📊 [MigrationEngine] Deep Scan Complete.", this.stats.summary.current);

        } catch (e) {
            console.error("Failed to scan current DB stats:", e);
        }
    }

    _getRelativePath(absPath) {
        return path.relative(this.modelsDir, absPath).replace(/\\/g, '/');
    }
}

module.exports = MigrationEngine;
