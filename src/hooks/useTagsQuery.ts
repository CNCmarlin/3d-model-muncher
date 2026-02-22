import { useQuery } from '@tanstack/react-query';

export interface Tag {
    id: number;
    name: string;
}

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

export function useTagsQuery(options: UseTagsQueryOptions = {}) {
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
