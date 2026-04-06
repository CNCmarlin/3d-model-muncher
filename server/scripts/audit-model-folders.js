/**
 * Audit: Model Folder Health Check
 *
 * Finds collections with isModelFolder=true that are in broken states:
 *   - Type A: No primary model (isMainModel=true) — models invisible if all hidden
 *   - Type B: All models hidden (isHidden=true) — nothing shows in UI
 *   - Type C: Zero models — orphaned model folder shell
 *
 * Usage:
 *   node server/scripts/audit-model-folders.js            -- report only
 *   node server/scripts/audit-model-folders.js --fix      -- auto-fix safe cases
 */
const path = require('path');
process.chdir(path.resolve(__dirname, '../../'));
const prisma = require('../../server-utils/db');

const FIX = process.argv.includes('--fix');

async function run() {
    console.log(`\n🔍 Model Folder Health Audit`);
    console.log(`Mode: ${FIX ? '🔧 FIX (safe auto-repairs)' : '📋 REPORT ONLY'}\n`);

    // Fetch all model-folder collections with their models
    const modelFolders = await prisma.collection.findMany({
        where: { isModelFolder: true },
        include: {
            parent: { select: { name: true } },
            models: {
                where: { isDeleted: false },
                select: { id: true, name: true, isMainModel: true, isComponent: true, isHidden: true }
            }
        }
    });

    console.log(`Total isModelFolder=true collections: ${modelFolders.length}\n`);

    const typeA = []; // No primary
    const typeB = []; // All hidden
    const typeC = []; // Zero models
    const healthy = [];

    for (const col of modelFolders) {
        const models = col.models;
        const hasPrimary = models.some(m => m.isMainModel);
        const allHidden = models.length > 0 && models.every(m => m.isHidden);
        const noModels = models.length === 0;
        const visibleCount = models.filter(m => !m.isHidden).length;

        if (noModels) {
            typeC.push(col);
        } else if (!hasPrimary) {
            typeA.push({ col, models, allHidden, visibleCount });
        } else if (allHidden) {
            // Has primary but everything hidden
            typeB.push({ col, models, visibleCount });
        } else {
            healthy.push({ col, models, visibleCount });
        }
    }

    // ── Type A: No primary (the camera bug) ──────────────────────────────────
    console.log(`─────────────────────────────────────────────────`);
    console.log(`🔴 Type A — No primary model (${typeA.length})`);
    console.log(`   (isMainModel=true is missing; may be invisible if all hidden)`);
    for (const { col, models, allHidden, visibleCount } of typeA) {
        const parentName = col.parent?.name || '(root)';
        const icon = allHidden ? '⛔' : '⚠️';
        console.log(`  ${icon} "${parentName} → ${col.name}"  models=${models.length} visible=${visibleCount} allHidden=${allHidden}`);
        models.forEach(m => {
            const flags = [m.isMainModel && 'MAIN', m.isComponent && 'COMP', m.isHidden && 'HIDDEN'].filter(Boolean).join(' ');
            console.log(`       → "${m.name}" [${flags || 'normal'}]`);
        });
    }

    // ── Type B: All hidden (has primary but still invisible) ─────────────────
    console.log(`\n🟡 Type B — All models hidden (${typeB.length})`);
    for (const { col, models } of typeB) {
        const parentName = col.parent?.name || '(root)';
        console.log(`  ⚠️  "${parentName} → ${col.name}"  models=${models.length}`);
    }

    // ── Type C: Empty shell ───────────────────────────────────────────────────
    console.log(`\n🟠 Type C — Zero models (orphaned shell) (${typeC.length})`);
    for (const col of typeC) {
        const parentName = col.parent?.name || '(root)';
        console.log(`  🗑️  "${parentName} → ${col.name}"  (no models at all)`);
    }

    // ── Healthy ───────────────────────────────────────────────────────────────
    console.log(`\n✅ Healthy (has primary, has visible models) (${healthy.length})`);
    for (const { col, models, visibleCount } of healthy) {
        const primaryName = models.find(m => m.isMainModel)?.name || '?';
        const parentName = col.parent?.name || '(root)';
        console.log(`  ✓ "${parentName} → ${col.name}"  primary="${primaryName}" total=${models.length} visible=${visibleCount}`);
    }

    // ── Summary ────────────────────────────────────────────────────────────────
    const totalBroken = typeA.length + typeB.length + typeC.length;
    console.log(`\n─────────────────────────────────────────────────`);
    console.log(`Summary:`);
    console.log(`  🔴 Type A (no primary):      ${typeA.length}`);
    console.log(`  🟡 Type B (all hidden):      ${typeB.length}`);
    console.log(`  🟠 Type C (empty shell):     ${typeC.length}`);
    console.log(`  ✅ Healthy:                  ${healthy.length}`);
    console.log(`  Total broken:                ${totalBroken}`);
    console.log(`─────────────────────────────────────────────────`);

    if (totalBroken === 0) {
        console.log('\n🎉 No broken model folders found!');
        return await prisma.$disconnect();
    }

    // ── Auto-Fix ───────────────────────────────────────────────────────────────
    if (!FIX) {
        console.log(`\n💡 Re-run with --fix to auto-repair safe cases:`);
        console.log(`   • Type A where allHidden: reset isHidden=false, isComponent=false, isModelFolder=false`);
        console.log(`   • Type C: set isModelFolder=false (no models to worry about)`);
        return await prisma.$disconnect();
    }

    console.log(`\n🔧 Applying fixes...`);
    let fixed = 0;

    // Fix Type A (all hidden, no primary) - same as Camera bug
    for (const { col, models, allHidden } of typeA) {
        if (!allHidden) {
            console.log(`  ⏭️  "${col.name}": skipping — has visible models but no primary. Manual review needed.`);
            continue;
        }
        const ids = models.map(m => m.id);
        await prisma.model.updateMany({
            where: { id: { in: ids } },
            data: { isHidden: false, isComponent: false, isMainModel: false }
        });
        await prisma.collection.update({
            where: { id: col.id },
            data: { isModelFolder: false }
        });
        console.log(`  ✅ Fixed "${col.name}": ${ids.length} models unhidden, collection reverted.`);
        fixed++;
    }

    // Fix Type C - just clear the flag
    for (const col of typeC) {
        await prisma.collection.update({
            where: { id: col.id },
            data: { isModelFolder: false }
        });
        console.log(`  ✅ Fixed "${col.name}": isModelFolder cleared (no models affected).`);
        fixed++;
    }

    console.log(`\n✅ Fixed ${fixed} collection(s).`);
    if (typeA.filter(x => !x.allHidden).length > 0) {
        console.log(`⚠️  ${typeA.filter(x => !x.allHidden).length} Type A case(s) skipped — have partial visibility, need manual review.`);
    }

    await prisma.$disconnect();
}
run().catch(e => { console.error('❌ Failed:', e.message); process.exit(1); });
