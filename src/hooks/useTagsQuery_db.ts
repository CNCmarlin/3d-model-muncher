import type { Tag_db as Tag } from '@/types/model_db';
import { useQuery } from '@tanstack/react-query';

/**
 * DATABASE-FIRST Tags Query Hook
 * 
 * Philosophy:
 * - Returns database types (Tag[])
 * - Replaces TagsContext for data fetching (context can stay for global state)
 */

export interface UseTagsQueryOptions {
    /** Enable the query (default: true) */
    enabled?: boolean;
}

export function useTagsQuery_db(options: UseTagsQueryOptions = {}) {
    const { enabled = true } = options;

    return useQuery({
        queryKey: ['tags'],
        queryFn: async (): Promise<Tag[]> => {
            const response = await fetch('/api/tags');
            if (!response.ok) {
                throw new Error('Failed to fetch tags');
            }
            const data = await response.json();
            // Both backends return Tag[]
            return data;
        },
        enabled,
        staleTime: 10 * 60 * 1000, // 10 minutes (tags change less frequently)
    });
}
