import { getCollections } from '@/api/services/collectionService_db';
import { Collection } from '@/types/collection_db';
import { useQuery } from '@tanstack/react-query';

export function useCollections_db(options: { enabled?: boolean } = {}) {
    return useQuery({
        queryKey: ['collections'],
        queryFn: async (): Promise<Collection[]> => {
            const data = await getCollections();
            // Handle API wrapper { collections: [...] } or bare array
            if (data && typeof data === 'object' && 'collections' in data) {
                return (data as any).collections as Collection[];
            }
            return data as Collection[];
        },
        enabled: options.enabled,
    });
}
