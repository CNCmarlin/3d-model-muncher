import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useModelsPaginated } from '@/hooks/queries/useModelsPaginated';
import { Collection } from '@/types/collection';
import { Model } from '@/types/model';
import { SortKey, sortCollections } from '@/utils/sortUtils';
import { ModelGrid } from '@/components/ModelGrid';

interface ModelsViewDBProps {
    collectionsForDisplay: Collection[];
    allCollections: Collection[];
    sortBy: SortKey;
    onModelClick: (model: Model) => void;
    onRefresh: () => void;
    isSelectionMode: boolean;
    selectedModelIds: string[];
    onModelSelection: (modelId: string, opts?: { shiftKey?: boolean; index?: number }) => void;
    onToggleSelectionMode: () => void;
    onSelectAll: () => void;
    onDeselectAll: () => void;
    onBulkEdit: () => void;
    onBulkDelete: () => void;
    // New props for server-side filtering
    currentFilters: Record<string, any>;
}

export function ModelsView_DB({
    collectionsForDisplay,
    allCollections,
    sortBy,
    onModelClick,
    onRefresh,
    isSelectionMode,
    selectedModelIds,
    onModelSelection,
    onToggleSelectionMode,
    onSelectAll,
    onDeselectAll,
    onBulkEdit,
    onBulkDelete,
    currentFilters
}: ModelsViewDBProps) {
    const [page, setPage] = useState(0);
    const [limit] = useState(50);

    // Use the new paginated hook
    const { data, isLoading, isError, refetch } = useModelsPaginated({
        page,
        limit,
        filters: currentFilters,
        // Map sort key to API sort params if needed
        // sortBy: sortBy 
    });

    const models = data?.data || [];
    const total = data?.pagination?.total || 0;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Loading models...</span>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-red-500">
                <p>Failed to load models.</p>
                <button
                    onClick={() => refetch()}
                    className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Pagination Controls (Basic) */}
            <div className="flex justify-between items-center px-4 py-2 border-b bg-muted/20">
                <span className="text-sm text-muted-foreground">
                    Showing {models.length} of {total} models
                </span>
                <div className="flex gap-2">
                    <button
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="px-3 py-1 text-sm border rounded disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <span className="px-2 py-1 text-sm">
                        Page {page + 1}
                    </span>
                    <button
                        onClick={() => setPage(p => p + 1)}
                        disabled={(page + 1) * limit >= total}
                        className="px-3 py-1 text-sm border rounded disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
            </div>

            <ModelGrid
                models={models}
                collections={sortCollections(collectionsForDisplay, sortBy)}
                allCollections={allCollections}
                sortBy={sortBy}
                onModelClick={onModelClick}
                onCollectionChanged={onRefresh}
                isSelectionMode={isSelectionMode}
                selectedModelIds={selectedModelIds}
                onModelSelection={onModelSelection}
                onToggleSelectionMode={onToggleSelectionMode}
                onSelectAll={onSelectAll}
                onDeselectAll={onDeselectAll}
                onBulkEdit={onBulkEdit}
                onBulkDelete={onBulkDelete}
            />
        </div>
    );
}
