import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Model } from '@/types/model';

/**
 * LEGACY Model Mutations Hook
 * 
 * Provides mutations for:
 * - Updating model metadata (using POST /api/save-model)
 * - Deleting models (using DELETE /api/models/delete)
 * - Bulk editing multiple models
 */

interface UpdateModelInput {
    id: string;
    data: Partial<Model>; // Simplify to Partial<Model> for Legacy
}

interface BulkUpdateInput {
    modelIds: string[];
    data: Partial<Model>;
}

export function useModelMutations_Legacy() {
    const queryClient = useQueryClient();

    // Update single model (Legacy)
    const updateModel = useMutation({
        mutationFn: async ({ id, data }: UpdateModelInput): Promise<Model> => {
            // Using Legacy Endpoint (POST /save-model)
            const response = await fetch(`/api/save-model`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, changes: data }),
            });

            if (!response.ok) {
                let errorMessage = 'Failed to update model';
                try {
                    const error = await response.json();
                    errorMessage = error.error || error.message || errorMessage;
                } catch (e) {
                    errorMessage += ` (Status ${response.status}: ${response.statusText})`;
                }
                console.error('[Legacy Mutation] Error:', errorMessage);
                throw new Error(errorMessage);
            }

            const resJson = await response.json();
            return resJson.refreshedModel || resJson;
        },
        onMutate: async ({ id, data }) => {
            await queryClient.cancelQueries({ queryKey: ['models'] });
            const previousModels = queryClient.getQueryData<Model[]>(['models']);
            queryClient.setQueryData<Model[]>(['models'], (old) => {
                if (!old) return old;
                return old.map(model =>
                    model.id === id ? { ...model, ...data } : model
                );
            });
            return { previousModels };
        },
        onError: (err, variables, context) => {
            if (context?.previousModels) {
                queryClient.setQueryData(['models'], context.previousModels);
            }
            console.error('Failed to update model (Legacy):', err);
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['models'] });
            queryClient.invalidateQueries({ queryKey: ['model', variables.id] });
            queryClient.invalidateQueries({ queryKey: ['collections'] });
            if (!data) toast.success('Model updated successfully');
        },
    });

    // Delete model
    const deleteModel = useMutation({
        mutationFn: async (id: string): Promise<void> => {
            // Use legacy complex delete which supports IDs
            const response = await fetch('/api/models/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelIds: [id] })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to delete model');
            }
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: ['models'] });
            const previousModels = queryClient.getQueryData<Model[]>(['models']);
            queryClient.setQueryData<Model[]>(['models'], (old) => {
                if (!old) return old;
                return old.filter(model => model.id !== id);
            });
            return { previousModels };
        },
        onError: (err, variables, context) => {
            if (context?.previousModels) {
                queryClient.setQueryData(['models'], context.previousModels);
            }
            console.error('Failed to delete model:', err);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['models'] });
        },
    });

    // Bulk update not fully supported in legacy or uses different mechanism?
    // For now, we mock it or throw to prevent usage?
    // Or try to use the DB one and hope it works (it relies on models.js having the route).
    // models.js does NOT seem to have /api/models/bulk-update.
    // So we throw.
    const bulkUpdateModels = useMutation({
        mutationFn: async (): Promise<{ updated: number }> => {
            throw new Error('Bulk update is not supported in Legacy Mode');
        }
    });

    return {
        updateModel,
        deleteModel,
        bulkUpdateModels,
    };
}
