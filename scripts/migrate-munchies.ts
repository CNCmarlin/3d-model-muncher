import { PrismaClient } from '@prisma/client';
import { Buffer } from 'buffer';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

// Configuration
const DRY_RUN = false; // ENABLE WRITES
const MODELS_DIR = process.env.MODELS_PATH || path.join(process.cwd(), 'models');

console.log(`\n🚀 STARTING MIGRATION (DRY RUN: ${DRY_RUN})`);
console.log(`📂 Scanning: ${MODELS_DIR}`);

if (!fs.existsSync(MODELS_DIR)) {
    console.error(`❌ Models directory not found: ${MODELS_DIR}`);
    process.exit(1);
}

// Statistics
interface MigrationStats {
    collections: number;
    models: number;
    files: number;
    projects: number;
    skipped: number;
    errors: Array<{ file: string; error: string; id?: string }>;
}

// Helper: Load legacy collections to get cover images
const COLLECTIONS_JSON_PATH = path.join(process.cwd(), 'data', 'collections.json');
let legacyCollectionsMap = new Map<string, string>(); // Id -> CoverImage

if (fs.existsSync(COLLECTIONS_JSON_PATH)) {
    try {
        const raw = fs.readFileSync(COLLECTIONS_JSON_PATH, 'utf8');
        const legacyCols = JSON.parse(raw);
        if (Array.isArray(legacyCols)) {
            legacyCols.forEach((c: any) => {
                if (c.id && c.coverImage) {
                    legacyCollectionsMap.set(c.id, c.coverImage);
                }
            });
            console.log(`📚 Loaded ${legacyCollectionsMap.size} legacy collection cover images.`);
        }
    } catch (e) {
        console.warn('⚠️ Failed to load legacy collections.json', e);
    }
}

const stats: MigrationStats = {
    collections: 0,
    models: 0,
    files: 0,
    projects: 0,
    skipped: 0,
    errors: []
};

// Helper: Generate consistent Collection ID based on path (Legacy Logic)
function generateCollectionId(folderPath: string): string {
    const rel = path.relative(MODELS_DIR, folderPath);
    const normalized = rel.replace(/\\/g, '/');
    if (!normalized) return 'root'; // Should not happen for subfolders
    return `col_${Buffer.from(normalized).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
}

async function main() {
    // Clear DB if needed? Or just upsert?
    // For safety in this phase, upsert is better.

    await scanDirectory(MODELS_DIR, null);

    console.log('\n------------------------------------------------');
    console.log('📊 MIGRATION SUMMARY');
    console.log('------------------------------------------------');
    console.log(`Collections: ${stats.collections}`);
    console.log(`Models:      ${stats.models}`);
    console.log(`Projects:    ${stats.projects}`);
    console.log(`Files:       ${stats.files}`);
    console.log(`Files:       ${stats.files}`);
    console.log('------------------------------------------------');

    if (stats.errors.length > 0) {
        console.log(`⚠️ ${stats.errors.length} errors occurred. Writing validation log...`);
        const errorLogPath = path.join(process.cwd(), 'data', 'migration_errors.json');
        fs.writeFileSync(errorLogPath, JSON.stringify(stats.errors, null, 2));
        console.log(`📝 Error log saved to: ${errorLogPath}`);
    } else {
        // Clear old logs if clean run
        const errorLogPath = path.join(process.cwd(), 'data', 'migration_errors.json');
        if (fs.existsSync(errorLogPath)) fs.unlinkSync(errorLogPath);
    }
}

async function scanDirectory(currentDir: string, parentId: string | null) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    const folderName = path.basename(currentDir);

    const isProject = fs.existsSync(path.join(currentDir, 'project.json'));
    const isRoot = currentDir === MODELS_DIR;

    let collectionId: string | null = parentId;

    // 1. Handle Collection Creation (if not root and not project)
    if (!isRoot && !isProject) {
        console.log(`[Collection] Processing: ${folderName}`);
        stats.collections++;

        const calculatedId = generateCollectionId(currentDir);
        const relPath = path.relative(MODELS_DIR, currentDir);

        // Collection Image Discovery
        // 1. Try Legacy Map first (High Fidelity)
        let coverImagePath = legacyCollectionsMap.get(calculatedId) || null;

        // 2. Fallback to scanning if not found
        if (!coverImagePath) {
            const potentialImages = ['collection.png', 'collection.jpg', 'cover.png', 'cover.jpg', 'folder.jpg', 'folder.png'];
            const allFiles = fs.readdirSync(currentDir);

            for (const img of potentialImages) {
                const match = allFiles.find(f => f.toLowerCase() === img);
                if (match) {
                    coverImagePath = path.join(relPath, match).replace(/\\/g, '/');
                    break;
                }
            }
        }

        if (!DRY_RUN) {
            // Explicitly cast to any if types are stubborn, but they should be strings now.
            // Using 'as any' for safety against stale types during this specific run.
            const col = await (prisma.collection as any).upsert({
                where: { id: calculatedId },
                create: {
                    id: calculatedId,
                    name: folderName,
                    parentId: parentId,
                    pathHash: relPath, // Storing relative path as "hash"
                    coverImagePath: coverImagePath,
                    createdAt: new Date(),
                },
                update: {
                    name: folderName,
                    parentId: parentId,
                    pathHash: relPath,
                    coverImagePath: coverImagePath, // Update if found
                }
            });
            collectionId = col.id;
        } else {
            collectionId = calculatedId;
        }
    }

    // 2. Handle Project (Model)
    if (isProject) {
        console.log(`[Project] Model Found: ${folderName}`);
        stats.projects++;

        await processModelFolder(currentDir, collectionId, true);
        return; // Don't recurse into project
    }

    // 3. Handle Loose Models (Munchies) in Collection
    if (collectionId || isRoot) {
        await processModelFolder(currentDir, collectionId, false);
    }

    // 4. Recurse
    for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
            await scanDirectory(path.join(currentDir, entry.name), collectionId);
        }
    }
}

async function processModelFolder(dir: string, collectionId: string | null, isProjectContext: boolean) {
    const files = fs.readdirSync(dir);

    // Find all munchie files
    const munchieFiles = files.filter(f => f.endsWith('-munchie.json'));

    if (munchieFiles.length === 0 && isProjectContext) {
        return;
    }

    for (const f of munchieFiles) {
        const jsonPath = path.join(dir, f);
        try {
            const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

            if (!data.id) {
                console.warn(`  [Skip] No ID in ${f}`);
                continue;
            }

            console.log(`  [Model] ${data.name || f} (${data.id})`);
            stats.models++;

            const relDir = path.relative(MODELS_DIR, dir);
            // Fix for Unique Constraint: For loose models, we must include the filename in the hash.
            // For Project Roots, the folder itself is the identity.
            // BUT: If a Project folder has MULTIPLE munchie files, they can't both be the folder.
            let uniquePath = relDir;
            if (!isProjectContext || munchieFiles.length > 1) {
                uniquePath = path.join(relDir, f.replace('-munchie.json', ''));
            }
            const pathHash = uniquePath.replace(/\\/g, '/');

            // Image Discovery Logic (Legacy Parity)
            let coverImagePath = data.coverImage || null;

            // If no explicit cover image, try to find one in the folder
            if (!coverImagePath) {
                const allFiles = fs.readdirSync(dir);
                const imageFiles = allFiles.filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));

                if (imageFiles.length > 0) {
                    // Prefer one that matches the model name
                    const modelNameBase = (data.name || f.replace('-munchie.json', '')).toLowerCase();
                    const exactMatch = imageFiles.find(img => img.toLowerCase().startsWith(modelNameBase));

                    // Use relative path for the DB
                    const bestImage = exactMatch || imageFiles[0];
                    coverImagePath = path.join(relDir, bestImage).replace(/\\/g, '/');
                }
            }

            // Build comprehensive metadata object
            // Store ALL fields that aren't direct database columns
            const metadata = {
                // Core organizational fields
                category: data.category || null,
                notes: data.notes || null,
                source: data.source || null,
                hidden: data.hidden || false,
                price: data.price || 0,

                // Project/file flags
                isRelatedPart: data.isRelatedPart || false,
                isProjectRoot: data.isProjectRoot || false,
                related_files: data.related_files || [],

                // File integrity
                hash: data.hash || null,

                // Print settings (store as object)
                printSettings: data.printSettings || null,

                // Image data
                parsedImages: data.parsedImages || [],
                images: data.images || [],
                thumbnail: data.thumbnail || null,

                // G-code analysis data
                gcodeData: data.gcodeData || null,

                // Legacy userDefined structure (preserve for backwards compat)
                userDefined: data.userDefined || {},

                // File metadata
                filePath: data.filePath || null,
                modelUrl: data.modelUrl || null,
                fileSize: data.fileSize || null,

                // Collections (for reference - actual relationships managed separately)
                collections: data.collections || [],
                excludedCollections: data.excludedCollections || [],

                // Timestamps
                created: data.created || null,
                lastModified: data.lastModified || null,
                lastScanned: data.lastScanned || null
            };

            // Upsert Model
            await (prisma.model as any).upsert({
                where: { id: String(data.id) },
                create: {
                    id: String(data.id),
                    collectionId: collectionId,
                    name: data.name || f.replace('-munchie.json', ''),
                    description: data.description || '',
                    pathHash: pathHash, // UNIQUE path
                    coverImagePath: coverImagePath,
                    printTime: Number(data.printTime) || 0,
                    filamentUsage: typeof data.filament?.total === 'number' ? data.filament.total : 0,
                    isFavorite: !!data.favorite,
                    isPrinted: !!data.printed,
                    isDeleted: false, // FORCE FALSE
                    license: data.license || null,
                    designer: data.designer || null,
                    metadata: JSON.stringify(metadata)
                },
                update: {
                    collectionId: collectionId,
                    pathHash: pathHash,
                    name: data.name || f.replace('-munchie.json', ''),
                    description: data.description || '',
                    coverImagePath: coverImagePath, // Update if found
                    isDeleted: false,
                    license: data.license || null,
                    designer: data.designer || null,
                    metadata: JSON.stringify(metadata)
                }
            });

            // Handle Files
            await (prisma.modelFile as any).deleteMany({ where: { modelId: String(data.id) } });

            if (isProjectContext) {
                const allFiles = fs.readdirSync(dir).filter(x => !x.endsWith('.json') && !x.startsWith('.') && !x.toLowerCase().includes('.bak'));

                const potentialFiles = data.originalFilename ? [data.originalFilename, ...allFiles.filter(x => x !== data.originalFilename)] : allFiles;

                let found = false;
                // Classic Match
                for (const candidate of potentialFiles) {
                    const candidatePath = path.join(dir, candidate);
                    if (fs.existsSync(candidatePath)) {
                        // Found it! Use existing logic
                        const fileStats = fs.statSync(candidatePath);
                        await (prisma.modelFile as any).create({
                            data: {
                                id: crypto.randomUUID(),
                                modelId: String(data.id),
                                filename: candidate,
                                filePath: path.join(relDir, candidate).replace(/\\/g, '/'),
                                size: BigInt(fileStats.size),
                                isPrimary: candidate === (data.originalFilename || ''),
                                isSupported: candidate.toLowerCase().includes('support')
                            }
                        });
                        stats.files++;
                        found = true;
                    }
                }

                // Fallback: Check for "sanitized extension" names (e.g. "foo-stl-munchie.json" -> "foo.stl")
                if (!found) {
                    const baseName = f.replace('-munchie.json', '');
                    const suffixes = ['-stl', '-obj', '-3mf', '-gcode', '-stp', '-step'];
                    for (const suffix of suffixes) {
                        if (baseName.toLowerCase().endsWith(suffix)) {
                            const strippedBase = baseName.slice(0, -suffix.length);
                            // Re-try matching with stripped base
                            const fallbackFiles = [
                                strippedBase + '.stl',
                                strippedBase + '.obj',
                                strippedBase + '.3mf',
                                strippedBase + '.gcode'
                            ];

                            for (const candidate of fallbackFiles) {
                                const candidatePath = path.join(dir, candidate);
                                if (fs.existsSync(candidatePath)) {
                                    const fileStats = fs.statSync(candidatePath);
                                    await (prisma.modelFile as any).create({
                                        data: {
                                            id: crypto.randomUUID(),
                                            modelId: String(data.id),
                                            filename: candidate,
                                            filePath: path.join(relDir, candidate).replace(/\\/g, '/'),
                                            size: BigInt(fileStats.size),
                                            isPrimary: true, // Assume primary if found via fallback
                                            isSupported: candidate.toLowerCase().includes('support')
                                        }
                                    });
                                    stats.files++;
                                    found = true;
                                    break; // Found a fallback file, no need to check other fallback candidates
                                }
                            }
                            if (found) break; // Found a fallback file, no need to check other suffixes
                        }
                    }
                }
            } else {
                // Loose model
                const baseName = f.replace('-munchie.json', '');
                const extensions = ['.stl', '.3mf', '.obj', '.gcode'];
                let foundGeo = null;

                for (const ext of extensions) {
                    if (fs.existsSync(path.join(dir, baseName + ext))) {
                        foundGeo = baseName + ext;
                        break;
                    }
                }

                // Fallback: Check for "sanitized extension" names (e.g. "foo-stl-munchie.json" -> "foo.stl")
                if (!foundGeo) {
                    const suffixes = ['-stl', '-obj', '-3mf', '-gcode', '-stp', '-step'];
                    for (const suffix of suffixes) {
                        if (baseName.toLowerCase().endsWith(suffix)) {
                            const strippedBase = baseName.slice(0, -suffix.length);
                            for (const ext of extensions) {
                                if (fs.existsSync(path.join(dir, strippedBase + ext))) {
                                    foundGeo = strippedBase + ext;
                                    break;
                                }
                            }
                            if (foundGeo) break;
                        }
                    }
                }

                if (foundGeo) {
                    const filePath = path.join(relDir, foundGeo).replace(/\\/g, '/');
                    const fileStats = fs.statSync(path.join(dir, foundGeo));

                    await (prisma.modelFile as any).create({
                        data: {
                            id: crypto.randomUUID(),
                            modelId: String(data.id),
                            filename: foundGeo,
                            filePath: filePath,
                            size: BigInt(fileStats.size),
                            isPrimary: true
                        }
                    });
                    stats.files++;
                }
            }


        } catch (e: any) {
            console.error(`  [Error] Failed to process ${f}`, e);
            stats.errors.push({ file: f, error: e.message || String(e), id: path.basename(dir) });
        }
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
