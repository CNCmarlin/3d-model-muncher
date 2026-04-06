/**
 * DB-Mode Heal Service
 *
 * Four DB-native operations (no munchie JSON reading/writing):
 *   0. Normalize ModelImage paths missing /models/ prefix  → UPDATE
 *   1. Extract embedded thumbnails from 3MF files          → ModelImage rows
 *   2. Claim untracked sibling gallery images              → ModelImage rows
 *   3. Scrub stale ModelImage rows (file missing)          → DELETE
 *
 * All operations are driven by Prisma queries and write only to:
 *   - The filesystem (extracted PNG thumbnails)
 *   - The ModelImage table
 */

const fs = require('fs');
const path = require('path');
const prisma = require('../../server-utils/db');
const { getAbsoluteModelsPath } = require('../../server-utils/dataAccess');
const { hasEmbeddedThumbnail, extractEmbeddedThumbnail } = require('../../server-utils/thumbnailExtraction');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

/**
 * Resolve a ModelFile.filePath to an absolute path on disk.
 */
function resolveAbsPath(filePath, modelsDir) {
    if (!filePath) return null;
    if (path.isAbsolute(filePath)) return filePath;
    let clean = filePath;
    if (clean.startsWith('/models/')) clean = clean.substring(8);
    else if (clean.startsWith('models/')) clean = clean.substring(7);
    return path.join(modelsDir, clean);
}

/**
 * Main heal function.
 * @param {boolean} dryRun - If true, report changes without writing anything.
 * @returns {Promise<HealReport>}
 */
async function heal(dryRun = false) {
    const modelsDir = getAbsoluteModelsPath();
    if (!modelsDir || !fs.existsSync(modelsDir)) {
        throw new Error('Models directory missing or undefined');
    }

    const report = {
        dryRun,
        normalize: { processed: 0, fixed: 0, skipped: 0 },
        embedded: { processed: 0, extracted: 0, alreadyDone: 0, noEmbed: 0, errors: [] },
        gallery: { processed: 0, added: 0, errors: [] },
        stale: { processed: 0, removed: 0, errors: [] },
        details: [], // per-model summary entries for the preview dialog
    };

    // ═══════════════════════════════════════════════════════════════
    // STEP 0 — Normalize ModelImage paths missing /models/ prefix
    // Idempotent: rows already prefixed are untouched.
    // ═══════════════════════════════════════════════════════════════
    const unprefixedImages = await prisma.modelImage.findMany({
        select: { id: true, path: true },
        where: {
            NOT: [
                { path: { startsWith: '/models/' } },
                { path: { startsWith: 'data:image' } },
            ],
        },
    });

    report.normalize.processed = unprefixedImages.length;

    for (const img of unprefixedImages) {
        const corrected = `/models/${img.path}`;
        const absPath = path.join(modelsDir, img.path);
        if (!fs.existsSync(absPath)) {
            report.normalize.skipped++;
            continue; // Stale — Step 3 will delete it
        }
        report.normalize.fixed++;
        if (!dryRun) {
            await prisma.modelImage.update({
                where: { id: img.id },
                data: { path: corrected },
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 1 — Extract embedded thumbnails from 3MF ModelFile rows
    // ═══════════════════════════════════════════════════════════════
    const threeMFFiles = await prisma.modelFile.findMany({
        where: {
            fileType: '3mf',
            isPrimary: true,
            model: { isDeleted: false },
        },
        select: {
            id: true,
            filePath: true,
            filename: true,
            modelId: true,
            model: {
                select: {
                    id: true,
                    name: true,
                    images: {
                        where: { source: 'thumbnail' },
                        select: { id: true, path: true, order: true },
                    },
                },
            },
        },
    });

    for (const mf of threeMFFiles) {
        report.embedded.processed++;
        const detail = { model: mf.model?.name || mf.modelId, additions: [], deletions: [], modifications: [] };

        try {
            const absPath = resolveAbsPath(mf.filePath, modelsDir);
            if (!absPath || !fs.existsSync(absPath)) {
                report.embedded.errors.push({ model: mf.model?.name, error: 'File not found on disk' });
                continue;
            }

            // Already has embedded thumb tracked in DB?
            const hasEmbeddedInDB = mf.model.images.some(img =>
                (img.path || '').includes('-embedded-thumb')
            );
            if (hasEmbeddedInDB) {
                report.embedded.alreadyDone++;
                continue;
            }

            // Does the 3MF actually contain an embedded thumbnail?
            if (!hasEmbeddedThumbnail(absPath)) {
                report.embedded.noEmbed++;
                continue;
            }

            const dir = path.dirname(absPath);
            const baseName = path.basename(absPath, path.extname(absPath));
            const thumbName = `${baseName}-embedded-thumb.png`;
            const thumbAbsPath = path.join(dir, thumbName);
            const thumbRelPath = path.relative(modelsDir, thumbAbsPath).replace(/\\/g, '/');
            const thumbUrl = `/models/${thumbRelPath}`;

            detail.additions.push(`${thumbName} (Embedded thumbnail extracted from 3MF)`);

            if (!dryRun) {
                // Extract to disk if not already there
                if (!fs.existsSync(thumbAbsPath)) {
                    const ok = await extractEmbeddedThumbnail(absPath, thumbAbsPath);
                    if (!ok) {
                        report.embedded.errors.push({ model: mf.model?.name, error: 'extractEmbeddedThumbnail returned false' });
                        continue;
                    }
                }

                // Shift existing thumbnail orders up by 1 so embedded lands at 0
                if (mf.model.images.length > 0) {
                    await prisma.modelImage.updateMany({
                        where: { modelId: mf.modelId, source: 'thumbnail' },
                        data: { order: { increment: 1 } },
                    });
                }

                // Insert embedded thumb at order 0
                await prisma.modelImage.create({
                    data: {
                        modelId: mf.modelId,
                        path: thumbUrl,
                        source: 'thumbnail',
                        sourceFile: mf.filename || path.basename(absPath),
                        order: 0,
                    },
                });
            }

            report.embedded.extracted++;
            if (detail.additions.length) report.details.push(detail);

        } catch (e) {
            report.embedded.errors.push({ model: mf.model?.name || mf.modelId, error: e.message });
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 2 — Claim untracked sibling gallery images
    // ═══════════════════════════════════════════════════════════════
    const allModels = await prisma.model.findMany({
        where: { isDeleted: false, modelUrl: { not: null } },
        select: {
            id: true,
            name: true,
            modelUrl: true,
            images: { select: { path: true } },
        },
    });

    for (const model of allModels) {
        report.gallery.processed++;
        const detail = { model: model.name, additions: [], deletions: [], modifications: [] };

        try {
            const relModelPath = (model.modelUrl || '').replace(/^\/models\//, '');
            if (!relModelPath) continue;

            const modelDir = path.join(modelsDir, path.dirname(relModelPath));
            if (!fs.existsSync(modelDir)) continue;

            const existingPaths = new Set(model.images.map(img => img.path));
            const modelBaseName = path.basename(relModelPath, path.extname(relModelPath)).toLowerCase();

            let dirEntries;
            try {
                dirEntries = fs.readdirSync(modelDir);
            } catch {
                continue;
            }

            const newImages = [];
            for (const file of dirEntries) {
                const ext = path.extname(file).toLowerCase();
                if (!IMAGE_EXTS.has(ext)) continue;
                if (!file.toLowerCase().startsWith(modelBaseName)) continue;

                const imgRelPath = path.join(path.dirname(relModelPath), file).replace(/\\/g, '/');
                const imgUrl = `/models/${imgRelPath}`;

                if (!existingPaths.has(imgUrl)) {
                    newImages.push({ file, imgUrl });
                }
            }

            if (newImages.length > 0) {
                newImages.forEach(({ file }) =>
                    detail.additions.push(`${file} (Untracked gallery image claimed)`)
                );

                if (!dryRun) {
                    // Get current max gallery order
                    const agg = await prisma.modelImage.aggregate({
                        where: { modelId: model.id, source: 'gallery' },
                        _max: { order: true },
                    });
                    let order = (agg._max.order ?? -1) + 1;

                    for (const { imgUrl } of newImages) {
                        await prisma.modelImage.create({
                            data: { modelId: model.id, path: imgUrl, source: 'gallery', order: order++ },
                        });
                    }
                }

                report.gallery.added += newImages.length;
                if (detail.additions.length) report.details.push(detail);
            }

        } catch (e) {
            report.gallery.errors.push({ model: model.name, error: e.message });
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 3 — Scrub stale ModelImage rows (file missing on disk)
    // ═══════════════════════════════════════════════════════════════
    const allImages = await prisma.modelImage.findMany({
        select: { id: true, path: true, modelId: true },
        where: {
            // Skip base64 blobs — can't check on disk
            NOT: { path: { startsWith: 'data:image' } },
        },
    });

    const staleIds = [];

    for (const img of allImages) {
        report.stale.processed++;
        try {
            const relPath = img.path.replace(/^\/models\//, '');
            const absPath = path.join(modelsDir, relPath);

            if (!fs.existsSync(absPath)) {
                staleIds.push(img.id);
                report.stale.removed++;

                // Add to details grouped by modelId if not already present
                const existing = report.details.find(d => d._modelId === img.modelId);
                if (existing) {
                    existing.deletions.push(`${path.basename(img.path)} (Stale - file missing on disk)`);
                } else {
                    report.details.push({
                        _modelId: img.modelId,
                        model: `(modelId: ${img.modelId})`,
                        additions: [],
                        deletions: [`${path.basename(img.path)} (Stale - file missing on disk)`],
                        modifications: [],
                    });
                }
            }
        } catch (e) {
            report.stale.errors.push({ imageId: img.id, error: e.message });
        }
    }

    if (!dryRun && staleIds.length > 0) {
        await prisma.modelImage.deleteMany({ where: { id: { in: staleIds } } });
    }

    // Clean up internal _modelId helper
    report.details.forEach(d => delete d._modelId);

    return report;
}

module.exports = { heal };
