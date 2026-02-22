import TagsInput from '@/components/common/TagsInput_DB';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Model } from '@/types/model';
import { ConfigManager } from '@/utils/configManager';
import { Separator } from '@radix-ui/react-select';
import { Box, FolderPlus, RefreshCw, Tag, Trash, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface ModelUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUploaded?: (updatedModel?: Model) => void;
  initialFolder?: string;
  initialCollectionId?: string;
  targetModel?: Model;
  onIsMovingChange?: (isMoving: boolean) => void;
}

const needsIsolation = (model: Model) => {
  // 1. THE PROJECT MARKER CHECK (Deterministic)
  // If it's a Root or a Related Part, it's already "Organized".
  if (model.isProjectRoot || model.isRelatedPart) {
    return false;
  }

  // 2. THE JUNK DRAWER CHECK (Fallback)
  // If markers are missing, we check if it's in the root 'uploads/' folder.
  const path = model.filePath || "";
  const parts = path.split('/');

  // It's "Loose" if it's in the root (no slashes) 
  // OR if it's directly inside 'uploads/' (e.g., "uploads/my_model.stl")
  const isLoose = parts.length <= 1 || (parts[0] === 'uploads' && parts.length === 2);

  return isLoose;
};

export const ModelUploadDialog_DB: React.FC<ModelUploadDialogProps> = ({ isOpen, onClose, onUploaded, initialCollectionId, targetModel, onIsMovingChange }: ModelUploadDialogProps) => {
  const [files, setFiles] = useState<File[]>([] as File[]);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [folders, setFolders] = useState<string[]>(['uploads']);

  const [isGroupUpload, setIsGroupUpload] = useState(false);
  const [autoTagFolder, setAutoTagFolder] = useState(true);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [collectionsList, setCollectionsList] = useState<any[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('new');
  const [createPhysicalFolder, setCreatePhysicalFolder] = useState(false);
  const [parentFolder, setParentFolder] = useState('uploads');

  const [generatePreviews, setGeneratePreviews] = useState<boolean>(true);
  const [availableCategories, setAvailableCategories] = useState<string[]>(['Uncategorized']);
  const [selectedCategory, setSelectedCategory] = useState<string>('Uncategorized');
  const [applyTags, setApplyTags] = useState<string[]>([]);
  const [primaryModelFile, setPrimaryModelFile] = useState<string | null>(null);

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
      toast.error(`G - code archives(${names}) belong in the G - code analysis dialog.`);
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


  const handleSubmit = async () => {
    if (files.length === 0) {
      toast.error('No files selected');
      return;
    }

    // NEW: Validation for Asset Folder (Global Mode)
    // Prevents starting import if a Project Folder is requested but no Primary file is set.
    if (!isAssetMode && createPhysicalFolder && !primaryModelFile) {
      toast.error("Main Model Required", {
        description: "Please select which file is the primary model by clicking the 'Main' button in the file list."
      });
      return;
    }

    setIsUploading(true);

    try {
      if (isAssetMode && targetModel) {
        // --- BRANCH 1: ASSET ENRICHMENT (Inside an existing project) ---
        let authoritativeModel = targetModel;

        // 1. Ensure the model has its own folder first
        if (needsIsolation(targetModel)) {
          onIsMovingChange?.(true);
          const moveResp = await fetch('/api/move-model-to-project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId: targetModel.id, targetFolderName: targetModel.name })
          });
          const moveData = await moveResp.json();
          if (!moveData.success) throw new Error("Folder isolation failed");
          authoritativeModel = moveData.model;
        }

        // 2. Upload files into that specific folder (Batch)
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));
        formData.append('modelId', authoritativeModel.id);
        formData.append('filePath', authoritativeModel.filePath);

        const resp = await fetch('/api/models/upload-document', { method: 'POST', body: formData });
        if (resp.ok) {
          const result = await resp.json();
          if (result.success) authoritativeModel = result.model;
        }

        toast.success("Project updated successfully");
        onUploaded?.(authoritativeModel);
        onClose();
      }
      else {
        // --- GLOBAL MODE: Mass Import or Asset Folder ---
        const fd = new FormData();
        files.forEach(f => fd.append('files', f));

        const cleanName = newCollectionName.replace(/[^a-zA-Z0-9_\- ]/g, '').trim();

        if (createPhysicalFolder) {
          // MODE: Asset Folder - Thingiverse Style
          const folderName = cleanName || `Import_${Date.now()} `;
          const targetPath = `${parentFolder}/${folderName}`;
          fd.append('destinations', JSON.stringify(files.map(() => targetPath)));
          fd.append('isProjectFolder', 'true');
          fd.append('projectName', folderName);

          // UPDATED: Pass the user's manual primary model selection to the backend
          if (primaryModelFile) {
            fd.append('primaryModelFile', primaryModelFile);
          }
        } else {
          // MODE: Individual Models
          fd.append('destinations', JSON.stringify(files.map(() => parentFolder)));
        }

        // Logic for Collection grouping (can be applied to either physical mode)
        if (isGroupUpload) {
          fd.append('createCollection', 'true');
          if (selectedCollectionId === 'new') {
            fd.append('collectionName', cleanName || 'New Uploads');
          } else {
            fd.append('collectionId', selectedCollectionId);
          }
        }

        fd.append('category', selectedCategory);
        if (applyTags.length > 0) fd.append('tags', JSON.stringify(applyTags));

        const resp = await fetch('/api/upload-models', { method: 'POST', body: fd });
        if (!resp.ok) throw new Error('Upload failed');

        toast.success("Import complete");
        onUploaded?.();
        onClose();
      }
    } catch (err: any) {
      console.error("Submit Error:", err);
      toast.error(err.message || "Process failed");
    } finally {
      setIsUploading(false);
      onIsMovingChange?.(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setFiles([]);
    setPrimaryModelFile(null);
    setSelectedCollectionId(initialCollectionId || 'new');
    setNewCollectionName('');
    setIsGroupUpload(!!initialCollectionId);
    setSelectedCategory('Uncategorized');
    setApplyTags([]);

    if (initialCollectionId) {
      setIsGroupUpload(true);
      setSelectedCollectionId(initialCollectionId);
    } else {
      setIsGroupUpload(false);
      setSelectedCollectionId('new');
    }

    (async () => {
      try {
        const resp = await fetch('/api/collections');
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.success) setCollectionsList(data.collections);
        }
      } catch (e) { console.error("Failed to load collections", e); }
    })();

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
          <DialogTitle className="flex items-center gap-2">
            {isAssetMode ? <Box className="h-5 w-5 text-primary" /> : <FolderPlus className="h-5 w-5 text-primary" />}
            {isAssetMode ? `Add Project Assets: ${targetModel?.name}` : "Import Models"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isAssetMode
              ? "Files will be added to this specific project folder."
              : "Choose whether to upload loose models or create a dedicated Project Folder."}
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
                {files.map((f, i) => {
                  const is3D = f.name.toLowerCase().endsWith('.stl') || f.name.toLowerCase().endsWith('.3mf');
                  return (
                    <div key={i} className={`flex items-center justify-between p-2 rounded text-xs transition-colors ${primaryModelFile === f.name ? 'bg-primary/10 border border-primary/20' : 'bg-muted/20'}`}>
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {/* Only show "Set as Primary" choice if in Asset Folder mode and it's a 3D file */}
                        {!isAssetMode && createPhysicalFolder && is3D && (
                          <button
                            type="button"
                            onClick={() => setPrimaryModelFile(f.name)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-all ${primaryModelFile === f.name ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:border-primary/50 text-muted-foreground'}`}
                          >
                            <Box className="h-3 w-3" />
                            <span className="text-[10px] font-bold uppercase">Main</span>
                          </button>
                        )}
                        <span className="truncate font-medium">{f.name}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeFile(i)}>
                        <Trash className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {!isAssetMode && (
              <div className="grid gap-4 border p-4 rounded-lg bg-card shadow-sm">
                <div className="space-y-4">
                  {/* Step 1: Logical Grouping (Always Available) */}
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="group-upload"
                        checked={isGroupUpload}
                        onCheckedChange={(v) => setIsGroupUpload(!!v)}
                      />
                      <Label htmlFor="group-upload" className="text-sm font-semibold cursor-pointer">Group into Collection</Label>
                    </div>

                    {isGroupUpload && (
                      <div className="pl-6 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                        <Select value={selectedCollectionId} onValueChange={setSelectedCollectionId}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select a collection..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">+ Create New Collection</SelectItem>
                            {collectionsList.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {selectedCollectionId === 'new' && (
                          <Input
                            placeholder="New Collection Name"
                            className="h-8 text-xs"
                            value={newCollectionName}
                            onChange={(e) => setNewCollectionName(e.target.value)}
                          />
                        )}
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Step 2: Physical Organization Choice */}
                  <div className="space-y-3">
                    <Label className="text-[10px] font-bold uppercase tracking-widest opacity-50">Physical Organization</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setCreatePhysicalFolder(false)}
                        className={`p-3 border rounded-lg text-left transition-all ${!createPhysicalFolder ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'opacity-60'}`}
                      >
                        <Box className="h-4 w-4 mb-2 text-primary" />
                        <div className="font-bold text-xs">Individual Models</div>
                        <div className="text-[10px] text-muted-foreground leading-tight">Loose files in the base directory.</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCreatePhysicalFolder(true)}
                        className={`p-3 border rounded-lg text-left transition-all ${createPhysicalFolder ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'opacity-60'}`}
                      >
                        <FolderPlus className="h-4 w-4 mb-2 text-primary" />
                        <div className="font-bold text-xs">Asset Folder</div>
                        <div className="text-[10px] text-muted-foreground leading-tight">Thingiverse Style: One folder for all files.</div>
                      </button>
                    </div>
                  </div>

                  {/* Step 3: Base Directory */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Base Directory</Label>

                      {/* NEW: Manual Suggestion Link (Appears only when out of sync) */}
                      {!isAssetMode && selectedCollectionId !== 'new' && (() => {
                        try {
                          const b64 = selectedCollectionId.substring(4);
                          const colPath = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
                          if (parentFolder !== colPath) {
                            return (
                              <button
                                type="button"
                                onClick={() => setParentFolder(colPath)}
                                className="text-[10px] text-primary hover:underline flex items-center gap-1 animate-in fade-in slide-in-from-right-1"
                              >
                                <RefreshCw className="h-2.5 w-2.5" /> Use Collection Path
                              </button>
                            );
                          }
                        } catch (e) { return null; }
                      })()}
                    </div>
                    <Select value={parentFolder} onValueChange={setParentFolder}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{folders.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
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
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="auto-tag" checked={autoTagFolder} onCheckedChange={(v) => setAutoTagFolder(!!v)} />
                    <Label htmlFor="auto-tag" className="text-sm font-normal cursor-pointer flex gap-2 items-center">
                      <Tag className="h-3 w-3 text-blue-500" />
                      Auto-tag files with {isAssetMode ? 'model name' : 'folder name'}
                    </Label>
                  </div>

                  {/* NEW: Dynamic Tag Preview Badge */}
                  {autoTagFolder && (
                    <div className="pl-6 animate-in fade-in slide-in-from-left-1 duration-200">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Proposed Tag:</span>
                        <div className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-[10px] font-medium">
                          {isAssetMode
                            ? (targetModel?.name || 'Model Name')
                            : createPhysicalFolder
                              ? (primaryModelFile ? primaryModelFile.replace(/\.(stl|3mf)$/i, '') : (newCollectionName || 'Project Name'))
                              : (parentFolder.split('/').pop() || parentFolder)
                          }
                        </div>
                      </div>
                    </div>
                  )}
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

export default ModelUploadDialog_DB;