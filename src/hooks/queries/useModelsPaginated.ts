import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useConfig } from '@/context/ConfigContext';
import type { Model } from '@/types/model';
import { adaptDbModelsToLegacy } from '@/utils/dbAdapter';

interface PaginatedResponse {
    data: Model[];
    pagination: {
        page: number;
        limit: number;
        total: number;
    };
}

export interface UseModelsPaginatedOptions {
    page?: number;
    limit?: number;
    search?: string;
    filters?: Record<string, any>;
    enabled?: boolean;
}

export function useModelsPaginated({
    page = 0,
    limit = 50,
    search = '',
    filters = {},
    enabled = true
}: UseModelsPaginatedOptions) {
    const { appConfig } = useConfig();
    const useDatabaseBackend = appConfig?.settings?.useDatabaseBackend ?? false;

    // Construct query parameters
    const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        paginated: 'true',
        ...(search && { search }),
        ...filters
    });

    return useQuery({
        queryKey: ['models', 'paginated', page, limit, search, filters],
        queryFn: async (): Promise<PaginatedResponse> => {
            const queryString = queryParams.toString();
            console.log(`[useModelsPaginated] Fetching: /api/models?${queryString}`);

            const response = await fetch(`/api/models?${queryString}`);
            if (!response.ok) {
                throw new Error('Failed to fetch paginated models');
            }

            const result = await response.json();
            console.log('[useModelsPaginated] Response:', result);

            // If using DB backend, we need to adapt the models
            // The DB returns { success: true, data: [...], pagination: {...} }
            if (useDatabaseBackend && result.success && Array.isArray(result.data)) {
                return {
                    data: adaptDbModelsToLegacy(result.data),
                    pagination: result.pagination
                };
            }

            // Fallback for legacy mode (which doesn't support server-side pagination efficiently yet)
            // But if the server was updated to support ?paginated=true in legacy mode, it would work.
            // For now, assume if we got here, we got the right shape.
            return {
                data: result.data || [],
                pagination: result.pagination || { page, limit, total: (result.data || []).length }
            };
        },
        enabled,
        placeholderData: keepPreviousData, // Keep previous page data while fetching next
        staleTime: 5 * 60 * 1000,
    });
}
