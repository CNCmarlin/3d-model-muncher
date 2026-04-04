/**
 * Recovery: Reset hidden/component flags on C-270 tripod models
 * and revert the collection from isModelFolder back to a plain folder.
 *
 * All 10 models in this collection have isHidden=true, isComponent=true
 * but isMainModel=false — a botched/partial model-folder conversion where
 * secondaries were demoted but no primary was ever promoted. The models
 * are completely invisible in the UI as a result.
 *
 * Usage:
 *   node server/scripts/recover-camera-models.js            -- dry run
 *   node server/scripts/recover-camera-models.js --apply    -- fix it
 */
const path = require('path');
process.chdir(path.resolve(__dirname, '../../'));
const prisma = require('../../server-utils/db');

const APPLY = process.argv.includes('--apply');
const COL_ID = 'col_M0QgUHJpbnRlci9DYW1lcmEvQy0yNzAgdHJpcG9k'; // "3D Printer/Camera/C-270 tripod"

async function run() {
    console.log(`\n🔧 Camera Model Recovery`);
    console.log(`Mode: ${APPLY ? '✅ APPLY' : '🔍 DRY RUN'}\n`);

    // 1. Check current state
    const col = await prisma.collection.findUnique({
        where: { id: COL_ID },
        select: { id: true, name: true, isModelFolder: true }
    });
    if (!col) {
        console.error(`❌ Collection not found: ${COL_ID}`);
        return await prisma.$disconnect();
    }

    const models = await prisma.model.findMany({
        where: { collectionId: COL_ID },
        select: { id: true, name: true, isMainModel: true, isComponent: true, isHidden: true, isDeleted: true }
    });

    console.log(`Collection: "${col.name}" isModelFolder=${col.isModelFolder}`);
    console.log(`Models: ${models.length}`);

    const hiddenCount = models.filter(m => m.isHidden).length;
    const componentCount = models.filter(m => m.isComponent).length;
    const mainCount = models.filter(m => m.isMainModel).length;
    console.log(`  isHidden=true: ${hiddenCount}`);
    console.log(`  isComponent=true: ${componentCount}`);
    console.log(`  isMainModel=true: ${mainCount}`);

    if (!APPLY) {
        console.log(`\n💡 Plan:`);
        console.log(`  - Reset all ${models.length} models: isHidden=false, isComponent=false, isMainModel=false`);
        console.log(`  - Set collection isModelFolder=false so it shows as a regular collection`);
        console.log(`\nRe-run with --apply to apply fixes.`);
        return await prisma.$disconnect();
    }

    // 2. Reset all models
    const ids = models.map(m => m.id);
    const modelResult = await prisma.model.updateMany({
        where: { id: { in: ids } },
        data: {
            isHidden: false,
            isComponent: false,
            isMainModel: false,
        }
    });
    console.log(`\n✅ Reset ${modelResult.count} model(s).`);

    // 3. Revert collection to regular folder
    await prisma.collection.update({
        where: { id: COL_ID },
        data: { isModelFolder: false }
    });
    console.log(`✅ Collection "${col.name}" reverted to regular folder (isModelFolder=false).`);
    console.log(`\nAll ${models.length} models should now be visible in the UI.`);

    await prisma.$disconnect();
}
run().catch(e => { console.error('❌ Failed:', e.message); process.exit(1); });
