
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Setup Prisma
const dbPath = path.join(process.cwd(), 'prisma', 'dev.db');
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: `file:${dbPath}`,
        },
    },
});

const modelsDir = process.env.MODELS_PATH || path.join(process.cwd(), 'models');

async function main() {
    console.log("🔍 Generating Discrepancy Report...");

    // 1. Get DB Files
    console.log("   Fetching DB records...");
    const dbFiles = await prisma.modelFile.findMany({
        select: { filePath: true }
    });
    // Normalize DB paths: remove leading slashes if any, ensure forward slashes
    const dbFileSet = new Set(dbFiles.map(f => f.filePath.replace(/\\/g, '/').replace(/^\//, '')));

    // 2. Scan Legacy Filesystem (Hybrid Logic: Matches migrate-munchies.ts)
    console.log("   Scanning filesystem...");
    const legacyPaths = new Set<string>();

    function scan(dir: string) {
        if (!fs.existsSync(dir)) return;
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (e) {
            console.error(`Error reading ${dir}:`, e);
            return;
        }

        const isProject = fs.existsSync(path.join(dir, 'project.json'));

        if (isProject) {
            // PROJECT MODE: Count ALL valid files
            for (const entry of entries) {
                if (entry.isFile()) {
                    if (entry.name.endsWith('.json')) continue;
                    if (entry.name.startsWith('.')) continue;
                    if (entry.name.toLowerCase().includes('.bak')) continue;
                    if (entry.name.toLowerCase() === 'thumbs.db') continue;
                    if (entry.name.toLowerCase() === 'desktop.ini') continue;

                    const fullPath = path.join(dir, entry.name);
                    const relPath = path.relative(modelsDir, fullPath).replace(/\\/g, '/');
                    legacyPaths.add(relPath);
                }
            }
            return; // Don't recurse further into a project (same as migration script)
        }

        // LOOSE MODE
        // 1. Recurse into subdirectories
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (entry.name.startsWith('.')) continue;
                scan(path.join(dir, entry.name));
            }
        }

        // 2. Scan for Munchie -> File links
        // We only count files that have a corresponding munchie
        const munchies = entries.filter(e => e.isFile() && e.name.endsWith('-munchie.json'));

        for (const munchie of munchies) {
            const munchiePath = path.join(dir, munchie.name);
            let data: any = {};
            try {
                data = JSON.parse(fs.readFileSync(munchiePath, 'utf8'));
            } catch (e) { continue; }

            const allFiles = entries.filter(e => e.isFile()).map(e => e.name);
            const potentialFiles = data.originalFilename
                ? [data.originalFilename, ...allFiles.filter(x => x !== data.originalFilename)]
                : allFiles;

            let found = false;

            // A. Classic / Explicit Match
            for (const candidate of potentialFiles) {
                if (candidate.endsWith('.json')) continue;
                if (candidate.toLowerCase().includes('.bak')) continue;

                const baseName = munchie.name.replace('-munchie.json', '');

                // 1. Check for exact file existence (e.g. "foo.stl" for "foo.stl-munchie.json")
                if (entries.find(e => e.name.toLowerCase() === baseName.toLowerCase())) {
                    // Get the ACTUAL casing from the entry
                    const actualEntry = entries.find(e => e.name.toLowerCase() === baseName.toLowerCase());
                    const relPath = path.relative(modelsDir, path.join(dir, actualEntry!.name)).replace(/\\/g, '/');
                    legacyPaths.add(relPath);
                    found = true;
                    break;
                }

                // 2. Check for "filename in munchie matches file in folder"
                if (!found && data.originalFilename && entries.find(e => e.name.toLowerCase() === data.originalFilename.toLowerCase())) {
                    const actualEntry = entries.find(e => e.name.toLowerCase() === data.originalFilename.toLowerCase());
                    const relPath = path.relative(modelsDir, path.join(dir, actualEntry!.name)).replace(/\\/g, '/');
                    legacyPaths.add(relPath);
                    found = true;
                    break;
                }

                // 3. Fallback logic
                if (!found) {
                    const suffixes = ['-stl', '-obj', '-3mf', '-gcode', '-stp', '-step'];
                    for (const suffix of suffixes) {
                        if (baseName.toLowerCase().endsWith(suffix)) {
                            const strippedBase = baseName.slice(0, -suffix.length);
                            const supportedExts = ['.stl', '.obj', '.3mf', '.gcode'];

                            for (const ext of supportedExts) {
                                const potential = strippedBase + ext;
                                if (entries.find(e => e.name.toLowerCase() === potential.toLowerCase())) {
                                    const actualEntry = entries.find(e => e.name.toLowerCase() === potential.toLowerCase());
                                    const relPath = path.relative(modelsDir, path.join(dir, actualEntry!.name)).replace(/\\/g, '/');
                                    legacyPaths.add(relPath);
                                    found = true;
                                    break;
                                }
                            }
                        }
                        if (found) break;
                    }
                }

                if (found) break;
            }
        }
    }

    scan(modelsDir);

    // 3. Compare
    console.log(`   DB Files: ${dbFileSet.size}`);
    console.log(`   Legacy Files: ${legacyPaths.size}`);

    const onlyInLegacy = [...legacyPaths].filter(x => !dbFileSet.has(x));
    const onlyInDb = [...dbFileSet].filter(x => !legacyPaths.has(x));

    // 4. Find Zero-File Models in DB
    const zeroFileModels = await prisma.model.findMany({
        where: { files: { none: {} } },
        select: { id: true, name: true, pathHash: true }
    });

    const report = {
        summary: {
            dbCount: dbFileSet.size,
            legacyCount: legacyPaths.size,
            missingFromDb: onlyInLegacy.length,
            extraInDb: onlyInDb.length,
            zeroFileModelsCount: zeroFileModels.length
        },
        missingFiles: onlyInLegacy.sort(),
        extraFiles: onlyInDb.sort(),
        zeroFileModels: zeroFileModels.map(m => ({
            name: m.name,
            location: m.pathHash // This is usually the folder path or unique ID string
        }))
    };

    fs.writeFileSync(path.join(process.cwd(), 'data', 'discrepancy_report.json'), JSON.stringify(report, null, 2));
    console.log("✅ Report written to data/discrepancy_report.json");
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
