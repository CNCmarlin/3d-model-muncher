import { useQuery } from '@tanstack/react-query';
import { getFiles } from '@/api/services/fileService_db';

export function useFiles_db(modelId: string, options: { enabled?: boolean } = {}) {
    return useQuery({
        queryKey: ['files', modelId],
        queryFn: () => getFiles(modelId),
        enabled: !!modelId && options.enabled,
    });
}
