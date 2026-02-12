import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { updateCollection } from '../../api/services/collectionService';
import { Collection } from '../../types/collection';

export function useUpdateCollection() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<Collection> }) => updateCollection(id, data),
        onMutate: async ({ id, data }) => {
            await queryClient.cancelQueries({ queryKey: ['collections'] });
            const previousCollections = queryClient.getQueryData<Collection[]>(['collections']);

            // Optimistic Update
            if (previousCollections) {
                queryClient.setQueryData<Collection[]>(['collections'], (old) => {
                    return old?.map(c => c.id === id ? { ...c, ...data } : c) || [];
                });
            }

            return { previousCollections };
        },
        onSuccess: (updatedCollection) => {
            toast.success(`Collection attributes updated`);
            queryClient.invalidateQueries({ queryKey: ['collections'] });
            queryClient.invalidateQueries({ queryKey: ['model', updatedCollection.id] }); // If collection has model details? No, models have collection.
        },
        onError: (_err, _variables, context) => {
            if (context?.previousCollections) {
                queryClient.setQueryData(['collections'], context.previousCollections);
            }
            toast.error('Failed to update collection');
        },
    });
}
