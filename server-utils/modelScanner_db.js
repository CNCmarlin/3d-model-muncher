const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const prisma = require('./db');

/**
 * DATABASE VERSION: Model Scanner
 * Scans the filesystem for *-munchie.json files and populates the Model, ModelFile, and Tag tables.
 * This is the first step of a "Re-migrate" process, followed by Collection scanning.
 */

async function scanModels(modelsDir) {
    console.log(`\n--- 🕵️ DATABASE MODEL SCANNER ---`);
    console.log(`Scanning root: ${modelsDir}`);

    const stats = {
        found: 0,
        created: 0,
        updated: 0,
        errors: 0,
        files: 0
    };

    // Helper: Calculate file hash for uniqueness
    function getFileHash(filePath) {
        return Buffer.from(filePath).toString('base64');
    }

    // Helper: Read JSON safely
    function readJson(fp) {
        try {
            const raw = fs.readFileSync(fp, 'utf8');
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    // Recursive scan function
    async function scanDir(currentDir) {
        let entries = [];
        try {
            entries = fs.readdirSync(currentDir, { withFileTypes: true });
        } catch (e) { return; }

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
                if (!entry.name.startsWith('.') && entry.name !== 'uploads') {
                    await scanDir(fullPath);
                }
            } else if (/\.(stl|3mf|obj)$/i.test(entry.name)) {
                // Found a physical 3D model file
                try {
                    await processPhysicalFile(fullPath, currentDir);
                    stats.found++;
                } catch (e) {
                    console.error(`❌ Error processing ${entry.name}:`, e.message);
                    stats.errors++;
                }
            }
        }
    }

    // Helper: Get Legacy Munchie filename
    function getMunchieFileName(modelFileName) {
        if (/\.3mf$/i.test(modelFileName)) return modelFileName.replace(/\.3mf$/i, '-munchie.json');
        if (/\.stl$/i.test(modelFileName)) return modelFileName.replace(/\.stl$/i, '-stl-munchie.json');
        return modelFileName + '-munchie.json';
    }

    // Process a physical STL/3MF/OBJ file
    async function processPhysicalFile(modelPath, dirPath) {
        const primaryFileName = path.basename(modelPath);
        const primaryFileRel = path.relative(modelsDir, modelPath).replace(/\\/g, '/');
        const fileHash = Buffer.from(primaryFileRel).toString('base64');
        const fileStats = fs.statSync(modelPath);

        // 1. RECONCILIATION CHECK (Happy Path)
        const existingFile = await prisma.modelFile.findUnique({
            where: { pathHash: fileHash }
        });

        if (existingFile) {
            // DB is source of truth. Check for physical file changes (size).
            if (existingFile.size !== fileStats.size) {
                await prisma.modelFile.update({
                    where: { id: existingFile.id },
                    data: { size: fileStats.size, updatedAt: new Date() }
                });
                stats.updated++;
            }
            stats.files++;
            return; // We are done! No JSON reading needed.
        }

        // 2. MIGRATION FALLBACK (File missing from DB)
        // Look for legacy JSON sidecar to seed the new DB record
        const jsonPath = path.join(dirPath, getMunchieFileName(primaryFileName));
        let data = readJson(jsonPath);

        // If no legacy JSON exists at all, we create a clean default "drag-and-drop" model
        if (!data) {
            data = {
                id: crypto.randomUUID(),
                name: primaryFileName,
                description: '',
                isMainModel: true,
                isRelatedPart: false,
                tags: []
            };
        }

        // Ensure we always have an ID
        if (!data.id) data.id = crypto.randomUUID();

        // Metadata blob for legacy fields
        const metadata = {
            category: data.category || '',
            related_files: data.related_files || [],
            userDefined: data.userDefined || {},
            notes: data.notes || '',
            hidden: !!data.hidden,
            isRelatedPart: !!data.isRelatedPart,
            isMainModel: !!data.isMainModel || !!data.isProjectRoot,
            price: data.price || ''
        };

        // 3. Upsert Model (Trusting the JSON ID if it existed, or the new UUID)
        const model = await prisma.model.upsert({
            where: { id: data.id },
            update: {
                // If it already existed in DB but missing ModelFile, just update stats
                updatedAt: new Date()
            },
            create: {
                id: data.id,
                name: data.name || primaryFileName,
                description: data.description || '',
                license: data.license || '',
                designer: data.designer || '',
                source: data.source || '',
                printTime: data.printTime ? parseInt(String(data.printTime)) : 0,
                filamentUsage: data.filamentUsed ? parseFloat(String(data.filamentUsed)) : 0,
                isPrinted: !!data.isPrinted,
                isFavorite: false,
                isDeleted: false,
                isComponent: !!data.isRelatedPart,
                isMainModel: !!data.isMainModel || !!data.isProjectRoot,
                collectionId: null, // Will be linked by Collection Scanner
                coverImagePath: data.coverImage || null,
                pathHash: Buffer.from(primaryFileRel).toString('base64'),
                metadata: JSON.stringify(metadata),
                createdAt: new Date(data.created || new Date()),
                updatedAt: new Date(data.lastModified || new Date())
            }
        });

        if (model.createdAt && model.updatedAt && model.createdAt.getTime() === model.updatedAt.getTime()) {
            stats.created++;
        } else {
            stats.updated++;
        }

        // 4. Upsert Tags (only if we created a new model or are hydrating from JSON)
        if (data.tags && Array.isArray(data.tags)) {
            for (const tagName of data.tags) {
                const tag = await prisma.tag.upsert({
                    where: { name: tagName },
                    update: {},
                    create: { name: tagName }
                });
                await prisma.modelTag.upsert({
                    where: { modelId_tagId: { modelId: model.id, tagId: tag.id } },
                    update: {},
                    create: { modelId: model.id, tagId: tag.id }
                });
            }
        }

        // 5. Create ModelFile
        const ext = path.extname(modelPath).substring(1).toLowerCase();
        await prisma.modelFile.create({
            data: {
                modelId: model.id,
                fileName: primaryFileName,
                filePath: primaryFileRel,
                fileType: ext,
                size: fileStats.size,
                isPrimary: true, // It's the file we found
                pathHash: fileHash
            }
        });
        stats.files++;
    }

    // Start
    await scanDir(modelsDir);

    // 6. Prune Orphaned DB Files (File missing from disk)
    const allDbFiles = await prisma.modelFile.findMany();
    let pruned = 0;
    for (const dbFile of allDbFiles) {
        const absPath = path.join(modelsDir, dbFile.filePath);
        if (!fs.existsSync(absPath)) {
            await prisma.modelFile.delete({ where: { id: dbFile.id } });
            pruned++;
        }
    }

    console.log(`\n✅ Model Scan Complete!`);
    console.log(`   Found: ${stats.found}`);
    console.log(`   Created: ${stats.created}`);
    console.log(`   Updated: ${stats.updated}`);
    console.log(`   Files Indexed: ${stats.files}`);
    console.log(`   Orphans Pruned: ${pruned}`);
    console.log(`   Errors: ${stats.errors}`);

    return stats;
}

module.exports = { scanModels };
