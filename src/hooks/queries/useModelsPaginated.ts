import { useConfig } from '@/context/ConfigContext';
import type { Model } from '@/types/model';
import { adaptDbModelsToLegacy } from '@/utils/dbAdapter';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

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

    // Construct query parameters manually to handle arrays correctly
    const queryParams = new URLSearchParams();
    queryParams.append('page', page.toString());
    queryParams.append('limit', limit.toString());
    queryParams.append('paginated', 'true');
    if (search) queryParams.append('search', search);

    Object.entries(filters).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        if (Array.isArray(value)) {
            if (value.length > 0) {
                // For arrays, append each value (e.g. tags=a&tags=b) 
                // OR join with comma if backend expects comma-separated (e.g. tags=a,b)
                // ModelQuerySchema transform splits by comma, so let's use comma.
                queryParams.append(key, value.join(','));
            }
        } else if (value !== 'all') { // Skip 'all' values as they mean "no filter"
            queryParams.append(key, String(value));
        }
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
