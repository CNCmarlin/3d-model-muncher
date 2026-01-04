import { useCallback, useRef, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ScrollArea } from './ui/scroll-area';
import { Input } from './ui/input';
import { FolderPlus, Trash, Layers, Tag, Upload, RefreshCw } from 'lucide-react';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import { RendererPool } from '../utils/rendererPool';
import TagsInput from './TagsInput';
import { ConfigManager } from '../utils/configManager';
import { Model } from '@/types/model';

interface ModelUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUploaded?: (updatedModel?: Model) => void;
  initialFolder?: string;
  targetModel?: Model;
  onIsMovingChange?: (isMoving: boolean) => void;
}

const needsIsolation = (model: Model) => {
  const path = model.filePath || "";
  if (!path.includes('/') || path.startsWith('uploads/')) return true;
  const parts = path.split('/');
  const parentFolder = parts[parts.length - 2];
  const sanitizedName = model.name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim();
  return parentFolder !== sanitizedName;
};

export const ModelUploadDialog: React.FC<ModelUploadDialogProps> = ({ isOpen, onClose, onUploaded, initialFolder, targetModel, onIsMovingChange }: ModelUploadDialogProps) => {
  const [files, setFiles] = useState<File[]>([] as File[]);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [folders, setFolders] = useState<string[]>(['uploads']);
  const [singleDestination, setSingleDestination] = useState<string>(initialFolder || 'uploads');

  const [isGroupUpload, setIsGroupUpload] = useState(false);
  const [groupDescription, setGroupDescription] = useState('');
  const [autoTagFolder, setAutoTagFolder] = useState(true);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [parentFolder, setParentFolder] = useState('uploads');

  const [generatePreviews, setGeneratePreviews] = useState<boolean>(true);
  const [previewGenerating, setPreviewGenerating] = useState<boolean>(false);
  const [previewProgress, setPreviewProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [availableCategories, setAvailableCategories] = useState<string[]>(['Uncategorized']);
  const [selectedCategory, setSelectedCategory] = useState<string>('Uncategorized');
  const [applyTags, setApplyTags] = useState<string[]>([]);

  const isAssetMode = !!targetModel;

  const processIncomingFiles = (incoming: File[]) => {
    const gcodeArchives: File[] = [];
    const validFiles: File[] = [];
    const rejectedFiles: string[] = [];

    incoming.forEach((f: File) => {
      const name = f.name.toLowerCase();
      const isModel = name.endsWith('.stl') || name.endsWith('.3mf');
      const isGcodeArchive = name.endsWith('.gcode.3mf') || name.endsWith('.3mf.gcode');
      const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(name);
      const isDoc = /\.(pdf|txt|md|doc|docx)$/i.test(name);

      if (isGcodeArchive) {
        gcodeArchives.push(f);
      }
      else if (isAssetMode) {
        if (isModel || isImage || isDoc) {
          validFiles.push(f);
        } else {
          rejectedFiles.push(f.name);
        }
      }
      else {
        if (isModel || isImage || isDoc) {
          validFiles.push(f);
        } else {
          rejectedFiles.push(f.name);
        }
      }
    });

    if (gcodeArchives.length > 0) {
      const names = gcodeArchives.map(f => f.name).join(', ');
      toast.error(`G-code archives (${names}) belong in the G-code analysis dialog.`);
    }

    if (rejectedFiles.length > 0) {
      const msg = isAssetMode
        ? "Please drop models, images, or documents only."
        : "Bulk import only supports .stl and .3mf files.";
      toast.error(msg);
    }

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer) return;
    processIncomingFiles(Array.from(e.dataTransfer.files));
  }, [isAssetMode]);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processIncomingFiles(Array.from(e.target.files || []));
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  async function applyCategoryAndTagsTo(relPath: string, candidateModel: any | null) {
    const trimmedCat = (selectedCategory || 'Uncategorized').trim() || 'Uncategorized';
    let finalTags = [...applyTags];
    if (autoTagFolder) {
      const folderName = singleDestination.split('/').pop() || singleDestination;
      if (folderName && folderName !== 'uploads' && !finalTags.includes(folderName)) {
        finalTags.push(folderName);
      }
    }
    let jsonPath = '';
    if (relPath.toLowerCase().endsWith('.3mf')) jsonPath = relPath.replace(/\.3mf$/i, '-munchie.json');
    else if (relPath.toLowerCase().endsWith('.stl')) jsonPath = relPath.replace(/\.stl$/i, '-stl-munchie.json');
    else jsonPath = `${relPath}-munchie.json`;

    const changes: any = { filePath: jsonPath, category: trimmedCat };
    if (finalTags.length > 0) {
      const baseTags: string[] = Array.isArray(candidateModel?.tags) ? candidateModel.tags : [];
      const union = new Map<string, string>();
      for (const t of baseTags) if (typeof t === 'string' && t.trim()) union.set(t.trim().toLowerCase(), t.trim());
      for (const t of finalTags) if (typeof t === 'string' && t.trim()) union.set(t.trim().toLowerCase(), t.trim());
      changes.tags = Array.from(union.values());
    }

    try {
      await fetch('/api/save-model', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
    } catch (e) { console.warn('Failed to save metadata', e); }
  }

  const handleSubmit = async () => {
    if (files.length === 0) {
      toast.error('No files selected');
      return;
    }
    setIsUploading(true);

    try {
      if (isAssetMode && targetModel) {
        let authoritativeModel = targetModel;
        if (needsIsolation(targetModel)) {
          onIsMovingChange?.(true);
          toast.loading("Isolating model into project folder...");
          const moveResp = await fetch('/api/move-model-to-project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId: targetModel.id, targetFolderName: targetModel.name })
          });
          const moveData = await moveResp.json();
          if (!moveData.success) throw new Error("Folder reorganization failed");
          authoritativeModel = moveData.model;
        }

        toast.loading(`Adding ${files.length} assets to project...`);
        for (const file of files) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('modelId', authoritativeModel.id);
          formData.append('filePath', authoritativeModel.filePath);

          const name = file.name.toLowerCase();
          let assetType = 'document';
          if (/\.(jpg|jpeg|png|webp)$/i.test(name)) assetType = 'image';
          if (name.endsWith('.stl') || name.endsWith('.3mf')) assetType = 'model';
          formData.append('assetType', assetType);

          const resp = await fetch('/api/models/upload-document', { method: 'POST', body: formData });
          if (resp.ok) {
            const result = await resp.json();
            if (result.success) authoritativeModel = result.model;
          }
        }

        toast.success("Project updated successfully");
        onIsMovingChange?.(false);
        onUploaded?.(authoritativeModel);
        onClose();
      }
      else {
        const fd = new FormData();
        for (const f of files) fd.append('files', f, f.name);
        const destArray: string[] = files.map(() => singleDestination || 'uploads');
        fd.append('destinations', JSON.stringify(destArray));

        if (isGroupUpload || groupDescription) {
          fd.append('createCollection', 'true');
          fd.append('collectionDescription', groupDescription);
          const tags = autoTagFolder ? [...applyTags, singleDestination.split('/').pop() || ''] : applyTags;
          fd.append('collectionTags', JSON.stringify(tags));
        }

        const resp = await fetch('/api/upload-models', { method: 'POST', body: fd });
        if (!resp.ok) throw new Error('Upload failed');
        const data = await resp.json();
        toast.success(`Uploaded ${data.saved?.length || files.length} files`);

        const savedPaths: string[] = Array.isArray(data.saved) ? data.saved : [];

        if (generatePreviews && savedPaths.length > 0) {
          setPreviewGenerating(true);
          setPreviewProgress({ current: 0, total: savedPaths.length });
          const modelsResp = await fetch('/api/models');
          const allModels = modelsResp.ok ? await modelsResp.json() : [];

          for (let i = 0; i < savedPaths.length; i++) {
            const rel = savedPaths[i];
            const candidate = allModels.find((m: any) => m && (m.filePath?.replace(/\\/g, '/') === rel.replace(/\\/g, '/'))) || null;
            await applyCategoryAndTagsTo(rel, candidate);
            setPreviewProgress(prev => ({ ...prev, current: prev.current + 1 }));
          }
          setPreviewGenerating(false);
        } else if (savedPaths.length > 0) {
          const modelsResp = await fetch('/api/models');
          const allModels = modelsResp.ok ? await modelsResp.json() : [];
          for (const rel of savedPaths) {
            const candidate = allModels.find((m: any) => m && (m.filePath?.replace(/\\/g, '/') === rel.replace(/\\/g, '/'))) || null;
            await applyCategoryAndTagsTo(rel, candidate);
          }
        }
        setFiles([]);
        onUploaded?.();
        onClose();
      }
    } catch (err: any) {
      onIsMovingChange?.(false);
      toast.error(err?.message || 'Process failed');
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (isGroupUpload) {
      const cleanParent = parentFolder === 'root' ? '' : parentFolder;
      const cleanName = newCollectionName.replace(/[^a-zA-Z0-9_\- ]/g, '').trim();
      const fullPath = cleanParent ? `${cleanParent}/${cleanName}` : cleanName;
      setSingleDestination(fullPath || 'uploads');
    } else {
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
        if (resp.ok) {
          const data = await resp.json();
          if (data && Array.isArray(data.folders)) setFolders(Array.from(new Set(['uploads', ...data.folders])));
        }
      } catch (e) { }
    })();

    try {
      const cfg = ConfigManager.loadConfig();
      const cats = Array.isArray(cfg?.categories) ? cfg.categories.map((c: any) => c?.label || c?.id).filter(Boolean) : [];
      setAvailableCategories(Array.from(new Set(['Uncategorized', ...cats])));
    } catch { }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isAssetMode ? `Add Project Assets: ${targetModel?.name}` : "Import 3D Models"}</DialogTitle>
          <DialogDescription>
            {isAssetMode ? "Files will be added to this model's specific folder and linked in the sidebar." : "Upload files to your library."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[65vh] pr-2">
          <div className="p-4 space-y-4">
            <div
              onDrop={onDrop} onDragOver={onDragOver} onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-primary/20 rounded-xl p-10 text-center bg-card hover:bg-accent/50 transition-colors cursor-pointer"
            >
              <Upload className="h-10 w-10 mx-auto mb-4 text-primary opacity-50" />
              <p className="text-base font-medium">{isAssetMode ? "Drop models, files, or images here" : "Drop .3mf or .stl files here"}</p>
              <input ref={inputRef} type="file" multiple accept={isAssetMode ? "*" : ".3mf,.stl"} onChange={onFileChange} className="hidden" />
            </div>

            {files.length > 0 && (
              <div className="border rounded-lg p-2 space-y-1">
                <Label className="text-[10px] font-bold uppercase tracking-widest opacity-50 ml-1">Queue</Label>
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/20 text-xs">
                    <span className="truncate flex-1 mr-4 font-medium">{f.name}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeFile(i)}><Trash className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
              </div>
            )}

            {!isAssetMode && (
              <div className="grid gap-4 border p-4 rounded-lg bg-card">
                <div className="flex items-start space-x-2">
                  <Checkbox id="group-upload" checked={isGroupUpload} onCheckedChange={(v) => setIsGroupUpload(!!v)} />
                  <Label htmlFor="group-upload" className="font-semibold cursor-pointer">Create as New Collection</Label>
                </div>
                <Select value={parentFolder} onValueChange={setParentFolder}>
                  <SelectTrigger><SelectValue placeholder="Target Folder" /></SelectTrigger>
                  <SelectContent>{folders.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            {isAssetMode && targetModel && needsIsolation(targetModel) && (
              <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg flex gap-3 items-center">
                <FolderPlus className="h-5 w-5 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  <strong>Note:</strong> This model will be moved into its own project folder to keep assets organized.
                </p>
              </div>
            )}

            <div className="grid gap-4 border p-4 rounded-lg bg-card">
              <Label className="text-sm font-bold uppercase tracking-widest opacity-50">Settings</Label>
              <div className={`grid ${isAssetMode ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
                {!isAssetMode && (
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{availableCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Apply Tags</Label>
                  <TagsInput value={applyTags} onChange={setApplyTags} placeholder="Add labels..." />
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-2 border-t">
                <div className="flex items-center space-x-2">
                  <Checkbox id="auto-tag" checked={autoTagFolder} onCheckedChange={(v) => setAutoTagFolder(!!v)} />
                  <Label htmlFor="auto-tag" className="text-sm font-normal cursor-pointer flex gap-2 items-center">
                    <Tag className="h-3 w-3 text-blue-500" />
                    Auto-tag files with {isAssetMode ? 'model name' : 'folder name'}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="gen-previews" checked={generatePreviews} onCheckedChange={(v) => setGeneratePreviews(Boolean(v))} />
                  <Label htmlFor="gen-previews" className="text-sm font-normal cursor-pointer">Generate thumbnail previews for 3D parts</Label>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="bg-muted/20 p-4 border-t -mx-6 -mb-6 rounded-b-lg">
          <Button variant="ghost" onClick={onClose} disabled={isUploading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isUploading || files.length === 0} className="px-8">
            {isUploading ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Processing...</> : (isAssetMode ? 'Add to Project' : 'Start Import')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ModelUploadDialog;