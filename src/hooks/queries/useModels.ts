import { useQuery } from '@tanstack/react-query';
import { getModels } from '@/api/services/modelService';
import { useConfig } from '@/context/ConfigContext';
import { adaptDbModelsToLegacy } from '@/utils/dbAdapter';

export function useModels(filters: Record<string, any> = {}, options: { enabled?: boolean } = {}) {
    const { appConfig } = useConfig();
    const useDatabaseBackend = appConfig?.settings?.useDatabaseBackend ?? false;

    return useQuery({
        queryKey: ['models', filters],
        queryFn: async () => {
            const data = await getModels(filters);

            // If using database backend, we might receive DB-format models
            // We need to adapt them to the frontend Model type if they aren't already compatible
            // For now, we reuse the adapter logic from the previous hook to be safe
            if (useDatabaseBackend && data.length > 0 && 'collectionId' in data[0]) {
                return adaptDbModelsToLegacy(data as any);
            }

            return data;
        },
        enabled: options.enabled,
    });
}

export function useModel(id: string) {
    // TODO: Implement single model fetch
}
