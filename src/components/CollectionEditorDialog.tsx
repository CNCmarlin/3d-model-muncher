import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Checkbox } from "./ui/checkbox";
import { Loader2, Save, Trash2, Folder, FolderOpen, ChevronRight, ChevronDown, FolderPlus, Upload, X, Image as ImageIcon, Images, Star } from "lucide-react";
import { toast } from "sonner";
import { Collection } from "../types/collection";
import { Category } from "../types/category";
import { Model } from "../types/model";
import { ScrollArea } from "./ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";

interface CollectionEditorDialogProps {
  collection: Collection | null;
  categories: Category[];
  collections?: Collection[]; // [NEW] List of all collections for parent selection
  models: Model[];
  onSave: (collection: Collection) => Promise<Collection | void>;
  onDelete: (id: string) => Promise<void>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // [NEW] Context props
  initialMode?: 'manual' | 'folder';
  defaultParentId?: string;
}

const defaultCollectionState: Collection = {
  id: '',
  name: '',
  description: '',
  modelIds: [],
  childCollectionIds: [],
  category: '',
  tags: [],
  images: [],
  created: new Date().toISOString(),
  lastModified: new Date().toISOString(),
};

// Helper to shorten long paths for UI
function truncateMiddle(text: string, maxLength: number) {
  if (!text || text.length <= maxLength) return text;
  const startChars = Math.ceil(maxLength / 2) - 2;
  const endChars = Math.floor(maxLength / 2) - 1;
  return `${text.substring(0, startChars)}...${text.substring(text.length - endChars)}`;
}

// --- Folder Tree Helpers (Keep existing implementation) ---
interface FolderNode {
  name: string;
  fullPath: string;
  children: Record<string, FolderNode>;
  fileCount: number;
}

const buildFolderTree = (models: Model[]): FolderNode => {
  const root: FolderNode = { name: 'Root', fullPath: '', children: {}, fileCount: 0 };
  if (!models) return root;
  models.forEach(model => {
    let pathStr = model.modelUrl || model.filePath || '';
    pathStr = pathStr.replace(/^(\/)?models\//, '').replace(/\\/g, '/');
    if (!pathStr) return;
    const parts = pathStr.split('/');
    parts.pop();
    if (parts.length === 0) return;
    let current = root;
    let currentPath = '';
    parts.forEach((part) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!current.children[part]) {
        current.children[part] = { name: part, fullPath: currentPath, children: {}, fileCount: 0 };
      }
      current = current.children[part];
      current.fileCount++;
    });
  });
  return root;
};

const FolderTreeItem = ({ node, level, onSelect }: { node: FolderNode, level: number, onSelect: (node: FolderNode) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = Object.keys(node.children).length > 0;
  return (
    <div className="w-full select-none">
      <div
        className={`flex items-center gap-2 py-1 px-2 rounded-md hover:bg-accent cursor-pointer ${level > 0 ? 'ml-3 border-l border-border/50' : ''}`}
        onClick={(e) => { e.stopPropagation(); onSelect(node); }}
      >
        {hasChildren ? (
          <span className="cursor-pointer p-0.5 hover:bg-muted rounded" onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}>
            {isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          </span>
        ) : <span className="w-4" />}
        {isOpen || (!hasChildren && level > 0) ? <FolderOpen className="h-4 w-4 text-primary" /> : <Folder className="h-4 w-4 text-muted-foreground" />}
        <span className="text-sm truncate flex-1">{node.name}</span>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 rounded-full">{node.fileCount}</span>
      </div>
      {isOpen && hasChildren && (
        <div className="mt-1">
          {Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name)).map((child) => (
            <FolderTreeItem key={child.fullPath} node={child} level={level + 1} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
};

export function CollectionEditorDialog({
  collection,
  categories,
  collections = [], // Default to empty array
  models,
  onSave,
  onDelete,
  open,
  onOpenChange,
  initialMode = 'manual',
  defaultParentId
}: CollectionEditorDialogProps) {
  const [localCollection, setLocalCollection] = useState<Collection>(collection || defaultCollectionState);
  const [isLoading, setIsLoading] = useState(false);

  // [NEW] Local state for enhanced features
  const [createOnDisk, setCreateOnDisk] = useState(false);
  const [parentId, setParentId] = useState<string>("root");

  // [NEW] Separated Pending States
  const [pendingCover, setPendingCover] = useState<File | null>(null);
  const [pendingCoverPreview, setPendingCoverPreview] = useState<string | null>(null);

  const [pendingGallery, setPendingGallery] = useState<File[]>([]);
  const [pendingGalleryPreviews, setPendingGalleryPreviews] = useState<string[]>([]);

  // [NEW] Smart List: Decode IDs to show full paths
  // This solves the "Which 'Test' folder is this?" problem
  const formattedCollections = useMemo(() => {
    return collections
      .filter(c => !collection || c.id !== collection.id) // Exclude self
      .map(c => {
        let displayName = c.name;
        let path = c.name;

        // Try to decode physical path from ID (col_...)
        if (c.id && c.id.startsWith('col_')) {
          try {
            const b64 = c.id.substring(4);
            // Standard base64url decoding
            path = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
            displayName = path.replace(/\//g, ' / ');
          } catch (e) { /* ignore */ }
        }

        return {
          id: c.id,
          name: c.name,
          displayName: displayName,
          path: path
        };
      })
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [collections, collection]);

  // Sync external prop changes & Initialize
  useEffect(() => {
    setLocalCollection(collection || { ...defaultCollectionState, id: '' });

    // Reset Pending
    setPendingCover(null);
    setPendingCoverPreview(null);
    setPendingGallery([]);
    setPendingGalleryPreviews([]);

    if (collection) {
      setParentId(collection.parentId || "root");
      setCreateOnDisk(false);
    } else {
      setParentId(defaultParentId || "root");
      setCreateOnDisk(initialMode === 'folder');
    }
  }, [collection, initialMode, defaultParentId, open]);

  const isEditing = !!collection;
  const folderTree = useMemo(() => buildFolderTree(models), [models]);

  // Filter out self to avoid circular parents

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setLocalCollection(prev => ({ ...prev, [id]: value }));
  };

  const handleCategoryChange = (value: string) => {
    const categoryValue = value === '--none--' ? '' : value;
    setLocalCollection(prev => ({ ...prev, category: categoryValue }));
  };

  const handleFolderSelect = (node: FolderNode) => {
    const folderPrefix = node.fullPath + '/';
    const modelsInFolder = models.filter(m => {
      let path = m.modelUrl || m.filePath || '';
      path = path.replace(/^(\/)?models\//, '').replace(/\\/g, '/');
      return path.startsWith(folderPrefix) || path === node.fullPath;
    });
    const ids = modelsInFolder.map(m => m.id);
    setLocalCollection(prev => ({ ...prev, name: node.name, modelIds: ids }));
    toast.info(`Selected ${ids.length} models from "${node.name}"`);
  };

  // --- 1. COVER PHOTO HANDLER ---
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    // CASE A: Edit Mode (Upload & Set immediately)
    if (localCollection.id) {
      setIsLoading(true);
      const formData = new FormData();
      formData.append('image', file);
      try {
        // 1. Upload
        const res = await fetch(`/api/collections/${localCollection.id}/images`, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success && data.imagePath) {
          // 2. Explicitly Set as Cover
          // We need to update the collection object with the new coverImage path
          const updatedCollection = { ...localCollection, coverImage: data.imagePath };

          // 3. Persist the change to the collection record itself
          // We reuse the onSave prop to patch the collection
          await onSave(updatedCollection);
          setLocalCollection(updatedCollection);

          toast.success("Cover photo updated");
        }
      } catch (err) {
        console.error(err);
        toast.error("Cover upload error");
      }
      setIsLoading(false);
    }
    // CASE B: Create Mode (Pending)
    else {
      setPendingCover(file);
      setPendingCoverPreview(URL.createObjectURL(file));
    }
    e.target.value = '';
  };

  // --- 2. MASS GALLERY HANDLER ---
  const handleMassUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);

    // CASE A: Edit Mode (Loop Upload)
    if (localCollection.id) {
      setIsLoading(true);
      let successCount = 0;

      // We will optimistically update the UI after all uploads finish to avoid flicker
      for (const file of files) {
        const formData = new FormData();
        formData.append('image', file);
        try {
          const res = await fetch(`/api/collections/${localCollection.id}/images`, { method: 'POST', body: formData });
          if (res.ok) successCount++;
        } catch (e) { console.error(e); }
      }

      if (successCount > 0) {
        toast.success(`Uploaded ${successCount} images`);
        // Trigger a re-save or re-fetch to get the updated image list from backend
        // For now, we rely on the parent's onSave/Refresh, but we should probably 
        // trigger a manual refresh here if possible. 
        // Workaround: We just force a save of the current state to trigger refresh in parent
        await onSave(localCollection);
      }

      setIsLoading(false);
    }
    // CASE B: Create Mode (Pending List)
    else {
      setPendingGallery(prev => [...prev, ...files]);
      const newPreviews = files.map(f => URL.createObjectURL(f));
      setPendingGalleryPreviews(prev => [...prev, ...newPreviews]);
    }
    e.target.value = '';
  };

  // --- 3. SAVE LOGIC ---
  const handleSave = async () => {
    if (!localCollection.name.trim()) {
      toast.error("Collection name is required.");
      return;
    }
    setIsLoading(true);

    const dataToSave = {
      ...localCollection,
      id: (createOnDisk && !isEditing) ? "" : (localCollection.id || crypto.randomUUID()),
      modelIds: localCollection.modelIds || [],
      tags: localCollection.tags || [],
      parentId: parentId === "root" ? null : parentId,
      createOnDisk: !isEditing && createOnDisk
    };

    try {
      // 1. Save Collection
      const savedCollection = await onSave(dataToSave as Collection) as unknown as Collection;

      // 2. Handle Pending Cover
      if (pendingCover && savedCollection?.id) {
        const formData = new FormData();
        formData.append('image', pendingCover);
        try {
          const res = await fetch(`/api/collections/${savedCollection.id}/images`, { method: 'POST', body: formData });
          const data = await res.json();

          // If successful, we need to ensure this is marked as cover
          if (data.success && data.imagePath) {
            // We need to patch the collection again to set the coverImage
            const patchData = { ...savedCollection, coverImage: data.imagePath };
            await fetch(`/api/collections`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(patchData)
            });
          }
        } catch (e) { console.error("Cover upload failed", e); }
      }

      // 3. Handle Pending Gallery (Loop)
      if (pendingGallery.length > 0 && savedCollection?.id) {
        for (const file of pendingGallery) {
          const formData = new FormData();
          formData.append('image', file);
          await fetch(`/api/collections/${savedCollection.id}/images`, { method: 'POST', body: formData }).catch(console.error);
        }
      }

      toast.success(`${isEditing ? 'Updated' : 'Created'} collection: ${dataToSave.name}`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Save failed: ${e.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!isEditing || !localCollection.id) return;
    if (!window.confirm(`Delete "${localCollection.name}"? This cannot be undone.`)) return;
    setIsLoading(true);
    try {
      await onDelete(localCollection.id);
      toast.success(`Collection deleted.`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Delete failed: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] h-[85vh] flex flex-col p-0 gap-0 bg-background">
        <div className="p-6 pb-2"> {/* Header Wrapper */}
          <DialogHeader>
            <DialogTitle>
              {isEditing ? `Edit: ${collection?.name}` : (initialMode === 'folder' ? 'New Collection Folder' : 'Manual Import')}
            </DialogTitle>
            <DialogDescription>
              {isEditing ? 'Update details.' : 'Create a new collection.'}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* The ScrollArea needs to be flex-1 and min-h-0 to scroll internally */}
        <ScrollArea className="flex-1 min-h-0 w-full px-6">
          <div className="py-4"> {/* Content Padding Wrapper */}
            {/* --- NAME & PARENT --- */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={localCollection.name} onChange={handleInputChange} required disabled={isLoading} placeholder="Collection Name" />
              </div>

              <div className="space-y-2">
                <Label>Parent</Label>
                <Select value={parentId} onValueChange={setParentId} disabled={isLoading}>
                  <SelectTrigger><SelectValue placeholder="Select parent..." /></SelectTrigger>
                  <SelectContent className="max-h-[250px]">
                    <SelectItem value="root"><span className="italic">Root</span></SelectItem>
                    {formattedCollections.map((col) => (
                      <SelectItem key={col.id} value={col.id}>{truncateMiddle(col.displayName, 30)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* --- DISK OPTIONS --- */}
            {!isEditing && initialMode === 'folder' && (
              <div className="flex items-start space-x-2 border p-3 rounded-md bg-muted/20">
                <Checkbox id="create-disk" checked={createOnDisk} onCheckedChange={(c) => setCreateOnDisk(!!c)} />
                <div className="grid gap-1.5 leading-none">
                  <Label htmlFor="create-disk" className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                    <FolderPlus className="h-3.5 w-3.5 text-primary" /> Create Physical Folder
                  </Label>
                  <p className="text-xs text-muted-foreground">Creates folder at <code>/{parentId !== 'root' ? '.../' : ''}{localCollection.name || '...'}</code></p>
                </div>
              </div>
            )}

            {/* --- MANUAL IMPORT FOLDER SELECT --- */}
            {(!isEditing && initialMode === 'manual') && (
              <Accordion type="single" collapsible className="w-full border rounded-md px-2">
                <AccordionItem value="folder-import" className="border-0">
                  <AccordionTrigger className="hover:no-underline py-2">
                    <div className="flex items-center gap-2 text-sm font-medium"><Folder className="h-4 w-4 text-blue-500" /> Select from Existing Folder</div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="max-h-48 overflow-y-auto border rounded bg-muted/30 p-2">
                      {Object.values(folderTree.children).map(node => (
                        <FolderTreeItem key={node.fullPath} node={node} level={0} onSelect={handleFolderSelect} />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea id="description" value={localCollection.description} onChange={handleInputChange} rows={3} className="resize-y" disabled={isLoading} />
            </div>

            {/* --- SECTION 1: COVER PHOTO (SINGLE) --- */}
            <div className="border rounded-md p-3 space-y-3 bg-muted/10">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-primary" />
                <Label className="font-semibold">Cover Photo</Label>
              </div>

              <div className="flex gap-4 items-start">
                {/* Preview Box */}
                <div className="w-24 h-24 bg-muted rounded-md border flex items-center justify-center overflow-hidden shrink-0 relative">
                  {(pendingCoverPreview || localCollection.coverImage) ? (
                    <img
                      src={pendingCoverPreview || localCollection.coverImage || ''}
                      alt="Cover"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
                  )}
                  {/* Remove Cover Button */}
                  {(localCollection.coverImage || pendingCover) && (
                    <button
                      onClick={() => {
                        setLocalCollection(p => ({ ...p, coverImage: undefined }));
                        setPendingCover(null);
                        setPendingCoverPreview(null);
                        if (isEditing) onSave({ ...localCollection, coverImage: undefined }); // Save removal immediately
                      }}
                      className="absolute top-0 right-0 p-1 bg-black/50 text-white hover:bg-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="space-y-2 flex-1">
                  <p className="text-xs text-muted-foreground">The main image displayed on cards.</p>
                  <div className="flex gap-2">
                    <Input id="cover-upload" type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
                    <Button variant="outline" size="sm" onClick={() => document.getElementById('cover-upload')?.click()} disabled={isLoading}>
                      <Upload className="w-3 h-3 mr-2" />
                      {localCollection.coverImage || pendingCover ? "Change Cover" : "Upload Cover"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* --- SECTION 2: GALLERY (MASS UPLOAD) --- */}
            <div className="border rounded-md p-3 space-y-3 bg-muted/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Images className="w-4 h-4 text-primary" />
                  <Label className="font-semibold">Gallery Images</Label>
                </div>
                {/* MASS UPLOAD BUTTON */}
                <div>
                  <Input id="gallery-upload" type="file" multiple accept="image/*" className="hidden" onChange={handleMassUpload} />
                  <Button size="sm" variant="secondary" onClick={() => document.getElementById('gallery-upload')?.click()} disabled={isLoading}>
                    <Upload className="w-3 h-3 mr-2" />
                    Add Photos
                  </Button>
                </div>
              </div>

              {/* Gallery Grid */}
              <div className="grid grid-cols-5 gap-2">
                {/* Existing Images */}
                {localCollection.images?.map((img, idx) => (
                  <div key={`exist-${idx}`} className="relative aspect-square rounded overflow-hidden border group bg-background">
                    <img src={img} className="w-full h-full object-cover" alt="Gallery" />
                    {/* Overlay Actions */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          // Set as Cover Action
                          const updated = { ...localCollection, coverImage: img };
                          setLocalCollection(updated);
                          if (isEditing) onSave(updated);
                          toast.success("Set as cover");
                        }}
                        className="p-1.5 bg-background rounded-full hover:bg-primary hover:text-primary-foreground text-foreground"
                        title="Set as Cover"
                      >
                        <Star className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteImage(img)} // <--- FIXED
                        className="p-1.5 bg-background rounded-full hover:bg-destructive hover:text-destructive-foreground text-foreground"
                        title="Remove"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    {/* Active Cover Indicator */}
                    {localCollection.coverImage === img && (
                      <div className="absolute bottom-0 left-0 right-0 bg-primary text-primary-foreground text-[8px] text-center py-0.5">
                        COVER
                      </div>
                    )}
                  </div>
                ))}

                {/* Pending Gallery Previews */}
                {pendingGalleryPreviews.map((src, idx) => (
                  <div key={`pend-${idx}`} className="relative aspect-square rounded overflow-hidden border border-dashed border-primary/50 opacity-70 bg-background">
                    <img src={src} className="w-full h-full object-cover grayscale" alt="Pending" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[9px] font-bold bg-background/80 px-1 rounded">PENDING</span>
                    </div>
                  </div>
                ))}

                {/* Empty State */}
                {(!localCollection.images?.length && !pendingGallery.length) && (
                  <div className="col-span-5 py-8 text-center text-xs text-muted-foreground border border-dashed rounded bg-background/50">
                    No gallery images.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={localCollection.category || '--none--'} onValueChange={handleCategoryChange} disabled={isLoading}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="--none--">(Uncategorized)</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={c.label}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </ScrollArea>

        <div className="p-6 pt-2 border-t mt-auto bg-background"> {/* Footer Wrapper */}
          <DialogFooter>
            {isEditing && (
              <Button variant="destructive" onClick={handleDelete} disabled={isLoading}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            )}
            <div className="flex space-x-2 ml-auto">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Cancel</Button>
              <Button onClick={handleSave} disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isEditing ? "Save Changes" : "Create"}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}