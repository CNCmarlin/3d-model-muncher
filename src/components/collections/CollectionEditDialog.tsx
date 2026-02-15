
import TagsInput from '@/components/common/TagsInput';
import { Button } from '@/components/ui/button';
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from "@/components/ui/label";
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Textarea } from '@/components/ui/textarea';
import type { Category } from '@/types/category';
import type { Collection } from '@/types/collection';
import { Check, FileText, Image as ImageIcon, LayoutGrid, List, Loader2, Pencil as PencilIcon, Plus, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from "sonner";

interface CollectionEditDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    collection: Collection | null;
    collections?: Collection[];
    categories: Category[];
    onSaved?: (updated: Collection) => void;
    initialModelIds?: string[];
    removalCollection?: Collection | null;
}

export default function CollectionEditDialog({
    open,
    onOpenChange,
    collection: initialCollection,
    collections = [],
    categories,
    onSaved,
    initialModelIds = [],
    removalCollection = null
}: CollectionEditDialogProps) {
    // Local state for form fields
    const [isLoading, setIsLoading] = useState(false);
    const [collectionData, setCollectionData] = useState<Collection | null>(initialCollection);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState<string>('Uncategorized');
    const [parentId, setParentId] = useState<string>("root");
    const [tags, setTags] = useState<string[]>([]);
    const [images, setImages] = useState<string[]>([]);
    const [documents, setDocuments] = useState<string[]>([]);
    const [isProject, setIsProject] = useState(false);
    const [coverImage, setCoverImage] = useState<string | null>(null);

    // Upload Queues
    const [pendingDocuments, setPendingDocuments] = useState<File[]>([]);
    const [pendingGallery, setPendingGallery] = useState<{ file: File; preview: string }[]>([]);
    const [pendingCover, setPendingCover] = useState<{ file: File; preview: string } | null>(null);
    const [applyToModels, setApplyToModels] = useState(false);

    // Deletion Queues (Batch Mode)
    const [deletedImages, setDeletedImages] = useState<string[]>([]);
    const [deletedDocuments, setDeletedDocuments] = useState<string[]>([]);

    // Status flags
    const [isSaving, setIsSaving] = useState(false);

    const [isGeneratingCover, setIsGeneratingCover] = useState(false);

    // Creation Mode
    const [createMode, setCreateMode] = useState<'new' | 'existing'>('new');
    const [existingCollections, setExistingCollections] = useState<Collection[]>([]);
    const [selectedExistingId, setSelectedExistingId] = useState<string>('');

    // 1. Fetch Full Data on Open
    useEffect(() => {
        if (open && initialCollection?.id) {
            setIsLoading(true);
            fetch(`/api/collections/${initialCollection.id}`)
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.collection) {
                        setCollectionData(data.collection);
                    } else {
                        console.warn("Failed to fetch full collection, using props");
                        setCollectionData(initialCollection);
                    }
                })
                .catch(err => {
                    console.error("Error fetching collection details:", err);
                    setCollectionData(initialCollection);
                })
                .finally(() => setIsLoading(false));
        } else if (open) {
            // New collection mode
            setCollectionData(null);
            setIsLoading(false);
        }
    }, [open, initialCollection]);

    // 2. Populate Form from Data
    useEffect(() => {
        if (open) {
            if (collectionData) {
                // Edit Mode
                setName(collectionData.name || '');
                setDescription(collectionData.description || '');
                setCategory(collectionData.category && collectionData.category.trim() ? collectionData.category : 'Uncategorized');
                setParentId(collectionData.parentId || "root");
                setTags(Array.isArray(collectionData.tags) ? collectionData.tags : []);
                setImages(Array.isArray(collectionData.images) ? collectionData.images : []);
                setDocuments(Array.isArray(collectionData.documents) ? collectionData.documents : []);
                setCoverImage(collectionData.coverImage || null);
                setIsProject(collectionData.type === 'project');

                setCreateMode('new');
                setSelectedExistingId('');
            } else {
                // Create Mode Defaults
                setName('');
                setDescription('');
                setCategory('Uncategorized');
                setParentId(removalCollection ? (removalCollection.id || "root") : "root");
                setTags([]);
                setImages([]);
                setDocuments([]);
                setCoverImage(null);
                setIsProject(false);
                setCreateMode('new');

                // Reset pending
                setPendingDocuments([]);
                setPendingGallery([]);
                setPendingCover(null);

                // Load existing for "Add to Existing"
                loadExistingCollections();
            }
        }
    }, [collectionData, open, removalCollection]);

    const loadExistingCollections = async () => {
        try {
            const resp = await fetch('/api/collections', { cache: 'no-store' });
            const data = await resp.json();
            if (resp.ok && data?.success && Array.isArray(data.collections)) {
                setExistingCollections(data.collections);
            }
        } catch { /* ignore */ }
    };

    // Cleanup blobs
    useEffect(() => {
        if (!open) {
            images.forEach(url => { if (url?.startsWith('blob:')) URL.revokeObjectURL(url); });
            if (coverImage?.startsWith('blob:')) URL.revokeObjectURL(coverImage);
        }
    }, [open, images, coverImage]);


    // --- HANDLERS ---

    const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        const file = e.target.files[0];
        const preview = URL.createObjectURL(file);

        // Revoke old pending cover if exists
        if (pendingCover) URL.revokeObjectURL(pendingCover.preview);

        setPendingCover({ file, preview });
        setCoverImage(preview);
        e.target.value = '';
    };

    const handleGalleryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;
        const files = Array.from(e.target.files);

        const newPendings = files.map(f => ({ file: f, preview: URL.createObjectURL(f) }));
        setPendingGallery(prev => [...prev, ...newPendings]);
        setImages(prev => [...prev, ...newPendings.map(p => p.preview)]);
        e.target.value = '';
    };

    const handleDeleteImage = (imgUrl: string) => {
        if (imgUrl.startsWith('blob:')) {
            // It's a pending image
            const cleanPendings = pendingGallery.filter(p => p.preview !== imgUrl);
            setPendingGallery(cleanPendings);
            // Revoke blob
            URL.revokeObjectURL(imgUrl);
        } else {
            // It's a server image
            setDeletedImages(prev => [...prev, imgUrl]);
        }

        // Remove from UI
        setImages(prev => prev.filter(img => img !== imgUrl));

        // Handle cover if it was the deleted image
        if (coverImage === imgUrl) {
            setCoverImage(null);
        }
    };

    const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;
        const files = Array.from(e.target.files);
        setPendingDocuments(prev => [...prev, ...files]);

        // For documents, we just show names usually, but we need to update the UI list 'documents'
        // 'documents' state is string[] (paths). We can't easily mix Files and Paths in the string array 
        // without breaking rendering type assumptions if we render them. 
        // Looking at render (not shown in snippet but assumed), it likely maps strings. 
        // We probably shouldn't mix Files into `documents` state if it expects strings.
        // Wait, `documents` string buffer from server. 
        // We will keep `pendingDocuments` separate and render them separately in the UI list.
        e.target.value = '';
    };

    const handleRemoveDocument = (docPath: string) => {
        // Check if it's a pending file (we'll need to store pending docs better if we want to delete by path-like ID)
        // Current UI likely distinguishes pending vs existing.
        // If docPath is a server path:
        if (!docPath.startsWith('blob:') && !docPath.startsWith('pending-')) {
            setDeletedDocuments(prev => [...prev, docPath]);
            setDocuments(prev => prev.filter(d => d !== docPath));
        } else {
            // It's pending. But `pendingDocuments` is File[]. 
            // `docPath` argument implies we are passing a string identifier.
            // We need to adjust the UI rendering loop to pass index or unique ID for pending docs.
            // For now, let's assume `docPath` corresponds to name for pending? 
            // Users might upload duplicate names.
            // Let's rely on the UI rendering: existing maps `documents`, pending maps `pendingDocuments`.
            // If UI calls this for an existing doc, ok.
            // If UI calls this for pending, we need a separate handler or branched logic.
            // Let's separate functionality to be safe.
        }
    };



    const handleSave = async () => {
        if (!collectionData?.id) {
            if (createMode === 'new' && !name.trim()) return toast.warning("Name is required");
            if (createMode === 'existing' && !selectedExistingId) return toast.warning("Select a collection");
        }

        setIsSaving(true);
        try {
            const isEdit = !!collectionData?.id;

            // --- 1. DETERMINE TARGET ID ---
            let targetId = collectionData?.id;
            let finalCollection: Collection | null = null;

            if (!isEdit) {
                // CREATE NEW / ADD TO EXISTING
                // We need to create it first so we have an ID for uploads
                const payload: any = {
                    name: name.trim(),
                    description,
                    category: category || 'Uncategorized',
                    parentId: parentId === "root" ? null : parentId,
                    tags,
                    type: isProject ? 'project' : 'standard',
                    createOnDisk: false // Generic
                };

                if (createMode === 'existing') {
                    const existing = existingCollections.find(c => c.id === selectedExistingId);
                    if (!existing) throw new Error("Collection not found");
                    payload.id = existing.id;
                    payload.modelIds = Array.from(new Set([...(existing.modelIds || []), ...initialModelIds]));
                    targetId = existing.id;

                    // Use POST for existing update as per legacy
                    const res = await fetch('/api/collections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                    const d = await res.json();
                    if (!d.success) throw new Error(d.error);
                    finalCollection = d.collection;
                } else {
                    // New
                    payload.modelIds = initialModelIds;
                    const res = await fetch('/api/collections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                    const d = await res.json();
                    if (!d.success) throw new Error(d.error);
                    targetId = d.collection.id;
                    finalCollection = d.collection;
                }
            } else {
                // EDIT MODE
                // We have targetId.
            }

            if (!targetId) throw new Error("No target collection ID");

            // --- 2. PROCESS DELETIONS (Edit Mode) ---
            if (isEdit) {
                // Delete Images
                for (const imgUrl of deletedImages) {
                    const filename = imgUrl.split('/').pop();
                    if (filename) {
                        await fetch(`/api/collections/${targetId}/images/${filename}`, { method: 'DELETE' }).catch(console.error);
                    }
                }
                // Delete Docs
                for (const docPath of deletedDocuments) {
                    const filename = docPath.split('/').pop();
                    if (filename) {
                        await fetch(`/api/collections/${targetId}/documents/${filename}`, { method: 'DELETE' }).catch(console.error);
                    }
                }
            }

            // --- 3. PROCESS UPLOADS & COLLECT PATHS ---
            const newImagePaths: string[] = [];
            const newDocPaths: string[] = [];
            let newCoverPath: string | null = null;

            // Upload Gallery
            if (pendingGallery.length > 0) {
                for (const item of pendingGallery) {
                    const fd = new FormData();
                    fd.append('image', item.file);
                    try {
                        const res = await fetch(`/api/collections/${targetId}/images`, { method: 'POST', body: fd });
                        const d = await res.json();
                        if (d.success && d.imagePath) newImagePaths.push(d.imagePath);
                    } catch (e) { console.error("Gallery upload failed", e); }
                }
            }

            // Upload Docs
            if (pendingDocuments.length > 0) {
                for (const file of pendingDocuments) {
                    const fd = new FormData();
                    fd.append('file', file);
                    try {
                        const res = await fetch(`/api/collections/${targetId}/documents`, { method: 'POST', body: fd });
                        const d = await res.json();
                        if (d.success && d.filePath) newDocPaths.push(d.filePath);
                    } catch (e) { console.error("Doc upload failed", e); }
                }
            }

            // Upload Cover
            if (pendingCover) {
                const fd = new FormData();
                fd.append('image', pendingCover.file);
                try {
                    const res = await fetch(`/api/collections/${targetId}/images`, { method: 'POST', body: fd });
                    const d = await res.json();
                    if (d.success && d.imagePath) newCoverPath = d.imagePath;
                } catch (e) { console.error("Cover upload failed", e); }
            }

            // --- 4. FINAL METADATA PATCH ---
            // Construct final lists
            // Images: Current `images` state contains existing URLs and Blobs. 
            // We need to replace Blobs with `newImagePaths`?
            // Actually, since we can't easily map exact blob->newPath without order preservation, 
            // we should assume appended order?
            // Simplification: `images` sent to server = (Existing NON-Deleted NON-Blob Images) + (New Image Paths).

            const currentExisting = images.filter(i => !i.startsWith('blob:') && !deletedImages.includes(i));
            const finalImages = [...currentExisting, ...newImagePaths];

            // Documents: Not strictly managed in `collection.json` by some legacy backends (scans dir), 
            // but we might as well sync if supported. `3d-model-muncher` often just scans. 
            // If backend manages `documents` list, we'd do same.

            // Cover Image logic: 
            // If we have `newCoverPath`, use it.
            // Else if `coverImage` is a blob (shouldn't happen if we uploaded it), logic error.
            // Else use `coverImage` (could be null or existing string).
            // If `coverImage` was blob, `previous block` uploaded it -> `newCoverPath`.
            // If `coverImage` was existing string, use it.
            // If `coverImage` was null, use null.

            let finalCover = coverImage;
            if (pendingCover && newCoverPath) {
                finalCover = newCoverPath;
            } else if (coverImage?.startsWith('blob:')) {
                // If it's a blob but we didn't get a new path (upload failed), fallback to null?
                finalCover = null;
            }

            const metadataUpdate: any = {
                name: name.trim(),
                description,
                category: category || 'Uncategorized',
                parentId: parentId === "root" ? null : parentId,
                tags,
                type: isProject ? 'project' : 'standard',
                images: finalImages,
                coverImage: finalCover
            };

            if (isEdit) {
                // For Edit, we definitely PUT metadata
                const res = await fetch(`/api/collections/${targetId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(metadataUpdate)
                });
                const d = await res.json();
                if (d.success) finalCollection = d.collection;
            } else {
                // For New/Existing, we already created/updated above. 
                // But we gathered new images/cover. We should do a final patch to set them correctly
                // as the initial create didn't have the paths.
                const res = await fetch(`/api/collections/${targetId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...metadataUpdate, id: targetId }) // Ensure ID is present
                });
                const d = await res.json();
                if (d.success) finalCollection = d.collection;
            }

            // --- 5. BULK MODEL UPDATES ---
            if (collectionData?.modelIds?.length && applyToModels) {
                const bulkPayload = {
                    modelIds: collectionData.modelIds,
                    data: { category: category },
                    tagChanges: { add: tags }
                };
                await fetch('/api/models/bulk-update', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bulkPayload)
                });
                toast.success("Updated contained models");
            }

            toast.success("Changes saved");
            if (onSaved && finalCollection) onSaved(finalCollection);
            onOpenChange(false);

        } catch (e: any) {
            console.error("Save error:", e);
            toast.error(e.message || "Failed to save");
        } finally {
            setIsSaving(false);
        }
    };


    const handleGenerateMosaic = async () => {
        if (!collectionData?.id) return;
        setIsGeneratingCover(true);
        try {
            const res = await fetch('/api/collections/generate-covers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ collectionIds: [collectionData.id], force: true })
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Cover regenerated");
                // Refresh local data to show new cover
                setCoverImage(`${collectionData.id}.jpg?t=${Date.now()}`); // Heuristic or re-fetch
            } else {
                toast.error("Failed to generate cover");
            }
        } catch { toast.error("Network error"); }
        setIsGeneratingCover(false);
    };


    // --- UI PARTIALS ---

    if (!open) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
                <DialogHeader className="p-6 pb-2 shrink-0">
                    <DialogTitle>{collectionData?.id ? 'Edit Collection' : 'New Collection'}</DialogTitle>
                    <DialogDescription>
                        {collectionData?.id
                            ? 'Manage collection details, properties, and attached files.'
                            : 'Create a new collection or add items to an existing one.'}
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center min-h-[300px]">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <ScrollArea className="flex-1 overflow-y-auto">
                        <div className="p-6 space-y-6">

                            {/* Create Mode Selector (Only if New) */}
                            {!collectionData?.id && (
                                <div className="flex flex-col gap-4 p-4 border rounded-lg bg-muted/20">
                                    <div className="flex items-center gap-2">
                                        <Button variant={createMode === 'new' ? 'default' : 'outline'} size="sm" onClick={() => setCreateMode('new')} className="flex-1">
                                            <Plus className="mr-2 h-4 w-4" /> Create New
                                        </Button>
                                        <Button variant={createMode === 'existing' ? 'default' : 'outline'} size="sm" onClick={() => setCreateMode('existing')} className="flex-1">
                                            <List className="mr-2 h-4 w-4" /> Add to Existing
                                        </Button>
                                    </div>

                                    {createMode === 'existing' && (
                                        <Select value={selectedExistingId} onValueChange={setSelectedExistingId}>
                                            <SelectTrigger><SelectValue placeholder="Select collection..." /></SelectTrigger>
                                            <SelectContent>
                                                {existingCollections.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    )}
                                </div>
                            )}

                            {/* Main Form */}
                            {(!!collectionData?.id || createMode === 'new') && (
                                <>
                                    {/* ROW 1: Name & Desc */}
                                    <div className="space-y-4">
                                        <div className="grid gap-2">
                                            <Label>Name</Label>
                                            <Input value={name} onChange={e => setName(e.target.value)} placeholder="My Collection" />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Description</Label>
                                            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description..." className="h-20" />
                                        </div>
                                    </div>

                                    {/* ROW 2: Organization Section (New) */}
                                    <div className="space-y-4 pt-4 border-t">
                                        <Label className="text-base font-semibold">Organization</Label>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Category</Label>
                                                <Select value={category} onValueChange={setCategory}>
                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="Uncategorized">Uncategorized</SelectItem>
                                                        {categories.filter(c => c.label !== "Uncategorized").map(c => (
                                                            <SelectItem key={c.id} value={c.label}>{c.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Parent Collection</Label>
                                                <Select value={parentId} onValueChange={setParentId}>
                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="root">No Parent (Root)</SelectItem>
                                                        {collections.filter(c => c.id !== collectionData?.id).map(c => (
                                                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Tags</Label>
                                            <TagsInput value={tags} onChange={setTags} />
                                        </div>

                                        {/* Bulk Apply Option (Only in Edit Mode) */}
                                        {collectionData?.id && (
                                            <div className="flex items-center space-x-2 pt-2">
                                                <Checkbox id="apply-to-models" checked={applyToModels} onCheckedChange={(c) => setApplyToModels(!!c)} />
                                                <label
                                                    htmlFor="apply-to-models"
                                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                                >
                                                    Apply Category & Tags to all {collectionData.modelIds?.length || 0} contained models
                                                </label>
                                            </div>
                                        )}
                                    </div>

                                    {/* MEDIA SECTION */}
                                    <div className="space-y-4 pt-4 border-t">
                                        <Label className="text-base font-semibold">Cover & Media</Label>

                                        {/* Gallery Grid */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-sm">Gallery Images</Label>
                                                <div className="relative">
                                                    <Input id="dialog-gallery" type="file" multiple className="hidden" accept="image/*" onChange={handleGalleryUpload} />
                                                    <Button variant="ghost" size="sm" onClick={() => document.getElementById('dialog-gallery')?.click()}>
                                                        <Plus className="mr-2 h-4 w-4" /> Add Photos
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                                                {images.map((img, i) => (
                                                    <div key={i} className="relative aspect-square rounded-md border overflow-hidden group">
                                                        <img src={img} className="w-full h-full object-cover" alt="Gallery" />
                                                        <button
                                                            className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                                                            onClick={() => handleDeleteImage(img)}
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                        </button>
                                                        {coverImage === img && (
                                                            <div className="absolute bottom-0 left-0 right-0 bg-primary/80 text-primary-foreground text-[9px] text-center p-0.5">COVER</div>
                                                        )}
                                                        {coverImage !== img && (
                                                            <button
                                                                className="absolute bottom-1 left-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary"
                                                                onClick={() => setCoverImage(img)}
                                                                title="Set as Cover"
                                                            >
                                                                <ImageIcon className="h-3 w-3" />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}

                                            </div>
                                        </div>

                                        <div className="flex gap-4 items-start pt-2">
                                            {/* Cover Preview */}
                                            <div className="group relative w-24 h-24 rounded-md border bg-muted/30 overflow-hidden shrink-0 flex items-center justify-center">
                                                {coverImage ? (
                                                    <img src={coverImage} alt="Cover" className="w-full h-full object-cover" />
                                                ) : (
                                                    <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                                                )}
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                    <Button size="icon" variant="secondary" className="h-7 w-7" onClick={() => document.getElementById('dialog-cover')?.click()}>
                                                        <PencilIcon className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                                <Input id="dialog-cover" type="file" className="hidden" accept="image/*" onChange={handleCoverUpload} />
                                            </div>

                                            {/* Actions */}
                                            <div className="flex-1 space-y-2">
                                                <p className="text-sm text-muted-foreground">
                                                    Current Cover Image. Select from gallery or upload new.
                                                </p>
                                                <div className="flex gap-2 flex-wrap">
                                                    <Button variant="outline" size="sm" onClick={() => document.getElementById('dialog-cover')?.click()}>
                                                        <Upload className="mr-2 h-4 w-4" /> Upload
                                                    </Button>
                                                    {coverImage && (
                                                        <Button variant="outline" size="sm" onClick={() => setCoverImage(null)} className="text-destructive hover:text-destructive">
                                                            <Trash2 className="mr-2 h-4 w-4" /> Remove
                                                        </Button>
                                                    )}
                                                    {collectionData?.id && (
                                                        <Button variant="secondary" size="sm" onClick={handleGenerateMosaic} disabled={isGeneratingCover}>
                                                            {isGeneratingCover ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LayoutGrid className="mr-2 h-4 w-4" />}
                                                            Mosaic
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* DOCUMENTS SECTION */}
                                    <div className="space-y-3 pt-4 border-t">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-base font-semibold">Attached Documents</Label>
                                            <div className="relative">
                                                <Input id="dialog-docs" type="file" multiple className="hidden" onChange={handleDocumentUpload} />
                                                <Button variant="ghost" size="sm" onClick={() => document.getElementById('dialog-docs')?.click()}>
                                                    <Plus className="mr-2 h-4 w-4" /> Add File
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            {(documents.length === 0 && pendingDocuments.length === 0) && (
                                                <div className="text-sm text-muted-foreground italic p-2">No documents attached.</div>
                                            )}

                                            {documents.map((doc, i) => (
                                                <div key={i} className="flex items-center justify-between p-2 rounded-md border bg-card">
                                                    <div className="flex items-center gap-2 overflow-hidden">
                                                        <FileText className="h-4 w-4 text-primary shrink-0" />
                                                        <span className="text-sm truncate">{doc.split('/').pop()}</span>
                                                    </div>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveDocument(doc)}>
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            ))}

                                            {pendingDocuments.map((file, i) => (
                                                <div key={`pending-${i}`} className="flex items-center justify-between p-2 rounded-md border border-dashed bg-muted/20">
                                                    <div className="flex items-center gap-2 overflow-hidden opacity-70">
                                                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                                        <span className="text-sm truncate">{file.name} (Pending)</span>
                                                    </div>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={() => setPendingDocuments(prev => prev.filter(f => f !== file))}>
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </ScrollArea>
                )}

                <DialogFooter className="p-4 border-t bg-muted/10 shrink-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={isSaving || (createMode === 'existing' && !selectedExistingId)}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                        {collectionData?.id ? 'Save Changes' : 'Create Collection'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


