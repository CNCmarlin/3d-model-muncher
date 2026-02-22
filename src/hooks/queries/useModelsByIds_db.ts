import { useQuery } from '@tanstack/react-query';
import { getModels } from '@/api/services/modelService_db';

interface UseModelsByIdsOptions {
    enabled?: boolean;
}

export function useModelsByIds_db(ids: string[], options: UseModelsByIdsOptions = {}) {
    return useQuery({
        queryKey: ['models', 'by-ids', ids.sort().join(',')],
        queryFn: async () => {
            if (ids.length === 0) return [];
            // Assuming getModels supports 'ids' param now via our backend update
            // We pass it as 'ids' which matches the schema update
            return getModels({ ids });
        },
        enabled: options.enabled !== false && ids.length > 0,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}
