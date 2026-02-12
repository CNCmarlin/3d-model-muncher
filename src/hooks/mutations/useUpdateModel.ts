import { useModelMutations } from '../useModelMutations';

/**
 * DEPRECATED HOOK
 * 
 * useUpdateModel is now a wrapper around the Facade hook `useModelMutations`.
 * This ensures that legacy vs database logic is handled correctly.
 * 
 * Please use `useModelMutations` directly in new code.
 */
export function useUpdateModel() {
    const { updateModel } = useModelMutations();
    // The Facade's updateModel already includes Toast notifications and Optimistic Updates.
    return updateModel;
}
