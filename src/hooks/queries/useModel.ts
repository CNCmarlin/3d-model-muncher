import { useQuery } from '@tanstack/react-query';
import { getModel } from '@/api/services/modelService';
import { useConfig } from '@/context/ConfigContext';
import { Model } from '@/types/model';
import { adaptDbModelToLegacy } from '@/utils/dbAdapter';

interface UseModelOptions {
    enabled?: boolean;
    initialData?: Model;
}

export function useModel(id: string, options: UseModelOptions = {}) {
    const { appConfig } = useConfig();
    const useDatabaseBackend = appConfig?.settings?.useDatabaseBackend ?? false;

    return useQuery({
        queryKey: ['model', id],
        queryFn: async () => {
            const data = await getModel(id);

            // Adapt if needed
            if (useDatabaseBackend && 'collectionId' in data) {
                return adaptDbModelToLegacy(data as any);
            }
            return data;
        },
        enabled: !!id && (options.enabled !== false), // Default to true unless explicitly disabled
        initialData: options.initialData,
        staleTime: 0, // Always refetch on navigation to ensure fresh data
    });
}
