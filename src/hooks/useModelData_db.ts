import { Model } from '@/types/model_db';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

export function useModelData_db() {
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
            const data: Model[] = await response.json();
            setModels(data);
            if (!isInitial) toast("Models reloaded successfully");
            return data;
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
        setIsModelsLoading,
        isRefreshing,
        refreshModels: fetchModels
    };
}
