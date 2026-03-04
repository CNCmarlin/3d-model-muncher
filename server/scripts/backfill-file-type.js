/**
 * Backfill Script: ModelFile.fileType
 *
 * Derives and writes fileType for every ModelFile row that doesn't have it yet.
 * Derives from the filePath extension.
 *
 * Run once after adding the fileType column:
 *   node server/scripts/backfill-file-type.js
 */

const { PrismaClient } = require('@prisma/client');
const path = require('path');
const prisma = new PrismaClient();

function deriveFileType(filePath) {
    if (!filePath) return 'other';
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    if (['stl', '3mf', 'obj'].includes(ext)) return ext;
    if (['gcode', 'gco'].includes(ext)) return 'gcode';
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext)) return 'image';
    return 'other';
}

async function backfill() {
    console.log('Starting ModelFile.fileType backfill...');

    const files = await prisma.modelFile.findMany({
        where: { fileType: null }
    });

    console.log(`Found ${files.length} rows with no fileType`);

    let updated = 0;

    for (const f of files) {
        const fileType = deriveFileType(f.filePath);
        await prisma.modelFile.update({
            where: { id: f.id },
            data: { fileType }
        });
        updated++;
    }

    console.log(`\n✓ fileType backfill complete:`);
    console.log(`  Updated: ${updated}`);
}

backfill()
    .catch(err => {
        console.error('Backfill failed:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
