import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { bulkEditModels } from '@/api/services/modelService';

export function useBulkEditModels() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ ids, updates }: { ids: string[]; updates: any }) => bulkEditModels(ids, updates),
        onSuccess: (data) => {
            toast.success(`Successfully updated ${data.updated} models`);
            queryClient.invalidateQueries({ queryKey: ['models'] });
        },
        onError: (err) => {
            toast.error(`Failed to bulk update models: ${err instanceof Error ? err.message : 'Unknown error'}`);
        },
    });
}
