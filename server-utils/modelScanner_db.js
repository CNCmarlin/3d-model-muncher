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
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
                if (!entry.name.startsWith('.') && entry.name !== 'uploads') {
                    await scanDir(fullPath);
                }
            } else if (entry.name.endsWith('munchie.json')) {
                // Found a model metadata file
                try {
                    await processModelFile(fullPath, currentDir);
                    stats.found++;
                } catch (e) {
                    console.error(`❌ Error processing ${entry.name}:`, e.message);
                    stats.errors++;
                }
            }
        }
    }

    // Process a single munchie.json file
    async function processModelFile(jsonPath, dirPath) {
        const data = readJson(jsonPath);
        if (!data || !data.id) return;

        // 1. Prepare Model Data
        // Handle "legacy" relative paths or partial data
        const relativePath = path.relative(modelsDir, jsonPath); // relative path of the json file
        const modelDirRel = path.dirname(relativePath).replace(/\\/g, '/'); // relative folder path

        // Determine "Primary File" (STL/3MF)
        let primaryFile = null;
        if (jsonPath.endsWith('-stl-munchie.json')) {
            primaryFile = jsonPath.replace('-stl-munchie.json', '.stl');
            if (!fs.existsSync(primaryFile)) primaryFile = jsonPath.replace('-stl-munchie.json', '.STL');
        } else {
            primaryFile = jsonPath.replace('-munchie.json', '.3mf');
        }

        // If primary file doesn't exist, skip model? Or keep as "metadata only"?
        // Legacy scanner required the file to exist.
        if (!primaryFile || !fs.existsSync(primaryFile)) {
            // console.warn(`Skipping orphan metadata: ${relativePath}`);
            return;
        }

        const primaryFileName = path.basename(primaryFile);
        const primaryFileRel = path.relative(modelsDir, primaryFile).replace(/\\/g, '/');
        const primaryStats = fs.statSync(primaryFile);

        // Metadata blob
        const metadata = {
            category: data.category,
            related_files: data.related_files || [],
            userDefined: data.userDefined || {},
            notes: data.notes,
            hidden: !!data.hidden,
            isRelatedPart: !!data.isRelatedPart,
            isProjectRoot: !!data.isProjectRoot,
            price: data.price
        };

        // 2. Upsert Model
        // We use `pathHash` of the JSON file (or primary file?) as a unique key for "Physical File" map?
        // Actually, `id` should be improved or trusted? 
        // If re-migrating, we trust the ID in the json file.

        const model = await prisma.model.upsert({
            where: { id: data.id },
            update: {
                name: data.name || path.basename(primaryFile),
                description: data.description || '',
                license: data.license,
                designer: data.designer,
                source: data.source,
                printTime: data.printTime ? parseInt(String(data.printTime)) : 0,
                filamentUsage: data.filamentUsed ? parseFloat(String(data.filamentUsed)) : 0,
                isPrinted: !!data.isPrinted,
                isFavorite: false, // Don't overwrite favorites on re-scan? Or should we? Metadata usually doesn't store favorite status in legacy except maybe userDefined?
                isDeleted: false,
                coverImagePath: data.coverImage || null, // data.coverImage in legacy was often a relative path or a blob? It's usually a path.
                metadata: JSON.stringify(metadata),
                updatedAt: new Date(data.lastModified || new Date())
            },
            create: {
                id: data.id,
                name: data.name || path.basename(primaryFile),
                description: data.description || '',
                license: data.license,
                designer: data.designer,
                source: data.source,
                printTime: data.printTime ? parseInt(String(data.printTime)) : 0,
                filamentUsage: data.filamentUsed ? parseFloat(String(data.filamentUsed)) : 0,
                isPrinted: !!data.isPrinted,
                isFavorite: false,
                isDeleted: false,
                collectionId: 'uncategorized', // Will be fixed by Collection Scanner
                coverImagePath: data.coverImage || null,
                pathHash: Buffer.from(primaryFileRel).toString('base64'), // Track primary file as the "filesytem identity"
                metadata: JSON.stringify(metadata),
                createdAt: new Date(data.created || new Date()),
                updatedAt: new Date(data.lastModified || new Date())
            }
        });

        if (model.createdAt.getTime() === model.updatedAt.getTime()) stats.created++;
        else stats.updated++;

        // 3. Upsert Tags
        if (data.tags && Array.isArray(data.tags)) {
            for (const tagName of data.tags) {
                const tag = await prisma.tag.upsert({
                    where: { name: tagName },
                    update: {},
                    create: { name: tagName }
                });
                // Link
                await prisma.modelTag.upsert({
                    where: { modelId_tagId: { modelId: model.id, tagId: tag.id } },
                    update: {},
                    create: { modelId: model.id, tagId: tag.id }
                });
            }
        }

        // 4. Upsert Model Files
        // Primary File
        await upsertFile(model.id, primaryFile, true);
        stats.files++;

        // Related Files (Images, Gcode, other STLs in same folder?)
        // Legacy scanner logic: check `related_files` in metadata, or scan folder?
        // Usually, we just scan the folder for images/gcode relative to the model.
        // For simplicity, let's look for sibling files if it's a "Project Folder" logic, 
        // but typically legacy just looked at `related_files` array OR implicitly images.

        // Let's just Add the Primary file for now to be safe and fast.
        // If `userDefined.images` exists, those point to files we should probably index.
    }

    async function upsertFile(modelId, absolutePath, isPrimary) {
        const stats = fs.statSync(absolutePath);
        const relPath = path.relative(modelsDir, absolutePath).replace(/\\/g, '/');
        const fileHash = Buffer.from(relPath).toString('base64');
        const ext = path.extname(absolutePath).substring(1).toLowerCase();

        await prisma.modelFile.upsert({
            where: { pathHash: fileHash },
            update: {
                size: stats.size,
                updatedAt: new Date()
            },
            create: {
                modelId: modelId,
                fileName: path.basename(absolutePath),
                filePath: relPath,
                fileType: ext,
                size: stats.size,
                isPrimary: isPrimary,
                pathHash: fileHash
            }
        });
    }

    // Start
    await scanDir(modelsDir);

    console.log(`\n✅ Model Scan Complete!`);
    console.log(`   Found: ${stats.found}`);
    console.log(`   Created: ${stats.created}`);
    console.log(`   Updated: ${stats.updated}`);
    console.log(`   Files Indexed: ${stats.files}`);
    console.log(`   Errors: ${stats.errors}`);

    return stats;
}

module.exports = { scanModels };
