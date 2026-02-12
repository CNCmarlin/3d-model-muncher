import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createCollection } from '../../api/services/collectionService';

export function useCreateCollection() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createCollection,
        onSuccess: (data) => {
            toast.success(`Collection "${data.name}" created`);
            queryClient.invalidateQueries({ queryKey: ['collections'] });
        },
        onError: (err) => {
            toast.error('Failed to create collection');
        },
    });
}
