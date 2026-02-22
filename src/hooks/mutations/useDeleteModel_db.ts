import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { deleteModel } from '@/api/services/modelService_db';
import { Model } from '@/types/model';

export function useDeleteModel_db() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => deleteModel(id),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: ['models'] });
            const previousModels = queryClient.getQueryData<Model[]>(['models']);

            if (previousModels) {
                queryClient.setQueryData<Model[]>(['models'], (old) => {
                    if (!old) return [];
                    return old.filter((model) => model.id !== id);
                });
            }

            return { previousModels };
        },
        onError: (err, id, context) => {
            if (context?.previousModels) {
                queryClient.setQueryData<Model[]>(['models'], context.previousModels);
            }
            toast.error('Failed to delete model');
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['models'] });
        },
        onSuccess: () => {
            toast.success('Model deleted');
        }
    });
}
