import { toast } from "sonner";
import { Model } from "@/types/model";
import { useModelMutations } from "./useModelMutations";

interface UseModelActionsProps {
    models: Model[];
    setModels: (models: Model[]) => void;
    filteredModels: Model[];
    setFilteredModels: (models: Model[]) => void;
    selectedModelIds: string[];
    setSelectedModelIds: (ids: string[]) => void;
    setIsSelectionMode: (isSelectionMode: boolean) => void;
    onCloseBulkEdit?: () => void;
    refreshModels: () => Promise<void>;
    setSelectedModel: (model: Model | null) => void;
}

/**
 * Model Actions Hook - Now powered by React Query!
 * 
 * Provides model manipulation functions with optimistic updates
 * for instant UI feedback.
 */
export function useModelActions({
    models,
    setModels,
    filteredModels,
    setFilteredModels,
    selectedModelIds,
    setSelectedModelIds,
    setIsSelectionMode,
    onCloseBulkEdit,
    refreshModels,
    setSelectedModel
}: UseModelActionsProps) {
    // React Query mutations for optimistic updates
    const { updateModel, bulkUpdateModels } = useModelMutations();

    const handleModelUpdate = async (updatedModel: Model) => {
        // Optimistically update local state immediately
        setSelectedModel(updatedModel);

        // Use React Query mutation (handles optimistic cache update automatically)
        updateModel.mutate(
            {
                id: updatedModel.id,
                data: updatedModel,
            },
            {
                onSuccess: () => {
                    console.log("Model saved successfully!");
                },
                onError: (error: unknown) => {
                    console.error('Failed to persist model change:', error);
                    toast.error("Failed to save changes");
                },
            }
        );
    };

    const handleBulkModelsUpdate = (updatedModelsData: Partial<Model> & { bulkTagChanges?: { add: string[]; remove: string[] } }, specificIds?: string[]) => {
        // Build the update data
        const updateData: Partial<Model> = { ...updatedModelsData };
        delete (updateData as any).bulkTagChanges;

        // Handle tag changes
        if (updatedModelsData.bulkTagChanges) {
            const { add, remove } = updatedModelsData.bulkTagChanges;
            // This will need special handling on the backend
            (updateData as any).tagChanges = { add, remove };
        }

        // Use React Query bulk mutation
        bulkUpdateModels.mutate(
            {
                modelIds: specificIds || selectedModelIds,
                data: updateData,
            },
            {
                onSuccess: () => {
                    setSelectedModelIds([]);
                    setIsSelectionMode(false);
                    if (onCloseBulkEdit) onCloseBulkEdit();
                    toast(`Updated ${selectedModelIds.length} models`);
                },
                onError: (error: unknown) => {
                    console.error('Failed to bulk update:', error);
                    toast.error("Failed to update models");
                },
            }
        );
    };

    const handleBulkSavedModels = (updatedModels: Model[]) => {
        if (!updatedModels || updatedModels.length === 0) return;
        const updatedMap = new Map(updatedModels.map(m => [m.id, m]));
        const mergedModels = models.map(m => updatedMap.has(m.id) ? { ...m, ...(updatedMap.get(m.id) as Model) } : m);
        setModels(mergedModels);
        const mergedFiltered = filteredModels.map(m => updatedMap.has(m.id) ? { ...m, ...(updatedMap.get(m.id) as Model) } : m);
        setFilteredModels(mergedFiltered);
        setSelectedModelIds([]);
        setIsSelectionMode(false);
        if (onCloseBulkEdit) onCloseBulkEdit();
    };

    const performDelete = async (modelIds: string[], includeFiles: boolean): Promise<boolean> => {
        try {
            const fileTypes = ['json'];
            if (includeFiles) {
                fileTypes.push('3mf');
                fileTypes.push('stl');
            }

            toast("Deleting model files...", {
                description: `Removing files for ${modelIds.length} models`
            });

            const deleteResponse = await fetch('/api/models/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    modelIds,
                    fileTypes: fileTypes
                })
            });

            if (!deleteResponse.ok) throw new Error('Failed to delete model files');

            const deleteResult = await deleteResponse.json();

            if (deleteResult.success) {
                const successfullyDeletedIds = modelIds.filter(modelId => {
                    const modelDeleted = deleteResult.deleted?.some((item: any) =>
                        item.modelId === modelId && fileTypes.includes(item.type)
                    );
                    return modelDeleted;
                });

                const updatedModels = models.filter(model => !successfullyDeletedIds.includes(model.id));
                setModels(updatedModels);

                const updatedFilteredModels = filteredModels.filter(model => !successfullyDeletedIds.includes(model.id));
                setFilteredModels(updatedFilteredModels);

                setSelectedModelIds([]);

                const successCount = successfullyDeletedIds.length;
                const errorCount = deleteResult.errors?.length || 0;

                if (successCount > 0) {
                    toast(`Deleted ${successCount} models`);
                }

                if (errorCount > 0) {
                    console.error('Deletion errors:', deleteResult.errors);
                    toast.error(`${errorCount} models could not be deleted`);
                }
                try {
                    await refreshModels();
                } catch (err) { console.error(err); }
                return true;
            } else {
                throw new Error(deleteResult.error || 'Unknown deletion error');
            }
        } catch (error) {
            console.error('Failed to delete models:', error);
            toast.error("Failed to delete models");
            return false;
        }
    };

    return {
        handleModelUpdate,
        handleBulkModelsUpdate,
        handleBulkSavedModels,
        performDelete
    };
}
