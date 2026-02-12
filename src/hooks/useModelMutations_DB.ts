import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Model } from '../types/model_db';

/**
 * DATABASE-FIRST Model Mutations Hook
 * 
 * Provides mutations for:
 * - Updating model metadata
 * - Deleting models (soft delete)
 * - Bulk editing multiple models
 * 
 * All mutations use optimistic updates for instant UI feedback
 */

interface UpdateModelInput {
    id: string;
    data: Partial<Omit<Model, 'id' | 'createdAt' | 'updatedAt'>>;
}

interface BulkUpdateInput {
    modelIds: string[];
    data: Partial<Omit<Model, 'id' | 'createdAt' | 'updatedAt'>>;
}

export function useModelMutations_DB() {
    const queryClient = useQueryClient();

    // Update single model
    const updateModel = useMutation({
        mutationFn: async ({ id, data }: UpdateModelInput): Promise<Model> => {
            const response = await fetch(`/api/models/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to update model');
            }

            return response.json();
        },
        onMutate: async ({ id, data }) => {
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: ['models'] });

            // Snapshot previous value
            const previousModels = queryClient.getQueryData<Model[]>(['models']);

            // Optimistically update
            queryClient.setQueryData<Model[]>(['models'], (old) => {
                if (!old) return old;
                return old.map(model =>
                    model.id === id ? { ...model, ...data } : model
                );
            });

            return { previousModels };
        },
        onError: (err, variables, context) => {
            // Rollback on error
            if (context?.previousModels) {
                queryClient.setQueryData(['models'], context.previousModels);
            }
            console.error('Failed to update model:', err);
        },
        onSuccess: () => {
            // Refetch to ensure sync with server
            queryClient.invalidateQueries({ queryKey: ['models'] });
            // Assuming toast is imported or globally available
            // toast.success('Model updated successfully'); 
        },
    });

    // Delete model (soft delete)
    const deleteModel = useMutation({
        mutationFn: async (id: string): Promise<void> => {
            const response = await fetch(`/api/models/${id}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to delete model');
            }
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: ['models'] });

            const previousModels = queryClient.getQueryData<Model[]>(['models']);

            // Optimistically remove from list
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

    // Bulk update multiple models
    const bulkUpdateModels = useMutation({
        mutationFn: async ({ modelIds, data }: BulkUpdateInput): Promise<{ updated: number }> => {
            const response = await fetch('/api/models/bulk-update', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelIds, data }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to bulk update models');
            }

            return response.json();
        },
        onMutate: async ({ modelIds, data }) => {
            await queryClient.cancelQueries({ queryKey: ['models'] });

            const previousModels = queryClient.getQueryData<Model[]>(['models']);

            // Optimistically update all selected models
            queryClient.setQueryData<Model[]>(['models'], (old) => {
                if (!old) return old;
                return old.map(model =>
                    modelIds.includes(model.id) ? { ...model, ...data } : model
                );
            });

            return { previousModels };
        },
        onError: (err, variables, context) => {
            if (context?.previousModels) {
                queryClient.setQueryData(['models'], context.previousModels);
            }
            console.error('Failed to bulk update models:', err);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['models'] });
        },
    });

    return {
        updateModel,
        deleteModel,
        bulkUpdateModels,
    };
}
