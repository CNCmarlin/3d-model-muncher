import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Model } from '@/types/model';
import { buildImageOrderFromModel, getUserImageData, resolveImageOrderToUrls } from '@/utils/galleryUtils';
import { compressImageFile } from '@/utils/imageUtils';
import { useModelMutations } from '@/hooks/useModelMutations';

export interface UseModelEditProps {
    model: Model | null;
    onModelUpdate: (model: Model) => void;
}

export function useModelEdit({ model, onModelUpdate }: UseModelEditProps) {
    // React Query Mutations
    const { updateModel } = useModelMutations();

    const [isEditing, setIsEditing] = useState(false);
    const [editedModel, setEditedModel] = useState<Model | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [restoreOriginalDescription, setRestoreOriginalDescription] = useState(false);
    const [inlineCombined, setInlineCombined] = useState<string[] | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [selectedImageIndexes, setSelectedImageIndexes] = useState<number[]>([]);

    // Image Upload State
    const [addImageProgress, setAddImageProgress] = useState<{ processed: number; total: number } | null>(null);
    const [addImageError, setAddImageError] = useState<string | null>(null);

    // Refs for restore logic
    const originalTopLevelDescriptionRef = useRef<string | null>(null);
    const originalUserDefinedDescriptionRef = useRef<string | null>(null);

    // For determining thumbnail origin
    const parsedImageCountRef = useRef<number>(0);
    const originalThumbnailExistsRef = useRef<boolean>(false);
    const parsedImagesSnapshotRef = useRef<string[]>([]);

    // Captured image pending insertion
    const pendingCapturedImageRef = useRef<string | null>(null);

    // Helper: validate related files
    const validateAndNormalizeRelatedFiles = (arr?: string[]) => {
        const cleaned: string[] = [];
        const invalid: string[] = [];
        if (!Array.isArray(arr)) return { cleaned, invalid };
        const seen = new Set<string>();
        for (const raw of arr) {
            if (typeof raw !== 'string') {
                invalid.push(String(raw));
                continue;
            }
            let s = raw.trim();
            if (s === '') {
                invalid.push(raw);
                continue;
            }
            // Remove surrounding single or double quotes
            const hadOuterQuotes = /^['"].*['"]$/.test(s);
            if (hadOuterQuotes) {
                s = s.replace(/^['"]|['"]$/g, '').trim();
                if (s === '') {
                    invalid.push(raw);
                    continue;
                }
            }
            if (s.includes('..')) {
                invalid.push(raw);
                continue;
            }
            s = s.replace(/\\/g, '/');
            if (s.startsWith('//')) {
                invalid.push(raw);
                continue;
            }
            if (/^[a-zA-Z]:\//.test(s)) {
                invalid.push(raw);
                continue;
            }
            if (s.startsWith('/')) s = s.substring(1);
            const key = s.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                cleaned.push(s);
            }
        }
        return { cleaned, invalid };
    };

    const [invalidRelated, setInvalidRelated] = useState<string[]>([]);

    // Live-validate related_files
    useEffect(() => {
        if (!editedModel) {
            setInvalidRelated([]);
            return;
        }
        const { invalid } = validateAndNormalizeRelatedFiles(editedModel.related_files as any);
        setInvalidRelated(invalid);
    }, [editedModel?.related_files]);


    const startEditing = () => {
        if (!model) return;

        // Ensure filePath is present for saving - convert to JSON file path
        let jsonFilePath;
        const srcModel = model;
        if (srcModel.filePath) {
            if (srcModel.filePath.endsWith('.3mf')) {
                jsonFilePath = srcModel.filePath.replace('.3mf', '-munchie.json');
            } else if (srcModel.filePath.endsWith('.stl') || srcModel.filePath.endsWith('.STL')) {
                jsonFilePath = srcModel.filePath.replace(/\.stl$/i, '-stl-munchie.json');
            } else if (srcModel.filePath.endsWith('-munchie.json') || srcModel.filePath.endsWith('-stl-munchie.json')) {
                jsonFilePath = srcModel.filePath;
            } else {
                jsonFilePath = `${srcModel.filePath}-munchie.json`;
            }
        } else if (srcModel.modelUrl) {
            let relativePath = srcModel.modelUrl.replace('/models/', '');
            if (relativePath.endsWith('.3mf')) {
                relativePath = relativePath.replace('.3mf', '-munchie.json');
            } else if (relativePath.endsWith('.stl') || relativePath.endsWith('.STL')) {
                relativePath = relativePath.replace(/\.stl$/i, '-stl-munchie.json');
            } else if (relativePath.endsWith('-munchie.json') || relativePath.endsWith('-stl-munchie.json')) {
                relativePath = relativePath;
            } else {
                relativePath = `${relativePath}-munchie.json`;
            }
            jsonFilePath = relativePath;
        } else {
            jsonFilePath = `${srcModel.name}-munchie.json`;
        }

        // Description Logic
        let initialDescription = (srcModel as any).description;
        try {
            const ud = (srcModel as any).userDefined;
            if (ud && typeof ud === 'object' && typeof ud.description === 'string') {
                initialDescription = ud.description;
            }
        } catch (e) { }

        originalTopLevelDescriptionRef.current = typeof (srcModel as any).description === 'string' ? (srcModel as any).description : null;
        try {
            const ud = (srcModel as any).userDefined;
            if (ud && typeof ud === 'object' && Object.prototype.hasOwnProperty.call(ud, 'description')) {
                originalUserDefinedDescriptionRef.current = typeof ud.description === 'string' ? ud.description : null;
            } else {
                originalUserDefinedDescriptionRef.current = null;
            }
        } catch (e) {
            originalUserDefinedDescriptionRef.current = null;
        }
        setRestoreOriginalDescription(false);

        // DEBUG: Check what's in srcModel
        console.log('[useModelEdit] startEditing called');
        console.log('[useModelEdit] srcModel.category:', srcModel.category);
        console.log('[useModelEdit] srcModel.printSettings:', srcModel.printSettings);
        console.log('[useModelEdit] srcModel.notes:', srcModel.notes);

        // Images Logic
        const { images: legacyImages, ...srcModelWithoutImages } = srcModel;
        const parsedImages = Array.isArray(srcModel.parsedImages)
            ? srcModel.parsedImages
            : (Array.isArray(legacyImages) ? legacyImages : []);

        const nextModel = {
            ...srcModelWithoutImages,
            filePath: jsonFilePath,
            tags: srcModel.tags || [],
            description: initialDescription,
            parsedImages: parsedImages,
            // CRITICAL FIX: Copy metadata fields so they're available for editing
            category: srcModel.category || '',
            notes: srcModel.notes || '',
            printSettings: srcModel.printSettings || {
                layerHeight: '',
                infill: '',
                nozzle: '',
                printer: '',
                material: ''
            },
            price: srcModel.price ?? 0,
            hidden: srcModel.hidden ?? false,
            designer: srcModel.designer ?? '',
            license: srcModel.license ?? '',
            isPrinted: srcModel.isPrinted ?? false,
            related_files: srcModel.related_files || []
        } as Model;

        // DEBUG: Check what's in nextModel
        console.log('[useModelEdit] nextModel.category:', nextModel.category);
        console.log('[useModelEdit] nextModel.printSettings:', nextModel.printSettings);

        // Count logic for Gallery
        const parsedImgs = parsedImages;
        const udImgs = Array.isArray((srcModel as any).userDefined?.images) ? (srcModel as any).userDefined.images : [];
        const thumbnailVal = srcModel.thumbnail;
        const thumbnailIsParsed = typeof thumbnailVal === 'string' && thumbnailVal !== '' && parsedImgs.includes(thumbnailVal);
        const thumbnailIsUser = typeof thumbnailVal === 'string' && thumbnailVal !== '' && udImgs.includes(thumbnailVal);

        if (thumbnailIsParsed) {
            parsedImageCountRef.current = 1 + parsedImgs.length;
            originalThumbnailExistsRef.current = true;
        } else if (thumbnailIsUser) {
            parsedImageCountRef.current = parsedImgs.length;
            originalThumbnailExistsRef.current = false;
        } else {
            parsedImageCountRef.current = (srcModel.thumbnail ? 1 : 0) + parsedImgs.length;
            originalThumbnailExistsRef.current = !!srcModel.thumbnail;
        }
        parsedImagesSnapshotRef.current = parsedImgs.slice();

        // Initialize inlineCombined using shared util
        const resolvedFromOrder = resolveImageOrderToUrls(srcModel as Model);
        if (resolvedFromOrder && resolvedFromOrder.length > 0) {
            setInlineCombined(resolvedFromOrder);
        } else {
            const initialCombined = [srcModel.thumbnail, ...parsedImgs].filter((img): img is string => Boolean(img));
            setInlineCombined(initialCombined);
        }

        setSelectedImageIndexes([]);
        setEditedModel(nextModel);
        setIsEditing(true);
    };

    const cancelEditing = () => {
        setEditedModel(null);
        setIsEditing(false);
        setInlineCombined(null);
        setSelectedImageIndexes([]);
    };

    const saveModelToFile = async (edited: Model, original: Model) => {
        if (!edited.id) return { success: false, error: "Missing model ID" };

        // DEBUG: What's actually in edited when save is clicked?
        console.log('[useModelEdit] saveModelToFile called');
        console.log('[useModelEdit] edited.category:', edited.category);
        console.log('[useModelEdit] edited.printSettings:', edited.printSettings);
        console.log('[useModelEdit] edited.notes:', edited.notes);

        const { invalid } = validateAndNormalizeRelatedFiles(edited.related_files as any);
        if (invalid.length > 0) return { success: false, error: 'validation_failed', invalid } as any;

        // Build updates object with only changed fields
        const updates: any = {};
        const keysToSync = [
            'name', 'description', 'notes', 'category', 'license', 'tags', 'price',
            'isPrinted', 'hidden', 'printSettings', 'designer',
            'printTime', 'filamentUsed', 'userDefined', 'related_files'
        ];

        keysToSync.forEach(key => {
            const newVal = (edited as any)[key];
            const oldVal = (original as any)[key];
            if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
                updates[key] = newVal;
            }
        });

        // Description Override Logic
        const currentText = edited.description;
        const originalLoadedText = originalUserDefinedDescriptionRef.current !== null
            ? originalUserDefinedDescriptionRef.current
            : originalTopLevelDescriptionRef.current;

        if (restoreOriginalDescription) {
            if (!updates.userDefined) updates.userDefined = {};
            updates.userDefined.description = null;
            delete updates.description;
        } else if (currentText !== originalLoadedText) {
            if (!updates.userDefined) updates.userDefined = {};
            const isEmpty = typeof currentText === 'string' && currentText.trim() === '';
            updates.userDefined.description = isEmpty ? null : currentText;
            delete updates.description;
        }

        // Image Order Enforcement
        try {
            const udObj = edited.userDefined && typeof edited.userDefined === 'object' ? { ...(edited.userDefined as any) } : {};
            let imageOrderFinal = Array.isArray(udObj.imageOrder) ? udObj.imageOrder : buildImageOrderFromModel(edited);

            if (Array.isArray(imageOrderFinal) && imageOrderFinal.length > 0) {
                if (!updates.userDefined) updates.userDefined = {};
                updates.userDefined.imageOrder = imageOrderFinal;
                updates.userDefined.thumbnail = imageOrderFinal[0];
                delete updates.images;
                delete updates.thumbnail;
            }
        } catch (e) { console.warn('Nested thumbnail enforcement failed:', e); }

        try {
            // Use React Query mutation instead of legacy endpoint
            const result = await updateModel.mutateAsync({
                id: edited.id,
                data: updates  // Changed from 'updates' to 'data' to match mutation signature
            });

            return { success: true, serverResponse: result, refreshedModel: result };
        } catch (err: any) {
            console.error("Save process failed:", err);
            return { success: false, error: err.message };
        }
    };

    const saveChanges = async () => {
        if (!editedModel || !model || isSaving) return;
        setIsSaving(true);
        try {
            const result = await saveModelToFile(editedModel, model);
            if (result && result.success) {
                const finalModelToUpdate = result.refreshedModel || editedModel;
                onModelUpdate(finalModelToUpdate);
                setIsEditing(false);
                setEditedModel(null);
                setInlineCombined(null);
                setSelectedImageIndexes([]);
                toast.success('Changes saved successfully');
            } else {
                const errorMsg = result?.error === 'validation_failed' ? "Invalid file paths detected" : (result?.error || "Unknown error");
                toast.error(`Save failed: ${errorMsg}`);
            }
        } catch (err) {
            toast.error("An unexpected error occurred during save");
        } finally {
            setIsSaving(false);
        }
    };

    const insertCapturedImageIntoEditedModel = (dataUrl: string) => {
        if (!editedModel) return;
        const udObj = (editedModel as any).userDefined && typeof (editedModel as any).userDefined === 'object' ? { ...(editedModel as any).userDefined } : {};
        const existingUserImages: any[] = Array.isArray(udObj.images) ? udObj.images.slice() : [];
        existingUserImages.push(dataUrl);
        udObj.images = existingUserImages;

        const currentOrder: string[] = Array.isArray(udObj.imageOrder) ? udObj.imageOrder.slice() : buildImageOrderFromModel(editedModel);
        const newUserIndex = existingUserImages.length - 1;
        currentOrder.push(`user:${newUserIndex}`);
        udObj.imageOrder = currentOrder;

        const nextModel = { ...(editedModel as any), userDefined: udObj } as Model;
        setEditedModel(nextModel);

        const resolved = resolveImageOrderToUrls(nextModel) || [];
        setInlineCombined(resolved);
        // Note: Caller (useModelGallery/ModelHubView) should typically update selectedImageIndex if they wish

        setSelectedImageIndexes([]);
        toast.success('Captured image added to model\'s gallery');
    };

    // When startEditing is called, we might need to handle a pending capture
    useEffect(() => {
        if (pendingCapturedImageRef.current && editedModel) {
            const dataUrl = pendingCapturedImageRef.current;
            pendingCapturedImageRef.current = null;
            insertCapturedImageIntoEditedModel(dataUrl);
        }
    }, [editedModel]);

    const handleCapturedImage = (dataUrl: string) => {
        pendingCapturedImageRef.current = dataUrl;
        if (!isEditing) {
            startEditing();
        } else if (editedModel) {
            insertCapturedImageIntoEditedModel(dataUrl);
            pendingCapturedImageRef.current = null;
        }
    };

    // IMAGE UPLOAD HANDLER
    const handleAddImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        e.stopPropagation();
        setAddImageError(null);
        const inputEl = e.currentTarget as HTMLInputElement;
        const files = inputEl.files ? Array.from(inputEl.files) : [];
        if (files.length === 0 || !editedModel) {
            try { inputEl.value = ''; } catch (err) { }
            return;
        }

        const oversize = files.find(f => f.size > 20 * 1024 * 1024);
        if (oversize) {
            setAddImageError(`File ${oversize.name} is too large (>20MB).`);
            try { inputEl.value = ''; } catch (err) { }
            return;
        }

        setAddImageProgress({ processed: 0, total: files.length });

        try {
            const newDataUrls: string[] = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const dataUrl = await compressImageFile(file, { maxWidth: 1600, maxHeight: 1600, maxSizeBytes: 800000 });
                newDataUrls.push(dataUrl);
                setAddImageProgress({ processed: i + 1, total: files.length });
            }

            setEditedModel(prev => {
                if (!prev) return prev;
                const udObj = (prev as any).userDefined && typeof (prev as any).userDefined === 'object'
                    ? { ...(prev as any).userDefined }
                    : {};

                const existingUserImages = Array.isArray(udObj.images) ? (udObj.images as any[]).slice() : [];
                const updatedUserImages = existingUserImages.concat(newDataUrls);
                const currentOrder = Array.isArray(udObj.imageOrder) ? (udObj.imageOrder as any[]).slice() : buildImageOrderFromModel(prev as Model);
                const newUserDescriptors = newDataUrls.map((_, index) => `user:${existingUserImages.length + index}`);
                const updatedOrder = currentOrder.concat(newUserDescriptors);

                udObj.images = updatedUserImages;
                udObj.imageOrder = updatedOrder;

                if ((!currentOrder.length || !udObj.thumbnail) && newUserDescriptors.length > 0) {
                    udObj.thumbnail = newUserDescriptors[0];
                }

                return { ...prev, userDefined: udObj } as Model;
            });

            // Update inlineCombined
            setInlineCombined(prev => {
                if (!prev) {
                    const parsed = Array.isArray((editedModel as any)?.parsedImages) ? (editedModel as any).parsedImages : [];
                    const existing = Array.isArray((editedModel as any)?.userDefined?.images)
                        ? (editedModel as any).userDefined.images.map((u: any) => getUserImageData(u))
                        : [];
                    const base = [...parsed, ...existing];
                    return base.concat(newDataUrls);
                }
                return [...prev, ...newDataUrls];
            });

            setSelectedImageIndexes([]);

        } catch (err: any) {
            console.error('Error adding images:', err);
            setAddImageError(String(err?.message || err));
        } finally {
            setAddImageProgress(null);
            try { inputEl.value = ''; } catch (err) { }
        }
    };

    // DRAG AND DROP HANDLERS
    const handleDragStart = (e: React.DragEvent, sourceIndex: number, isWindowFullscreen: boolean) => {
        if (!isEditing || isWindowFullscreen) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData('text/plain', String(sourceIndex));
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, targetIndex: number, isWindowFullscreen: boolean) => {
        if (!isEditing || isWindowFullscreen) return;
        e.preventDefault();
        setDragOverIndex(targetIndex);
    };

    const handleDrop = (e: React.DragEvent, targetIndex: number, isWindowFullscreen: boolean) => {
        if (!isEditing || isWindowFullscreen) return;
        e.preventDefault();
        const src = e.dataTransfer.getData('text/plain');
        if (!src) return setDragOverIndex(null);
        const sourceIndex = parseInt(src, 10);
        if (isNaN(sourceIndex)) return setDragOverIndex(null);
        if (!editedModel) return setDragOverIndex(null);

        const currentDescriptors = Array.isArray((editedModel as any).userDefined?.imageOrder)
            ? (editedModel as any).userDefined.imageOrder.slice()
            : buildImageOrderFromModel(editedModel);

        if (sourceIndex < 0 || sourceIndex >= currentDescriptors.length || targetIndex < 0 || targetIndex >= currentDescriptors.length) {
            setDragOverIndex(null);
            return;
        }

        const descItem = currentDescriptors.splice(sourceIndex, 1)[0];
        currentDescriptors.splice(targetIndex, 0, descItem);

        let normalizedThumbDescriptor: string | undefined = undefined;
        if (targetIndex === 0) {
            if (typeof descItem === 'string' && /^(user:\d+|parsed:\d+)$/.test(descItem)) {
                normalizedThumbDescriptor = descItem;
            }
        }

        setEditedModel(prev => {
            if (!prev) return prev;
            const udObj = prev.userDefined && typeof prev.userDefined === 'object' ? { ...(prev.userDefined as any) } : {};
            udObj.imageOrder = currentDescriptors;
            if (typeof normalizedThumbDescriptor === 'string' && udObj.thumbnail !== normalizedThumbDescriptor) {
                udObj.thumbnail = normalizedThumbDescriptor as any;
            }
            return { ...prev, userDefined: udObj } as Model;
        });

        const tempUdObj2 = (editedModel as any).userDefined && typeof (editedModel as any).userDefined === 'object' ? { ...(editedModel as any).userDefined } : {};
        tempUdObj2.imageOrder = currentDescriptors;
        const tempModelForResolve = { ...editedModel, userDefined: tempUdObj2 } as Model;
        const resolved = resolveImageOrderToUrls(tempModelForResolve) || [];
        setInlineCombined(resolved);

        setSelectedImageIndexes([]);
        setDragOverIndex(null);

        return targetIndex;
    };

    const toggleImageSelection = (index: number, isWindowFullscreen: boolean) => {
        if (!isEditing || isWindowFullscreen) return;
        setSelectedImageIndexes(prev => {
            const set = new Set(prev);
            if (set.has(index)) set.delete(index);
            else set.add(index);
            return Array.from(set).sort((a, b) => a - b);
        });
    };

    const handleSetAsMain = (imageIndex: number) => {
        if (!isEditing || !editedModel) return;
        const currentOrder = Array.isArray((editedModel as any).userDefined?.imageOrder)
            ? (editedModel as any).userDefined.imageOrder.slice()
            : buildImageOrderFromModel(editedModel);

        if (imageIndex < 0 || imageIndex >= currentOrder.length) return;
        const selectedDescriptor = currentOrder[imageIndex];

        setEditedModel(prev => {
            if (!prev) return prev;
            const udObj = prev.userDefined && typeof prev.userDefined === 'object' ? { ...(prev.userDefined as any) } : {};
            udObj.thumbnail = selectedDescriptor;
            const newOrder = [selectedDescriptor, ...currentOrder.filter((_: any, idx: number) => idx !== imageIndex)];
            udObj.imageOrder = newOrder;
            return { ...prev, userDefined: udObj } as Model;
        });

        if (inlineCombined) {
            const selectedImage = inlineCombined[imageIndex];
            const newOrder = [selectedImage, ...inlineCombined.filter((_, idx) => idx !== imageIndex)];
            setInlineCombined(newOrder);
        }
    };

    return {
        isEditing,
        setIsEditing,
        editedModel,
        setEditedModel,
        isSaving,
        restoreOriginalDescription,
        setRestoreOriginalDescription,
        originalTopLevelDescriptionRef,
        originalUserDefinedDescriptionRef,
        invalidRelated,
        startEditing,
        cancelEditing,
        saveChanges,
        handleCapturedImage,
        parsedImageCountRef,
        originalThumbnailExistsRef,
        parsedImagesSnapshotRef,
        buildImageOrderFromModel,
        insertCapturedImageIntoEditedModel,
        inlineCombined,
        setInlineCombined,
        dragOverIndex,
        setDragOverIndex,
        selectedImageIndexes,
        setSelectedImageIndexes,
        handleAddImageFile,
        addImageProgress,
        addImageError,
        handleDragStart,
        handleDragOver,
        handleDrop,
        toggleImageSelection,
        handleSetAsMain
    };
}
