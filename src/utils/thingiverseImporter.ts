import * as fs from 'fs';
import * as path from 'path';
import { createStandardModelIdentity } from './modelFactory';
import { generateThumbnail } from './thumbnailGenerator';

// Helper to sanitize filenames
const sanitize = (name: string) => name.replace(/[^a-z0-9\.\-]/gi, '_');

export class ThingiverseImporter {
  private token: string;
  private baseUrl = 'https://api.thingiverse.com';

  constructor(token: string) {
    this.token = token;
  }

  // Generic fetch wrapper with Auth headers
  private async fetchTV(endpoint: string) {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      }
    });

    // 1. Extract Rate Limit Headers
    const limit = res.headers.get('X-RateLimit-Limit');
    const remaining = res.headers.get('X-RateLimit-Remaining');
    if (remaining) {
      console.log(`[Thingiverse API] Quota: ${remaining}/${limit} remaining`);
    }
    if (!res.ok) {
      if (res.status === 401) throw new Error('Invalid Thingiverse Token');
      if (res.status === 404) throw new Error('Thing not found');
      throw new Error(`Thingiverse API Error: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  // Download helper that handles redirects properly
  private async downloadFile(url: string, destPath: string): Promise<void> {
    // We use a custom fetch here because S3 redirects often fail 
    // if you forward the Authorization header to Amazon.
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${this.token}` },
      redirect: 'follow'
    });

    if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);

    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
  }

  async importThing(thingId: string, modelsRoot: string, targetFolder: string = 'imported') {
    console.log(`[Thingiverse] Starting import for ID: ${thingId} to ${targetFolder}`);

    // 1. Fetch Metadata
    const meta = await this.fetchTV(`/things/${thingId}`);

    // 2. Fetch File List
    const fileList = await this.fetchTV(`/things/${thingId}/files`);

    // Filter for 3D files only
    const validFiles = fileList.filter((f: any) =>
      f.name.toLowerCase().endsWith('.stl') ||
      f.name.toLowerCase().endsWith('.3mf')
    );

    if (validFiles.length === 0) throw new Error('No STL or 3MF files found in this Thing.');

    // 3. Create Directory (Sanitized Thing Name)
    const thingName = sanitize(meta.name).substring(0, 64);
    // Combine user's selected target folder with the thing name
    const destRelPath = path.join(targetFolder, thingName);
    const destDir = path.join(modelsRoot, destRelPath);

    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const importedFiles: string[] = [];

    // 4. Download Files
    for (const file of validFiles) {
      const cleanName = sanitize(file.name);
      const dest = path.join(destDir, cleanName);

      console.log(`[Thingiverse] Downloading ${cleanName}...`);
      await this.downloadFile(file.download_url, dest);
      importedFiles.push(cleanName);
    }

    // 5. Download Thumbnail
    const imageList = await this.fetchTV(`/things/${thingId}/images`);
    const localImagePaths: string[] = [];
    const relativeWebFolder = `/models/${destRelPath.replace(/\\/g, '/')}`;
    const modelCount = validFiles.length;
    const totalImages = imageList.length;
    const realPhotosCount = Math.max(1, totalImages - modelCount); // Ensure we keep at least one

    for (let i = 0; i < realPhotosCount; i++) { // Only loop through real photos
      const imgData = imageList[i];
      const imgUrl = imgData.sizes.find((s: any) => s.size === 'original')?.url ||
        imgData.sizes.find((s: any) => s.type === 'display' && s.size === 'large')?.url ||
        imgData.sizes.find((s: any) => s.type === 'preview' && s.size === 'large')?.url ||
        imgData.sizes[0]?.url; // Absolute last resort: the first size available

      // [FIX] Defensive extension stripping to prevent .jpg.jpg
      const baseImgName = sanitize(imgData.name || 'view').replace(/\.(jpg|jpeg|png|gif)$/i, '');
      const imgFileName = `image_${i}_${baseImgName}.jpg`;
      const dest = path.join(destDir, imgFileName);

      console.log(`[Thingiverse] Downloading High-Res Image ${i + 1}/${realPhotosCount}...`);
      await this.downloadFile(imgUrl, dest);
      localImagePaths.push(`${relativeWebFolder}/${imgFileName}`);
    }

    // Capture Instructions as Markdown for the new Document Viewer
    if (meta.details || meta.instructions) {
      const instructionContent = `# Instructions\n\n${meta.instructions || ''}\n\n# Details\n\n${meta.details || ''}`;
      fs.writeFileSync(path.join(destDir, 'instructions.md'), instructionContent);
    }

    // 6. Generate Standardized Identities
    const mainFile = importedFiles[0];

    for (let i = 0; i < importedFiles.length; i++) {
      const currentFile = importedFiles[i];
      const isMain = i === 0;

      const cleanName = sanitize(currentFile);
      const sourcePath = path.join(destDir, cleanName);

      // We clone the localImagePaths for this specific model instance
      const modelGallery = [...localImagePaths];

      const modelIdentity = createStandardModelIdentity({
        id: isMain ? `tv-${thingId}` : `tv-${thingId}-${i}`,
        name: isMain ? meta.name : `${meta.name} (${currentFile})`,
        hidden: !isMain,
        isRelatedPart: !isMain,
        description: meta.description || `Imported from Thingiverse: ${meta.public_url}`,
        filePath: `${destRelPath}/${currentFile}`,
        modelUrl: `${relativeWebFolder}/${currentFile}`.replace(/\/\//g, '/'),
        license: meta.license || 'Unknown',
        source: meta.public_url,
        designer: meta.creator?.name || 'Unknown',
        tags: meta.tags ? meta.tags.map((t: any) => t.name) : [],
        parsedImages: modelGallery,
        related_files: [
          ...importedFiles.map(f => `${destRelPath}/${f}`),
          `${destRelPath}/instructions.md`
        ],
        userDefined: {
          thumbnail: 'parsed:0', // Initially point to first photo
          imageOrder: modelGallery.map((_, idx) => `parsed:${idx}`),
          description: meta.description || `Imported from Thingiverse: ${meta.public_url}`,
          images: []
        }
      });

      const jsonFileName = currentFile.toLowerCase().endsWith('.3mf')
        ? currentFile.replace(/\.3mf$/i, '-munchie.json')
        : currentFile.replace(/\.stl$/i, '-stl-munchie.json');

      const jsonPath = path.join(destDir, jsonFileName);
      fs.writeFileSync(jsonPath, JSON.stringify(modelIdentity, null, 2));

      // --- Robust Auto-Thumbnail Generation ---
      try {
        const thumbName = cleanName + '-thumb.png';
        const thumbPath = path.join(destDir, thumbName);
        const BASE_URL = process.env.HOST_URL || `http://127.0.0.1:${process.env.PORT || 9000}`;

        console.log(`📸 Generating 3D Render for: ${cleanName}`);
        await generateThumbnail(sourcePath, thumbPath, BASE_URL, undefined, modelsRoot);

        const relativeThumbUrl = `/models/${path.relative(modelsRoot, thumbPath).replace(/\\/g, '/')}`;
        const freshJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        // [FIX] Correctly insert the render and REBUILD the imageOrder
        if (!freshJson.parsedImages.includes(relativeThumbUrl)) {
          freshJson.parsedImages.unshift(relativeThumbUrl);

          // thumbnail pointer: parsed:1 = First Real Photo, parsed:0 = 3D Render
          // If you want the photo in the grid, keep 'parsed:1'
          freshJson.userDefined.thumbnail = 'parsed:0';
          freshJson.thumbnail = 'parsed:0';

          // [CRITICAL] Rebuild the order so the gallery sees ALL images including the new render
          freshJson.userDefined.imageOrder = freshJson.parsedImages.map((_: any, idx: any) => `parsed:${idx}`);
        }

        fs.writeFileSync(jsonPath, JSON.stringify(freshJson, null, 2));
      } catch (genErr) {
        console.error("3D Render failed for imported part:", genErr);
      }
    }
    //7. RETURN THE MAIN MODEL
    const mainJsonPath = mainFile.toLowerCase().endsWith('.3mf')
      ? mainFile.replace('.3mf', '-munchie.json')
      : mainFile.replace('.stl', '-stl-munchie.json');

    const finalMainModel = JSON.parse(fs.readFileSync(path.join(destDir, mainJsonPath), 'utf8'));

    return finalMainModel;
  }
}