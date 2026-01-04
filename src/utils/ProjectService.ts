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
  static async finalizeProject(options: ProjectOptions) {
    const { mode, destDir, modelsRoot, importedFiles, localImagePaths = [], targetFolder, meta } = options;
    
    const destRelPath = path.relative(modelsRoot, destDir).replace(/\\/g, '/');
    const relativeWebFolder = `/models/${destRelPath}`;
    const isGlobalRoot = !targetFolder || targetFolder === '.' || targetFolder === '';
    
    // --- 6. GENERATE STANDARDIZED IDENTITIES ---
    for (let i = 0; i < importedFiles.length; i++) {
      const currentFile = importedFiles[i];
      const isMain = i === 0;
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
        parsedImages: modelGallery,
        related_files: [
          ...importedFiles.map(f => `${destRelPath}/${f}`),
          ...(fs.existsSync(path.join(destDir, 'instructions.md')) ? [`${destRelPath}/instructions.md`] : [])
        ],
        userDefined: {
          thumbnail: 'parsed:0',
          imageOrder: modelGallery.map((_, idx) => `parsed:${idx}`),
          description: description,
          images: []
        }
      });

      const jsonFileName = currentFile.toLowerCase().endsWith('.3mf')
        ? currentFile.replace(/\.3mf$/i, '-munchie.json')
        : currentFile.replace(/\.stl$/i, '-stl-munchie.json');

      const jsonPath = path.join(destDir, jsonFileName);
      fs.writeFileSync(jsonPath, JSON.stringify(modelIdentity, null, 2));

      // --- ROBUST AUTO-THUMBNAIL GENERATION ---
      try {
        const thumbName = cleanName + '-thumb.png';
        const thumbPath = path.join(destDir, thumbName);
        const BASE_URL = process.env.HOST_URL || `http://127.0.0.1:${process.env.PORT || 9000}`;

        console.log(`📸 Generating 3D Render for: ${cleanName}`);
        await generateThumbnail(sourcePath, thumbPath, BASE_URL, undefined, modelsRoot);

        const relativeThumbUrl = `/models/${path.relative(modelsRoot, thumbPath).replace(/\\/g, '/')}`;
        const freshJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        if (!freshJson.parsedImages.includes(relativeThumbUrl)) {
          freshJson.parsedImages.unshift(relativeThumbUrl);
          freshJson.userDefined.thumbnail = 'parsed:0';
          freshJson.thumbnail = 'parsed:0';
          freshJson.userDefined.imageOrder = freshJson.parsedImages.map((_: any, idx: any) => `parsed:${idx}`);
        }

        fs.writeFileSync(jsonPath, JSON.stringify(freshJson, null, 2));
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

    // --- 8. RETURN THE MAIN MODEL ---
    const mainFile = importedFiles[0];
    const mainJsonPath = mainFile.toLowerCase().endsWith('.3mf')
      ? mainFile.replace('.3mf', '-munchie.json')
      : mainFile.replace('.stl', '-stl-munchie.json');

    return JSON.parse(fs.readFileSync(path.join(destDir, mainJsonPath), 'utf8'));
  }
}