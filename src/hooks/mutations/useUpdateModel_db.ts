import { useModelMutations_DB } from '@/hooks/useModelMutations_DB';

/**
 * DEPRECATED HOOK
 * 
 * useUpdateModel is now a wrapper around the Facade hook `useModelMutations`.
 * This ensures that legacy vs database logic is handled correctly.
 * 
 * Please use `useModelMutations` directly in new code.
 */
export function useUpdateModel_db() {
    const { updateModel } = useModelMutations_DB();
    // The Facade's updateModel already includes Toast notifications and Optimistic Updates.
    return updateModel;
}
