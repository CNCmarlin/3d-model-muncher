import { updateModel } from '@/api/services/modelService_db';
import { useBulkEditModels_db } from '@/hooks/mutations/useBulkEditModels_db';
import { Model } from '@/types/model_db';
import { RendererPool } from '@/utils/rendererPool';
import { useState } from 'react';
import { toast } from 'sonner';
import { useBulkEditForm_db } from './useBulkEditForm_db';

// Helper: validate related files (Not used directly here but good for consistency or can use the one from useModelEdit if exported)

interface UseBulkOperationsProps {
    models: Model[];
    form: ReturnType<typeof useBulkEditForm_db>;

    onRefresh?: () => Promise<void>;
    onBulkSaved?: (updatedModels: Model[]) => void;
    onClose: () => void;
    onClearSelections?: () => void;

    pendingBulkCollectionId: string | null;
    openMoveConfirmation?: () => Promise<boolean>;
}

export function useBulkOperations_DB({
    models,
    form,
    onRefresh,
    onBulkSaved,
    onClose,
    // pendingBulkCollectionId,
    openMoveConfirmation
}: UseBulkOperationsProps) {
    const [isSaving, setIsSaving] = useState(false);
    const [isGeneratingImages, setIsGeneratingImages] = useState(false);
    const [generateProgress, setGenerateProgress] = useState({ current: 0, total: 0 });
    const [closeRequestedWhileGenerating, setCloseRequestedWhileGenerating] = useState(false);

    const bulkEditModels = useBulkEditModels_db();

    // Image Generation Logic (DB Version uses updateModel service)
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

                try {
                    // DB: Use updateModel service which maps to PATCH /api/models/:id
                    const updates = {
                        userDefined: {
                            images: updatedModel.userDefined!.images
                        }
                    };

                    const refreshedModel = await updateModel(model.id, updates) as unknown as Model;
                    savedModels.push(refreshedModel);
                } catch (err) {
                    console.error('[BulkEdit] Failed to save generated image for model', model.id, err);
                    savedModels.push(updatedModel); // Push unsaved state just in case? Or error?
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

    // Save Logic (DB Version)
    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Group edits for bulk update
            const updatesGrouped = new Map<string, string[]>();
            const { stagedEdits } = form;

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

                // 1. Standard Fields (Dynamic flat copy)
                const specialKeys = new Set(['tags', 'printSettings', 'collectionId', 'collectionAction', 'relatedPrimary', 'relatedHideOthers', 'relatedIncluded', 'relatedClearAll', 'price', 'printTime', 'filamentUsed', 'filamentUsage']);

                Object.keys(editState).forEach((key) => {
                    if (specialKeys.has(key)) return;
                    const val = (editState as any)[key];
                    if (val !== undefined) {
                        updates[key] = val;
                    }
                });

                // Explicit type parsing for number fields
                if (editState.price !== undefined) updates.price = parseFloat(String(editState.price)) || 0;
                if (editState.printTime !== undefined) updates.printTime = parseInt(String(editState.printTime)) || 0;
                if (editState.filamentUsed !== undefined) updates.filamentUsage = parseFloat(String(editState.filamentUsed)) || 0;
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
                    } else if (editState.collectionAction === 'remove') {
                        // Prisma requires models to be in a collection, so "removing" from a collection
                        // is unsupported unless we move them to a generic "Uncategorized" collection ID.
                        // For now, we omit it to prevent Prisma crashes (500 errors).
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

            // Move files confirmation logic: DB mode might handle this differently or not support moves yet?
            // "moveFiles" param is for legacy FS moves. DB probably doesn't need it or ignores it unless "sync" is active.
            // But we keep it to signal intent if collections_db supports re-parenting.
            let moveFilesGlobal = false;
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
                if (onBulkSaved) onBulkSaved(models);
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
