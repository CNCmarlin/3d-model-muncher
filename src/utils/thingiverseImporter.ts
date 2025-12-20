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

  // 6. Generate Munchie JSON for ALL files
    // This ensures that even if a user clicks a "child" file in the grid, 
    // they still see the relationship to the parent and siblings.

    const relativeWebPath = destRelPath.replace(/\\/g, '/');
    const mainFile = importedFiles[0];

    // Helper to get full relative web path for a filename
    const getWebPath = (fname: string) => `/models/${relativeWebPath}/${fname}`;
    // Helper to get relative path for related_files list (no /models prefix)
    const getRelPath = (fname: string) => `${relativeWebPath}/${fname}`;

    // Common metadata for the whole group
    const baseMetadata: Partial<Model> = {
        id: `tv-${thingId}`, // All share the same Thing ID base? Or maybe `tv-${thingId}-${index}`? 
                             // Ideally they share an ID if they are variations, but the system expects unique IDs for unique entries.
                             // Let's stick to unique IDs for safety: `tv-${thingId}` for main, others get suffix.
        name: meta.name,
        description: meta.description || `Imported from Thingiverse: ${meta.public_url}`,
        category: 'Uncategorized',
        tags: meta.tags ? meta.tags.map((t: any) => t.name) : [],
        isPrinted: false,
        printTime: '',
        filamentUsed: '',
        license: meta.license || 'Unknown',
        source: meta.public_url,
        designer: meta.creator?.name || 'Unknown',
        printSettings: { layerHeight: '', infill: '', nozzle: '' },
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        // Images are shared across the group
        parsedImages: thumbName ? [getWebPath(thumbName)] : [],
        images: thumbName ? [getWebPath(thumbName)] : [],
        thumbnail: thumbName ? getWebPath(thumbName) : undefined,
    };

    // Iterate all files to generate metadata
    for (let i = 0; i < importedFiles.length; i++) {
        const currentFile = importedFiles[i];
        const isMain = i === 0;
        
        const jsonPath = currentFile.endsWith('.3mf') 
          ? currentFile.replace('.3mf', '-munchie.json')
          : currentFile.replace('.stl', '-stl-munchie.json');

        // Calculate related files: All files in the group EXCEPT the current one
        const others = importedFiles.filter(f => f !== currentFile);
        const relatedList = others.map(f => getRelPath(f));

        const fileData: Model = {
            ...baseMetadata as Model,
            // Unique ID for each file entry to avoid conflicts in the DB/Grid
            id: isMain ? `tv-${thingId}` : `tv-${thingId}-${i}`, 
            name: isMain ? meta.name : `${meta.name} (${currentFile})`, // Differentiate names for children
            filePath: path.join(relativeWebPath, currentFile),
            modelUrl: getWebPath(currentFile),
            fileSize: '0', // Will be updated by scanner/server later if needed
            related_files: relatedList
        };

        fs.writeFileSync(path.join(destDir, jsonPath), JSON.stringify(fileData, null, 2));
    }

    // Return the Main Model object so the server can post-process it (add to collection/category)
    // We recreate the main model object here to ensure the return value matches exactly what was written
    const mainJsonPath = mainFile.endsWith('.3mf') 
        ? mainFile.replace('.3mf', '-munchie.json')
        : mainFile.replace('.stl', '-stl-munchie.json');
    
    const finalMainModel = JSON.parse(fs.readFileSync(path.join(destDir, mainJsonPath), 'utf8'));

    return finalMainModel;
  }
}