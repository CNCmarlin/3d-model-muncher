import * as fs from 'fs';
import * as path from 'path';
import { ProjectService } from './ProjectService';

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

    // Replace Sections 6, 7, and 8 with:
    return await ProjectService.finalizeProject({
      mode: 'thingiverse',
      destDir,
      modelsRoot,
      importedFiles,
      localImagePaths,
      targetFolder,
      meta: {
        id: thingId,
        name: meta.name,
        description: meta.description,
        public_url: meta.public_url,
        license: meta.license,
        creatorName: meta.creator?.name,
        tags: meta.tags?.map((t: any) => t.name)
      }
    });
  }
}