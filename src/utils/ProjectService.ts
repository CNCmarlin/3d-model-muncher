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
    const { mode, destDir, modelsRoot, importedFiles, localImagePaths = [], targetFolder, meta } = options;

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

    // --- NEW: FOLDER ASSET DISCOVERY ---
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

      const cleanName = sanitize(currentFile);
      const sourcePath = path.join(destDir, cleanName);
      const modelGallery = [...localImagePaths];

      // Logic Switch: Handle ID and naming prefixes
      const modelId = mode === 'thingiverse'
        ? (isMain ? `tv-${meta.id}` : `tv-${meta.id}-${i}`)
        : (isMain ? meta.id : `${meta.id}-part-${i}`);

      const displayName = isMain ? meta.name : `${meta.name} (${currentFile})`;

      const description = meta.description ||
        (mode === 'thingiverse' ? `Imported from Thingiverse: ${meta.public_url}` : 'Local Project');

      const modelIdentity = createStandardModelIdentity({
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

      // USE HELPER HERE
      const jsonFileName = ProjectService.getMunchieFileName(currentFile);
      const jsonPath = path.join(destDir, jsonFileName);
      fs.writeFileSync(jsonPath, JSON.stringify(modelIdentity, null, 2));

      // --- ROBUST AUTO-THUMBNAIL GENERATION ---
      try {
        const thumbName = cleanName + '-thumb.png';
        const thumbPath = path.join(destDir, thumbName);
        const BASE_URL = process.env.HOST_URL || `http://127.0.0.1:${process.env.PORT || 9000}`;

        // UPDATED: Check for exact match on disk before rendering
        if (fs.existsSync(thumbPath)) {
          console.log(`⏭️ Skipping render; thumbnail already exists: ${thumbName}`);
        } else {
          console.log(`📸 Generating 3D Render for: ${cleanName}`);
          await generateThumbnail(sourcePath, thumbPath, BASE_URL, undefined, modelsRoot);
        }

        // UPDATED: This part now runs whether we rendered or skipped, 
        // ensuring the munchie JSON is always "aware" of its thumbnail.
        const relativeThumbUrl = `/models/${path.relative(modelsRoot, thumbPath).replace(/\\/g, '/')}`;
        const freshJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        if (!freshJson.parsedImages.includes(relativeThumbUrl)) {
          freshJson.parsedImages.unshift(relativeThumbUrl);
          freshJson.userDefined.thumbnail = 'parsed:0';
          freshJson.thumbnail = 'parsed:0';
          freshJson.userDefined.imageOrder = freshJson.parsedImages.map((_: any, idx: any) => `parsed:${idx}`);

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