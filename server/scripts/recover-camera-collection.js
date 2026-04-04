/**
 * Recovery: Create the missing "C-270 tripod" collection
 * and verify all its models are accessible.
 *
 * The models in 3D Printer/Camera/C-270 tripod/ were correctly linked to
 * collection ID col_M0QgUHJpbnRlci9DYW1lcmEvQy0yNzAgdHJpcG9k ("3D Printer/Camera/C-270 tripod")
 * but that collection record itself was never created in the Collection table.
 *
 * Usage:
 *   node server/scripts/recover-camera-collection.js            -- dry run
 *   node server/scripts/recover-camera-collection.js --apply    -- fix it
 */
const path = require('path');
process.chdir(path.resolve(__dirname, '../../'));
const prisma = require('../../server-utils/db');

const APPLY = process.argv.includes('--apply');

const MISSING_COL_ID = 'col_M0QgUHJpbnRlci9DYW1lcmEvQy0yNzAgdHJpcG9k'; // "3D Printer/Camera/C-270 tripod"
const PARENT_COL_ID  = 'col_M0QgUHJpbnRlci9DYW1lcmE';                   // "3D Printer/Camera"

async function run() {
    console.log(`\n🔧 Camera Collection Recovery`);
    console.log(`Mode: ${APPLY ? '✅ APPLY' : '🔍 DRY RUN'}\n`);

    // 1. Confirm the missing collection does not exist
    const existing = await prisma.collection.findUnique({ where: { id: MISSING_COL_ID } });
    console.log(`Missing collection exists? ${existing ? 'YES (no fix needed!)' : 'NO — will create'}`);
    if (existing) {
        console.log(`  Name: "${existing.name}"`);
        return await prisma.$disconnect();
    }

    // 2. Confirm parent (Camera) exists
    const parent = await prisma.collection.findUnique({
        where: { id: PARENT_COL_ID },
        select: { id: true, name: true, parentId: true }
    });
    if (!parent) {
        console.error(`❌ Parent collection ${PARENT_COL_ID} not found! Cannot proceed.`);
        return await prisma.$disconnect();
    }
    console.log(`Parent collection: "${parent.name}" (${parent.id})`);

    // 3. Count affected models
    const affectedModels = await prisma.model.findMany({
        where: { collectionId: MISSING_COL_ID },
        select: { id: true, name: true, isDeleted: true }
    });
    console.log(`\nModels linked to missing collection: ${affectedModels.length}`);
    affectedModels.forEach(m => console.log(`  → [${m.id}] "${m.name}" deleted=${m.isDeleted}`));

    if (!APPLY) {
        console.log(`\n💡 Re-run with --apply to create the missing collection.`);
        return await prisma.$disconnect();
    }

    // 4. Create the missing collection
    const created = await prisma.collection.create({
        data: {
            id: MISSING_COL_ID,
            name: 'C-270 tripod',
            description: 'Camera tripod parts for Logitech C270',
            parentId: PARENT_COL_ID,
            type: 'folder',
            isModelFolder: false,
            coverImagePath: null,
        }
    });
    console.log(`\n✅ Created collection: "${created.name}" (${created.id})`);
    console.log(`   Parent: ${PARENT_COL_ID}`);
    console.log(`   Models now visible: ${affectedModels.length}`);

    await prisma.$disconnect();
}
run().catch(e => { console.error('❌ Failed:', e.message); process.exit(1); });
