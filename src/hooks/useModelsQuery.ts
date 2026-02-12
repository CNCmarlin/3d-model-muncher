import { useQuery } from '@tanstack/react-query';
import { useConfig } from '../context/ConfigContext';
import type { Model as LegacyModel } from '../types/model';
import type { Model as DbModel } from '../types/model_db';
import { adaptDbModelsToLegacy } from '../utils/dbAdapter';

/**
 * DATABASE-FIRST Models Query Hook
 * 
 * Philosophy:
 * - Returns database types (Model from model_db.ts) by default
 * - Adapter is applied INTERNALLY in legacy mode only
 * - Components always consume database-typed data
 * 
 * Migration Path:
 * - Phase 1: Replace useModelData with this hook
 * - Phase 2: Components updated to use database types
 * - Phase 3: Remove adapter when legacy mode deprecated
 */

export interface UseModelsQueryOptions {
    /** Enable the query (default: true) */
    enabled?: boolean;
    /** Custom refetch interval */
    refetchInterval?: number;
}

export function useModelsQuery(options: UseModelsQueryOptions = {}) {
    const { appConfig } = useConfig();
    const { enabled = true, refetchInterval } = options;

    return useQuery({
        queryKey: ['models'],
        queryFn: async (): Promise<LegacyModel[]> => {
            const response = await fetch('/api/models');
            if (!response.ok) {
                throw new Error('Failed to fetch models');
            }

            const data: DbModel[] | LegacyModel[] = await response.json();

            // Detect if we got database models or legacy models
            const isDatabase = data.length > 0 && 'collectionId' in data[0];
            const useDatabaseBackend = appConfig?.useDatabaseBackend ?? false;

            // CRITICAL: Apply adapter ONLY in legacy mode
            // Database mode returns database types directly
            if (!isDatabase && useDatabaseBackend) {
                // Database backend but got legacy format - shouldn't happen
                console.warn('[useModelsQuery] Database mode but received legacy format');
                return data as LegacyModel[];
            }

            if (isDatabase && !useDatabaseBackend) {
                // Legacy mode but got database format - apply adapter
                return adaptDbModelsToLegacy(data as DbModel[]);
            }

            // Types match mode - return as-is
            return data as LegacyModel[];
        },
        enabled,
        refetchInterval,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}
