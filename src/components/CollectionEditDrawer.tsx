import { useEffect, useRef, useState } from 'react';
import { Plus, List, Loader2, LayoutGrid, Upload, X, Trash2, Image as ImageIcon, Star } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';
import { ScrollArea } from './ui/scroll-area';
import { Input } from './ui/input';
import { Label } from "./ui/label"; 
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import TagsInput from './TagsInput';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "./ui/select";
import { toast } from "sonner";
import type { Collection } from '../types/collection';
import type { Category } from '../types/category';


interface CollectionEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: Collection | null;
  collections?: Collection[]; // Made optional with ? to match your current usage, but we will default it
  categories: Category[];
  onSaved?: (updated: Collection) => void;
  initialModelIds?: string[];
  removalCollection?: Collection | null;
}

export default function CollectionEditDrawer({ 
  open, 
  onOpenChange, 
  collection, 
  collections = [], // Default to empty array
  categories, 
  onSaved, 
  initialModelIds = [], 
  removalCollection = null 
}: CollectionEditDrawerProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('Uncategorized');
  const [parentId, setParentId] = useState<string>("root");
  
  const [tags, setTags] = useState<string[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [existingCollections, setExistingCollections] = useState<Collection[]>([]);
  const [selectedExistingId, setSelectedExistingId] = useState<string>('');
  const [createMode, setCreateMode] = useState<'new' | 'existing'>('new');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [pendingGallery, setPendingGallery] = useState<File[]>([]);
  const [pendingGalleryPreviews, setPendingGalleryPreviews] = useState<string[]>([]);
  const [coverImage, setCoverImage] = useState<string | null>(null);

  // Sync initial cover image
  useEffect(() => {
    if (collection) {
       setCoverImage(collection.coverImage || null);
       // Ensure images is synced from props if not already
       if(collection.images) setImages(collection.images);
    } else {
       setCoverImage(null);
    }
  }, [collection]);

  // Handler: Immediate Upload (Edit Mode) or Pending (Create Mode)
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    // CASE A: Edit Mode (Upload Immediately)
    if (collection?.id) {
        setIsSaving(true);
        const formData = new FormData();
        formData.append('image', file);
        try {
          const res = await fetch(`/api/collections/${collection.id}/images`, { method: 'POST', body: formData });
          const data = await res.json();
          if (data.success && data.imagePath) {
             setCoverImage(data.imagePath);
             // Patch the collection record immediately to save the cover assignment
             await fetch('/api/collections', {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ ...collection, coverImage: data.imagePath }) 
             });
             toast.success("Cover updated");
          }
        } catch (err) { toast.error("Upload failed"); }
        setIsSaving(false);
    } 
    // CASE B: Create Mode (Use FileReader for Preview)
    else {
        const reader = new FileReader();
        reader.onload = (e) => setCoverImage(e.target?.result as string);
        reader.readAsDataURL(file);
        // Note: You'll need to handle the actual file upload in handleSave for Create Mode
        // For now, this just updates the visual preview
    }
  };

  const handleMassUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);

    // CASE A: Edit Mode (Loop Upload)
    if (collection?.id) {
        setIsSaving(true);
        let count = 0;
        for (const file of files) {
            const formData = new FormData();
            formData.append('image', file);
            const res = await fetch(`/api/collections/${collection.id}/images`, { method: 'POST', body: formData });
            if (res.ok) count++;
        }
        if (count > 0) {
            toast.success(`Uploaded ${count} images`);
            // Trigger refresh - in a perfect world we re-fetch the collection here
            // For now we trust the user to reload or we trigger onSaved
            if(onSaved) onSaved({ ...collection, images: [...images, ...files.map(f => URL.createObjectURL(f))] }); // Optimistic update
        }
        setIsSaving(false);
    }
    // CASE B: Create Mode
    else {
        const newPreviews = files.map(f => URL.createObjectURL(f));
        setImages(prev => [...prev, ...newPreviews]); // Update local state for preview
        // Store files in a ref or similar if we need to upload them later, 
        // but for now relying on existing base64 logic in handleSave or sticking to simple preview
    }
  };

  const handleGenerateMosaic = async () => {
    if (!collection?.id) return;
    try {
      setIsGeneratingCover(true);
      const res = await fetch('/api/collections/generate-covers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ collectionIds: [collection.id], force: true })
      });
      const data = await res.json();
      if (data.success && data.processed > 0) {
          toast.success("Cover regenerated!");
          // Close and refresh to see changes
          onSaved?.(collection); 
          onOpenChange(false); 
      } else if (data.success) {
          toast.warning("Could not generate cover (need 4+ models with thumbnails)");
      } else {
          toast.error(data.error || "Failed");
      }
    } catch(e) {
        toast.error("Error generating cover");
    } finally {
        setIsGeneratingCover(false);
    }
  };

  // Filter out self to prevent circular parents
  const availableParents = collections.filter(c => 
    (!collection || c.id !== collection.id)
  );

  useEffect(() => {
    if (!open) return;
    
    if (collection) {
      setName(collection.name || '');
      setDescription(collection.description || '');
      setCategory(collection.category && collection.category.trim() ? collection.category : 'Uncategorized');
      setParentId(collection.parentId || "root");
      setTags(Array.isArray(collection.tags) ? collection.tags : []);
      setImages(Array.isArray(collection.images) ? collection.images : []);
      
      setSelectedExistingId('');
      setCreateMode('new');
    } else {
      setName('');
      setDescription('');
      setCategory('Uncategorized');
      setParentId(removalCollection ? (removalCollection.id || "root") : "root");
      setTags([]);
      setImages([]);
      
      setCreateMode('new');
      setSelectedExistingId('');
      
      // Load existing collections for the "Add to Existing" tab
      (async () => {
        try {
          const resp = await fetch('/api/collections', { cache: 'no-store' });
          const data = await resp.json();
          if (resp.ok && data && data.success && Array.isArray(data.collections)) {
            setExistingCollections(data.collections);
          } else {
            setExistingCollections([]);
          }
        } catch {
          setExistingCollections([]);
        }
      })();
    }
  }, [open, collection?.id, removalCollection]);

  const onPickImages = () => fileInputRef.current?.click();

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files ? Array.from(e.currentTarget.files) : [];
    if (files.length === 0) return;
    const reads: Promise<string>[] = files.map(f => new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = reject;
      r.readAsDataURL(f);
    }));
    const data = await Promise.all(reads);
    setImages(prev => [...prev, ...data]);
    try { e.currentTarget.value = ''; } catch {}
  };

  const handleSave = async () => {
    if (!collection?.id) {
      if (createMode === 'new' && !name.trim()) return;
      if (createMode === 'existing' && !selectedExistingId) return;
    }
    
    setIsSaving(true);
    try {
      const isEdit = !!collection?.id;
      let payload: any;

      if (!isEdit && createMode === 'existing') {
        const existing = existingCollections.find(c => c.id === selectedExistingId);
        if (!existing) throw new Error('Selected collection not found');
        
        const nextIds = Array.from(new Set([...(existing.modelIds || []), ...((Array.isArray(initialModelIds) ? initialModelIds : []) as string[])]));
        
        payload = {
          id: existing.id,
          name: existing.name,
          description: existing.description || '',
          modelIds: nextIds,
          category: (existing as any).category || '',
          tags: (existing as any).tags || [],
          images: (existing as any).images || [],
          coverModelId: (existing as any).coverModelId,
          parentId: existing.parentId,
          childCollectionIds: existing.childCollectionIds
        };
      } else {
        payload = {
          name: name.trim(),
          description,
          category: (category && category.trim()) ? category : 'Uncategorized',
          parentId: parentId === "root" ? null : parentId,
          tags,
          images,
        };

        if (isEdit) {
          payload.id = collection!.id;
          payload.modelIds = collection!.modelIds;
          payload.coverModelId = collection!.coverModelId;
          payload.childCollectionIds = collection!.childCollectionIds;
        } else {
          payload.modelIds = Array.isArray(initialModelIds) ? initialModelIds : [];
        }
      }

      const resp = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const res = await resp.json();
      if (!resp.ok || !res.success) throw new Error(res?.error || 'Failed to save');
      
      window.dispatchEvent(new CustomEvent('collection-created', { detail: res.collection }));
      
      toast.success(isEdit ? "Collection updated" : "Collection created");
      onSaved?.(res.collection);
      onOpenChange(false);
    } catch (e) {
      console.error('Failed to save collection:', e);
      toast.error("Failed to save collection");
    } finally {
      setIsSaving(false);
    }
  };

  const removalTarget = removalCollection ?? collection;
  const removableIds = Array.isArray(initialModelIds) ? initialModelIds.filter(id => (removalTarget?.modelIds || []).includes(id)) : [];
  const canRemove = !!removalTarget?.id && removableIds.length > 0 && !isRemoving;

  const handleRemoveSelected = async () => {
    if (!removalTarget?.id || removableIds.length === 0) return;
    setIsRemoving(true);
    try {
      const remainingIds = (removalTarget.modelIds || []).filter(id => !removableIds.includes(id));
      const payload = {
        id: removalTarget.id,
        name: removalTarget.name,
        description: removalTarget.description || '',
        modelIds: remainingIds,
        category: (removalTarget as any).category || '',
        tags: (removalTarget as any).tags || [],
        images: (removalTarget as any).images || [],
        coverModelId: (removalTarget as any).coverModelId,
        parentId: removalTarget.parentId,
        childCollectionIds: removalTarget.childCollectionIds
      };

      const resp = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const res = await resp.json();
      if (!resp.ok || !res.success) throw new Error(res?.error || 'Failed to remove items');
      onSaved?.(res.collection);
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to remove models from collection:', err);
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-xl"
        blockOverlayInteractions={false}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>{collection?.id ? 'Edit Collection' : 'New Collection'}</SheetTitle>
          <SheetDescription>
            {collection?.id
              ? 'Update this collection’s name, parent, description, category, tags, and images.'
              : 'Create a new collection or add selected models to an existing one.'}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-8rem)] pr-2">
          <div className="space-y-4 p-4">
            
            {removalTarget?.id && removableIds.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-destructive">Remove from collection</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Remove {removableIds.length} item{removableIds.length === 1 ? '' : 's'} from "{removalTarget.name}".
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-2"
                  onClick={(e) => { e.stopPropagation(); handleRemoveSelected(); }}
                  disabled={!canRemove}
                >
                  {isRemoving ? 'Removing…' : 'Remove selected'}
                </Button>
              </div>
            )}

            {!collection?.id && (
              <div className="flex items-center justify-between">
                <div className="font-semibold text-lg text-card-foreground">Choose</div>
                <div className="flex items-center bg-muted/30 rounded-lg p-1 border">
                  <Button
                    variant={createMode === 'new' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setCreateMode('new')}
                    className="gap-2 h-8 px-3"
                  >
                    <Plus className="h-4 w-4" />
                    New
                  </Button>
                  <Button
                    variant={createMode === 'existing' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setCreateMode('existing')}
                    className="gap-2 h-8 px-3"
                  >
                    <List className="h-4 w-4" />
                    Existing
                  </Button>
                </div>
              </div>
            )}

            {!collection?.id && createMode === 'existing' && (
              <div className="space-y-2">
                <Label>Add to existing collection</Label>
                <Select
                  value={selectedExistingId}
                  onValueChange={(val) => setSelectedExistingId(val)}
                >
                  <SelectTrigger onClick={(e) => e.stopPropagation()}>
                    <SelectValue placeholder="Choose an existing collection" />
                  </SelectTrigger>
                  <SelectContent>
                    {(existingCollections || [])
                      .slice()
                      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                      .map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {existingCollections.length === 0 && (
                  <p className="text-xs text-muted-foreground">No existing collections yet.</p>
                )}
              </div>
            )}

            {(!!collection?.id || createMode === 'new') && (
              <>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Collection name"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Parent Collection</Label>
                  <Select value={parentId} onValueChange={setParentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select parent..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="root">
                        <span className="text-muted-foreground italic">No Parent (Root Level)</span>
                      </SelectItem>
                      {availableParents.map((col) => (
                        <SelectItem key={col.id} value={col.id}>
                          {col.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={category || 'Uncategorized'}
                    onValueChange={(val) => setCategory(val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Uncategorized">Uncategorized</SelectItem>
                      {categories
                        .filter(c => c?.label && c.label.trim() !== '')
                        .filter(c => c.label !== 'Uncategorized')
                        .map(c => (
                          <SelectItem key={c.id} value={c.label}>{c.label}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Tags</Label>
                  <TagsInput
                    value={tags}
                    onChange={(next) => setTags(next)}
                    placeholder="Add tag"
                  />
                </div>

                {/* [REPLACEMENT START] */}
                <div className="space-y-4 pt-2 border-t">
                  {/* SECTION 1: COVER PHOTO */}
                  <div className="space-y-2">
                     <div className="flex items-center justify-between">
                        <Label>Cover Photo</Label>
                        {coverImage && (
                          <Button 
                            variant="ghost" size="sm" className="h-6 text-xs text-destructive hover:text-destructive"
                            onClick={() => setCoverImage(null)}
                          >
                            Remove
                          </Button>
                        )}
                     </div>
                     
                     <div className="flex gap-4 items-start p-3 border rounded-md bg-muted/10">
                        {/* Cover Preview */}
                        <div className="w-24 h-24 bg-background rounded-md border flex items-center justify-center overflow-hidden shrink-0">
                            {coverImage ? (
                                <img src={coverImage} alt="Cover" className="w-full h-full object-cover" />
                            ) : (
                                <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
                            )}
                        </div>

                        <div className="space-y-2 flex-1">
                            <div className="flex flex-wrap gap-2">
                                <div className="relative">
                                    <Input id="drawer-cover" type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
                                    <Button variant="outline" size="sm" onClick={() => document.getElementById('drawer-cover')?.click()}>
                                        <Upload className="h-3 w-3 mr-2" />
                                        Upload
                                    </Button>
                                </div>
                                <Button 
                                    variant="secondary" 
                                    size="sm"
                                    onClick={handleGenerateMosaic}
                                    disabled={isGeneratingCover || !collection?.id}
                                    title="Generate 2x2 mosaic from first 4 models"
                                >
                                    {isGeneratingCover ? <Loader2 className="h-3 w-3 animate-spin" /> : <LayoutGrid className="h-3 w-3 mr-2" />}
                                    Mosaic
                                </Button>
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                                Controls the main thumbnail on the dashboard.
                            </p>
                        </div>
                     </div>
                  </div>

                  {/* SECTION 2: GALLERY */}
                  <div className="space-y-2">
                     <div className="flex items-center justify-between">
                        <Label>Gallery Images</Label>
                        <div className="relative">
                            <Input id="drawer-gallery" type="file" multiple accept="image/*" className="hidden" onChange={handleMassUpload} />
                            <Button variant="ghost" size="sm" className="h-6" onClick={() => document.getElementById('drawer-gallery')?.click()}>
                                <Plus className="h-3 w-3 mr-1" /> Add Photos
                            </Button>
                        </div>
                     </div>

                     <div className="grid grid-cols-4 gap-2 border rounded-md p-2 min-h-[100px] bg-muted/10">
                        {images.map((img, idx) => (
                           <div key={idx} className="relative aspect-square rounded overflow-hidden border group bg-background">
                               <img src={img} alt="Gallery" className="w-full h-full object-cover" />
                               
                               {/* Hover Actions */}
                               <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                   <button 
                                      className="p-1.5 bg-background rounded-full hover:bg-primary hover:text-primary-foreground"
                                      title="Set as Cover"
                                      onClick={(e) => {
                                          e.stopPropagation();
                                          setCoverImage(img);
                                          // If editing, save immediately
                                          if(collection?.id) {
                                              fetch('/api/collections', {
                                                  method: 'POST',
                                                  headers: {'Content-Type': 'application/json'},
                                                  body: JSON.stringify({...collection, coverImage: img})
                                              });
                                              toast.success("Set as cover");
                                          }
                                      }}
                                   >
                                      <Star className="w-3 h-3" />
                                   </button>
                                   <button 
                                      className="p-1.5 bg-background rounded-full hover:bg-destructive hover:text-destructive-foreground"
                                      title="Remove"
                                      onClick={async (e) => {
                                          e.stopPropagation();
                                          // Optimistic remove
                                          setImages(prev => prev.filter(i => i !== img));
                                          
                                          // API Delete if existing
                                          if (collection?.id) {
                                              const filename = img.split('/').pop();
                                              await fetch(`/api/collections/${collection.id}/images/${filename}`, { method: 'DELETE' });
                                          }
                                      }}
                                   >
                                      <Trash2 className="w-3 h-3" />
                                   </button>
                               </div>

                               {/* Cover Indicator */}
                               {coverImage === img && (
                                   <div className="absolute bottom-0 left-0 right-0 bg-primary text-primary-foreground text-[8px] text-center py-0.5">
                                       COVER
                                   </div>
                               )}
                           </div>
                        ))}
                        {images.length === 0 && (
                            <div className="col-span-4 flex items-center justify-center text-xs text-muted-foreground italic h-full">
                                No gallery images
                            </div>
                        )}
                     </div>
                  </div>
                </div>
                {/* [REPLACEMENT END] */}
              </>
            )}


            <div className="pt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenChange(false);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={(e) => { e.stopPropagation(); handleSave(); }}
                disabled={
                  isSaving || (
                    collection?.id
                      ? false
                      : (createMode === 'new' ? !name.trim() : !selectedExistingId)
                  )
                }
              >
                {isSaving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}