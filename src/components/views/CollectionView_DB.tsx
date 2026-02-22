import CollectionGrid from '@/components/collections/CollectionGrid_DB';
import { Collection } from '@/types/collection';
import { AppConfig } from '@/types/config';
import { Model } from '@/types/model';

interface CollectionViewProps {
    activeCollection: Collection;
    filteredModels: Model[];
    collections: Collection[];
    onOpenCollection: (c: Collection) => void;
    onImportClick: (id?: string) => void;
    onUploadClick: () => void;
    onBack: () => void;
    onModelClick: (m: Model) => void;
    config: AppConfig | null;
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
}

export function CollectionView_DB({
    activeCollection,
    filteredModels,
    collections,
    onOpenCollection,
    onImportClick,
    onUploadClick,
    onBack,
    onModelClick,
    config,
    isFiltering,
    isSelectionMode,
    selectedModelIds,
    onModelSelection,
    onToggleSelectionMode,
    onSelectAll,
    onDeselectAll,
    onBulkEdit,
    onBulkDelete,
    onRefresh
}: CollectionViewProps) {

    return (
        <CollectionGrid
            name={activeCollection.name}
            modelIds={activeCollection.modelIds}
            models={filteredModels}
            collections={collections}
            onOpenCollection={onOpenCollection}
            onImportClick={onImportClick}
            onUploadClick={onUploadClick}
            onBack={onBack}
            onModelClick={onModelClick}
            config={config}
            activeCollection={activeCollection}
            isFiltering={isFiltering}
            isSelectionMode={isSelectionMode}
            selectedModelIds={selectedModelIds}
            onModelSelection={onModelSelection}
            onToggleSelectionMode={onToggleSelectionMode}
            onSelectAll={onSelectAll}
            onDeselectAll={onDeselectAll}
            onBulkEdit={onBulkEdit}
            onBulkDelete={onBulkDelete}
            onCollectionChanged={onRefresh}
        />
    );
}
