import * as fs from 'fs';
import * as path from 'path';
import { Model } from '../types/model';

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

  // ... inside class ThingiverseImporter ...

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
    let thumbName = '';
    if (meta.thumbnail) {
      thumbName = `${thingName}-thumb.jpg`;
      await this.downloadFile(meta.thumbnail, path.join(destDir, thumbName));
    }

    // 6. Generate Munchie JSON
    const mainFile = importedFiles[0];
    const jsonPath = mainFile.endsWith('.3mf') 
      ? mainFile.replace('.3mf', '-munchie.json')
      : mainFile.replace('.stl', '-stl-munchie.json');

    // Use forward slashes for URLs/Paths in JSON
    const relativeWebPath = destRelPath.replace(/\\/g, '/');

    const modelData: Model = {
        id: `tv-${thingId}`, // Keep consistent ID
        name: meta.name,
        filePath: path.join(relativeWebPath, mainFile), // Relative path for deletion/mgmt
        fileSize: '0', 
        modelUrl: `/models/${relativeWebPath}/${mainFile}`,
        description: meta.description || `Imported from Thingiverse: ${meta.public_url}`,
        category: 'Uncategorized', // This will be overwritten by the API handler if user selected one
        tags: meta.tags ? meta.tags.map((t: any) => t.name) : [],
        isPrinted: false,
        printTime: '',
        filamentUsed: '',
        license: meta.license || 'Unknown',
        source: meta.public_url,
        designer: meta.creator?.name || 'Unknown',
        // New Image Structure (Canonical)
        parsedImages: thumbName ? [`/models/${relativeWebPath}/${thumbName}`] : [],
        // Legacy fields for compat
        images: thumbName ? [`/models/${relativeWebPath}/${thumbName}`] : [],
        thumbnail: thumbName ? `/models/${relativeWebPath}/${thumbName}` : undefined,
        related_files: importedFiles.slice(1).map(f => `${relativeWebPath}/${f}`),
        printSettings: { layerHeight: '', infill: '', nozzle: '' },
        created: new Date().toISOString(),
        lastModified: new Date().toISOString()
    };

    fs.writeFileSync(path.join(destDir, jsonPath), JSON.stringify(modelData, null, 2));

    // Return the Model object so the server can post-process it (add to collection/category)
    return modelData;
  }
}