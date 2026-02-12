import { useConfig } from '../context/ConfigContext';
import { useModelMutations_DB } from './useModelMutations_DB';
import { useModelMutations_Legacy } from './useModelMutations_Legacy';

/**
 * Facade Hook for Model Mutations
 * 
 * Automatically switches between DB implementation (PATCH /api/models/:id)
 * and Legacy implementation (POST /save-model) based on App Configuration.
 */
export function useModelMutations() {
    // 1. Get configuration
    const { appConfig } = useConfig();
    const useDatabaseBackend = appConfig?.settings?.useDatabaseBackend ?? false;

    // 2. Instantiate both hooks
    // Hooks must be called unconditionally in React.
    // They are lazy (only execute when .mutate() is called), so this is safe.
    const dbMutations = useModelMutations_DB();
    const legacyMutations = useModelMutations_Legacy();

    // 3. Return the correct implementation based on mode
    // We cast to 'any' here because the Model types differ slightly between DB and Legacy,
    // but the shape of the mutation result (Model) is compatible enough for consumers like useModelEdit.
    return useDatabaseBackend ? (dbMutations as any) : (legacyMutations as any);
}
