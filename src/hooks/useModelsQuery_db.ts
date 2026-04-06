import type { Model } from '@/types/model_db';
import { useQuery } from '@tanstack/react-query';

/**
 * DATABASE-FIRST Models Query Hook
 *
 * Returns Model_db[] directly from the database API.
 * No legacy adapter — this hook is DB-mode only.
 */

export interface UseModelsQueryOptions {
    /** Enable the query (default: true) */
    enabled?: boolean;
    /** Custom refetch interval */
    refetchInterval?: number;
}

export function useModelsQuery_db(options: UseModelsQueryOptions = {}) {
    const { enabled = true, refetchInterval } = options;

    return useQuery({
        queryKey: ['models'],
        queryFn: async (): Promise<Model[]> => {
            const response = await fetch('/api/models');
            if (!response.ok) {
                throw new Error('Failed to fetch models');
            }
            return response.json() as Promise<Model[]>;
        },
        enabled,
        refetchInterval,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}
