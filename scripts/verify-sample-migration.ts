import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

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
    // Find some diverse munchie files to test
    const munchieFiles: { path: string, type: string }[] = [];

    // Get a project model
    const projectPath = path.join(modelsDir, '3D Printer/Printers/CR-10/CR-10_Mod_-_Standalone_-_All_in_One/project-munchie.json');
    if (fs.existsSync(projectPath)) {
        munchieFiles.push({ path: projectPath, type: 'project' });
    }

    // Get a loose model with fallback matching (the one we fixed)
    const adxlPath = path.join(modelsDir, '3D Printer/ADXL/ADXL mount-stl-munchie.json');
    if (fs.existsSync(adxlPath)) {
        munchieFiles.push({ path: adxlPath, type: 'loose-fallback' });
    }

    // Get a regular loose model
    const cameraPath = path.join(modelsDir, '3D Printer/Camera/C-270 tripod/c270_cam1-stl-munchie.json');
    if (fs.existsSync(cameraPath)) {
        munchieFiles.push({ path: cameraPath, type: 'loose-regular' });
    }

    const results = [];

    for (const { path: munchiePath, type } of munchieFiles) {
        const munchieData = JSON.parse(fs.readFileSync(munchiePath, 'utf8'));

        const dbModel = await prisma.model.findUnique({
            where: { id: String(munchieData.id) },
            include: {
                files: true,
                tags: {
                    include: {
                        tag: true
                    }
                },
                collection: true
            }
        });

        results.push({
            type,
            munchiePath: path.relative(modelsDir, munchiePath),
            munchie: {
                id: munchieData.id,
                name: munchieData.name,
                description: munchieData.description?.substring(0, 100),
                tags: munchieData.tags || [],
                printTime: munchieData.printTime,
                filament: munchieData.filament?.total,
                favorite: munchieData.favorite || false,
                printed: munchieData.printed || false,
                originalFilename: munchieData.originalFilename
            },
            database: dbModel ? {
                id: dbModel.id,
                name: dbModel.name,
                description: dbModel.description?.substring(0, 100),
                tags: dbModel.tags.map(t => t.tag.name),
                printTime: dbModel.printTime,
                filament: dbModel.filamentUsage,
                favorite: dbModel.isFavorite,
                printed: dbModel.isPrinted,
                collection: dbModel.collection.name,
                fileCount: dbModel.files.length,
                files: dbModel.files.map(f => ({
                    name: f.filename,
                    primary: f.isPrimary,
                    size: Number(f.size)
                }))
            } : null,
            checks: dbModel ? {
                idMatch: dbModel.id === String(munchieData.id),
                nameMatch: dbModel.name === munchieData.name,
                tagsMatch: JSON.stringify(dbModel.tags.map(t => t.tag.name).sort()) === JSON.stringify((munchieData.tags || []).sort()),
                favoriteMatch: dbModel.isFavorite === (munchieData.favorite || false),
                printedMatch: dbModel.isPrinted === (munchieData.printed || false),
                hasFiles: dbModel.files.length > 0
            } : null
        });
    }

    fs.writeFileSync('verification_comparison.json', JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ status: 'success', samplesVerified: results.length }, null, 2));
}

main()
    .catch(err => {
        console.error(JSON.stringify({ status: 'error', message: err.message }, null, 2));
    })
    .finally(() => prisma.$disconnect());
