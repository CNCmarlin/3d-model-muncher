import { useQuery } from '@tanstack/react-query';
import { getTags } from '../../api/services/tagService';

export function useTags(options: { enabled?: boolean } = {}) {
    return useQuery({
        queryKey: ['tags'],
        queryFn: getTags,
        enabled: options.enabled,
    });
}
