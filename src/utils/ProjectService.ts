import * as fs from 'fs';
import * as path from 'path';
import { createStandardModelIdentity } from './modelFactory';
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

export class ProjectService {
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
        if (data.isProjectRoot === true) {
          // Map the JSON back to the STL/3MF filename it represents
          existingBossFile = data.filePath.split('/').pop() || null;
          break;
        }
      } catch (e) { /* Ignore malformed JSONs */ }
    }
    // --- INHERITANCE LOGIC: Load Metadata from Boss File ---
    if (existingBossFile) {
      try {
        const bossJsonPath = path.join(destDir, ProjectService.getMunchieFileName(existingBossFile));
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



    // --- 6. GENERATE STANDARDIZED IDENTITIES ---


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
        ? (isMain ? `tv-${meta.id}` : `tv-${meta.id}-${i}`)
        : (isMain ? meta.id : `${meta.id}-part-${i}`);

      const displayName = meta.name; // User requested static Project Name for all files

      // FLATTENED METADATA STRATEGY: 
      // All files get the full project description and metadata.
      // This allows any file to be promoted to "Main" without losing context.
      const description = meta.description ||
        (mode === 'thingiverse' ? `Imported from Thingiverse: ${meta.public_url}` : 'Local Project');

      // USE HELPER HERE
      const jsonFileName = ProjectService.getMunchieFileName(currentFile);
      const jsonPath = path.join(destDir, jsonFileName);

      let modelIdentity: any;

      if (fs.existsSync(jsonPath)) {
        // MERGE STRATEGY: Preserve existing metadata
        try {
          const existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

          // Update computed lists (images/docs) but keep user overrides
          const allImages = new Set([...(existing.parsedImages || []), ...modelGallery, ...discoveredImages]);
          const allDocs = new Set([...(existing.related_files || []), ...importedFiles.map(f => `${destRelPath}/${f}`), ...discoveredRelated]);

          modelIdentity = {
            ...existing,
            id: modelId, // FORCE ID update to match calculate role (Main vs Part)
            isProjectRoot: isMain, // FORCE role update
            isRelatedPart: !isMain,
            hidden: isMain ? !isGlobalRoot : true,
            parsedImages: Array.from(allImages),
            related_files: Array.from(allDocs)
            // Do NOT reset userDefined, name, description, tags, etc.
          };
          if (!modelIdentity.userDefined) modelIdentity.userDefined = {};

        } catch (e) {
          // Fallback if JSON broken
          modelIdentity = createStandardModelIdentity({
            id: modelId,
            name: displayName,
            hidden: isMain ? !isGlobalRoot : true,
            isRelatedPart: !isMain,
            isProjectRoot: isMain,
            description: description,
            filePath: `${destRelPath}/${currentFile}`,
            modelUrl: `${relativeWebFolder}/${currentFile}`.replace(/\/\//g, '/'),
            // FLATTENED METADATA: All files get project license/source/designer/tags
            license: meta.license || 'Unknown',
            source: meta.public_url || 'Local',
            designer: meta.creatorName || 'Unknown',
            tags: meta.tags || [],
            parsedImages: Array.from(new Set([...modelGallery, ...discoveredImages])),
            related_files: [
              ...importedFiles.map(f => `${destRelPath}/${f}`),
              ...discoveredRelated
            ],
            userDefined: {
              thumbnail: 'parsed:0',
              imageOrder: modelGallery.map((_, idx) => `parsed:${idx}`),
              description: description,
              images: []
            }
          });
        }
      } else {
        // CREATE NEW
        modelIdentity = createStandardModelIdentity({
          id: modelId,
          name: displayName,
          hidden: isMain ? !isGlobalRoot : true,
          isRelatedPart: !isMain,
          isProjectRoot: isMain,
          description: description,
          filePath: `${destRelPath}/${currentFile}`,
          modelUrl: `${relativeWebFolder}/${currentFile}`.replace(/\/\//g, '/'),
          license: meta.license || 'Unknown',
          source: meta.public_url || 'Local',
          designer: meta.creatorName || 'Unknown',
          tags: meta.tags || [],
          parsedImages: Array.from(new Set([...modelGallery, ...discoveredImages])),
          related_files: [
            ...importedFiles.map(f => `${destRelPath}/${f}`),
            ...discoveredRelated
          ],
          userDefined: {
            thumbnail: 'parsed:0',
            imageOrder: modelGallery.map((_, idx) => `parsed:${idx}`),
            description: description,
            images: []
          }
        });
      }

      fs.writeFileSync(jsonPath, JSON.stringify(modelIdentity, null, 2));

      // --- ROBUST AUTO-THUMBNAIL GENERATION ---
      try {
        const cleanName = sanitize(currentFile); // Sanitized name (underscores)
        const rawName = currentFile;             // Raw name (spaces etc)

        let thumbName = cleanName + '-thumb.png';
        let thumbPath = path.join(destDir, thumbName);

        // 1. Check if a thumbnail exists with the RAW filename (e.g. from a move)
        const rawThumbName = rawName + '-thumb.png';
        const rawThumbPath = path.join(destDir, rawThumbName);

        if (fs.existsSync(rawThumbPath)) {
          // Prefer the existing raw-named thumbnail
          thumbName = rawThumbName;
          thumbPath = rawThumbPath;
        }

        const BASE_URL = process.env.HOST_URL || `http://127.0.0.1:${process.env.PORT || 3001}`;
        const sourcePath = path.join(destDir, currentFile); // FIX: Use actual filename for source

        // UPDATED: Check for exact match on disk before rendering
        if (fs.existsSync(thumbPath)) {
          // Skipping render; thumbnail already exists
        } else {
          // Use sanitized name for NEW thumbnails
          thumbName = cleanName + '-thumb.png';
          thumbPath = path.join(destDir, thumbName);
          await generateThumbnail(sourcePath, thumbPath, BASE_URL, undefined, modelsRoot);
        }

        // UPDATED: This part now runs whether we rendered or skipped, 
        // ensuring the munchie JSON is always "aware" of its thumbnail.
        const relativeThumbUrl = `/models/${path.relative(modelsRoot, thumbPath).replace(/\\/g, '/')}`;
        const freshJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        if (!freshJson.parsedImages.includes(relativeThumbUrl)) {
          freshJson.parsedImages.unshift(relativeThumbUrl);

          // Only reset userDefined thumbnail if it was NOT set or was invalid
          if (!freshJson.userDefined.thumbnail || freshJson.userDefined.thumbnail === 'parsed:0') {
            freshJson.userDefined.thumbnail = 'parsed:0';
            freshJson.thumbnail = 'parsed:0';

            // Regenerate imageOrder only if needed
            const currentOrder = freshJson.userDefined.imageOrder || [];
            if (currentOrder.length === 0 || (currentOrder.length === 1 && currentOrder[0] === 'parsed:0')) {
              freshJson.userDefined.imageOrder = freshJson.parsedImages.map((_: any, idx: any) => `parsed:${idx}`);
            }
          }

          // Only write back if we actually modified the JSON
          fs.writeFileSync(jsonPath, JSON.stringify(freshJson, null, 2));
        }
      } catch (genErr) {
        console.error("3D Render failed for project part:", genErr);
      }
    }

    // --- 7. CREATE PROJECT MARKER ---
    const projectMarkerPath = path.join(destDir, 'project.json');
    const projectMarkerContent = {
      id: mode === 'thingiverse' ? `tv-project-${meta.id}` : `project-${meta.id}`,
      name: meta.name,
      type: mode === 'thingiverse' ? 'thingiverse-import' : 'local-project',
      isProjectRoot: true,
      importedAt: new Date().toISOString(),
      sourceUrl: meta.public_url || '',
      mainModelId: mode === 'thingiverse' ? `tv-${meta.id}` : meta.id
    };

    fs.writeFileSync(projectMarkerPath, JSON.stringify(projectMarkerContent, null, 2));
    console.log(`✅ Project marker created at: ${projectMarkerPath}`);

    const finalFiles = fs.readdirSync(destDir).filter(f => f.endsWith('munchie.json'));
    // Instead of assuming index 0, we scan the folder for the munchie with the matching ID.
    for (const jsonFile of finalFiles) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(destDir, jsonFile), 'utf8'));
        // If this munchie's ID matches the one we were told is 'Main'
        if (content.id === meta.id || (mode === 'thingiverse' && content.id === `tv-${meta.id}`)) {
          return content;
        }
      } catch (e) {
        console.error("Error verifying main model for return:", e);
      }
    }

    // --- 8. RETURN THE MAIN MODEL ---
    const mainFile = importedFiles[0];
    // USE HELPER HERE AS WELL
    const mainJsonFileName = ProjectService.getMunchieFileName(mainFile);
    const mainJsonPath = path.join(destDir, mainJsonFileName);

    if (fs.existsSync(mainJsonPath)) {
      return JSON.parse(fs.readFileSync(mainJsonPath, 'utf8'));
    }

    // Final fallback: try to find any munchie if the primary failed
    const finalMunchies = fs.readdirSync(destDir).filter(f => f.toLowerCase().endsWith('munchie.json'));
    if (finalMunchies.length > 0) {
      return JSON.parse(fs.readFileSync(path.join(destDir, finalMunchies[0]), 'utf8'));
    }

    throw new Error("Could not locate a valid model identity file to return.");
  }
}