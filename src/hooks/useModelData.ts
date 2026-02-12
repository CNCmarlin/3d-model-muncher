import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Model } from '../types/model';
import { adaptDbModelsToLegacy } from '../utils/dbAdapter';

export function useModelData() {
    const [models, setModels] = useState<Model[]>([]);
    const [isModelsLoading, setIsModelsLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchModels = useCallback(async (isInitial = false) => {
        if (isInitial) {
            setIsModelsLoading(true);
            toast("Loading model metadata...", {
                description: "Models are being loaded. This may take a minute for large libraries. Please wait."
            });
        } else {
            setIsRefreshing(true);
            toast("Reloading model metadata...", { description: "Refreshing from existing JSON files" });
        }

        try {
            const response = await fetch('/api/models');
            if (!response.ok) throw new Error('Failed to fetch models');
            const data = await response.json();

            // Only apply adapter if database mode (models have `collectionId` instead of `collections`)
            const needsAdapter = data.length > 0 && 'collectionId' in data[0] && !('collections' in data[0]);
            const adaptedData = needsAdapter ? adaptDbModelsToLegacy(data) : data;

            setModels(adaptedData);

            if (!isInitial) toast("Models reloaded successfully");
            return adaptedData as Model[];
        } catch (error) {
            console.error('Failed to load models:', error);
            toast("Failed to load models");
            return null;
        } finally {
            if (isInitial) setIsModelsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    return {
        models,
        setModels,
        isModelsLoading,
        setIsModelsLoading, // Exported so App can set it if needed during init
        isRefreshing,
        refreshModels: fetchModels
    };
}
