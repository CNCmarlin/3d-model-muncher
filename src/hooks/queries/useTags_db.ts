import { useQuery } from '@tanstack/react-query';
import { getTags } from '@/api/services/tagService_db';

export function useTags_db(options: { enabled?: boolean } = {}) {
    return useQuery({
        queryKey: ['tags'],
        queryFn: getTags,
        enabled: options.enabled,
    });
}
