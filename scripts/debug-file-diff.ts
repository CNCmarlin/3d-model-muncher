
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// import { auditLegacySystem } from '../server-utils/legacyAudit'; 
// const { auditLegacySystem } = require('../server-utils/legacyAudit');
dotenv.config();

const dbPath = path.join(process.cwd(), 'prisma', 'dev.db');
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: `file:${dbPath}`,
        },
    },
});

async function main() {
    console.log("🔍 Starting Deep Diff...");
    console.log(`🔌 Database URL: ${process.env.DATABASE_URL}`);

    // 1. Get DB Files
    const dbFiles = await prisma.modelFile.findMany({
        select: { filePath: true, modelId: true }
    });
    const dbFileSet = new Set(dbFiles.map(f => f.filePath.replace(/\\/g, '/')));

    console.log(`📂 DB Records: ${dbFileSet.size}`);

    // 2. Get Legacy Audit Files (We need to hack auditLegacySystem to return paths, 
    //    or just re-implement a quick scanner here that matches its logic perfectly)
    //    Let's re-implement the scanner logic here to be sure we control it and can capture paths.

    const legacyPaths = new Set<string>();
    const modelsDir = process.env.MODELS_PATH || path.join(process.cwd(), 'models');

    function scan(dir: string) {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        const isProject = fs.existsSync(path.join(dir, 'project.json'));

        if (isProject) {
            // Project Logic
            for (const entry of entries) {
                if (entry.isFile()) {
                    if (entry.name.endsWith('.json')) continue;
                    if (entry.name.startsWith('.')) continue;
                    if (entry.name.toLowerCase().includes('.bak')) continue;

                    const relPath = path.relative(modelsDir, path.join(dir, entry.name)).replace(/\\/g, '/');
                    legacyPaths.add(relPath);
                }
            }
            return;
        }

        // Non-Project Logic
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
                scan(fullPath);
            } else if (entry.isFile()) {
                if (entry.name.endsWith('-munchie.json')) {
                    const baseName = entry.name.replace('-munchie.json', '');
                    const exts = ['.stl', '.3mf', '.obj', '.gcode'];
                    for (const ext of exts) {
                        const candidate = baseName + ext;
                        const candidatePath = path.join(dir, candidate);
                        if (fs.existsSync(candidatePath)) {
                            const relPath = path.relative(modelsDir, candidatePath).replace(/\\/g, '/');
                            legacyPaths.add(relPath);
                            break;
                        }
                    }
                }
            }
        }
    }

    scan(modelsDir);
    console.log(`💾 Legacy Expected: ${legacyPaths.size}`);

    // 3. Compare
    const onlyInDb = [...dbFileSet].filter(x => !legacyPaths.has(x));
    const onlyInLegacy = [...legacyPaths].filter(x => !dbFileSet.has(x));

    console.log("\n--- Files in DB but NOT in Legacy Audit (Should be 0) ---");
    onlyInDb.forEach(f => console.log(` + ${f}`));

    console.log("\n--- Files in Audit but NOT in DB (Should be 0) ---");
    onlyInLegacy.forEach(f => console.log(` - ${f}`));

}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
