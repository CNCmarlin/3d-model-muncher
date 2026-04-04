#!/usr/bin/env node
/**
 * Track 1: ModelFile Junk Cleanup Script
 *
 * The original migration engine ingested every file in each model folder as a
 * ModelFile record, including thumbnails, PDFs, Word docs, DS_Store, and even
 * folder names. This leaves ~35k records for only ~1k models.
 *
 * This script removes the junk rows in three targeted passes:
 *   Pass A: Delete records with non-model extensions (thumbnails, PDFs, images, etc.)
 *   Pass B: Delete records with no extension at all (folder names ingested as files)
 *   Pass C: Deduplicate — keep only one record per unique filePath, preferring the
 *            isPrimary=true record or the most recently created one.
 *
 * Usage:
 *   node server/scripts/cleanup-model-files.js            -- dry run (preview only)
 *   node server/scripts/cleanup-model-files.js --apply    -- apply changes
 *
 * ALWAYS run without --apply first to review the numbers.
 */

const path = require('path');
process.chdir(path.resolve(__dirname, '../../'));
const prisma = require('../../server-utils/db');

const APPLY = process.argv.includes('--apply');

// Extensions that are definitively NOT 3D model files and should not be in ModelFile.
// Model files: stl, 3mf, obj, gcode, bgcode, step, stp, f3d, blend
// Anything else is junk.
const JUNK_EXTENSIONS = new Set([
    'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp',   // Images / thumbnails
    'pdf', 'docx', 'doc', 'txt', 'xlsx', 'csv',    // Documents
    'zip', 'rar', '7z', 'tar', 'gz',               // Archives
    'mp4', 'mov', 'avi', 'mkv',                     // Video
    'svg', 'ai', 'eps', 'psd',                      // Design files
    'py', 'js', 'ts', 'sh', 'bat', 'ps1',          // Scripts
    'xml', 'yaml', 'yml',                           // Config
    // Thumbnail-specific composite extensions handled by pattern below
]);

// Patterns: filenames that are definitively junk regardless of extension
const JUNK_FILENAME_PATTERNS = [
    /\.stl-thumb\.(png|jpg|webp)$/i,
    /\.3mf-thumb\.(png|jpg|webp)$/i,
    /\.obj-thumb\.(png|jpg|webp)$/i,
    /\.stl-embedded-thumb\.(png|jpg|webp)$/i,
    /\.3mf-embedded-thumb\.(png|jpg|webp)$/i,
    /^\.DS_Store$/i,
    /^Thumbs\.db$/i,
];

function classifyRecord(record) {
    const filename = record.filename || path.basename(record.filePath || '');
    const ext = path.extname(filename).toLowerCase().replace('.', '');

    // Pass B: No extension = folder name or bare file
    if (!ext) return 'no-extension';

    // Pass A: Known junk extension
    if (JUNK_EXTENSIONS.has(ext)) return `junk-ext:${ext}`;

    // Pass A: Junk filename pattern
    for (const pattern of JUNK_FILENAME_PATTERNS) {
        if (pattern.test(filename)) return `junk-pattern`;
    }

    return 'ok';
}

async function run() {
    console.log(`\n🧹 ModelFile Junk Cleanup`);
    console.log(`Mode: ${APPLY ? '✅ APPLY (writing changes)' : '🔍 DRY RUN (use --apply to write)'}\n`);

    const allFiles = await prisma.modelFile.findMany({
        select: { id: true, filename: true, filePath: true, fileType: true, isPrimary: true, modelId: true, createdAt: true },
    });

    console.log(`Total ModelFile records: ${allFiles.length}`);

    // ─── Pass A & B: Identify junk ─────────────────────────────────
    const junkIds = [];
    const junkBreakdown = {};

    for (const record of allFiles) {
        const reason = classifyRecord(record);
        if (reason !== 'ok') {
            junkIds.push(record.id);
            junkBreakdown[reason] = (junkBreakdown[reason] || 0) + 1;
        }
    }

    console.log(`\n📋 Pass A+B — Junk records to delete: ${junkIds.length}`);
    Object.entries(junkBreakdown)
        .sort(([, a], [, b]) => b - a)
        .forEach(([reason, count]) => console.log(`   ${count.toString().padStart(6)} × ${reason}`));

    // ─── Pass C: Deduplication (same filePath, multiple records) ────
    const cleanFiles = allFiles.filter(r => !junkIds.includes(r.id));
    const pathGroups = {};
    for (const record of cleanFiles) {
        const key = (record.filePath || '').toLowerCase();
        if (!pathGroups[key]) pathGroups[key] = [];
        pathGroups[key].push(record);
    }

    const dupIdsToDelete = [];
    let dupGroupCount = 0;
    for (const [filePath, records] of Object.entries(pathGroups)) {
        if (records.length <= 1) continue;
        dupGroupCount++;

        // Keep: prefer isPrimary=true, then most recently created
        records.sort((a, b) => {
            if (a.isPrimary && !b.isPrimary) return -1;
            if (!a.isPrimary && b.isPrimary) return 1;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        const [keep, ...discard] = records;
        dupIdsToDelete.push(...discard.map(r => r.id));
    }

    console.log(`\n📋 Pass C — Duplicate groups: ${dupGroupCount}, excess records to delete: ${dupIdsToDelete.length}`);
    if (dupGroupCount > 0 && dupGroupCount <= 20) {
        for (const [filePath, records] of Object.entries(pathGroups)) {
            if (records.length > 1) {
                console.log(`   ${records.length}x  ${filePath}`);
            }
        }
    }

    const totalToDelete = junkIds.length + dupIdsToDelete.length;
    console.log(`\n─────────────────────────────────────────────────`);
    console.log(`Total records to delete: ${totalToDelete}`);
    console.log(`Records that will remain: ${allFiles.length - totalToDelete}`);
    console.log(`─────────────────────────────────────────────────`);

    if (totalToDelete === 0) {
        console.log('\n✅ Nothing to clean up. Database is already tidy.');
        await prisma.$disconnect();
        return;
    }

    if (!APPLY) {
        console.log(`\n💡 Re-run with --apply to delete ${totalToDelete} record(s).`);
        await prisma.$disconnect();
        return;
    }

    // ─── Apply ───────────────────────────────────────────────────────
    console.log('\n⚙️  Applying changes...');

    // Delete in batches of 500 to avoid SQLite limits
    const BATCH = 500;
    const allIdsToDelete = [...junkIds, ...dupIdsToDelete];
    let deleted = 0;

    for (let i = 0; i < allIdsToDelete.length; i += BATCH) {
        const batch = allIdsToDelete.slice(i, i + BATCH);
        const result = await prisma.modelFile.deleteMany({
            where: { id: { in: batch } },
        });
        deleted += result.count;
        process.stdout.write(`\r   Deleted ${deleted} / ${allIdsToDelete.length}...`);
    }

    console.log(`\n✅ Done. Deleted ${deleted} junk/duplicate ModelFile record(s).`);
    console.log(`   Records remaining: ${allFiles.length - deleted}`);

    await prisma.$disconnect();
}

run().catch(err => {
    console.error('❌ Script failed:', err.message);
    process.exit(1);
});
