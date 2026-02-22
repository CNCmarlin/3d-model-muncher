const fs = require('fs');
const path = require('path');
const prisma = require('./db');

/**
 * DATABASE VERSION: Collection Scanner
 * Generates collections based on folder structure and writes to Prisma database.
 * Supports: 'smart', 'strict', and 'top-level' strategies.
 * Respects 'project.json' as a marker for single-model project folders.
 * 
 * Key Differences from Legacy:
 * - Writes to Prisma DB instead of collections.json
 * - Creates/updates tags in Tag table
 * - Syncs ModelTags many-to-many relationships
 * - Uses transactions for atomic updates
 */

async function generateCollections(scanRoot, modelsDir, options = { strategy: 'smart' }) {
    const strategy = options.strategy || 'smart';
    console.log(`\n--- 📊 DATABASE COLLECTION SCANNER (Strategy: ${strategy}) ---`);

    const collections = [];
    const allClaimedIds = new Set();
    let taggedCount = 0;

    // --- HELPERS ---
    function readJson(fp) {
        try {
            const raw = fs.readFileSync(fp, 'utf8');
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    /**
     * Update model tags in DATABASE (not JSON files)
     * Creates tags if they don't exist, then creates ModelTag relationships
     */
    async function updateModelTags(modelId, newTags) {
        if (!newTags || newTags.length === 0) return;

        try {
            // Create tags if they don't exist (upsert)
            for (const tagName of newTags) {
                await prisma.tag.upsert({
                    where: { name: tagName },
                    update: {},
                    create: { name: tagName }
                });
            }

            // Get existing tag names for this model
            const existingModelTags = await prisma.modelTag.findMany({
                where: { modelId },
                include: { tag: true }
            });
            const existingTagNames = new Set(existingModelTags.map(mt => mt.tag.name));

            // Find new tags to add
            const tagsToAdd = newTags.filter(t => !existingTagNames.has(t));

            // Create ModelTag relationships for new tags
            for (const tagName of tagsToAdd) {
                const tag = await prisma.tag.findUnique({ where: { name: tagName } });
                if (tag) {
                    await prisma.modelTag.create({
                        data: {
                            modelId,
                            tagId: tag.id
                        }
                    });
                    taggedCount++;
                }
            }
        } catch (e) {
            console.error(`[DB] Failed to update tags for model ${modelId}:`, e.message);
        }
    }

    function generateCollectionId(folderPath) {
        const rel = path.relative(modelsDir, folderPath);
        const normalized = rel.replace(/\\/g, '/');
        return `col_${Buffer.from(normalized).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
    }

    // --- RECURSIVE SCANNER (Database Aware) ---
    function scanRecursively(currentDir, parentColId = null, depth = 0) {
        const indent = "  ".repeat(depth);
        const folderName = path.basename(currentDir);

        // 1. Marker Check
        const isProjectFolder = fs.existsSync(path.join(currentDir, 'project.json'));

        let entries;
        try {
            entries = fs.readdirSync(currentDir, { withFileTypes: true });
        } catch (e) { return false; }

        let directModelIds = [];
        let projectRootId = null;
        const subFolders = [];

        // 2. Identify contents
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                if (!entry.name.startsWith('.')) subFolders.push(fullPath);
            } else if (entry.name.endsWith('munchie.json') && entry.name !== 'project.json') {
                const modelData = readJson(fullPath);
                if (modelData && modelData.id) {
                    if (isProjectFolder && modelData.isProjectRoot === true) {
                        projectRootId = modelData.id;
                    } else if (!isProjectFolder) {
                        directModelIds.push(modelData.id);
                    }
                }
            }
        }

        console.log(`${indent}📁 Scanning: ${folderName} [Project: ${isProjectFolder}]`);

        const myColId = generateCollectionId(currentDir);
        let idToPass = (strategy === 'strict' && currentDir !== scanRoot) ? myColId : parentColId;

        // 3. Recurse and Collect IDs from children
        let childrenModelIds = [];
        let childCreatedCollection = false;

        for (const sub of subFolders) {
            const childResult = scanRecursivelyWithResult(sub, idToPass, depth + 1);
            if (childResult.hasCreated) childCreatedCollection = true;
            childrenModelIds = [...childrenModelIds, ...childResult.foundIds];
        }

        // 4. DECISION LOGIC
        const isMajorCategory = ['imported', 'uploads', 'models'].includes(folderName.toLowerCase());
        const hasContentHere = directModelIds.length > 0 || projectRootId;
        const shouldCreate = (
            (strategy === 'strict' && currentDir !== scanRoot) ||
            (strategy === 'top-level' && depth === 1) ||
            (strategy === 'smart' && (childCreatedCollection || hasContentHere) && !isMajorCategory)
        );

        if (shouldCreate) {
            const allIdsHere = [...directModelIds];
            if (projectRootId) allIdsHere.push(projectRootId);
            const finalModelIds = [...allIdsHere, ...childrenModelIds];

            allIdsHere.forEach(id => allClaimedIds.add(id));

            collections.push({
                id: myColId,
                name: folderName,
                parentId: parentColId || null,
                modelIds: finalModelIds,
                path: path.relative(modelsDir, currentDir)
            });

            console.log(`${indent}  ✅ Collection "${folderName}" (${finalModelIds.length} models)`);
            return { hasCreated: true, foundIds: allIdsHere };
        }

        // If no collection here, pass IDs up
        const bubbledIds = projectRootId ? [projectRootId, ...directModelIds] : directModelIds;
        bubbledIds.forEach(id => allClaimedIds.add(id));

        console.log(`${indent}  ⬆️  Bubbled ${bubbledIds.length} IDs up`);
        return { hasCreated: false, foundIds: bubbledIds };
    }

    function scanRecursivelyWithResult(currentDir, parentColId = null, depth = 0) {
        return scanRecursively(currentDir, parentColId, depth);
    }

    // --- START SCAN ---
    scanRecursively(scanRoot, null, 0);

    // --- FINALIZE: Write to Database ---
    console.log(`\n📊 Writing ${collections.length} collections to database...`);

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Delete all existing collections
            // TODO: Should we only delete manual ones? Or sync strategy?
            // Current logic: Full overwrite (simplest for scanner parity)
            await tx.collection.deleteMany({});

            // 2. Pre-fetch valid Model IDs to avoid Foreign Key errors
            const allFileModelIds = new Set();
            collections.forEach(c => c.modelIds.forEach(id => allFileModelIds.add(id)));

            const existingModels = await tx.model.findMany({
                where: { id: { in: Array.from(allFileModelIds) } },
                select: { id: true }
            });
            const validModelIds = new Set(existingModels.map(m => m.id));

            // 3. Create new collections
            for (const col of collections) {
                // Filter models that actually exist in DB
                const linkedModelIds = col.modelIds.filter(id => validModelIds.has(id));

                if (linkedModelIds.length < col.modelIds.length) {
                    // Log warning for ghost files (IDs in JSON but not in DB)
                    // console.warn(`[DB Scanner] Skipped ${col.modelIds.length - linkedModelIds.length} missing models in collection "${col.name}"`);
                }

                await tx.collection.create({
                    data: {
                        id: col.id,
                        name: col.name,
                        parentId: col.parentId,
                        pathHash: col.path ? Buffer.from(col.path).toString('base64') : null,

                        // Relation: Connect existing models
                        models: {
                            connect: linkedModelIds.map(id => ({ id }))
                        },

                        // New Fields (Phase 3B Parity)
                        metadata: JSON.stringify({
                            description: null, // Scanned collections typically don't have descriptions yet
                            images: [],
                            buildPlates: [],
                            // legacyPath: col.path // Optional: store original path
                        }),
                        type: 'folder', // Default for scanned folders
                        category: null  // Default
                    }
                });
            }
        });

        console.log(`✅ ${collections.length} collections written to database`);
        console.log(`🏷️  ${taggedCount} tag assignments created`);
    } catch (error) {
        console.error('❌ Failed to write collections to database:', error.message);
        throw error;
    }

    return collections;
}

/**
 * Event-driven file watcher integration (NEW for Phase 3)
 * Handles file add/delete/modify events and updates database
 */
async function handleFileEvent(eventType, filePath, modelsDir) {
    console.log(`[FileWatcher DB] ${eventType}: ${path.basename(filePath)}`);

    try {
        const pathHash = Buffer.from(filePath).toString('base64');

        switch (eventType) {
            case 'add':
                // Check if file already exists
                const existing = await prisma.modelFile.findUnique({ where: { pathHash } });
                if (!existing) {
                    // Find parent model by directory
                    const munchieFile = filePath.replace(/\.(stl|3mf|obj)$/i, '-munchie.json');
                    const munchieData = readJson(munchieFile);

                    if (munchieData && munchieData.id) {
                        // Find Model in database
                        const model = await prisma.model.findFirst({
                            where: { pathHash: Buffer.from(munchieFile).toString('base64') }
                        });

                        if (model) {
                            const stats = fs.statSync(filePath);
                            await prisma.modelFile.create({
                                data: {
                                    modelId: model.id,
                                    fileName: path.basename(filePath),
                                    filePath: filePath,
                                    fileType: path.extname(filePath).substring(1).toLowerCase(),
                                    size: stats.size,
                                    pathHash,
                                    isPrimary: false // First file can be set as primary later
                                }
                            });
                            console.log(`  ✅ Added file to database: ${path.basename(filePath)}`);
                        }
                    }
                }
                break;

            case 'unlink':
                // Soft delete or hard delete
                const fileToDelete = await prisma.modelFile.findUnique({ where: { pathHash } });
                if (fileToDelete) {
                    // For now, hard delete. Could implement soft delete with isDeleted flag
                    await prisma.modelFile.delete({ where: { id: fileToDelete.id } });
                    console.log(`  🗑️  Removed file from database: ${path.basename(filePath)}`);
                }
                break;

            case 'change':
                // Update file size and timestamp
                const fileToUpdate = await prisma.modelFile.findUnique({ where: { pathHash } });
                if (fileToUpdate) {
                    const stats = fs.statSync(filePath);
                    await prisma.modelFile.update({
                        where: { id: fileToUpdate.id },
                        data: {
                            size: stats.size,
                            updatedAt: new Date()
                        }
                    });
                    console.log(`  🔄 Updated file in database: ${path.basename(filePath)}`);
                }
                break;
        }
    } catch (error) {
        console.error(`[FileWatcher DB] Error handling ${eventType}:`, error.message);
    }
}

module.exports = {
    generateCollections,
    scanDirectory: generateCollections, // Alias for compatibility
    handleFileEvent
};
