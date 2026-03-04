const fs = require('fs');
const path = require('path');
const { getAbsoluteModelsPath } = require('./dataAccess');

// We use a try-catch for sharp so the server doesn't crash if it's missing
let sharp;
try { sharp = require('sharp'); } catch (e) { console.warn('Sharp missing'); }

/**
 * DATABASE VERSION: Cover Generator
 * Generates an 800x800 transparent PNG mosaic for collections containing 4+ models.
 */

async function generateCoverForCollection(collectionId, force = false) {
  if (!sharp) throw new Error('Sharp module is not installed. Run "npm install sharp"');

  const prisma = require('./db');
  const col = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: { id: true, name: true, coverImagePath: true, models: { select: { id: true }, take: 4 } }
  });

  if (!col) return { success: false, reason: 'Collection not found' };

  // Strict Rule: Do NOT overwrite a custom user-uploaded cover unless forced
  // If the coverImagePath does NOT contain '/data/covers/', it means they manually uploaded it.
  if (!force && col.coverImagePath && !col.coverImagePath.startsWith('/data/covers/')) {
    return { success: false, reason: 'Collection has a custom user-uploaded cover' };
  }

  const modelIds = col.models.map(m => m.id);
  return await generateCoverFromModelIds(collectionId, modelIds);
}

/**
 * Low-level generator taking exact model IDs
 */
async function generateCoverFromModelIds(collectionId, modelIds) {
  if (!sharp) throw new Error('Sharp module is not installed. Run "npm install sharp"');

  const candidates = [...new Set(modelIds || [])].slice(0, 4);

  if (candidates.length < 4) {
    return { success: false, reason: 'Not enough models for a quad mosaic (need 4+)' };
  }

  const prisma = require('./db');
  const modelsDir = getAbsoluteModelsPath();
  const imageBuffers = [];

  // Fetch models to extract image paths
  for (const mid of candidates) {
    try {
      const model = await prisma.model.findUnique({
        where: { id: mid },
        select: { id: true, thumbnailPath: true, metadata: true, images: { select: { path: true } } }
      });

      if (!model) continue;

      let imgRelPath = model.thumbnailPath;

      // Prefer dedicated images table first if no explicit thumbnailPath
      if (!imgRelPath && model.images && model.images.length > 0) {
        imgRelPath = model.images[0].path;
      }

      // Fallback to legacy metadata JSON blob
      if (!imgRelPath && model.metadata) {
        try {
          const meta = JSON.parse(model.metadata);
          if (meta.thumbnail && !meta.thumbnail.startsWith('parsed:') && !meta.thumbnail.startsWith('user:')) {
            imgRelPath = meta.thumbnail;
          } else if (meta.images && meta.images.length > 0) {
            imgRelPath = meta.images[0];
          }
        } catch (e) { }
      }

      if (!imgRelPath) continue;

      const cleanRel = imgRelPath.replace(/^\/models\//, '').replace(/^models\//, '');
      const absImgPath = path.join(modelsDir, cleanRel);

      if (fs.existsSync(absImgPath)) {
        // Resize immediately to 400x400 to normalize
        const buffer = await sharp(absImgPath)
          .resize(400, 400, { fit: 'cover', position: 'center' })
          .toBuffer();
        imageBuffers.push(buffer);
      }
    } catch (e) {
      console.warn(`[CoverGenerator] Failed to process image for model ${mid}:`, e.message);
    }
  }

  if (imageBuffers.length < 4) {
    return { success: false, reason: `Found ${imageBuffers.length} valid thumbnails, needed 4` };
  }

  // Composite 2x2 grid onto an 800x800 transparent canvas
  const composite = await sharp({
    create: { width: 800, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([
      { input: imageBuffers[0], top: 0, left: 0 },
      { input: imageBuffers[1], top: 0, left: 400 },
      { input: imageBuffers[2], top: 400, left: 0 },
      { input: imageBuffers[3], top: 400, left: 400 },
    ])
    .png()
    .toBuffer();

  // Save
  const outputDir = path.join(process.cwd(), 'data', 'covers');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const encodedId = encodeURIComponent(collectionId);
  const filename = `${encodedId}_cover.png`;
  const outputPath = path.join(outputDir, filename);

  fs.writeFileSync(outputPath, composite);

  // Update the DB immediately
  await prisma.collection.update({
    where: { id: collectionId },
    data: { coverImagePath: `/data/covers/${filename}` }
  });

  console.log(`[CoverGenerator] Generated transparent cover for ${collectionId}`);

  return {
    success: true,
    path: `/data/covers/${filename}`,
    absPath: outputPath
  };
}

module.exports = { generateCoverFromModelIds, generateCoverForCollection };