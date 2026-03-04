import * as fs from 'fs';
import * as path from 'path';
import { generateThumbnail } from './thumbnailGenerator';

const sanitize = (name: string) => name.replace(/[^a-z0-9\.\-]/gi, '_');

export interface ProjectOptions {
  mode: 'thingiverse' | 'generic';
  destDir: string;
  modelsRoot: string;
  importedFiles: string[]; // List of STL/3MF filenames
  localImagePaths?: string[]; // Relative paths to images already in folder
  targetFolder?: string; // e.g., 'imported' or 'models'
  primaryModelFile?: string; // STL/3MF filename
  collectionId?: string | null; // Database collection ID
  meta: {
    id: string; // thingId or existing local modelId
    name: string;
    description?: string;
    public_url?: string;
    license?: string;
    creatorName?: string;
    tags?: string[];
    instructions?: string;
    details?: string;
  };
}

export class ProjectService_db {
  /**
   * Helper to resolve the correct munchie JSON filename based on model extension.
   * Centralizing this makes the service case-insensitive and easy to maintain.
   */
  private static getMunchieFileName(modelFileName: string): string {
    if (/\.3mf$/i.test(modelFileName)) {
      return modelFileName.replace(/\.3mf$/i, '-munchie.json');
    }
    if (/\.stl$/i.test(modelFileName)) {
      return modelFileName.replace(/\.stl$/i, '-stl-munchie.json');
    }
    // Fallback for unknown extensions
    return modelFileName + '-munchie.json';
  }

  static async finalizeProject(options: ProjectOptions) {
    const { mode, destDir, modelsRoot, importedFiles, localImagePaths = [], meta } = options;

    const destRelPath = path.relative(modelsRoot, destDir).replace(/\\/g, '/');
    const relativeWebFolder = `/models/${destRelPath}`;
    const isGlobalRoot = destRelPath === '' || destRelPath === '.';

    let existingBossFile: string | null = null;
    const existingMunchies = fs.readdirSync(destDir).filter(f => f.endsWith('munchie.json'));

    for (const mFile of existingMunchies) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(destDir, mFile), 'utf8'));
        if (data.isMainModel === true || data.isProjectRoot === true) {
          // Map the JSON back to the STL/3MF filename it represents
          existingBossFile = data.filePath.split('/').pop() || null;
          break;
        }
      } catch (e) { /* Ignore malformed JSONs */ }
    }
    // --- INHERITANCE LOGIC: Load Metadata from Boss File ---
    if (existingBossFile) {
      try {
        const bossJsonPath = path.join(destDir, ProjectService_db.getMunchieFileName(existingBossFile));
        if (fs.existsSync(bossJsonPath)) {
          const bossData = JSON.parse(fs.readFileSync(bossJsonPath, 'utf8'));

          // Inherit missing fields from the Project Root
          if (!meta.description && bossData.description) meta.description = bossData.description;
          if ((!meta.tags || meta.tags.length === 0) && bossData.tags) meta.tags = bossData.tags;
          if (!meta.license && bossData.license) meta.license = bossData.license;
          if (!meta.creatorName && bossData.designer) meta.creatorName = bossData.designer;
          if (!meta.public_url && bossData.source) meta.public_url = bossData.source;

          // Also ensure the ID is consistent if we are in "generic" mode (local uploads)
          if (mode === 'generic' && !meta.id && bossData.id) {
            meta.id = bossData.id.replace(/-part-\d+$/, '').replace(/-thumb$/, '');
          }
        }
      } catch (e) { console.warn("Failed to inherit boss metadata", e); }
    }
    // Scan the physical folder for images and documentation to include in metadata
    const allFilesOnDisk = fs.readdirSync(destDir);

    // 1. Identify Images (Excluding thumbnails and backups)
    const discoveredImages = allFilesOnDisk
      .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
      .filter(f => !f.includes('-thumb.png') && !f.includes('.bak'))
      .map(f => `${relativeWebFolder}/${f}`.replace(/\/\//g, '/'));

    // 2. Identify Documents/Related Files (Excluding munchies and backups)
    const discoveredRelated = allFilesOnDisk
      .filter(f => !/\.(jpg|jpeg|png|webp|gif|stl|3mf|json)$/i.test(f))
      .filter(f => !f.includes('.bak') && !f.startsWith('.'))
      .map(f => `${destRelPath}/${f}`.replace(/\/\//g, '/'));

    // --- 6. DATABASE-FIRST METADATA INSERTION ---
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    try {
      // Create a short fingerprint of the folder path so the same Thingiverse ID can exist in multiple folders
      const folderFingerprint = destRelPath ? Buffer.from(destRelPath).toString('base64').replace(/=/g, '').substring(0, 8) : 'root';

      // CLEAR OLD RELATIONS TO PREVENT DUPLICATES ON OVERWRITE/RE-IMPORT in THIS specific folder
      // We identify all models (main + components) associated with this ID in THIS folder
      const baseModelId = mode === 'thingiverse' ? `tv-${meta.id}-${folderFingerprint}` : meta.id;
      const relatedModelIds = await prisma.model.findMany({
        where: { id: { startsWith: baseModelId } },
        select: { id: true }
      });
      const idsToDelete = relatedModelIds.map((m: { id: string }) => m.id);

      if (idsToDelete.length > 0) {
        await prisma.modelFile.deleteMany({ where: { modelId: { in: idsToDelete } } });
        await prisma.modelImage.deleteMany({ where: { modelId: { in: idsToDelete } } });
        await prisma.modelRelatedFile.deleteMany({ where: { modelId: { in: idsToDelete } } });
      }

      for (let i = 0; i < importedFiles.length; i++) {
        const currentFile = importedFiles[i];
        const isMain = options.primaryModelFile
          ? currentFile === options.primaryModelFile
          : (existingBossFile
            ? currentFile === existingBossFile
            : (mode === 'thingiverse' ? i === 0 : (currentFile.includes(meta.id) || i === 0))
          );

        const modelGallery = [...localImagePaths];

        // Logic Switch: Handle ID and naming prefixes
        const modelId = mode === 'thingiverse'
          ? (isMain ? `tv-${meta.id}-${folderFingerprint}` : `tv-${meta.id}-${folderFingerprint}-${i}`)
          : (isMain ? meta.id : `${meta.id}-part-${i}`);

        const displayName = meta.name;
        const description = meta.description || (mode === 'thingiverse' ? `Imported from Thingiverse: ${meta.public_url}` : 'Local Project');

        const primaryFileRel = `${destRelPath}/${currentFile}`.replace(/\/\//g, '/');
        const fileHash = Buffer.from(primaryFileRel).toString('base64');
        const absoluteModelPath = path.join(destDir, currentFile);
        let fileSize = 0;
        if (fs.existsSync(absoluteModelPath)) {
          fileSize = fs.statSync(absoluteModelPath).size;
        }

        // Arrays
        const allParsedImages = Array.from(new Set([...modelGallery, ...discoveredImages]));
        const allRelatedFiles = [
          ...importedFiles.map(f => `${destRelPath}/${f}`),
          ...discoveredRelated
        ];

        // Legacy Metadata blob (to preserve some compatibility for UI)
        const metadataBlob = {
          category: '',
          related_files: allRelatedFiles,
          userDefined: {
            thumbnail: 'parsed:0',
            imageOrder: allParsedImages.map((_, idx) => `parsed:${idx}`),
            description: description,
            images: []
          },
          notes: '',
          hidden: isMain ? !isGlobalRoot : true,
          isRelatedPart: !isMain,
          isMainModel: isMain,
          price: '',
          parsedImages: allParsedImages // Expose this here just in case UI expects it in metadata
        };

        // 6A. Upsert the Model Record using Prisma
        const model = await prisma.model.upsert({
          where: { id: modelId },
          update: {
            name: displayName,
            description: description,
            isMainModel: isMain,
            isComponent: !isMain,
            isHidden: isMain ? !isGlobalRoot : true,
            license: meta.license || 'Unknown',
            designer: meta.creatorName || 'Unknown',
            source: meta.public_url || 'Local',
            modelUrl: `${relativeWebFolder}/${currentFile}`.replace(/\/\//g, '/'),
            metadata: JSON.stringify(metadataBlob),
            updatedAt: new Date(),
            ...(options.collectionId !== undefined && { collectionId: options.collectionId })
            // We specifically do NOT overwrite fields like isFavorite on update
          },
          create: {
            id: modelId,
            name: displayName,
            description: description,
            isMainModel: isMain,
            isComponent: !isMain,
            isHidden: isMain ? !isGlobalRoot : true,
            license: meta.license || 'Unknown',
            designer: meta.creatorName || 'Unknown',
            source: meta.public_url || 'Local',
            pathHash: fileHash, // Base filesystem identity
            modelUrl: `${relativeWebFolder}/${currentFile}`.replace(/\/\//g, '/'),
            collectionId: options.collectionId || null,
            metadata: JSON.stringify(metadataBlob),
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });

        // 6B. Tags
        const tags = meta.tags || [];
        for (const tagName of tags) {
          const tagRecord = await prisma.tag.upsert({
            where: { name: tagName },
            update: {},
            create: { name: tagName }
          });
          await prisma.modelTag.upsert({
            where: { modelId_tagId: { modelId: model.id, tagId: tagRecord.id } },
            update: {},
            create: { modelId: model.id, tagId: tagRecord.id }
          });
        }

        // 6C. File Record
        const ext = path.extname(currentFile).substring(1).toLowerCase();
        await prisma.modelFile.upsert({
          where: { pathHash: fileHash },
          update: {
            size: BigInt(fileSize)
          },
          create: {
            modelId: model.id,
            filename: currentFile,
            filePath: primaryFileRel,
            fileType: ext,
            size: BigInt(fileSize),
            isPrimary: true,
            pathHash: fileHash
          }
        });

        // 6D. Model Related Files (Crucial for UI 'Related Files' Tab)
        for (const relPath of allRelatedFiles) {
          // Avoid self-referencing the main model path as a related file, though the UI handles it safely, it's cleaner
          if (relPath !== primaryFileRel) {
            // Apply the /models/ prefix to match frontend expectations
            const cleanRelPath = relPath.startsWith('/models/') ? relPath : `/models/${relPath}`;
            const relId = `${model.id}_${Buffer.from(cleanRelPath).toString('base64')}`;

            await prisma.modelRelatedFile.upsert({
              where: { id: relId },
              create: {
                id: relId,
                modelId: model.id,
                path: cleanRelPath
              },
              update: {
                path: cleanRelPath
              }
            });
          }
        }

        // --- ROBUST AUTO-THUMBNAIL GENERATION ---
        try {
          const cleanName = sanitize(currentFile);
          const rawName = currentFile;

          let thumbName = cleanName + '-thumb.png';
          let thumbPath = path.join(destDir, thumbName);
          const rawThumbName = rawName + '-thumb.png';
          const rawThumbPath = path.join(destDir, rawThumbName);

          if (fs.existsSync(rawThumbPath)) {
            thumbName = rawThumbName;
            thumbPath = rawThumbPath;
          }

          const BASE_URL = process.env.HOST_URL || `http://127.0.0.1:${process.env.PORT || 3001}`;
          const sourcePath = path.join(destDir, currentFile);

          if (!fs.existsSync(thumbPath) && fs.existsSync(sourcePath)) {
            thumbName = cleanName + '-thumb.png';
            thumbPath = path.join(destDir, thumbName);
            await generateThumbnail(sourcePath, thumbPath, BASE_URL, undefined, modelsRoot);
          }

          const relativeThumbUrl = `/models/${path.relative(modelsRoot, thumbPath).replace(/\\/g, '/')}`;

          // Ensure thumbnail gets registered into the image arrays in DB if generated
          if (!allParsedImages.includes(relativeThumbUrl) && fs.existsSync(thumbPath)) {
            allParsedImages.unshift(relativeThumbUrl);
            metadataBlob.parsedImages = allParsedImages;
            metadataBlob.userDefined.imageOrder = allParsedImages.map((_, idx) => `parsed:${idx}`);

            await prisma.model.update({
              where: { id: model.id },
              data: { metadata: JSON.stringify(metadataBlob) }
            });
          }
        } catch (genErr) {
          console.error("3D Render failed for project part:", genErr);
        }

        // --- 7. DATABASE IMAGE ASSOCIATION ---
        for (let j = 0; j < allParsedImages.length; j++) {
          const imgUrl = allParsedImages[j];
          const cleanPath = imgUrl.replace(/^\/models\//, '');
          const source = cleanPath.includes('-thumb.png') ? 'thumbnail' : 'gallery';

          const existingImg = await prisma.modelImage.findFirst({
            where: { modelId: model.id, path: cleanPath }
          });

          if (existingImg) {
            await prisma.modelImage.update({
              where: { id: existingImg.id },
              data: { order: j }
            });
          } else {
            await prisma.modelImage.create({
              data: {
                modelId: model.id,
                path: cleanPath,
                source,
                sourceFile: source === 'thumbnail' ? currentFile : null,
                order: j
              }
            });
          }
        }

        // Set the primary thumbnail on the Model record
        if (allParsedImages.length > 0) {
          await prisma.model.update({
            where: { id: model.id },
            data: { thumbnailPath: allParsedImages[0].replace(/^\/models\//, '') }
          });
        }
      }

      // --- 8. RETURN THE MAIN MODEL ---
      // We no longer read from json files. Build a complete Mock Object that matches 
      // what the frontend used to receive from `project.json` or `*-munchie.json`.
      let mainModelId = meta.id;
      if (mode === 'thingiverse') {
        const folderFingerprint = destRelPath ? Buffer.from(destRelPath).toString('base64').replace(/=/g, '').substring(0, 8) : 'root';
        mainModelId = `tv-${meta.id}-${folderFingerprint}`;
      }

      const mainRecord = await prisma.model.findUnique({ where: { id: mainModelId } });

      if (mainRecord) {
        const parsedMeta = mainRecord.metadata ? JSON.parse(mainRecord.metadata as string) : {};
        return {
          id: mainRecord.id,
          name: mainRecord.name,
          description: mainRecord.description,
          isMainModel: mainRecord.isMainModel,
          parsedImages: parsedMeta.parsedImages || [],
          related_files: parsedMeta.related_files || [],
          userDefined: parsedMeta.userDefined || {}
        };
      } else {
        // Fallback if main wasn't successfully created
        throw new Error("Could not construct a valid model identity to return.");
      }

    } finally {
      await prisma.$disconnect();
    }
  }
}