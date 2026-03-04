import { CollectionCard_DB } from '@/components/collections/CollectionCard_DB';
import { CollectionListRow_DB } from '@/components/collections/CollectionListRow_DB';
import { LayoutControls_DB } from '@/components/layout/LayoutControls_DB';
import { useLayoutSettings } from '@/components/layout/LayoutSettingsContext_DB';
import { DynamicCollectionModeDialog_DB } from '@/components/shared/DynamicCollectionModeDialog_DB';
import { Button } from "@/components/ui/button";
import { useConfig } from "@/context/AppConfigContext";
import { Category } from '@/types/category';
import { Collection } from '@/types/collection_db';
import { Model } from '@/types/model_db';
import { SortKey, sortCollections } from '@/utils/sortUtils';
import { FolderTree } from "lucide-react";
import React from 'react';

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
    const { appConfig, updateConfig } = useConfig();
    // Ensure "strict" is the default fallback
    const collectionMode = appConfig?.settings?.collectionMode || 'strict';
    const [showModeDialog, setShowModeDialog] = React.useState(false);

    return (
        <div className="h-full flex flex-col">
            {/* Collections Header with Layout Controls */}
            <div className="p-4 lg:p-6 pb-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-lg font-semibold shrink-0">All Collections</h2>
                <div className="flex items-center gap-3 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                    <Button variant="outline" size="sm" onClick={() => setShowModeDialog(true)} className="h-9 font-medium capitalize flex items-center gap-2">
                        <FolderTree className="h-4 w-4" />
                        Mode: {collectionMode === 'manual' ? 'Custom' : collectionMode}
                    </Button>
                    <LayoutControls_DB />
                </div>
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

            <DynamicCollectionModeDialog_DB
                open={showModeDialog}
                onOpenChange={setShowModeDialog}
            />
        </div>
    );
}
