import { Model } from '@/types/model';
import { RendererPool } from '@/utils/rendererPool';
import { useState } from 'react';
import { toast } from 'sonner';
import { useBulkEditForm } from './useBulkEditForm';

// Separate helper for saving a single model file interaction
// This needs to be exported or self-contained
async function saveModelToFile(edited: Model, original: Model) {
    if (!edited.filePath) {
        console.error("No filePath specified for model");
        return { success: false, error: "No filePath" };
    }
    // Compute changed fields
    const changes: any = { filePath: edited.filePath, id: edited.id };
    Object.keys(edited).forEach(key => {
        if (key === 'filePath' || key === 'id') return;
        const editedValue = JSON.stringify((edited as any)[key]);
        const originalValue = JSON.stringify((original as any)[key]);
        if (editedValue !== originalValue) {
            changes[key] = (edited as any)[key];
        }
    });

    // Special handling for nested userDefined if needed (mirrored from original)
    if (edited.userDefined) {
        if (Array.isArray(edited.userDefined.images)) {
            if (!changes.userDefined) changes.userDefined = {};
            changes.userDefined.images = edited.userDefined.images;
        }
        if (Array.isArray(edited.userDefined.imageOrder)) {
            if (!changes.userDefined) changes.userDefined = {};
            changes.userDefined.imageOrder = edited.userDefined.imageOrder;
        }
        if (typeof (edited.userDefined as any).description !== 'undefined') {
            // Handle legacy description migration if present
            if (!changes.userDefined) changes.userDefined = {};
            changes.userDefined.description = (edited.userDefined as any).description;
        }
    }

    // Handle root description migration
    if (typeof changes.description !== 'undefined') {
        if (!changes.userDefined) changes.userDefined = {};
        changes.userDefined.description = changes.description;
        delete changes.description;
    }

    try {
        const response = await fetch('/api/save-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(changes)
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Failed to save model');
        return result;
    } catch (err) {
        console.error(`[BulkEdit] Failed to save model ${edited.name}:`, err);
        return { success: false, error: String(err) };
    }
}

interface UseBulkOperationsProps {
    models: Model[];
    form: ReturnType<typeof useBulkEditForm>;
    onBulkUpdate: (updates: Partial<Model>) => void;
    onRefresh?: () => Promise<void>;
    onBulkSaved?: (updatedModels: Model[]) => void;
    onBulkEditComplete: () => void;
    onClose: () => void;
    onClearSelections?: () => void;
    modelDirectory?: string;
    pendingBulkCollectionId: string | null;
}

export function useBulkOperations({
    models,
    form,
    onBulkUpdate,
    onRefresh,
    onBulkSaved,
    onBulkEditComplete,
    onClose,
    onClearSelections,
    modelDirectory,
    pendingBulkCollectionId
}: UseBulkOperationsProps) {
    const { editState, fieldSelection, uniqueKeyForModel, isStlModel } = form;
    const [isSaving, setIsSaving] = useState(false);
    const [isGeneratingImages, setIsGeneratingImages] = useState(false);
    const [generateProgress, setGenerateProgress] = useState({ current: 0, total: 0 });
    const [closeRequestedWhileGenerating, setCloseRequestedWhileGenerating] = useState(false);

    // Image Generation Logic
    const handleGenerateImages = async () => {
        if (isGeneratingImages) return [];
        const modelHasImage = (m: Model) => {
            if (!m) return false;
            // Quick check logic
            return !!m.thumbnail || (m.images && m.images.length > 0) || (m.parsedImages && m.parsedImages.length > 0) || (m.userDefined?.images && m.userDefined.images.length > 0);
        };

        const toProcess = models.filter(m => !modelHasImage(m));
        if (toProcess.length === 0) {
            form.setFieldSelection(prev => ({ ...prev, generateImages: false }));
            return [];
        }

        setIsGeneratingImages(true);
        setGenerateProgress({ current: 0, total: toProcess.length });

        const savedModels: Model[] = [];

        for (let i = 0; i < toProcess.length; i++) {
            const model = toProcess[i];
            let modelUrl = model.modelUrl;
            if (!modelUrl && model.filePath) {
                modelUrl = `/models/${model.filePath.replace(/\\/g, '/')}`;
            }

            let dataUrl: string | null = null;
            try {
                if (modelUrl) dataUrl = await RendererPool.captureModel(modelUrl);
            } catch (err) {
                console.warn('[BulkEdit] capture failed', model.name, err);
            }

            if (dataUrl) {
                const updatedModel = { ...model } as Model;
                if (!updatedModel.userDefined) updatedModel.userDefined = {} as any;
                const imgs = updatedModel.userDefined?.images || [];
                updatedModel.userDefined!.images = [...imgs, dataUrl];
                // basic path logic
                if (!updatedModel.filePath && updatedModel.modelUrl) {
                    let rel = updatedModel.modelUrl.replace('/models/', '');
                    if (rel.endsWith('.3mf')) rel = rel.replace('.3mf', '-munchie.json');
                    else if (rel.endsWith('.stl')) rel = rel.replace('.stl', '-stl-munchie.json');
                    else rel = `${rel}-munchie.json`;
                    updatedModel.filePath = rel;
                }

                const res = await saveModelToFile(updatedModel, model);
                if (res.success && res.refreshedModel) {
                    savedModels.push(res.refreshedModel);
                } else {
                    savedModels.push(updatedModel);
                }
            }
            setGenerateProgress({ current: i + 1, total: toProcess.length });
        }

        setIsGeneratingImages(false);
        form.setFieldSelection(prev => ({ ...prev, generateImages: false }));

        if (closeRequestedWhileGenerating) {
            setCloseRequestedWhileGenerating(false);
            onClose();
        }
        return savedModels;
    };

    // Save Logic
    const handleSave = async () => {
        setIsSaving(true);
        try {
            const updates: Partial<Model> = {};

            // 1. Build updates object from simple fields
            if (fieldSelection.category && editState.category) updates.category = editState.category;
            if (fieldSelection.license && editState.license) updates.license = editState.license;
            if (fieldSelection.designer && editState.designer) updates.designer = editState.designer;
            if (fieldSelection.isPrinted && editState.isPrinted !== undefined) updates.isPrinted = editState.isPrinted;
            if (fieldSelection.hidden && editState.hidden !== undefined) updates.hidden = editState.hidden;
            if (fieldSelection.notes && editState.notes !== undefined) updates.notes = editState.notes;
            if (fieldSelection.source && editState.source !== undefined) updates.source = editState.source;
            if (fieldSelection.price && editState.price !== undefined) updates.price = editState.price;
            if (fieldSelection.printTime && editState.printTime !== undefined) updates.printTime = editState.printTime;
            if (fieldSelection.filamentUsed && editState.filamentUsed !== undefined) updates.filamentUsed = editState.filamentUsed;

            if (fieldSelection.tags && editState.tags) {
                (updates as any).bulkTagChanges = editState.tags;
            }

            // 2. Collection Updates
            if (fieldSelection.collection && editState.collectionId && editState.collectionAction && editState.collectionAction !== 'none') {
                try {
                    const resp = await fetch('/api/collections/bulk-update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            collectionId: editState.collectionId,
                            action: editState.collectionAction,
                            modelIds: models.map(m => m.id)
                        })
                    });
                    const res = await resp.json();
                    if (!res.success) throw new Error(res.error);
                    toast.success(`Collection updated: ${editState.collectionAction} ${models.length} models`);
                    window.dispatchEvent(new Event('collection-updated'));
                } catch (e) {
                    console.error("Collection update failed", e);
                    toast.error("Collection update failed");
                }
            }

            // 3. Regenerate Munchie
            if (fieldSelection.regenerateMunchie) {
                await fetch('/api/regenerate-munchie-files', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ modelIds: models.map(m => m.id) })
                });
                if (onRefresh) await onRefresh();
                if (onClearSelections) onClearSelections();

                // Return early if no other updates
                const hasPerModel = fieldSelection.printSettings || fieldSelection.relatedFiles;
                if (Object.keys(updates).length === 0 && !hasPerModel) {
                    onClose();
                    return;
                }
            }

            // 4. Per-Model Logic & Saving
            onBulkUpdate(updates);

            const savedModels: Model[] = [];

            for (const model of models) {
                // Logic to compute file path (simplified from original)
                let jsonPath = model.filePath;
                if (jsonPath) {
                    if (jsonPath.endsWith('.3mf')) jsonPath = jsonPath.replace(/\.3mf$/i, '-munchie.json');
                    else if (jsonPath.endsWith('.stl') || jsonPath.endsWith('.STL')) jsonPath = jsonPath.replace(/\.stl$/i, '-stl-munchie.json');
                    else if (!jsonPath.endsWith('.json')) jsonPath = `${jsonPath}-munchie.json`;
                } else if (model.modelUrl) {
                    let rel = model.modelUrl.replace('/models/', '');
                    if (rel.endsWith('.3mf')) rel = rel.replace('.3mf', '-munchie.json');
                    else if (rel.endsWith('.stl')) rel = rel.replace('.stl', '-stl-munchie.json');
                    else rel = `${rel}-munchie.json`;
                    jsonPath = rel;
                } else {
                    jsonPath = `${model.name}-munchie.json`;
                }

                // Sanitize path (strip double suffixes)
                if (jsonPath?.includes('-munchie.json_')) {
                    jsonPath = jsonPath.split('_')[0];
                }

                const updatedModel = { ...model, filePath: jsonPath };

                // Related Files Application
                if (fieldSelection.relatedFiles) {
                    if (editState.relatedClearAll) {
                        (updatedModel as any).related_files = [];
                    } else if (editState.relatedIncluded && editState.relatedIncluded.length > 0) {
                        const includedIds = editState.relatedIncluded;
                        const relatedUrls = includedIds
                            .filter(key => key !== uniqueKeyForModel(model))
                            .map(key => {
                                const m = models.find(x => uniqueKeyForModel(x) === key);
                                let url = m?.modelUrl || '';
                                const configured = (modelDirectory || './models').replace(/\\/g, '/');
                                // simple relative logic
                                if (url.startsWith(configured)) url = url.substring(configured.length);
                                else if (url.startsWith('/' + configured)) url = url.substring(configured.length + 1);
                                if (url.startsWith('/')) url = url.substring(1);
                                return url;
                            }).filter(Boolean);

                        (updatedModel as any).related_files = relatedUrls;

                        if (editState.relatedHideOthers && editState.relatedPrimary) {
                            const key = uniqueKeyForModel(model);
                            if (includedIds.includes(key)) {
                                updatedModel.hidden = (key !== editState.relatedPrimary);
                            }
                        }
                    }
                }

                // Apply Bulk Tags
                if (fieldSelection.tags && editState.tags) {
                    let newTags = [...(model.tags || [])];
                    if (editState.tags.remove) {
                        newTags = newTags.filter(t => !editState.tags!.remove!.includes(t));
                    }
                    if (editState.tags.add) {
                        editState.tags.add.forEach(t => { if (!newTags.includes(t)) newTags.push(t); });
                    }
                    updatedModel.tags = newTags;
                }

                // Apply standard updates
                Object.keys(updates).forEach(key => {
                    if (key !== 'bulkTagChanges') (updatedModel as any)[key] = (updates as any)[key];
                });

                // Apply Print Settings (STL only)
                if (fieldSelection.printSettings && editState.printSettings && isStlModel(model)) {
                    // Filter empty
                    const ps: any = {};
                    Object.entries(editState.printSettings).forEach(([k, v]) => {
                        if (v?.trim()) ps[k] = v.trim();
                    });
                    if (Object.keys(ps).length > 0) {
                        (updatedModel as any).printSettings = { ...(updatedModel as any).printSettings, ...ps };
                    }
                }

                await saveModelToFile(updatedModel, model);
                savedModels.push(updatedModel);
            } // end loop

            if (onBulkSaved) onBulkSaved(savedModels);
            else if (onRefresh) await onRefresh();

            if (pendingBulkCollectionId && onBulkEditComplete) onBulkEditComplete();

            onClose();

        } catch (error) {
            console.error(error);
            toast.error("Failed to save bulk changes");
        } finally {
            setIsSaving(false);
        }
    };

    return {
        isSaving,
        isGeneratingImages,
        generateProgress,
        handleSave,
        handleGenerateImages,
        setCloseRequestedWhileGenerating
    };
}
