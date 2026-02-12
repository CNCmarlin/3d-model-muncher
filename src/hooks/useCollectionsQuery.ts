import { useQuery } from '@tanstack/react-query';
import type { Collection } from '../types/collection';

/**
 * DATABASE-FIRST Collections Query Hook
 * 
 * Philosophy:
 * - Returns database types (Collection with parentId, not modelIds array)
 * - Both legacy and database backends return the same Collection structure
 * - Tree structure built from parentId relationships
 */

export interface UseCollectionsQueryOptions {
    /** Enable the query (default: true) */
    enabled?: boolean;
}

export function useCollectionsQuery(options: UseCollectionsQueryOptions = {}) {
    const { enabled = true } = options;

    return useQuery({
        queryKey: ['collections'],
        queryFn: async (): Promise<Collection[]> => {
            const response = await fetch('/api/collections');
            if (!response.ok) {
                throw new Error('Failed to fetch collections');
            }
            const data = await response.json();

            // Handle legacy API format: {success: true, collections: [...]}
            // Database API returns array directly
            if (data && typeof data === 'object' && 'collections' in data) {
                return data.collections; // Legacy format
            }

            return data; // Database format (array)
        },
        enabled,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}
