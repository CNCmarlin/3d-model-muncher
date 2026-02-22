const fs = require('fs');
const path = require('path');
// We use a try-catch for sharp so the server doesn't crash if it's missing
let sharp;
try { sharp = require('sharp'); } catch (e) { console.warn('Sharp missing'); }

async function generateCover(collection, modelsRoot, outputDir, idToPathMap) {
  if (!sharp) throw new Error('Sharp module is not installed. Run "npm install sharp"');

  // 1. Get the candidates (first 4 distinct model IDs)
  const candidates = [...new Set(collection.modelIds || [])].slice(0, 4);
  
  // We strictly need 4 images for a perfect quad. 
  // If < 4, we return null (the frontend will fallback to "Single Cover" mode)
  if (candidates.length < 4) {
    return { success: false, reason: 'Not enough models for a quad (need 4+)' };
  }

  // 2. Resolve paths to their thumbnails
  const imageBuffers = [];
  
  for (const modelId of candidates) {
    const jsonPath = idToPathMap[modelId];
    if (!jsonPath || !fs.existsSync(jsonPath)) continue;

    try {
      const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      // Find the first valid image (thumbnail)
      let imgRelPath = null;
      
      // Check standard locations
      if (json.images && json.images.length > 0) imgRelPath = json.images[0];
      else if (json.parsedImages && json.parsedImages.length > 0) imgRelPath = json.parsedImages[0];
      
      if (!imgRelPath) continue;

      // Resolve relative URL to absolute file system path
      // Expected format: "/models/subdir/image.png" -> "C:/.../models/subdir/image.png"
      const cleanRel = imgRelPath.replace(/^\/models\//, '').replace(/^models\//, '');
      const absImgPath = path.join(modelsRoot, cleanRel);

      if (fs.existsSync(absImgPath)) {
        // Resize immediately to 400x400 to normalize
        const buffer = await sharp(absImgPath)
          .resize(400, 400, { fit: 'cover', position: 'center' })
          .toBuffer();
        imageBuffers.push(buffer);
      }
    } catch (e) {
      console.warn(`Failed to process image for model ${modelId}:`, e.message);
    }
  }

  // 3. Final Check: Do we actually have 4 valid image buffers?
  if (imageBuffers.length < 4) {
    return { success: false, reason: `Found ${imageBuffers.length} valid thumbnails, needed 4` };
  }

  // 4. Composite
  // Create a blank 800x800 canvas
  const composite = await sharp({
    create: {
      width: 800,
      height: 800,
      channels: 3,
      background: { r: 20, g: 20, b: 20 } // Dark gray background
    }
  })
  .composite([
    { input: imageBuffers[0], top: 0, left: 0 },
    { input: imageBuffers[1], top: 0, left: 400 },
    { input: imageBuffers[2], top: 400, left: 0 },
    { input: imageBuffers[3], top: 400, left: 400 },
  ])
  .jpeg({ quality: 90 })
  .toBuffer();

  // 5. Save
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const filename = `${collection.id}.jpg`;
  const outputPath = path.join(outputDir, filename);
  fs.writeFileSync(outputPath, composite);

  return { 
    success: true, 
    path: `/data/covers/${filename}`, // This path assumes you serve /data statically or handle it
    absPath: outputPath 
  };
}

module.exports = { generateCover };