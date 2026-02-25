import type { Model } from '@/types/model_db';
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

export function useModelsPaginated_db({
    page = 0,
    limit = 50,
    search = '',
    filters = {},
    enabled = true
}: UseModelsPaginatedOptions) {
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
                queryParams.append(key, value.join(','));
            }
        } else if (value !== 'all') {
            queryParams.append(key, String(value));
        }
    });

    return useQuery({
        queryKey: ['models', 'paginated', page, limit, search, filters],
        queryFn: async (): Promise<PaginatedResponse> => {
            const queryString = queryParams.toString();
            const response = await fetch(`/api/models?${queryString}`);
            if (!response.ok) {
                throw new Error('Failed to fetch paginated models');
            }

            const result = await response.json();

            // DB backend returns { success: true, data: [...], pagination: {...} }
            if (result.success && Array.isArray(result.data)) {
                return {
                    data: result.data as Model[],
                    pagination: result.pagination
                };
            }

            return {
                data: result.data || [],
                pagination: result.pagination || { page, limit, total: (result.data || []).length }
            };
        },
        enabled,
        placeholderData: keepPreviousData,
        staleTime: 5 * 60 * 1000,
    });
}
