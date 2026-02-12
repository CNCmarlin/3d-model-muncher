import { toast } from "sonner";
import { Model } from "../types/model";

interface UseModelActionsProps {
    models: Model[];
    setModels: (models: Model[]) => void;
    filteredModels: Model[];
    setFilteredModels: (models: Model[]) => void;
    selectedModelIds: string[];
    setSelectedModelIds: (ids: string[]) => void;
    setIsSelectionMode: (isSelectionMode: boolean) => void;
    setIsBulkEditOpen: (isOpen: boolean) => void;
    refreshModels: () => Promise<void>; // This should be handleRefreshModels from useFilteredModels
    setSelectedModel: (model: Model | null) => void;
}

export function useModelActions({
    models,
    setModels,
    filteredModels,
    setFilteredModels,
    selectedModelIds,
    setSelectedModelIds,
    setIsSelectionMode,
    setIsBulkEditOpen,
    refreshModels,
    setSelectedModel
}: UseModelActionsProps) {

    const handleModelUpdate = async (updatedModel: Model) => {
        const updatedModels = models.map(model =>
            model.id === updatedModel.id ? updatedModel : model
        );
        setModels(updatedModels);
        setSelectedModel(updatedModel);

        const updatedFilteredModels = filteredModels.map(model =>
            model.id === updatedModel.id ? updatedModel : model
        );
        setFilteredModels(updatedFilteredModels);
        try {
            const response = await fetch('/api/save-model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...updatedModel
                }),
            });

            if (!response.ok) throw new Error('Failed to save to server');

            console.log("Model saved successfully!");
        } catch (error) {
            console.error('Failed to persist model change:', error);
            toast.error("Failed to save changes");
        }
    };

    const handleBulkModelsUpdate = (updatedModelsData: Partial<Model> & { bulkTagChanges?: { add: string[]; remove: string[] } }) => {
        const updatedModels = models.map(model => {
            if (selectedModelIds.includes(model.id)) {
                let updatedModel = { ...model };
                Object.keys(updatedModelsData).forEach(key => {
                    if (key !== 'bulkTagChanges' && updatedModelsData[key as keyof Model] !== undefined) {
                        (updatedModel as any)[key] = updatedModelsData[key as keyof Model];
                    }
                });

                if (updatedModelsData.bulkTagChanges) {
                    const { add, remove } = updatedModelsData.bulkTagChanges;
                    let newTags = [...(updatedModel.tags || [])];
                    if (remove && remove.length > 0) {
                        newTags = newTags.filter(tag => !remove.includes(tag));
                    }
                    if (add && add.length > 0) {
                        add.forEach(tag => {
                            if (!newTags.includes(tag)) newTags.push(tag);
                        });
                    }
                    updatedModel.tags = newTags;
                }
                return updatedModel;
            }
            return model;
        });

        setModels(updatedModels);

        const updatedFilteredModels = filteredModels.map(model => {
            if (selectedModelIds.includes(model.id)) {
                const updatedModel = updatedModels.find(m => m.id === model.id);
                return updatedModel || model;
            }
            return model;
        });
        setFilteredModels(updatedFilteredModels);

        setSelectedModelIds([]);
        setIsSelectionMode(false);
        setIsBulkEditOpen(false);

        toast(`Updated ${selectedModelIds.length} models`);
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
        setIsBulkEditOpen(false);
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
