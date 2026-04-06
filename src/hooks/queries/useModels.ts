import { getModels } from '@/api/services/modelService';
import { useQuery } from '@tanstack/react-query';

export function useModels(filters: Record<string, any> = {}, options: { enabled?: boolean } = {}) {
    return useQuery({
        queryKey: ['models', filters],
        queryFn: async () => {
            const data = await getModels(filters);
            // DB mode: return raw DB-shaped models directly — no adapter.
            // useFilteredModels_db and filterUtils_db expect the native DB shape (files[], tags[], etc.)
            // Legacy mode: data is already in legacy Model shape from the legacy endpoint.
            return data;
        },
        enabled: options.enabled,
    });
}

export function useModel(id: string) {
    // TODO: Implement single model fetch
}
