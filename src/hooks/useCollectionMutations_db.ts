import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Collection } from '@/types/collection';

/**
 * DATABASE-FIRST Collection Mutations Hook
 * 
 * Provides mutations for:
 * - Creating collections
 * - Updating collection metadata
 * - Deleting collections
 * - Reordering collections (via parentId)
 * 
 * All mutations use optimistic updates
 */

interface CreateCollectionInput {
    name: string;
    parentId?: string | null;
    description?: string;
}

interface UpdateCollectionInput {
    id: string;
    data: Partial<Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>>;
}

export function useCollectionMutations_db() {
    const queryClient = useQueryClient();

    // Create new collection
    const createCollection = useMutation({
        mutationFn: async (input: CreateCollectionInput): Promise<Collection> => {
            const response = await fetch('/api/collections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to create collection');
            }

            return response.json();
        },
        onSuccess: (newCollection) => {
            // Optimistically add to cache
            queryClient.setQueryData<Collection[]>(['collections'], (old) => {
                if (!old) return [newCollection];
                return [...old, newCollection];
            });

            // Refetch to ensure sync
            queryClient.invalidateQueries({ queryKey: ['collections'] });
        },
        onError: (err) => {
            console.error('Failed to create collection:', err);
        },
    });

    // Update collection
    const updateCollection = useMutation({
        mutationFn: async ({ id, data }: UpdateCollectionInput): Promise<Collection> => {
            const response = await fetch(`/api/collections/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to update collection');
            }

            return response.json();
        },
        onMutate: async ({ id, data }) => {
            await queryClient.cancelQueries({ queryKey: ['collections'] });

            const previousCollections = queryClient.getQueryData<Collection[]>(['collections']);

            // Optimistically update
            queryClient.setQueryData<Collection[]>(['collections'], (old) => {
                if (!old) return old;
                return old.map(col =>
                    col.id === id ? { ...col, ...data } : col
                );
            });

            return { previousCollections };
        },
        onError: (err, variables, context) => {
            if (context?.previousCollections) {
                queryClient.setQueryData(['collections'], context.previousCollections);
            }
            console.error('Failed to update collection:', err);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['collections'] });
        },
    });

    // Delete collection
    const deleteCollection = useMutation({
        mutationFn: async (id: string): Promise<void> => {
            const response = await fetch(`/api/collections/${id}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to delete collection');
            }
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: ['collections'] });

            const previousCollections = queryClient.getQueryData<Collection[]>(['collections']);

            // Optimistically remove
            queryClient.setQueryData<Collection[]>(['collections'], (old) => {
                if (!old) return old;
                return old.filter(col => col.id !== id);
            });

            return { previousCollections };
        },
        onError: (err, variables, context) => {
            if (context?.previousCollections) {
                queryClient.setQueryData(['collections'], context.previousCollections);
            }
            console.error('Failed to delete collection:', err);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['collections'] });
        },
    });

    return {
        createCollection,
        updateCollection,
        deleteCollection,
    };
}
