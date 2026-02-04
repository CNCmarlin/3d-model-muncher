import { Collection } from '../../types/collection';
import { AppConfig } from '../../types/config';
import { Model } from '../../types/model';
import { SortKey, sortCollections } from '../../utils/sortUtils';
import { ModelGrid } from '../ModelGrid';

interface ModelsViewProps {
    filteredModels: Model[];
    collectionsForDisplay: Collection[];
    allCollections: Collection[];
    sortBy: SortKey;
    onModelClick: (model: Model) => void;
    onOpenCollection: (collection: Collection) => void;
    onRefresh: () => void;
    isSelectionMode: boolean;
    selectedModelIds: string[];
    onModelSelection: (modelId: string, opts?: { shiftKey?: boolean; index?: number }) => void;
    onToggleSelectionMode: () => void;
    onSelectAll: () => void;
    onDeselectAll: () => void;
    onBulkEdit: () => void;
    onBulkDelete: () => void;
    config: AppConfig | null;
}

export function ModelsView({
    filteredModels,
    collectionsForDisplay,
    allCollections,
    sortBy,
    onModelClick,
    onOpenCollection,
    onRefresh,
    isSelectionMode,
    selectedModelIds,
    onModelSelection,
    onToggleSelectionMode,
    onSelectAll,
    onDeselectAll,
    onBulkEdit,
    onBulkDelete,
    config
}: ModelsViewProps) {

    return (
        <ModelGrid
            models={filteredModels}
            collections={sortCollections(collectionsForDisplay, sortBy)}
            allCollections={allCollections}
            sortBy={sortBy}
            onModelClick={onModelClick}
            onOpenCollection={(id) => {
                const col = allCollections.find(c => c.id === id);
                if (col) onOpenCollection(col);
            }}
            onCollectionChanged={onRefresh}
            isSelectionMode={isSelectionMode}
            selectedModelIds={selectedModelIds}
            onModelSelection={onModelSelection}
            onToggleSelectionMode={onToggleSelectionMode}
            onSelectAll={onSelectAll}
            onDeselectAll={onDeselectAll}
            onBulkEdit={onBulkEdit}
            onBulkDelete={onBulkDelete}
            config={config}
        />
    );
}
