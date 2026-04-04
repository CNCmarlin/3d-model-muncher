#!/usr/bin/env node
/**
 * Track 7: Normalize ModelImage Paths
 *
 * Some ModelImage rows were inserted without the '/models/' prefix
 * (e.g. 'imported/Sonos.../file.jpg' instead of '/models/imported/Sonos.../file.jpg').
 * All non-base64 paths should be canonical URL paths starting with '/models/'.
 *
 * Usage:
 *   node server/scripts/normalize-image-paths.js            -- dry run (preview only)
 *   node server/scripts/normalize-image-paths.js --apply    -- apply changes
 */

const path = require('path');
const fs = require('fs');

// Ensure we can resolve server-utils from this script's location
process.chdir(path.resolve(__dirname, '../../'));

const prisma = require('../../server-utils/db');
const { getAbsoluteModelsPath } = require('../../server-utils/dataAccess');

const APPLY = process.argv.includes('--apply');

async function run() {
    const modelsDir = getAbsoluteModelsPath();

    console.log(`\n🖼️  ModelImage Path Normalizer`);
    console.log(`Mode: ${APPLY ? '✅ APPLY (writing changes)' : '🔍 DRY RUN (preview only — use --apply to write)'}`);
    console.log(`Models dir: ${modelsDir}\n`);

    // Find all image paths that are NOT already prefixed with /models/ and NOT base64
    const images = await prisma.modelImage.findMany({
        select: { id: true, path: true, source: true, modelId: true },
        where: {
            NOT: [
                { path: { startsWith: '/models/' } },
                { path: { startsWith: 'data:image' } },
            ],
        },
    });

    if (images.length === 0) {
        console.log('✅ All ModelImage paths are already normalized. Nothing to do.');
        await prisma.$disconnect();
        return;
    }

    console.log(`Found ${images.length} image(s) with missing /models/ prefix.\n`);

    let willFix = 0;
    let willSkip = 0;
    const skipped = [];

    for (const img of images) {
        const correctedPath = `/models/${img.path}`;
        const absPath = path.join(modelsDir, img.path);
        const existsOnDisk = fs.existsSync(absPath);

        if (!existsOnDisk) {
            console.log(`⚠️  SKIP (not on disk): ${img.path}`);
            willSkip++;
            skipped.push({ id: img.id, path: img.path });
            continue;
        }

        console.log(`  ${APPLY ? '✏️ ' : '→'} ${img.path}  =>  ${correctedPath}`);
        willFix++;

        if (APPLY) {
            try {
                await prisma.modelImage.update({
                    where: { id: img.id },
                    data: { path: correctedPath },
                });
            } catch (e) {
                console.error(`  ❌ Failed to update ${img.id}: ${e.message}`);
            }
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`  Will normalize : ${willFix}`);
    console.log(`  Will skip (not on disk): ${willSkip}`);

    if (willSkip > 0) {
        console.log(`\n⚠️  Skipped paths (file missing — investigate separately):`);
        skipped.forEach(s => console.log(`    ${s.path}`));
    }

    if (!APPLY && willFix > 0) {
        console.log(`\n💡 Re-run with --apply to write ${willFix} update(s) to the database.`);
    }

    if (APPLY) {
        console.log(`\n✅ Done. ${willFix} path(s) normalized.`);
    }

    await prisma.$disconnect();
}

run().catch(err => {
    console.error('❌ Script failed:', err.message);
    process.exit(1);
});
