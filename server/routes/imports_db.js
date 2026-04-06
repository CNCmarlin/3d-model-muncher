const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { ConfigManager } = require('../../dist-backend/utils/configManager');
const { collectionQueue } = require('../../server-utils/sharedQueue');
const collectionScanner = require('../../server-utils/collectionScanner_db');
const { loadCollections, saveCollections } = require('../../server-utils/dataAccess');

// Configure Multer for Uploads
const MAX_UPLOAD_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES || '5368709120'); // 5GB default
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: MAX_UPLOAD_BYTES }
});

// --- Helpers ---

function getModelsDirectory() {
    if (process.env.MODELS_PATH) return process.env.MODELS_PATH;
    try {
        const dataDir = path.join(process.cwd(), 'data');
        const globalPath = path.join(dataDir, 'config.json');
        if (fs.existsSync(globalPath)) {
            const parsed = JSON.parse(fs.readFileSync(globalPath, 'utf8') || '{}');
            if (parsed?.settings?.modelDirectory) return parsed.settings.modelDirectory;
        }
    } catch (e) { }
    const config = ConfigManager.loadConfig();
    return (config.settings && config.settings.modelDirectory) || './models';
}

function getAbsoluteModelsPath() {
    const dir = getModelsDirectory();
    return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

function createInitialModelMetadata(overrides) {
    const now = new Date().toISOString();
    return {
        id: overrides.id || `local-${Date.now()}`,
        name: overrides.name || "New Model",
        filePath: overrides.filePath || "",
        modelUrl: overrides.modelUrl || "",
        fileSize: overrides.fileSize || "0",
        description: overrides.description || "",
        category: overrides.category || "Uncategorized",
        tags: overrides.tags || [],
        isPrinted: false,
        printTime: "",
        filamentUsed: "",
        license: overrides.license || "Private Use",
        source: "Upload",
        designer: "Local User",
        collections: overrides.collections || [],
        excludedCollections: overrides.excludedCollections || [],
        printSettings: {
            layerHeight: "", infill: "", nozzle: "", material: "", printer: ""
        },
        created: now,
        lastModified: now,
        parsedImages: [],
        related_files: overrides.related_files || [],
        hidden: overrides.hidden ?? true,
        isRelatedPart: overrides.isRelatedPart ?? false,
        isMainModel: overrides.isMainModel ?? false,
        price: 0,
        userDefined: {
            thumbnail: "parsed:0",
            imageOrder: [],
            description: overrides.description || "",
            images: []
        },
        ...overrides
    };
}

function reconcileHiddenFlags() {
    const modelsDir = getAbsoluteModelsPath();
    const scan = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) scan(p);
            else if (e.name.endsWith('munchie.json')) {
                try {
                    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
                    if (d.isMainModel && d.hidden) {
                        d.hidden = false;
                        fs.writeFileSync(p, JSON.stringify(d, null, 2));
                    }
                } catch (err) { }
            }
        }
    };
    scan(modelsDir);
}

// --- Routes ---
// POST /api/import/thingiverse
router.post('/import/thingiverse', async (req, res) => {
    try {
        const { thingId, collectionId, category } = req.body;
        console.log("[Thingiverse Import] Received Payload:", req.body);
        let targetFolder = req.body.targetFolder || 'imported';

        if (!thingId) return res.status(400).json({ success: false, error: 'No Thing ID provided' });

        const config = ConfigManager.loadConfig();
        const token = config.integrations?.thingiverse?.token || process.env.THINGIVERSE_TOKEN;
        if (!token) return res.status(500).json({ success: false, error: 'Server missing THINGIVERSE_TOKEN' });

        // Phase 2: Resolve Physical Folder from Database Collection
        const prisma = require('../../server-utils/db');
        if (collectionId) {
            try {
                const col = await prisma.collection.findUnique({ where: { id: collectionId } });
                // If it's a valid collection with a physical path, decode the hash
                if (col && col.pathHash) {
                    targetFolder = Buffer.from(col.pathHash, 'base64').toString('utf8');
                } else if (col) {
                    // Manual Virtual Collection (no physical hash yet). Map it to imported folder.
                    targetFolder = `imported/${col.name.replace(/[^a-z0-9_-]/gi, '_')}`;
                }
            } catch (err) {
                console.error("[Thingiverse Import] Failed to resolve collection path:", err);
            }
        }

        // 1. Perform Import
        let ThingiverseImporter;
        try {
            const module = require('../../dist-backend/utils/thingiverseImporter_db');
            ThingiverseImporter = module.ThingiverseImporter;
        } catch (e) {
            return res.status(500).json({ success: false, error: 'Backend utility not found. Rebuild required.' });
        }

        const importer = new ThingiverseImporter(token);
        const modelData = await importer.importThing(thingId, getAbsoluteModelsPath(), targetFolder, collectionId);

        // 2. Wrap Post-Processing in Collection Queue
        await collectionQueue.add(async (currentCols) => {
            if (prisma && modelData?.id) {
                // Update Category if selected
                if (category && category !== 'Uncategorized') {
                    modelData.category = category;
                    try {
                        await prisma.model.update({
                            where: { id: modelData.id },
                            data: { category }
                        });
                    } catch (err) {
                        console.error("[Thingiverse Import] Failed to update category:", err);
                    }
                }

                // Add to Collection if selected (Manual collections)
                if (collectionId) {
                    try {
                        const existingCol = await prisma.collection.findUnique({
                            where: { id: collectionId }
                        });

                        if (existingCol) {
                            // 1. Set Primary Strict Ownership
                            await prisma.model.update({
                                where: { id: modelData.id },
                                data: { collectionId: collectionId }
                            });

                            // 2. Add Virtual Symbolic Link
                            await prisma.modelCollection.upsert({
                                where: { modelId_collectionId: { collectionId, modelId: modelData.id } },
                                update: {},
                                create: { collectionId, modelId: modelData.id }
                            });
                        }
                    } catch (err) {
                        console.error("[Thingiverse Import] Failed to link to collection:", err);
                    }
                }
            }
            return currentCols; // Prevent ERR_INVALID_ARG_TYPE in queue processing
        });

        res.json({ success: true, model: modelData });
    } catch (e) {
        console.error('Thingiverse Import Error:', e);
        res.status(500).json({ success: false, error: e.message || String(e) });
    }
});

// POST /api/thingiverse/verify (Mounted at /api usually)
// If we mount the router at /api, this becomes /api/thingiverse/verify
// This is somewhat messy because we have two different "thingiverse" prefices.
// But following the "Lift and Shift" with /api mount:
router.post('/thingiverse/verify', async (req, res) => { // Internal name, mapped later
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, error: 'Token required' });
    try {
        const fetch = (await import('node-fetch')).default;
        const resp = await fetch('https://api.thingiverse.com/users/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resp.ok) {
            const data = await resp.json();
            return res.json({ success: true, username: data.name || 'Unknown User' });
        }
        return res.status(resp.status).json({ success: false, error: `Verification failed (${resp.status})` });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/upload-models
router.post('/upload-models', upload.array('files'), async (req, res) => {
    const savedFilePaths = [];
    const processedModelIds = [];
    const errors = [];
    const affectedFolders = new Map();

    try {
        const files = req.files || [];
        if (files.length === 0) {
            return res.status(400).json({ success: false, error: 'No files uploaded' });
        }

        const modelsDir = getAbsoluteModelsPath();
        const { parse3MF, parseSTL, computeMD5 } = require('../../dist-backend/utils/threeMFToJson');

        // Import ProjectService with safety catch
        let ProjectService;
        try {
            const projectModule = require('../../dist-backend/utils/ProjectService_db');
            ProjectService = projectModule.ProjectService_db || projectModule.default;
        } catch (e) {
            console.error("[UPLOAD] Critical: ProjectService utility not found. Asset Folder mode will fail.");
        }

        // --- SAFE DATA PARSING ---
        // We wrap every JSON.parse in a try/catch to document malformed frontend requests
        let destinations = null;
        let collectionTags = [];
        let sharedTags = [];

        try {
            if (req.body.destinations) destinations = JSON.parse(req.body.destinations);
        } catch (e) {
            console.error("[UPLOAD] Error parsing destinations:", e.message);
            errors.push({ error: "Invalid destination format received" });
        }

        try {
            if (req.body.collectionTags) collectionTags = JSON.parse(req.body.collectionTags);
        } catch (e) {
            console.error("[UPLOAD] Error parsing collectionTags:", e.message);
        }

        try {
            if (req.body.tags) sharedTags = JSON.parse(req.body.tags);
        } catch (e) {
            console.error("[UPLOAD] Error parsing tags:", e.message);
        }

        const {
            isModelFolder,
            projectName,
            primaryModelFile,
            createCollection: createColRaw,
            collectionId,
            collectionName,
            category,
            collectionDescription
        } = req.body;

        const createCollection = createColRaw === 'true';

        // --- 1. RESOLVE PHYSICAL DESTINATION (DB First) ---
        let resolvedBaseFolder = ''; // 'None' means Root, which is no prefix

        if (createCollection && collectionId && collectionId !== 'new') {
            try {
                const prisma = require('../../server-utils/db');
                const col = await prisma.collection.findUnique({ where: { id: collectionId } });
                if (col && col.pathHash) {
                    // Valid physical folder collection found
                    resolvedBaseFolder = Buffer.from(col.pathHash, 'base64').toString('utf8');
                } else if (col) {
                    // It's a virtual manual collection, so fall back to the name
                    resolvedBaseFolder = `uploads/${col.name.replace(/[^a-z0-9_-]/gi, '_')}`;
                }
            } catch (err) {
                console.error("[UPLOAD] Failed to resolve target collection's physical path:", err);
            }
        }

        // --- 2. PHYSICAL FILE SAVING (ATOMIC WRITE) ---
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const originalName = f.originalname.replace(/\\/g, '/');
            let base = path.basename(originalName).replace(/[^a-zA-Z0-9_.\- ]/g, '_');

            // Resolve destination with DB path protection
            // If they are making a "Model Folder", the projectName acts as the trailing directory
            let userTrailingPath = '';
            // Only prepend the sanitized project name if they specifically check "Model Folder" toggle
            if (isModelFolder === 'true' && projectName) {
                userTrailingPath = projectName.replace(/[^a-zA-Z0-9_\- ]/g, '');
            }

            // Reconstruct path: modelsDir / [DB Collection Path] / [Model Folder Name (if any)]
            const targetRelDir = userTrailingPath
                ? path.join(resolvedBaseFolder, userTrailingPath).replace(/\\/g, '/')
                : resolvedBaseFolder;

            const destDir = path.isAbsolute(targetRelDir)
                ? targetRelDir
                : path.join(modelsDir, targetRelDir);

            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

            let targetPath = path.join(destDir, base);

            // De-conflict filenames if they already exist
            if (fs.existsSync(targetPath)) {
                const ext = path.extname(base);
                const name = path.basename(base, ext);
                base = `${name}-${Date.now()}${ext}`;
                targetPath = path.join(destDir, base);
            }

            // Safe Write: Use .tmp extension during write to prevent partial file reads
            const tmpPath = targetPath + '.tmp';
            try {
                fs.writeFileSync(tmpPath, f.buffer);
                fs.renameSync(tmpPath, targetPath);

                let relativePath = path.relative(modelsDir, targetPath).replace(/\\/g, '/');
                // Failsafe: if the path is still absolute (due to drive letter mismatch or something), strip the modelsDir completely
                if (path.isAbsolute(relativePath)) {
                    relativePath = targetPath.replace(modelsDir, '').replace(/^[\\\/]+/, '').replace(/\\/g, '/');
                }
                savedFilePaths.push(relativePath);

                // --- 2. INDIVIDUAL MODEL PROCESSING ---
                // Skip heavy parsing if we are letting ProjectService handle it as an Asset Folder
                if (isModelFolder !== 'true') {
                    const lowerBase = base.toLowerCase();
                    if (lowerBase.endsWith('.3mf') || lowerBase.endsWith('.stl')) {
                        const derivedId = base.replace(/\.(3mf|stl)$/i, '');
                        const hash = computeMD5(f.buffer);

                        const parsedData = lowerBase.endsWith('.3mf')
                            ? await parse3MF(targetPath, derivedId, hash)
                            : await parseSTL(targetPath, derivedId, hash);

                        // Create Standard Metadata via Factory
                        let metadata = createInitialModelMetadata({
                            ...parsedData,
                            id: derivedId,
                            hash: hash,
                            filePath: relativePath,
                            modelUrl: `/models/${relativePath}`,
                            category: category || 'Uncategorized',
                            tags: Array.from(new Set([...sharedTags, ...(parsedData.tags || [])]))
                        });

                        // NEW: Directly Insert the Model to Prisma DB
                        try {
                            const prisma = require('../../server-utils/db');
                            await prisma.model.upsert({
                                where: { id: derivedId },
                                update: {
                                    name: derivedId,
                                    description: metadata.description || '',
                                    license: metadata.license || 'Unknown',
                                    designer: metadata.designer || 'Unknown',
                                    source: 'Local',
                                    modelUrl: `/models/${relativePath}`,
                                    layerHeight: parsedData.printSettings?.layerHeight || null,
                                    infill: parsedData.printSettings?.infill || null,
                                    nozzle: parsedData.printSettings?.nozzle || null,
                                    fileSize: parsedData.fileSize || null,
                                    printTime: parsedData.printTime ? parseInt(parsedData.printTime.replace(/[^0-9]/g, '')) : null,
                                    filamentUsage: parsedData.filamentUsed ? parseFloat(parsedData.filamentUsed) : null,
                                    metadata: JSON.stringify(metadata),
                                    ...(createCollection && collectionId && collectionId !== 'new' && { collectionId }),
                                    updatedAt: new Date()
                                },
                                create: {
                                    id: derivedId,
                                    name: derivedId,
                                    description: metadata.description || '',
                                    license: metadata.license || 'Unknown',
                                    designer: metadata.designer || 'Unknown',
                                    source: 'Local',
                                    modelUrl: `/models/${relativePath}`,
                                    pathHash: Buffer.from(relativePath).toString('base64'),
                                    layerHeight: parsedData.printSettings?.layerHeight || null,
                                    infill: parsedData.printSettings?.infill || null,
                                    nozzle: parsedData.printSettings?.nozzle || null,
                                    fileSize: parsedData.fileSize || null,
                                    printTime: parsedData.printTime ? parseInt(parsedData.printTime.replace(/[^0-9]/g, '')) : null,
                                    filamentUsage: parsedData.filamentUsed ? parseFloat(parsedData.filamentUsed) : null,
                                    metadata: JSON.stringify(metadata),
                                    category: category || 'Uncategorized',
                                    isMainModel: true,
                                    isHidden: false,
                                    collectionId: (createCollection && collectionId && collectionId !== 'new') ? collectionId : null,
                                    files: {
                                        create: {
                                            filename: base,
                                            filePath: relativePath,
                                            fileType: path.extname(base).substring(1).toLowerCase(),
                                            size: BigInt(fs.statSync(targetPath).size),
                                            isPrimary: true,
                                            pathHash: Buffer.from(relativePath).toString('base64')
                                        }
                                    }
                                }
                            });

                            // If putting in an existing collection, make sure it gets the virtual link too
                            if (createCollection && collectionId && collectionId !== 'new') {
                                await prisma.modelCollection.upsert({
                                    where: { modelId_collectionId: { collectionId, modelId: derivedId } },
                                    update: {},
                                    create: { collectionId, modelId: derivedId }
                                });
                            }

                            // Insert Tags
                            const tagsToInsert = metadata.tags || [];
                            for (const tagName of tagsToInsert) {
                                const tagRecord = await prisma.tag.upsert({
                                    where: { name: tagName },
                                    update: {},
                                    create: { name: tagName }
                                });
                                await prisma.modelTag.upsert({
                                    where: { modelId_tagId: { modelId: derivedId, tagId: tagRecord.id } },
                                    update: {},
                                    create: { modelId: derivedId, tagId: tagRecord.id }
                                });
                            }

                            // Insert Embedded Parsed Images (Gallery)
                            const embeddedImages = parsedData.parsedImages || [];
                            for (let j = 0; j < embeddedImages.length; j++) {
                                const imgUrl = embeddedImages[j];
                                const cleanPath = imgUrl.replace(/^\/models\//, '');

                                const existingImg = await prisma.modelImage.findFirst({
                                    where: { modelId: derivedId, path: cleanPath }
                                });

                                if (!existingImg) {
                                    await prisma.modelImage.create({
                                        data: {
                                            modelId: derivedId,
                                            path: cleanPath,
                                            source: 'gallery',
                                            order: j + 1
                                        }
                                    });
                                }
                            }

                            // --- THUMBNAIL GENERATION FOR INDIVIDUAL MODELS ---
                            try {
                                const { generateThumbnail } = (require('../../dist-backend/utils/thumbnailGenerator') || require('../../dist-backend/utils/thumbnailGenerator_db'));
                                const { extractEmbeddedThumbnail } = require('../../server-utils/thumbnailExtraction');
                                const BASE_URL = process.env.HOST_URL || `http://127.0.0.1:${process.env.PORT || 3001}`;
                                const cleanName = base.replace(/[^a-zA-Z0-9.\-_]/g, '_');

                                const thumbName = cleanName + '-thumb.png';
                                const thumbPath = path.join(destDir, thumbName);

                                const embeddedName = cleanName + '-embedded-thumb.png';
                                const embeddedPath = path.join(destDir, embeddedName);

                                let extractionSuccess = false;
                                let finalThumbPath = thumbPath;

                                const isStl = targetPath.toLowerCase().endsWith('.stl');

                                // Attempt embedded extraction for 3MFs
                                if (!isStl) {
                                    try {
                                        extractionSuccess = await extractEmbeddedThumbnail(targetPath, embeddedPath);
                                        if (extractionSuccess && fs.existsSync(embeddedPath)) {
                                            finalThumbPath = embeddedPath;
                                        } else {
                                            extractionSuccess = false;
                                        }
                                    } catch (err) {
                                        console.warn(`[UPLOAD] Failed to extract embedded thumb for ${base}:`, err.message);
                                        extractionSuccess = false;
                                    }
                                }

                                // Fallback to headless browser if extraction failed
                                if (!extractionSuccess) {
                                    // Make sure config fallback uses the nice gray 
                                    const { ConfigManager } = require('../../dist-backend/utils/configManager');
                                    const config = ConfigManager.loadConfig();
                                    const globalDefaultColor = config?.settings?.defaultModelColor || config?.defaultModelColor || '#dddddd';

                                    await generateThumbnail(targetPath, thumbPath, BASE_URL, globalDefaultColor, modelsDir);
                                    finalThumbPath = thumbPath;
                                }

                                if (fs.existsSync(finalThumbPath)) {
                                    const relativeThumbUrl = `/models/${path.relative(modelsDir, finalThumbPath).replace(/\\/g, '/')}`;

                                    // Make sure relative array exists and push thumbnail
                                    let allParsedImages = parsedData.parsedImages || [];
                                    if (!allParsedImages.includes(relativeThumbUrl)) {
                                        allParsedImages.unshift(relativeThumbUrl);
                                        metadata.parsedImages = allParsedImages;
                                        metadata.userDefined = metadata.userDefined || {};
                                        metadata.userDefined.imageOrder = allParsedImages.map((_, idx) => `parsed:${idx}`);
                                    }

                                    // Update metadata and thumbnailPath on Prisma Model
                                    await prisma.model.update({
                                        where: { id: derivedId },
                                        data: {
                                            metadata: JSON.stringify(metadata),
                                            thumbnailPath: relativeThumbUrl.replace(/^\/models\//, '')
                                        }
                                    });

                                    // Insert image record for frontend gallery mapping
                                    await prisma.modelImage.create({
                                        data: {
                                            modelId: derivedId,
                                            path: relativeThumbUrl.replace(/^\/models\//, ''),
                                            source: 'thumbnail',
                                            sourceFile: base,
                                            order: 0
                                        }
                                    });
                                }
                            } catch (thumbErr) {
                                console.error(`[UPLOAD] Failed to generate thumbnail for ${base}:`, thumbErr);
                            }
                        } catch (dbErr) {
                            console.error(`[UPLOAD] Failed to insert DB record for ${base}:`, dbErr);
                        }

                        processedModelIds.push(derivedId);
                        if (!affectedFolders.has(destDir)) affectedFolders.set(destDir, []);
                        affectedFolders.get(destDir).push(derivedId);
                    }
                }
            } catch (writeErr) {
                console.error(`[UPLOAD] Failed to save file ${base}:`, writeErr);
                errors.push({ file: base, error: "Disk write failure" });
            }
        }

        // --- 3. ASSET FOLDER MODE (Project Logic) ---
        if (isModelFolder === 'true' && ProjectService && savedFilePaths.length > 0) {
            try {
                const firstFile = savedFilePaths[0];
                const absoluteDestDir = path.join(modelsDir, path.dirname(firstFile));
                const modelFiles = fs.readdirSync(absoluteDestDir).filter(f => f.endsWith('.stl') || f.endsWith('.3mf'));

                /**
                 * UPDATED: In mass upload "Asset Folder" mode, we generate a new project ID.
                 * Since these are all new files, the first file in the array (index 0) 
                 * will become the Main model by default in ProjectService.
                 */
                const newProjId = `proj-${Date.now()}`;

                const projectModel = await ProjectService.finalizeProject({
                    mode: 'generic',
                    destDir: absoluteDestDir,
                    modelsRoot: modelsDir,
                    importedFiles: modelFiles,
                    primaryModelFile,
                    meta: {
                        id: newProjId,
                        name: projectName || path.basename(absoluteDestDir),
                        category: category || 'Uncategorized',
                        tags: sharedTags
                    },
                    collectionId: (createCollection && collectionId && collectionId !== 'new') ? collectionId : undefined
                });
                processedModelIds.push(projectModel.id);

                // If putting in an existing collection, make sure the new project gets the virtual link too
                if (createCollection && collectionId && collectionId !== 'new') {
                    const prisma = require('../../server-utils/db');
                    await prisma.modelCollection.upsert({
                        where: { modelId_collectionId: { collectionId, modelId: projectModel.id } },
                        update: {},
                        create: { collectionId, modelId: projectModel.id }
                    });
                }
            } catch (projErr) {
                console.error("[UPLOAD] ProjectService finalization failed:", projErr);
                errors.push({ error: "Asset folder organization failed" });
            }
        }

        // --- 4. NEW COLLECTION CREATION (If user requested 'Create New' which shouldn't happen anymore but just in case) ---
        if (createCollection && (!collectionId || collectionId === 'new') && processedModelIds.length > 0) {
            try {
                const prisma = require('../../server-utils/db');

                // Create a new collection and link the new models
                const newId = `col-${Date.now()}`;

                // Reconstruct Pathhash if they generated a Model Folder, or just use root
                const colPath = (isModelFolder === 'true' && projectName) ? projectName.replace(/[^a-zA-Z0-9_\- ]/g, '') : '';

                await prisma.collection.create({
                    data: {
                        id: newId,
                        name: collectionName || projectName || "New Upload",
                        description: collectionDescription || '',
                        isModelFolder: false,
                        type: 'Manual',
                        pathHash: Buffer.from(colPath).toString('base64'),
                        models: {
                            connect: processedModelIds.map(id => ({ id }))
                        }
                    }
                });

                // Set optional tags if any were provided for the collection
                if (collectionTags && collectionTags.length > 0) {
                    for (const tagName of collectionTags) {
                        const tag = await prisma.tag.upsert({
                            where: { name: tagName },
                            update: {},
                            create: { name: tagName }
                        });
                        await prisma.collectionTag.create({
                            data: {
                                collectionId: newId,
                                tagId: tag.id
                            }
                        });
                    }
                }
            } catch (colErr) {
                console.error("[UPLOAD] New Collection creation failed:", colErr);
                errors.push({ error: "Failed to create new collection for models" });
            }
        }

        // ProjectService and Prisma Upserts handle the DB insertion safely now.

        res.json({
            success: errors.length === 0,
            saved: savedFilePaths,
            modelIds: processedModelIds,
            errors
        });

    } catch (err) {
        console.error("[UPLOAD] Fatal Crash in upload-models:", err);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

// POST /api/move-model-to-project
router.post('/move-model-to-project', async (req, res) => {
    try {

        let ProjectService;

        try {
            // Use the same dist-backend path since they are in the same folder
            const projectModule = require('../../dist-backend/utils/ProjectService_db');

            // Note: Check if your class is a named export or default export in the compiled JS
            // If it's "export class ProjectService", use .ProjectService
            // If it's "export default class ProjectService", use .default
            ProjectService = projectModule.ProjectService_db || projectModule.default;
        } catch (e) {
            console.error('Failed to load ProjectService:', e);
            return res.status(500).json({
                success: false,
                error: 'Project management utility not found. Rebuild required.'
            });
        }

        const { modelId, targetFolderName } = req.body;
        const modelsDir = getAbsoluteModelsPath();

        // 1. Find existing munchie
        const findMunchie = (dir) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    const found = findMunchie(full);
                    if (found) return found;
                } else if (entry.name.endsWith('munchie.json')) {
                    try {
                        const data = JSON.parse(fs.readFileSync(full, 'utf8'));
                        if (data.id === modelId) return full;
                    } catch (e) { }
                }
            }
            return null;
        };

        const munchiePath = findMunchie(modelsDir);
        if (!munchiePath) return res.status(404).json({ error: "Model not found" });

        const modelData = JSON.parse(fs.readFileSync(munchiePath, 'utf8'));
        const sourceDir = path.dirname(munchiePath);
        const safeFolderName = targetFolderName.replace(/[^a-zA-Z0-9_\- ]/g, '').trim();
        const destDir = path.join(sourceDir, safeFolderName);


        // 2. Physical Move Logic
        if (path.basename(sourceDir) !== safeFolderName) {
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

            const munchieFileName = path.basename(munchiePath);
            const baseName = munchieFileName.replace(/(-stl)?-munchie\.json$/, '');

            const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
            const filesToMove = entries.filter(entry =>
                entry.isFile() && entry.name.startsWith(baseName)
            );

            filesToMove.forEach(f => {
                const oldP = path.join(sourceDir, f.name);
                const newP = path.join(destDir, f.name);
                if (fs.existsSync(oldP)) fs.renameSync(oldP, newP);
            });
        }

        // 3. Identify all 3D files now in the new project folder
        const currentFiles = fs.readdirSync(destDir);
        const modelFiles = currentFiles.filter(f => f.endsWith('.stl') || f.endsWith('.3mf'));

        const updatedModel = await ProjectService.finalizeProject({
            mode: 'generic',
            destDir,
            modelsRoot: modelsDir,
            importedFiles: modelFiles,
            localImagePaths: [], // Service will generate thumbnails and add them
            targetFolder: '',
            meta: {
                id: modelId,
                name: safeFolderName || modelData.name,
                description: modelData.description,
                tags: modelData.tags
            }
        });

        res.json({ success: true, model: updatedModel });

    } catch (e) {
        console.error("Move model error:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
