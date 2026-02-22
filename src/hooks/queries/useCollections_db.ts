import { useQuery } from '@tanstack/react-query';
import { getCollections } from '@/api/services/collectionService_db';
import { useConfig } from '@/context/ConfigContext';
import { Collection } from '@/types/collection';
import { adaptDbCollectionsToLegacy } from '@/utils/dbAdapter';

export function useCollections_db(options: { enabled?: boolean } = {}) {
    const { appConfig } = useConfig();
    const useDatabaseBackend = appConfig?.settings?.useDatabaseBackend ?? false;

    return useQuery({
        queryKey: ['collections'],
        queryFn: async () => {
            const data = await getCollections();

            // Adapt database collections to legacy format if using DB backend
            if (useDatabaseBackend && Array.isArray(data)) {
                return adaptDbCollectionsToLegacy(data as any);
            }

            // Handle legacy wrapper if present
            if (data && typeof data === 'object' && 'collections' in data) {
                return (data as any).collections as Collection[];
            }
            return data as Collection[];
        },
        enabled: options.enabled,
    });
}
