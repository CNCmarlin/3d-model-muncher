import { useBulkEditModels } from '@/hooks/mutations/useBulkEditModels';
import { Model } from '@/types/model';
import { RendererPool } from '@/utils/rendererPool';
import { useState } from 'react';
import { toast } from 'sonner';
import { useBulkEditForm } from './useBulkEditForm';

// Separate helper for saving a single model file interaction
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

    // Special handling for nested userDefined if needed
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
            if (!changes.userDefined) changes.userDefined = {};
            changes.userDefined.description = (edited.userDefined as any).description;
        }
    }

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

    onRefresh?: () => Promise<void>;
    onBulkSaved?: (updatedModels: Model[]) => void;
    onClose: () => void;
    onClearSelections?: () => void;

    pendingBulkCollectionId: string | null;
    openMoveConfirmation?: () => Promise<boolean>;
}

export function useBulkOperations({
    models,
    form,
    onRefresh,
    onBulkSaved,
    onClose,
    // pendingBulkCollectionId, // Unused in operations, generic handling moved to update logic or form init
    openMoveConfirmation
}: UseBulkOperationsProps) {
    // const { editState, fieldSelection } = form; // No longer used directly, we use form.stagedEdits in handleSave
    const [isSaving, setIsSaving] = useState(false);
    const [isGeneratingImages, setIsGeneratingImages] = useState(false);
    const [generateProgress, setGenerateProgress] = useState({ current: 0, total: 0 });
    const [closeRequestedWhileGenerating, setCloseRequestedWhileGenerating] = useState(false);

    const bulkEditModels = useBulkEditModels();

    // Image Generation Logic
    const handleGenerateImages = async () => {
        if (isGeneratingImages) return [];
        const modelHasImage = (m: Model) => {
            if (!m) return false;
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
            // We need to group models by the *exact* set of updates they are receiving
            // to efficiently use the bulk-update endpoint.
            // Map<JSONStringOfUpdates, Array<ModelId>>
            const updatesGrouped = new Map<string, string[]>();

            const { stagedEdits } = form; // This is the new state

            // Iterate over ALL models that have staged edits
            // (We iterate over 'models' to be safe, or just keys of stagedEdits)
            const modelsToUpdate = models.filter(m => stagedEdits[m.id] && Object.keys(stagedEdits[m.id]).length > 0);

            if (modelsToUpdate.length === 0) {
                toast.info("No changes staged to save");
                setIsSaving(false);
                return;
            }

            modelsToUpdate.forEach(model => {
                const editState = stagedEdits[model.id];
                const updates: any = {};
                const tagChanges: any = {};

                // 1. Standard Fields (Always from stagedEdits now)
                if (editState.category) updates.category = editState.category;
                if (editState.license) updates.license = editState.license;
                if (editState.designer) updates.designer = editState.designer;
                if (editState.isPrinted !== undefined) updates.isPrinted = editState.isPrinted;
                if (editState.hidden !== undefined) updates.hidden = editState.hidden;
                if (editState.notes !== undefined) updates.notes = editState.notes;
                if (editState.source !== undefined) updates.source = editState.source;
                if (editState.price !== undefined) updates.price = parseFloat(String(editState.price)) || 0;
                if (editState.printTime !== undefined) updates.printTime = parseInt(editState.printTime) || 0;
                if (editState.filamentUsed !== undefined) updates.filamentUsed = parseFloat(editState.filamentUsed) || 0;
                // Deep merge printSettings to prevent overwriting existing keys with a partial update
                if (editState.printSettings) {
                    updates.printSettings = {
                        ...(model.printSettings || {}),
                        ...editState.printSettings
                    };
                }

                if (editState.tags) {
                    if (editState.tags.add?.length) tagChanges.add = editState.tags.add;
                    if (editState.tags.remove?.length) tagChanges.remove = editState.tags.remove;
                    if (Object.keys(tagChanges).length > 0) {
                        updates.tags = tagChanges;
                    }
                }

                // 2. Collection Operations
                if (editState.collectionId) {
                    if (editState.collectionAction === 'add' || !editState.collectionAction) {
                        updates.collectionId = editState.collectionId;
                        // Move files confirmation logic is tricky in batch.
                        // For now we assume false or global setting, or we can prompt ONCE.
                        // updates.moveFiles = ... 
                    } else if (editState.collectionAction === 'remove') {
                        updates.collectionId = null;
                    }
                }

                if (Object.keys(updates).length > 0) {
                    const key = JSON.stringify(updates);
                    if (!updatesGrouped.has(key)) {
                        updatesGrouped.set(key, []);
                    }
                    updatesGrouped.get(key)!.push(model.id);
                }
            });

            // 3. Execute Bulk Updates (Grouped)
            const promises: Promise<any>[] = [];

            // Helper for move confirmation (ask once if any collection move is happening?)
            let moveFilesGlobal = false;
            // Check if any update involves collectionId
            const anyCollectionMove = Array.from(updatesGrouped.keys()).some(k => k.includes('collectionId'));
            if (anyCollectionMove && openMoveConfirmation) {
                moveFilesGlobal = await openMoveConfirmation();
            }

            for (const [updateJson, ids] of updatesGrouped.entries()) {
                const updates = JSON.parse(updateJson);
                if (updates.collectionId) {
                    updates.moveFiles = moveFilesGlobal;
                }
                promises.push(bulkEditModels.mutateAsync({ ids, updates }));
            }

            if (promises.length > 0) {
                await Promise.all(promises);
                if (onBulkSaved) onBulkSaved(models); // Trigger parent refresh
                if (onRefresh) await onRefresh();
                onClose();
            } else {
                toast.info("No effective changes to save");
            }

        } catch (error) {
            console.error(error);
            toast.error("Failed to save changes");
        } finally {
            setIsSaving(false);
        }
    };

    return {
        isSaving,
        isGeneratingImages,
        generateProgress,
        handleSave,
        modelHasImage: (m: Model) => !!m.thumbnail || (m.images && m.images.length > 0),
        handleGenerateImages,
        setCloseRequestedWhileGenerating
    };
}
