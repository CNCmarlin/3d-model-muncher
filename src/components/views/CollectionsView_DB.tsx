import { CollectionCard_DB } from '@/components/collections/CollectionCard_DB';
import { CollectionListRow_DB } from '@/components/collections/CollectionListRow_DB';
import { LayoutControls_DB } from '@/components/layout/LayoutControls_DB';
import { useLayoutSettings } from '@/components/layout/LayoutSettingsContext_DB';
import { Category } from '@/types/category';
import { Collection } from '@/types/collection';
import { Model } from '@/types/model';
import { SortKey, sortCollections } from '@/utils/sortUtils';

interface CollectionsViewProps {
    collections: Collection[];
    collectionsForDisplay: Collection[];
    currentSortBy: SortKey;
    models: Model[];
    categories: Category[];
    onOpenCollection: (c: Collection) => void;
    onRefresh: () => void;
}

export function CollectionsView_DB({
    collections,
    collectionsForDisplay,
    currentSortBy,
    models,
    categories,
    onOpenCollection,
    onRefresh
}: CollectionsViewProps) {
    const { viewMode, getGridClasses } = useLayoutSettings();

    return (
        <div className="h-full flex flex-col">
            {/* Collections Header with Layout Controls */}
            <div className="p-4 lg:p-6 pb-0 flex justify-between items-center">
                <h2 className="text-lg font-semibold">All Collections</h2>
                <LayoutControls_DB />
            </div>

            <div className="p-4 lg:p-6 flex-1 overflow-auto">
                {collections.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No collections yet...</div>
                ) : (
                    viewMode === 'grid' ? (
                        <div className={`grid ${getGridClasses()} gap-3`}>
                            {sortCollections(collectionsForDisplay, currentSortBy).map(c => {
                                let fallback: string | undefined = undefined;
                                if (c.modelIds && c.modelIds.length > 0) {
                                    for (const id of c.modelIds) {
                                        const m = models.find(mod => mod.id === id);
                                        if (m && m.images && m.images.length > 0) {
                                            fallback = m.images[0];
                                            break;
                                        }
                                    }
                                }

                                return (
                                    <CollectionCard_DB
                                        key={c.id}
                                        collection={c}
                                        categories={categories}
                                        collections={collections}
                                        models={models}
                                        onOpen={() => onOpenCollection(c)}
                                        onChanged={onRefresh}
                                        fallbackImage={fallback}
                                    />
                                );
                            })}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {sortCollections(collectionsForDisplay, currentSortBy).map(c => (
                                <CollectionListRow_DB
                                    key={c.id}
                                    collection={c}
                                    categories={categories}
                                    collections={collections}
                                    models={models}
                                    onOpen={() => onOpenCollection(c)}
                                    onChanged={onRefresh}
                                />
                            ))}
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
