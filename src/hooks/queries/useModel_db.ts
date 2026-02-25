import { getModel } from '@/api/services/modelService_db';
import { Model } from '@/types/model_db';
import { useQuery } from '@tanstack/react-query';

interface UseModelOptions {
    enabled?: boolean;
    initialData?: Model;
}

export function useModel_db(id: string, options: UseModelOptions = {}) {
    return useQuery({
        queryKey: ['model', id],
        queryFn: async (): Promise<Model> => {
            return getModel(id);
        },
        enabled: !!id && (options.enabled !== false),
        initialData: options.initialData,
        staleTime: 0, // Always refetch on navigation to ensure fresh data
    });
}
