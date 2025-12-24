import { useCallback, useRef, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ScrollArea } from './ui/scroll-area';
import { Input } from './ui/input';
import { FolderPlus, Trash, Layers, Tag } from 'lucide-react';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import { RendererPool } from '../utils/rendererPool';
import TagsInput from './TagsInput';
import { ConfigManager } from '../utils/configManager';

interface ModelUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUploaded?: () => void;
  initialFolder?: string;
}

export const ModelUploadDialog: React.FC<ModelUploadDialogProps> = ({ isOpen, onClose, onUploaded, initialFolder }: ModelUploadDialogProps) => {
  const [files, setFiles] = useState<File[]>([] as File[]);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Destination State
  const [folders, setFolders] = useState<string[]>(['uploads']);
  const [singleDestination, setSingleDestination] = useState<string>(initialFolder || 'uploads');

  // Group / Collection Features
  const [isGroupUpload, setIsGroupUpload] = useState(false);
  const [groupDescription, setGroupDescription] = useState('');
  const [autoTagFolder, setAutoTagFolder] = useState(true); // Default to true for convenience
  const [newCollectionName, setNewCollectionName] = useState('');
  const [parentFolder, setParentFolder] = useState('uploads');

  // Standard Metadata
  const [generatePreviews, setGeneratePreviews] = useState<boolean>(true);
  const [previewGenerating, setPreviewGenerating] = useState<boolean>(false);
  const [previewProgress, setPreviewProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [availableCategories, setAvailableCategories] = useState<string[]>(['Uncategorized']);
  const [selectedCategory, setSelectedCategory] = useState<string>('Uncategorized');
  const [applyTags, setApplyTags] = useState<string[]>([]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dt = e.dataTransfer;
    if (!dt) return;
    const arr = Array.from(dt.files as FileList);

    // Filter out .gcode.3mf files and show helpful message
    const gcodeArchives: File[] = [];
    const validFiles: File[] = [];

    arr.forEach((f: File) => {
      const lowerName = f.name.toLowerCase();
      if (lowerName.endsWith('.gcode.3mf') || lowerName.endsWith('.3mf.gcode')) {
        gcodeArchives.push(f);
      } else if (/\.3mf$/i.test(f.name) || /\.stl$/i.test(f.name)) {
        validFiles.push(f);
      }
    });

    if (gcodeArchives.length > 0) {
      const fileNames = gcodeArchives.map(f => f.name).join(', ');
      toast.error(`G-code archives (${fileNames}) should be uploaded via the G-code analysis dialog in the model details panel`);
    }

    if (validFiles.length === 0 && gcodeArchives.length === 0) {
      toast.error('Please drop .3mf or .stl files only');
      return;
    }

    if (validFiles.length > 0) {
      setFiles(prev => ([...prev, ...validFiles]));
    }
  }, []);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arr = Array.from(e.target.files || []) as File[];

    // Filter out .gcode.3mf files and show helpful message
    const gcodeArchives: File[] = [];
    const validFiles: File[] = [];

    arr.forEach((f: File) => {
      const lowerName = f.name.toLowerCase();
      if (lowerName.endsWith('.gcode.3mf') || lowerName.endsWith('.3mf.gcode')) {
        gcodeArchives.push(f);
      } else if (/\.3mf$/i.test(f.name) || /\.stl$/i.test(f.name)) {
        validFiles.push(f);
      }
    });

    if (gcodeArchives.length > 0) {
      const fileNames = gcodeArchives.map(f => f.name).join(', ');
      toast.error(`G-code archives (${fileNames}) should be uploaded via the G-code analysis dialog in the model details panel`);
    }

    if (validFiles.length === 0 && gcodeArchives.length === 0) {
      toast.error('Please select .3mf or .stl files');
      return;
    }

    if (validFiles.length > 0) {
      setFiles(prev => ([...prev, ...validFiles]));
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  async function applyCategoryAndTagsTo(relPath: string, candidateModel: any | null) {
    const trimmedCat = (selectedCategory || 'Uncategorized').trim() || 'Uncategorized';

    let finalTags = [...applyTags];
    if (autoTagFolder) {
      // Extract folder name from destination
      const folderName = singleDestination.split('/').pop() || singleDestination;
      if (folderName && folderName !== 'uploads' && !finalTags.includes(folderName)) {
        finalTags.push(folderName);
      }
    }
    const hasTags = finalTags.length > 0;

    let jsonPath = '';
    if (relPath.toLowerCase().endsWith('.3mf')) jsonPath = relPath.replace(/\.3mf$/i, '-munchie.json');
    else if (relPath.toLowerCase().endsWith('.stl')) jsonPath = relPath.replace(/\.stl$/i, '-stl-munchie.json');
    else jsonPath = `${relPath}-munchie.json`;

    const changes: any = { filePath: jsonPath, category: trimmedCat };
    if (hasTags) {
      const baseTags: string[] = Array.isArray(candidateModel?.tags) ? candidateModel.tags : [];
      const union = new Map<string, string>();
      for (const t of baseTags) if (typeof t === 'string' && t.trim()) union.set(t.trim().toLowerCase(), t.trim());
      for (const t of applyTags) if (typeof t === 'string' && t.trim()) union.set(t.trim().toLowerCase(), t.trim());
      changes.tags = Array.from(union.values());
    }

    try {
      const saveResp = await fetch('/api/save-model', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
      if (!saveResp.ok) {
        const txt = await saveResp.text();
        console.warn('Failed to save category/tags for', jsonPath, txt);
      }
    } catch (e) {
      console.warn('Failed to save category/tags for', jsonPath, e);
    }
  }

  const handleSubmit = async () => {
    if (files.length === 0) {
      toast.error('No files selected');
      return;
    }
    setIsUploading(true);
    const fd = new FormData();
    for (const f of files) fd.append('files', f, f.name);

    const destArray: string[] = files.map(() => singleDestination || 'uploads');
    fd.append('destinations', JSON.stringify(destArray));

    if (isGroupUpload || groupDescription) {
      fd.append('createCollection', 'true');
      fd.append('collectionDescription', groupDescription);
      // Also tag the collection itself if requested
      if (autoTagFolder) {
        const folderName = singleDestination.split('/').pop() || '';
        if (folderName) fd.append('collectionTags', JSON.stringify([...applyTags, folderName]));
      } else {
        fd.append('collectionTags', JSON.stringify(applyTags));
      }
    }

    try {
      const resp = await fetch('/api/upload-models', { method: 'POST', body: fd });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(txt || 'Upload failed');
      }
      const data = await resp.json();
      toast.success(`Uploaded ${(Array.isArray(data.saved) ? data.saved.length : files.length)} files`);

      const savedPaths: string[] = Array.isArray(data.saved) ? data.saved : [];

      if (generatePreviews && savedPaths.length > 0) {
        setPreviewGenerating(true);
        setPreviewProgress({ current: 0, total: savedPaths.length });
        try {
          const modelsResp = await fetch('/api/models');
          const allModels = modelsResp.ok ? await modelsResp.json() : [];

          for (let i = 0; i < savedPaths.length; i++) {
            const rel = savedPaths[i];
            try {
              const candidate = allModels.find((m: any) => {
                if (!m) return false;
                if (m.filePath && m.filePath.replace(/\\/g, '/') === rel.replace(/\\/g, '/')) return true;
                if (m.modelUrl && m.modelUrl.endsWith(rel.replace(/\\/g, '/'))) return true;
                return false;
              }) || null;

              await applyCategoryAndTagsTo(rel, candidate);

              const hasParsed = candidate && Array.isArray(candidate.parsedImages) && candidate.parsedImages.length > 0;
              const hasUser = candidate && candidate.userDefined && Array.isArray(candidate.userDefined.images) && candidate.userDefined.images.length > 0;
              if (!hasParsed && !hasUser) {
                const modelUrl = candidate?.modelUrl;
                if (modelUrl) {
                  let dataUrl: string | null = null;
                  try { dataUrl = await RendererPool.captureModel(modelUrl); } catch (e) { console.warn('Capture failed for', modelUrl, e); }
                  if (dataUrl) {
                    let jsonPath = '';
                    if (rel.toLowerCase().endsWith('.3mf')) jsonPath = rel.replace(/\.3mf$/i, '-munchie.json');
                    else if (rel.toLowerCase().endsWith('.stl')) jsonPath = rel.replace(/\.stl$/i, '-stl-munchie.json');
                    else jsonPath = `${rel}-munchie.json`;

                    const payload: any = { filePath: jsonPath, userDefined: { images: [dataUrl], imageOrder: ['user:0'], thumbnail: 'user:0' } };
                    try {
                      const saveResp = await fetch('/api/save-model', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                      if (!saveResp.ok) {
                        const txt = await saveResp.text();
                        console.warn('Failed to save captured image for', jsonPath, txt);
                      }
                    } catch (e) {
                      console.warn('Failed to save captured image for', jsonPath, e);
                    }
                  }
                }
              }

              setPreviewProgress(prev => ({ ...prev, current: prev.current + 1 }));
            } catch (e) {
              console.warn('Per-file post-upload handling error', e);
              setPreviewProgress(prev => ({ ...prev, current: prev.current + 1 }));
            }
          }
        } catch (e) {
          console.warn('Post-upload handling failed:', e);
        } finally {
          setPreviewGenerating(false);
          await new Promise(res => setTimeout(res, 300));
        }
      } else if (savedPaths.length > 0) {
        try {
          const modelsResp = await fetch('/api/models');
          const allModels = modelsResp.ok ? await modelsResp.json() : [];
          for (const rel of savedPaths) {
            const candidate = allModels.find((m: any) => m && ((m.filePath && m.filePath.replace(/\\/g, '/') === rel.replace(/\\/g, '/')) || (m.modelUrl && m.modelUrl.endsWith(rel.replace(/\\/g, '/'))))) || null;
            await applyCategoryAndTagsTo(rel, candidate);
          }
        } catch (e) {
          // ignore
        }
      }

      setFiles([]);
      onUploaded?.();
      onClose();
    } catch (err: any) {
      console.error('Upload error', err);
      toast.error(err?.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (isGroupUpload) {
        // Mode: New Folder/Collection
        // Path = Parent + / + Name
        const cleanParent = parentFolder === 'root' ? '' : parentFolder;
        const cleanName = newCollectionName.replace(/[^a-zA-Z0-9_\- ]/g, '').trim();
        const fullPath = cleanParent ? `${cleanParent}/${cleanName}` : cleanName;
        setSingleDestination(fullPath || 'uploads');
    } else {
        // Mode: Direct Upload -> Destination is just the selected folder
        setSingleDestination(parentFolder);
    }
  }, [isGroupUpload, parentFolder, newCollectionName]);

  useEffect(() => {
    if (!isOpen) return;
    setFiles([]);
    setParentFolder(initialFolder || 'uploads');
    setNewCollectionName('');
    setIsGroupUpload(false);
    setSelectedCategory('Uncategorized');
    setApplyTags([]);

    (async () => {
      try {
        const resp = await fetch('/api/model-folders');
        if (!resp.ok) return;
        const data = await resp.json();
        if (data && Array.isArray(data.folders)) setFolders(Array.from(new Set(['uploads', ...data.folders])));
      } catch (e) {
        // ignore
      }
    })();

    try {
      const cfg = ConfigManager.loadConfig();
      const cats = Array.isArray(cfg?.categories) ? cfg.categories.map((c: any) => c?.label || c?.id).filter(Boolean) : [];
      setAvailableCategories(Array.from(new Set(['Uncategorized', ...cats])));
    } catch {
      // ignore
    }

    // rely on global TagsInput suggestions (context-driven); no local fetch needed
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload 3MF / STL Files</DialogTitle>
          <DialogDescription>
            Choose destination, optional category and tags to apply to all uploaded models, and optionally generate previews.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[65vh] pr-2">
          <div className="p-4">
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              className="border-2 border-dashed border-border rounded p-6 text-center bg-card cursor-pointer"
              onClick={() => inputRef.current?.click()}
            >
              <p className="text-sm text-muted-foreground">Drag & drop .3mf or .stl files here, or click to browse</p>
              <p className="text-xs text-muted-foreground mt-2">Files will be saved to the configured models/ directory and processed automatically.</p>
              <input ref={inputRef} type="file" multiple accept=".3mf,.stl" onChange={onFileChange} className="hidden" />
            </div>

            <div className="mt-4">

{/* 2. Destination & Grouping */}
<div className="grid gap-4 border p-4 rounded-lg bg-card mb-4">
                
                {/* Mode Toggle */}
                <div className="flex items-start space-x-2 mb-2">
                    <Checkbox 
                        id="group-upload" 
                        checked={isGroupUpload} 
                        onCheckedChange={(v) => setIsGroupUpload(!!v)} 
                    />
                    <div className="grid gap-1.5 leading-none">
                        <Label htmlFor="group-upload" className="flex items-center gap-2 cursor-pointer font-semibold">
                            <Layers className="h-4 w-4 text-primary" />
                            Create as New Collection
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            {isGroupUpload 
                                ? "Files will be uploaded into a NEW folder created inside the path below."
                                : "Useful for uploading of muliple related models. Eg. a unzipped download from Printables."
                            }
                        </p>
                    </div>
                </div>

                <div className="space-y-4 pt-2 border-t">
                    {/* Parent Folder Selector */}
                    <div className="space-y-2">
                        <Label className="text-xs uppercase text-muted-foreground font-bold">
                            {isGroupUpload ? "Create Inside (Parent)" : "Upload To (Target)"}
                        </Label>
                        <Select value={parentFolder} onValueChange={setParentFolder}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select folder..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="uploads">/uploads (Root)</SelectItem>
                                {(folders || []).filter(f => f !== 'uploads').map(f => (
                                    <SelectItem key={f} value={f}>{f}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* New Collection Name Input (Only visible when checked) */}
                    {isGroupUpload && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                            <Label className="text-xs uppercase text-muted-foreground font-bold text-primary">
                                New Collection Name
                            </Label>
                            <div className="flex items-center gap-2">
                                <FolderPlus className="h-4 w-4 text-muted-foreground" />
                                <Input 
                                    value={newCollectionName} 
                                    onChange={(e) => setNewCollectionName(e.target.value)} 
                                    placeholder="e.g. Red Race Car" 
                                    autoFocus
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Final Path: <code>models/{singleDestination}</code>
                            </p>
                        </div>
                    )}

                    {/* Description (Only visible when checked) */}
                    {isGroupUpload && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                            <Label className="text-xs uppercase text-muted-foreground font-bold">
                                Description (Optional)
                            </Label>
                            <Textarea 
                                value={groupDescription} 
                                onChange={(e) => setGroupDescription(e.target.value)} 
                                placeholder="Describe this collection..." 
                                rows={2}
                            />
                        </div>
                    )}
                </div>
            </div>

              {/* Metadata & Tagging */}
              <div className="grid gap-4 border p-4 rounded-lg bg-card mb-4">
                <Label className="text-base font-semibold">Metadata</Label>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                      <SelectContent>
                        {availableCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tags</Label>
                    <TagsInput value={applyTags} onChange={setApplyTags} placeholder="Add tags..." />
                  </div>
                </div>

                {/* [NEW] Auto-Tag Checkbox */}
                <div className="flex items-center space-x-2">
                  <Checkbox id="auto-tag" checked={autoTagFolder} onCheckedChange={(v) => setAutoTagFolder(!!v)} />
                  <Label htmlFor="auto-tag" className="flex items-center gap-2 cursor-pointer text-sm font-normal">
                    <Tag className="h-3.5 w-3.5 text-blue-500" />
                    Auto-tag with folder name (e.g. adds "{singleDestination.split('/').pop()}" tag)
                  </Label>
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <Checkbox id="gen-previews" checked={generatePreviews} onCheckedChange={(v) => setGeneratePreviews(Boolean(v))} />
                  <Label htmlFor="gen-previews" className="text-sm text-foreground">Generate preview images after upload</Label>
                </div>
              </div>

              {files.length === 0 ? (
                <div className="text-sm text-muted-foreground">No files selected</div>
              ) : (
                <ScrollArea className="h-40">
                  <ul className="space-y-2">
                    {files.map((f, i) => (
                      <li key={i} className={`flex items-center justify-between p-2 rounded bg-muted/20`}>
                        <div className="text-sm w-3/4">
                          <div className="font-medium">{f.name}</div>
                          <div className="text-xs text-muted-foreground">{Math.round(f.size / 1024)} KB</div>
                          <div className="mt-2 text-xs text-muted-foreground">Destination: {singleDestination || 'uploads'}</div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => removeFile(i)}>
                            <Trash className="h-4 w-4" />
                            Remove
                          </Button>
                          <div className="text-xs text-muted-foreground">{i + 1}/{files.length}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </div>

            {previewGenerating && (
              <div className="px-6 pb-4">
                <div className="text-sm text-foreground mb-1">Generating previews: {previewProgress.current}/{previewProgress.total}</div>
                <div className="w-full bg-muted h-2 rounded overflow-hidden">
                  <div style={{ width: `${Math.min(100, Math.round((previewProgress.current / Math.max(1, previewProgress.total)) * 100))}%` }} className="h-2 bg-accent" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <div className="flex gap-2 justify-end w-full">
            <Button variant="outline" onClick={onClose} disabled={isUploading || previewGenerating}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isUploading || files.length === 0}>
              {isUploading ? 'Uploading...' : (isGroupUpload ? 'Create Collection & Upload' : 'Upload Files')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ModelUploadDialog;
