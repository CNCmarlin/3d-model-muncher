import { ArrowLeft, FolderInput, Loader2, Upload } from 'lucide-react';
import { useState } from 'react';
import { useConfig } from '@/context/ConfigContext';
import { useModelsPaginated } from '@/hooks/queries/useModelsPaginated';
import { Collection } from '@/types/collection';
import { Model } from '@/types/model';
import { SortKey, sortCollections } from '@/utils/sortUtils';
import { ModelGrid } from '@/components/ModelGrid';
import { Button } from '@/components/ui/button';

interface CollectionViewDBProps {
    activeCollection: Collection;
    collections: Collection[]; // All collections, for finding children
    onOpenCollection: (c: Collection) => void;
    onImportClick: (id?: string) => void;
    onUploadClick: (c?: Collection) => void;
    onBack: () => void;
    onModelClick: (m: Model) => void;
    isFiltering: boolean;
    isSelectionMode: boolean;
    selectedModelIds: string[];
    onModelSelection: (modelId: string, opts?: { shiftKey?: boolean; index?: number }) => void;
    onToggleSelectionMode: () => void;
    onSelectAll: () => void;
    onDeselectAll: () => void;
    onBulkEdit: () => void;
    onBulkDelete: () => void;
    onRefresh: () => void;
    currentSortBy: SortKey;
}

export function CollectionView_DB({
    activeCollection,
    collections,
    onOpenCollection,
    onImportClick,
    onUploadClick,
    onBack,
    onModelClick,
    isFiltering,
    isSelectionMode,
    selectedModelIds,
    onModelSelection,
    onToggleSelectionMode,
    onSelectAll,
    onDeselectAll,
    onBulkEdit,
    onBulkDelete,
    onRefresh,
    currentSortBy
}: CollectionViewDBProps) {
    const [page, setPage] = useState(0);
    const [limit] = useState(50);
    const { appConfig } = useConfig();

    // 1. Fetch Models for this Collection (Server-Side)
    const { data, isLoading, isError, refetch } = useModelsPaginated({
        page,
        limit,
        filters: {
            collectionId: activeCollection.id, // Server-side filter
            sortBy: currentSortBy
        },
        enabled: !isFiltering // If global filtering is active, we let the sidebar drive the global search? 
        // Actually, ModelsView_DB handles global search. 
        // CollectionView usually shows *just* this collection.
        // If user types in sidebar search while in collection view, 
        // App.tsx logic usually handles filtering.
        // But here we want the server to do it.
    });

    // 2. Derive Children Collections
    // In DB mode, 'collections' might be a flat list of ALL collections or just root?
    // If it's all, we can filter.
    const childCollections = collections.filter(c => c.parentId === activeCollection.id);
    const sortedChildren = sortCollections(childCollections, currentSortBy);

    const models = data?.data || [];
    const total = data?.pagination?.total || 0;

    console.log('[CollectionView_DB] Rendering:', {
        collectionName: activeCollection.name,
        collectionId: activeCollection.id,
        allCollectionsCount: collections.length,
        childCollectionsFound: childCollections.length,
        modelsFound: models.length,
        totalModels: total,
        isLoading,
        isError
    });

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-4 p-4 border-b bg-card">
                <Button variant="ghost" size="sm" onClick={onBack}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                </Button>
                <div>
                    <h2 className="text-xl font-bold">{activeCollection.name}</h2>
                    <p className="text-sm text-muted-foreground">
                        {total} models • {childCollections.length} sub-collections
                    </p>
                </div>
                <div className="ml-auto flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => onImportClick(activeCollection.id)}>
                        <FolderInput className="w-4 h-4 mr-2" />
                        Import
                    </Button>
                    <Button variant="default" size="sm" onClick={() => onUploadClick(activeCollection)}>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload
                    </Button>
                </div>
            </div>

            {/* Pagination Controls */}
            <div className="flex justify-between items-center px-4 py-2 border-b bg-muted/20">
                <span className="text-sm text-muted-foreground">
                    Page {page + 1} ({models.length} shown)
                </span>
                <div className="flex gap-2">
                    <button
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="px-3 py-1 text-sm border rounded disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <button
                        onClick={() => setPage(p => p + 1)}
                        disabled={(page + 1) * limit >= total}
                        className="px-3 py-1 text-sm border rounded disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : (
                <ModelGrid
                    models={models}
                    collections={sortedChildren} // Sub-collections
                    allCollections={collections}
                    sortBy={currentSortBy}
                    onModelClick={onModelClick}
                    onCollectionChanged={onRefresh}
                    onOpenCollection={onOpenCollection} // Critical for navigating down
                    isSelectionMode={isSelectionMode}
                    selectedModelIds={selectedModelIds}
                    onModelSelection={onModelSelection}
                    onToggleSelectionMode={onToggleSelectionMode}
                    onSelectAll={onSelectAll}
                    onDeselectAll={onDeselectAll}
                    onBulkEdit={onBulkEdit}
                    onBulkDelete={onBulkDelete}
                />
            )}
        </div>
    );
}
