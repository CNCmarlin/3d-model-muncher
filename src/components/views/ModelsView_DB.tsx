import { ModelGrid_DB } from '@/components/models/ModelGrid_DB';
import { Collection } from '@/types/collection_db';
import { Model } from '@/types/model_db';
import { SortKey, sortCollections } from '@/utils/sortUtils';

interface ModelsViewProps {
    filteredModels: Model[];
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
}

export function ModelsView_DB({
    filteredModels,
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
}: ModelsViewProps) {

    return (
        <ModelGrid_DB
            models={filteredModels}
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
    );
}
