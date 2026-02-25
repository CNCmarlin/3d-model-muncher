import { getModels } from '@/api/services/modelService_db';
import type { Model } from '@/types/model_db';
import { useQuery } from '@tanstack/react-query';

export function useModels_db(filters: Record<string, any> = {}, options: { enabled?: boolean } = {}) {
    return useQuery({
        queryKey: ['models', filters],
        queryFn: async (): Promise<Model[]> => {
            return getModels(filters) as Promise<Model[]>;
        },
        enabled: options.enabled,
    });
}

export function useModel(_id: string) {
    // TODO: Implement single model fetch
}
