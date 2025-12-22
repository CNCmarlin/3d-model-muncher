import JSZip from "jszip";
import { toast } from "sonner";
import { Model } from "../types/model"; 

export function normalizeModelPath(url: string | undefined | null): string | null {
  if (!url) return null;
  let resolved = url.replace(/\\/g, '/');
  if (resolved.startsWith('http')) return resolved; 
  
  if (resolved.startsWith('/models/')) {
    // ok
  } else if (resolved.startsWith('models/')) {
    resolved = '/' + resolved;
  } else {
    const trimmed = resolved.replace(/^\/+/, '');
    resolved = '/models/' + trimmed;
  }
  return resolved;
}

export function extractFileName(resolvedPath: string | null): string {
  if (!resolvedPath) return '';
  const parts = resolvedPath.split(/[/\\]/);
  const name = parts.pop() || '';
  return name.split('?')[0]; 
}

export function triggerDownload(url: string | undefined | null, e?: MouseEvent, downloadName?: string) {
  if (e && typeof (e as MouseEvent).stopPropagation === 'function') {
    (e as MouseEvent).stopPropagation();
  }
  const resolved = normalizeModelPath(url);
  if (!resolved) return;
  const fileName = typeof downloadName === 'string' && downloadName ? downloadName : extractFileName(resolved);
  
  const link = document.createElement('a');
  link.href = resolved;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Fetch helper that handles the API we just added to server.js
async function fetchFileBlob(path: string): Promise<Blob | null> {
    try {
        const encoded = encodeURIComponent(path);
        const resp = await fetch(`/api/download?path=${encoded}`);
        if (resp.ok) return await resp.blob();
        console.warn(`Download API failed for ${path}: ${resp.status}`);
    } catch (e) {
        console.error("Fetch failed for", path, e);
    }
    return null;
}

// Fixed downloadAllFiles (Single Model, Multiple Files)
export const downloadAllFiles = async (mainFilePath: string, relatedFiles: string[], baseName: string) => {
  const toastId = toast.loading("Preparing ZIP archive...");
  try {
    const zip = new JSZip();
    
    // 1. Main File
    const mainBlob = await fetchFileBlob(mainFilePath);
    if (mainBlob) {
        zip.file(extractFileName(mainFilePath) || 'model.file', mainBlob);
    }

    // 2. Related Files
    if (relatedFiles && relatedFiles.length > 0) {
        await Promise.all(relatedFiles.map(async (rf) => {
            const blob = await fetchFileBlob(rf);
            if (blob) {
                zip.file(extractFileName(rf), blob);
            }
        }));
    }

    const content = await zip.generateAsync({ type: "blob" });
    if (content.size === 0) throw new Error("Zip is empty (files not found)");

    const url = window.URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}_Files.zip`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    toast.dismiss(toastId);
    toast.success("Files downloaded!");
  } catch (error) {
    console.error("Zip download failed", error);
    toast.dismiss(toastId);
    toast.error("Failed to create ZIP (check console)");
  }
};

// New: Download Multiple Models (Bulk)
export const downloadMultipleModels = async (models: Model[]) => {
    if (!models || models.length === 0) return;
    const toastId = toast.loading(`Zipping ${models.length} models...`);

    try {
        const zip = new JSZip();
        let count = 0;

        await Promise.all(models.map(async (model) => {
            const folderName = model.name.replace(/[^a-z0-9\-_ ]/gi, '').trim() || model.id;
            const folder = zip.folder(folderName);
            if (!folder) return;

            // Main
            const mainPath = normalizeModelPath(model.modelUrl || model.filePath);
            if (mainPath) {
                const blob = await fetchFileBlob(mainPath);
                if (blob) {
                    folder.file(extractFileName(mainPath), blob);
                    count++;
                }
            }

            // Related
            if (model.related_files && model.related_files.length > 0) {
                await Promise.all(model.related_files.map(async (rf) => {
                    const rfPath = normalizeModelPath(rf);
                    if (rfPath) {
                        const blob = await fetchFileBlob(rfPath);
                        if (blob) {
                            folder.file(extractFileName(rfPath), blob);
                            count++;
                        }
                    }
                }));
            }
        }));

        if (count === 0) throw new Error("No files could be downloaded");

        const content = await zip.generateAsync({ type: "blob" });
        const url = window.URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Bulk_Models_${new Date().toISOString().slice(0,10)}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        toast.dismiss(toastId);
        toast.success("Bulk download complete!");
    } catch (e) {
        console.error(e);
        toast.dismiss(toastId);
        toast.error("Bulk download failed");
    }
};