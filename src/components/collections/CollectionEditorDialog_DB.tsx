import { SearchableSelect_DB } from '@/components/common/SearchableSelect_DB';
import TagsInput from '@/components/common/TagsInput_DB';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Category } from "@/types/category";
import { Collection } from "@/types/collection_db";
import { FileText, HelpCircle, Image as ImageIcon, Images, Loader2, Save, Star, Trash2, Upload, X } from "lucide-react";
import React, { useEffect, useMemo, useState } from 'react';
import { toast } from "sonner";

interface CollectionEditorDialogProps {
  collection: Collection | null;
  categories: Category[];
  collections?: Collection[]; // [NEW] List of all collections for parent selection
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
  images: [],
  parentId: null,
  path: '',
  pathHash: null,
  coverImage: null,
  coverImagePath: null,
  documents: [],
  category: 'Uncategorized',
  tags: []
};



// Helper to resolve asset URLs correctly for display
function resolveAssetUrl(path: string | null) {
  if (!path) return '';
  if (path.startsWith('blob:') || path.startsWith('http') || path.startsWith('/')) return path;
  if (path.startsWith('images/') || path.startsWith('documents/')) return `/api/${path}`;
  return `/models/${path}`;
}



export function CollectionEditorDialog_DB({
  collection,
  categories = [], // [FIX] Added categories back to destructuring
  collections = [], // Default to empty array
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

  const [parentId, setParentId] = useState<string>("root");

  // [NEW] Separated Pending States
  const [pendingCover, setPendingCover] = useState<File | null>(null);
  const [pendingCoverPreview, setPendingCoverPreview] = useState<string | null>(null);

  const [pendingGallery, setPendingGallery] = useState<File[]>([]);
  const [pendingGalleryPreviews, setPendingGalleryPreviews] = useState<string[]>([]);

  const [documents, setDocuments] = useState<string[]>([]);
  const [pendingDocuments, setPendingDocuments] = useState<File[]>([]);

  // Category and Tags state
  const [selectedCategory, setSelectedCategory] = useState<string>('Uncategorized');
  const [applyTags, setApplyTags] = useState<string[]>([]);

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
    setPendingDocuments([]);

    if (collection) {
      setParentId(collection.parentId || "root");
      setDocuments(collection.documents || []);
      setSelectedCategory(collection.category || 'Uncategorized');
      setApplyTags(collection.tags || []);
    } else {
      setParentId(defaultParentId || "root");
      setDocuments([]);
      setSelectedCategory('Uncategorized');
      setApplyTags([]);

      // If we are given a default parent on open, inherit its properties instantly
      if (defaultParentId && defaultParentId !== "root" && collections.length > 0) {
        const parentCol = collections.find(c => c.id === defaultParentId);
        if (parentCol) {
          if (parentCol.category) setSelectedCategory(parentCol.category);
          if (parentCol.tags && parentCol.tags.length > 0) setApplyTags(parentCol.tags);
        }
      }
    }
  }, [collection, initialMode, defaultParentId, open, collections]);

  // Handle Parent Change to trigger inheritance
  const handleParentChange = (newParentId: string) => {
    setParentId(newParentId);
    if (!isEditing && newParentId !== "root") {
      const parentCol = collections.find(c => c.id === newParentId);
      if (parentCol) {
        if (parentCol.category && selectedCategory === 'Uncategorized') setSelectedCategory(parentCol.category);
        if (parentCol.tags && parentCol.tags.length > 0 && applyTags.length === 0) setApplyTags(parentCol.tags);
      }
    }
  };

  const isEditing = !!collection;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setLocalCollection(prev => ({ ...prev, [id]: value }));
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
        const imagePath = data.filePath || data.imagePath;
        if (data.success && imagePath) {
          // 2. Explicitly Set as Cover
          // We need to update the collection object with the new coverImage path
          const updatedCollection = { ...localCollection, coverImage: imagePath };

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
    console.log("[Dialog] Uploading files:", files.length);

    // CASE A: Edit Mode (Loop Upload)
    if (localCollection.id) {
      setIsLoading(true);
      const newImagePaths: string[] = [];

      for (const file of files) {
        const formData = new FormData();
        formData.append('image', file);
        try {
          const res = await fetch(`/api/collections/${localCollection.id}/images`, { method: 'POST', body: formData });
          const data = await res.json();
          console.log("[Dialog] Server response:", data);
          const imagePath = data.filePath || data.imagePath;

          if (res.ok && data.success && imagePath) {
            newImagePaths.push(imagePath);
          }
        } catch (e) { console.error("[Dialog] Error:", e); }
      }

      if (newImagePaths.length > 0) {
        toast.success(`Uploaded ${newImagePaths.length} images`);

        // Update local state
        const updatedImages = [...(localCollection.images || []), ...newImagePaths];
        const updatedCol = { ...localCollection, images: updatedImages };

        setLocalCollection(updatedCol);
        await onSave(updatedCol);
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

  // --- 2.5 DOCUMENT UPLOAD HANDLER ---
  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);

    // CASE A: Edit Mode (Direct Upload)
    if (localCollection.id) {
      setIsLoading(true);
      const newPaths: string[] = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        try {
          const res = await fetch(`/api/collections/${localCollection.id}/documents`, { method: 'POST', body: formData });
          const contentType = res.headers.get("content-type");
          if (!contentType || !contentType.includes("application/json")) continue;
          const data = await res.json();
          if (res.ok && data.success && data.filePath) {
            newPaths.push(data.filePath);
          }
        } catch (e) { console.error("Network error:", e); }
      }
      if (newPaths.length > 0) {
        toast.success(`Uploaded ${newPaths.length} documents`);
        const nextDocs = [...documents, ...newPaths];
        setDocuments(nextDocs);
        const updatedCol = { ...localCollection, documents: nextDocs };
        setLocalCollection(updatedCol);
        await onSave(updatedCol);
      }
      setIsLoading(false);
    }
    // CASE B: Create Mode (Pending)
    else {
      setPendingDocuments(prev => [...prev, ...files]);
    }
    e.target.value = '';
  };

  const handleRemoveDocument = async (docPath: string) => {
    const updatedDocs = documents.filter(d => d !== docPath);
    setDocuments(updatedDocs);
    const updatedCollection = { ...localCollection, documents: updatedDocs };
    setLocalCollection(updatedCollection);

    if (isEditing && localCollection.id) {
      const filename = docPath.split('/').pop();
      if (filename) await fetch(`/api/collections/${localCollection.id}/documents/${filename}`, { method: 'DELETE' });
      await onSave(updatedCollection);
    }
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
      id: (localCollection.id || crypto.randomUUID()),
      modelIds: localCollection.modelIds || [],
      parentId: parentId === "root" ? null : parentId,
      // Clear images if creating new (they are pending), otherwise keep existing
      images: isEditing ? localCollection.images : [],
      documents: isEditing ? documents : [],
      category: selectedCategory,
      tags: applyTags,
      createOnDisk: !isEditing // ALWAYS enforce physical creation for new collections
    };

    try {
      // 1. Save Collection
      const savedCollection = await onSave(dataToSave as Collection) as unknown as Collection;

      // 2. Handle Pending Gallery (Sequential)
      if (pendingGallery.length > 0 && savedCollection?.id) {
        for (const file of pendingGallery) {
          const formData = new FormData();
          formData.append('image', file);
          try {
            await fetch(`/api/collections/${savedCollection.id}/images`, { method: 'POST', body: formData });
          } catch (e) { console.error("Pending upload failed", e); }
        }
      }

      // 3. Handle Pending Cover
      if (pendingCover && savedCollection?.id) {
        const formData = new FormData();
        formData.append('image', pendingCover);
        try {
          const res = await fetch(`/api/collections/${savedCollection.id}/images`, { method: 'POST', body: formData });
          const data = await res.json();
          const imagePath = data.filePath || data.imagePath;

          if (data.success && imagePath) {
            // Patch the collection to set coverImage
            const patchData = {
              ...savedCollection,
              coverImage: imagePath,
            };
            await fetch(`/api/collections/${savedCollection.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(patchData)
            });
          }
        } catch (e) { console.error("Cover upload failed", e); }
      }

      // 4. Handle Pending Documents
      if (pendingDocuments.length > 0 && savedCollection?.id) {
        const newDocPaths: string[] = [];
        for (const file of pendingDocuments) {
          const formData = new FormData();
          formData.append('file', file);
          try {
            const docResp = await fetch(`/api/collections/${savedCollection.id}/documents`, { method: 'POST', body: formData });
            const docData = await docResp.json();
            if (docResp.ok && docData.success && docData.filePath) newDocPaths.push(docData.filePath);
          } catch (e) { console.error("Doc upload failed", e); }
        }
        if (newDocPaths.length > 0) toast.success(`Uploaded ${newDocPaths.length} documents`);
      }

      toast.success(`${isEditing ? 'Updated' : 'Created'} collection: ${dataToSave.name}`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Save failed: ${e.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- 4. DELETE IMAGE HANDLER ---
  const handleDeleteImage = async (imgUrl: string) => {
    // Optimistic UI update
    const updatedImages = (localCollection.images || []).filter(img => img !== imgUrl);

    // If cover was removed, clear it
    const updatedCover = localCollection.coverImage === imgUrl ? null : localCollection.coverImage;

    const updatedCollection = {
      ...localCollection,
      images: updatedImages,
      coverImage: updatedCover
    };

    setLocalCollection(updatedCollection);

    // Persist if editing an existing collection
    if (isEditing && localCollection.id) {
      try {
        // 1. Attempt to delete physical file (optional, but good for cleanup)
        const filename = imgUrl.split('/').pop();
        if (filename) {
          await fetch(`/api/collections/${localCollection.id}/images/${filename}`, { method: 'DELETE' });
        }

        // 2. Update collection record
        await onSave(updatedCollection);
        toast.success("Image removed");
      } catch (e) {
        console.error("Error deleting image:", e);
        // Even if file delete fails, we should save the collection state
        await onSave(updatedCollection);
      }
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
      <DialogContent
        className="w-full sm:max-w-xl flex flex-col p-0 max-h-[85vh] bg-background"
        onEscapeKeyDown={(e: any) => e.preventDefault()}
      >
        <div className="p-6 pb-4 border-b">
          <DialogHeader>
            <DialogTitle>{localCollection.id ? 'Edit Collection' : 'New Collection'}</DialogTitle>
            <DialogDescription>
              {localCollection.id
                ? 'Update this collection’s name, parent, description, category, tags, and images.'
                : 'Create a new collection or add selected models to an existing one.'}
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="flex-1 overflow-y-auto px-6 min-h-0">
          <div className="space-y-6">

            {/* NAME & PARENT GRID */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={localCollection.name || ''}
                  onChange={handleInputChange}
                  required
                  disabled={isLoading}
                  placeholder="Collection Name"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>Parent Collection</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[300px]">
                        <p>Selecting a Parent Collection nests this collection one level deeper. Choosing "Root" places it at the top level.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <SearchableSelect_DB
                  disabled={isLoading}
                  value={parentId}
                  onValueChange={handleParentChange}
                  placeholder="Select parent..."
                  emptyText="No collections found."
                  options={[
                    { value: "root", label: "Root", tooltip: "Store at the top level" },
                    ...formattedCollections.map(col => ({
                      value: col.id,
                      label: col.name,
                      tooltip: col.displayName
                    }))
                  ]}
                />
              </div>
            </div>

            {/* ORGANIZATIONAL METADATA */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <SearchableSelect_DB
                  value={selectedCategory}
                  onValueChange={setSelectedCategory}
                  disabled={isLoading}
                  placeholder="Select a category..."
                  options={[
                    ...categories.map(c => ({ value: c.label || c.id, label: c.label })),
                    ...(!categories.find(c => c.label === 'Uncategorized') ? [{ value: 'Uncategorized', label: 'Uncategorized' }] : [])
                  ]}
                />
              </div>
              <div className="space-y-2">
                <Label>Tags</Label>
                <TagsInput value={applyTags} onChange={setApplyTags} placeholder="Add tags..." />
              </div>
            </div>



            {/* DESCRIPTION */}
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                id="description"
                value={localCollection.description}
                onChange={handleInputChange}
                rows={4}
                className="max-h-[150px] min-h-[80px] resize-y"
                placeholder="Describe this collection..."
                disabled={isLoading}
              />
            </div>

            {/* VISUALS SECTION */}
            <div className="space-y-4">

              {/* COVER PHOTO */}
              <div className="border rounded-md p-3 space-y-3 bg-muted/10">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-primary" />
                  <Label className="font-semibold">Cover Photo</Label>
                </div>

                <div className="flex gap-4 items-start">
                  <div className="w-24 h-24 bg-muted rounded-md border flex items-center justify-center overflow-hidden shrink-0 relative">
                    {(pendingCoverPreview || localCollection.coverImage) ? (
                      <img
                        src={resolveAssetUrl(pendingCoverPreview || localCollection.coverImage || '')}
                        alt="Cover"
                        className="w-full h-full object-cover bg-background"
                      />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
                    )}

                    {(localCollection.coverImage || pendingCover) && (
                      <button
                        onClick={() => {
                          setLocalCollection(p => ({ ...p, coverImage: null }));
                          setPendingCover(null);
                          setPendingCoverPreview(null);
                          if (isEditing) onSave({ ...localCollection, coverImage: null });
                        }}
                        className="absolute top-0 right-0 p-1 bg-black/50 text-white hover:bg-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-2 flex-1">
                    <p className="text-xs text-muted-foreground">
                      The main image displayed on cards.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        id="cover-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleCoverUpload}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById('cover-upload')?.click()}
                        disabled={isLoading}
                      >
                        <Upload className="w-3 h-3 mr-2" />
                        {localCollection.coverImage || pendingCover ? "Change Cover" : "Upload Cover"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* GALLERY */}
              <div className="border rounded-md p-3 space-y-3 bg-muted/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Images className="w-4 h-4 text-primary" />
                    <Label className="font-semibold">Gallery Images</Label>
                  </div>
                  <div>
                    <Input
                      id="gallery-upload"
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={handleMassUpload}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => document.getElementById('gallery-upload')?.click()}
                      disabled={isLoading}
                    >
                      <Upload className="w-3 h-3 mr-2" />
                      Add Photos
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {localCollection.images?.map((img, idx) => (
                    <div key={`exist-${idx}`} className="relative aspect-square rounded overflow-hidden border group bg-background">
                      <img src={resolveAssetUrl(img)} className="w-full h-full object-cover" alt="Gallery" />

                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
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
                          onClick={() => handleDeleteImage(img)}
                          className="p-1.5 bg-background rounded-full hover:bg-destructive hover:text-destructive-foreground text-foreground"
                          title="Remove"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      {localCollection.coverImage === img && (
                        <div className="absolute bottom-0 left-0 right-0 bg-primary text-primary-foreground text-[8px] text-center py-0.5">
                          COVER
                        </div>
                      )}
                    </div>
                  ))}

                  {pendingGalleryPreviews.map((src, idx) => (
                    <div key={`pend-${idx}`} className="relative aspect-square rounded overflow-hidden border border-dashed border-primary/50 opacity-70 bg-background">
                      <img src={src} className="w-full h-full object-cover grayscale" alt="Pending" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[9px] font-bold bg-background/80 px-1 rounded">PENDING</span>
                      </div>
                    </div>
                  ))}

                  {(!localCollection.images?.length && !pendingGallery.length) && (
                    <div className="col-span-5 py-8 text-center text-xs text-muted-foreground border border-dashed rounded bg-background/50">
                      No gallery images.
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 3: DOCUMENTS */}
              <div className="border rounded-md p-3 space-y-3 bg-muted/10 mt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <Label className="font-semibold">Documents (PDF, TXT, MD)</Label>
                  </div>
                  <div className="relative">
                    <Input id="dialog-docs" type="file" multiple accept=".pdf,.txt,.md,.dxf" className="hidden" onChange={handleDocumentUpload} disabled={isLoading} />
                    <Button variant="secondary" size="sm" onClick={() => document.getElementById('dialog-docs')?.click()} disabled={isLoading}>
                      <Upload className="h-3 w-3 mr-2" /> Add Docs
                    </Button>
                  </div>
                </div>

                <div className="space-y-1 border rounded-md p-2 min-h-[50px] bg-background text-sm">
                  {documents.map((doc, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded group border">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                        <span className="truncate" title={doc.split('/').pop()}>{doc.split('/').pop()}</span>
                      </div>
                      <button
                        type="button"
                        className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); handleRemoveDocument(doc); }}
                        disabled={isLoading}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {pendingDocuments.map((file, idx) => (
                    <div key={`pend-doc-${idx}`} className="flex items-center justify-between p-2 bg-background border border-dashed rounded opacity-70">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-[200px]">{file.name}</span>
                      </div>
                      <span className="text-[9px] bg-secondary px-1 rounded">PENDING</span>
                    </div>
                  ))}

                  {documents.length === 0 && pendingDocuments.length === 0 && (
                    <div className="flex items-center justify-center text-xs text-muted-foreground italic h-full py-2">
                      No documents attached
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-6 py-4 border-t bg-background flex items-center justify-between mt-auto">
          <div>
            {isEditing && (
              <Button variant="destructive" onClick={handleDelete} disabled={isLoading}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            )}
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isEditing ? "Save Changes" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog >
  );
}