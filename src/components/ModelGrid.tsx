import { Clock, CloudDownload, FolderPlus, HardDrive, Weight } from "lucide-react";
import { useMemo, useState } from "react";
import { useConfig } from "@/context/ConfigContext";
import { useNavigation } from "@/context/NavigationContext";
import type { Collection } from "@/types/collection";
import { Model } from "@/types/model";
import { ConfigManager } from "@/utils/configManager";
import { downloadMultipleModels } from "@/utils/downloadUtils";
import { SortKey, getCollectionTimestamp, getModelTimestamp } from "@/utils/sortUtils";
import { resolveModelThumbnail } from '@/utils/thumbnailUtils';
import { CollectionCard } from "@/components/CollectionCard";
import CollectionEditDrawer from "@/components/CollectionEditDrawer";
import { CollectionEditorDialog } from '@/components/CollectionEditorDialog';
import { CollectionListRow } from "@/components/CollectionListRow";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { LayoutControls } from "@/components/LayoutControls";
import { useLayoutSettings } from "@/components/LayoutSettingsContext";
import { ModelCard } from "@/components/ModelCard";
import { SelectionModeControls } from "@/components/SelectionModeControls";
import { ViewLayout } from "@/components/shared/ViewLayout";
import { ThingiverseImportDialog } from '@/components/ThingiverseImportDialog';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface ModelGridProps {
  models: Model[];
  collections?: Collection[];
  allCollections?: Collection[];
  onModelClick: (model: Model) => void;
  // onOpenCollection is handled via NavigationContext
  onCollectionChanged?: () => void;
  isSelectionMode?: boolean;
  selectedModelIds?: string[];
  onModelSelection?: (modelId: string, opts?: { shiftKey?: boolean; index?: number }) => void;
  onToggleSelectionMode?: () => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  onBulkEdit?: () => void | Promise<void>;
  onBulkDelete?: () => void | Promise<void>;
  onOpenCollection?: (collection: Collection) => void;
  sortBy?: SortKey;
  // Removed config prop
}

export function ModelGrid({
  models,
  collections = [],
  allCollections = [],
  onModelClick,
  onCollectionChanged,
  isSelectionMode = false,
  selectedModelIds = [],
  onModelSelection,
  onToggleSelectionMode,
  onSelectAll,
  onDeselectAll,
  onBulkEdit,
  onBulkDelete,
  onOpenCollection,
  sortBy = 'none'
}: ModelGridProps) {

  const { appConfig: config } = useConfig();
  const { openCollection } = useNavigation();

  // Helper to handle navigation if not strictly provided? 
  // actually ModelGrid was flexible. But for this App, we want to use the context.
  // If we want to keep ModelGrid reusable without context, we should keep props optional and fall back to context?
  // "Use contexts where appropriate" -> implies we are coupling it more tightly to the app architecture.

  // handleModelClick is handled directly via props call in handleModelInteraction
  // or we can wrap it if we want to add context logic later.
  // For now, we use the prop.

  const handleOpenCollection = (id: string) => {
    const col = allCollections.find(c => c.id === id);
    if (col) openCollection(col);
  };

  const { viewMode, getGridClasses } = useLayoutSettings();


  const [isCreateCollectionOpen, setIsCreateCollectionOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [createCollectionMode, setCreateCollectionMode] = useState<'manual' | 'folder'>('manual');

  const handleModelInteraction = (e: React.MouseEvent, model: Model, index: number) => {
    if (isSelectionMode && onModelSelection) {
      onModelSelection(model.id, { shiftKey: e.shiftKey, index });
    } else {
      onModelClick(model);
    }
  };

  const handleBulkDeleteClick = async () => {
    if (!onBulkDelete) return;
    const res = onBulkDelete();
    if (res && typeof (res as any).then === "function") {
      try {
        await res;
      } finally {
        onDeselectAll?.();
        onToggleSelectionMode?.();
      }
    }
  };

  const handleBulkDownload = async () => {
    if (selectedModelIds.length === 0) return;
    const targets = models.filter(m => selectedModelIds.includes(m.id));
    await downloadMultipleModels(targets);
  };

  const handleCheckboxClick = (e: React.MouseEvent<HTMLButtonElement>, modelId: string, index: number) => {
    e.stopPropagation();
    if (onModelSelection) {
      onModelSelection(modelId, { index, shiftKey: e.shiftKey });
    }
  };

  const modelIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    models.forEach((m, i) => map.set(m.id, i));
    return map;
  }, [models]);

  const unifiedItems: ({ kind: 'collection'; data: Collection } | { kind: 'model'; data: Model })[] | null = useMemo(() => {
    if (!sortBy || sortBy === 'none') return null;
    type Item = { kind: 'collection'; data: Collection } | { kind: 'model'; data: Model };
    const items: Item[] = [
      ...collections.filter(Boolean).map(c => ({ kind: 'collection', data: c } as Item)),
      ...models.map(m => ({ kind: 'model', data: m } as Item)),
    ];
    const getName = (it: Item) => (it.kind === 'collection' ? it.data.name : it.data.name) || '';
    const getTime = (it: Item) => it.kind === 'collection' ? getCollectionTimestamp(it.data) : getModelTimestamp(it.data);
    items.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc': return getName(a).localeCompare(getName(b));
        case 'name_desc': return getName(b).localeCompare(getName(a));
        case 'modified_asc': {
          const ta = getTime(a), tb = getTime(b);
          if (ta !== tb) return ta - tb;
          return getName(a).localeCompare(getName(b));
        }
        case 'modified_desc': {
          const ta = getTime(a), tb = getTime(b);
          if (ta !== tb) return tb - ta;
          return getName(a).localeCompare(getName(b));
        }
        default: return 0;
      }
    });
    return items;
  }, [collections, models, sortBy]);

  return (
    <ViewLayout
      className="h-full"
      title={
        <div className="flex items-center gap-4 flex-wrap">
          <p className="text-muted-foreground text-sm font-medium">
            {models.length > 0
              ? `${models.length} model${models.length !== 1 ? 's' : ''} found`
              : collections.length > 0
                ? `${collections.length} collection${collections.length !== 1 ? 's' : ''}`
                : 'No items found'}
          </p>
          {!isSelectionMode && (
            <LayoutControls />
          )}
        </div>
      }
      actions={
        <div className="flex items-center gap-2">
          <SelectionModeControls
            isSelectionMode={isSelectionMode}
            selectedCount={selectedModelIds.length}
            onEnterSelectionMode={onToggleSelectionMode}
            onExitSelectionMode={onToggleSelectionMode}
            onBulkEdit={onBulkEdit}
            onCreateCollection={() => setIsCreateCollectionOpen(true)}
            onBulkDelete={onBulkDelete ? handleBulkDeleteClick : undefined}
            onBulkDownload={handleBulkDownload}
            onSelectAll={onSelectAll}
            onDeselectAll={onDeselectAll}
          />
          {!isSelectionMode && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setCreateCollectionMode('folder'); setIsEditorOpen(true); }}
                className="gap-2 hidden sm:flex"
              >
                <FolderPlus className="h-4 w-4" />
                New Collection
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsImportOpen(true)}
                className="gap-2"
                title="Import from Thingiverse"
              >
                <CloudDownload className="h-4 w-4" />
                <span className="hidden sm:inline">Thingiverse Import</span>
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="pb-8 lg:pb-12">
        {(models.length === 0 && collections.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <h2 className="font-semibold text-lg">No items found</h2>
            <p className="text-muted-foreground text-sm">Try adjusting your search or filters</p>
            <img src="/images/munchie-front.png" alt="No items found" width="418" />
          </div>
        ) : viewMode === 'grid' ? (
          <div className={`grid ${getGridClasses()} gap-4 lg:gap-6`}>
            {unifiedItems ? (
              unifiedItems.map((it, idx) => {
                if (it.kind === 'collection') {
                  const c = it.data;
                  return (
                    <CollectionCard
                      key={c.id}
                      collection={c}
                      categories={config?.categories || []}
                      collections={[]} // Nested editing disabled in grid view
                      onOpen={(id) => onOpenCollection ? onOpenCollection(c) : handleOpenCollection(id)}
                      onChanged={() => onCollectionChanged?.()}
                      onDeleted={() => onCollectionChanged?.()}
                    />
                  );
                }
                const model = it.data;
                const index = modelIndexMap.get(model.id) ?? idx;
                return (
                  <ModelCard
                    key={model.id}
                    model={model}
                    onClick={(e) => handleModelInteraction(e, model, index)}
                    isSelectionMode={isSelectionMode}
                    isSelected={selectedModelIds.includes(model.id)}
                    onSelectionChange={(id, shiftKey) => onModelSelection?.(id, { index, shiftKey })}
                    config={config}
                  />
                );
              })
            ) : (
              <>
                {collections.filter(Boolean).map((c) => (
                  <CollectionCard
                    key={`col-${c.id}`}
                    collection={c}
                    categories={config?.categories || []}
                    onOpen={(id) => handleOpenCollection(id)}
                    onChanged={() => onCollectionChanged?.()}
                    onDeleted={() => onCollectionChanged?.()} collections={[]} />
                ))}
                {models.map((model, index) => (
                  <ModelCard
                    key={model.id}
                    model={model}
                    onClick={(e) => handleModelInteraction(e, model, index)}
                    isSelectionMode={isSelectionMode}
                    isSelected={selectedModelIds.includes(model.id)}
                    onSelectionChange={(id, shiftKey) => onModelSelection?.(id, { index, shiftKey })}
                    config={config}
                  />
                ))}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {unifiedItems ? (
              unifiedItems.map((it, idx) => {
                if (it.kind === 'collection') {
                  const c = it.data;
                  return (
                    <CollectionListRow
                      key={`col-row-${c.id}`}
                      collection={c}
                      categories={config?.categories || []}
                      onOpen={(id) => handleOpenCollection(id)}
                      onChanged={() => onCollectionChanged?.()}
                      onDeleted={() => onCollectionChanged?.()} collections={[]} />
                  );
                }
                const model = it.data;
                const index = modelIndexMap.get(model.id) ?? idx;
                return (
                  <div
                    key={model.id}
                    data-testid={`row-${model.id}`}
                    onClick={(e) => handleModelInteraction(e, model, index)}
                    onMouseDown={(e) => {
                      if (isSelectionMode && e.shiftKey) e.preventDefault();
                    }}
                    className={`flex items-center gap-4 p-3 rounded-xl border hover:bg-accent/50 hover:border-primary/50 cursor-pointer transition-all duration-200 group shadow-sm hover:shadow-md ${isSelectionMode && selectedModelIds.includes(model.id)
                      ? 'border-primary bg-primary/5'
                      : ''
                      }`}
                    style={{ backgroundColor: isSelectionMode && selectedModelIds.includes(model.id) ? undefined : 'var(--card)' }}
                  >
                    {isSelectionMode && (
                      <div className="flex-shrink-0 pl-1">
                        <Checkbox
                          checked={selectedModelIds.includes(model.id)}
                          onCheckedChange={() => { /* handled by click */ }}
                          onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleCheckboxClick(e, model.id, index)}
                          data-testid={`checkbox - ${model.id}`}
                          className="w-5 h-5"
                        />
                      </div>
                    )}

                    {/* Thumbnail */}
                    <div className="flex-shrink-0">
                      <div className="relative">
                        <ImageWithFallback
                          src={resolveModelThumbnail(model)}
                          alt={model.name}
                          fallback={<Box className="w-8 h-8 text-primary/80" />}
                          className={`w - 20 h - 20 object - cover rounded - lg border group - hover: border - primary / 30 transition-colors flex items-center justify-center bg-muted/30 ${isSelectionMode && selectedModelIds.includes(model.id)
                            ? 'border-primary'
                            : ''
                            }`}
                        />
                        {/* Print status overlay */}
                        {(() => {
                          const effectiveCfg = config || ConfigManager.loadConfig();
                          const showBadge = effectiveCfg?.settings?.showPrintedBadge !== false;

                          if (!model.isPrinted) {
                            return <div className={`absolute top-2 right-2 w-3 h-3 rounded-full border-2 border-card bg-yellow-500`} />;
                          }

                          if (model.isPrinted && showBadge) {
                            return <div className={`absolute top-2 right-2 w-3 h-3 rounded-full border-2 border-card bg-green-700`} />;
                          }

                          return null;
                        })()}
                      </div>
                    </div>

                    {/* Model Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className={`font-semibold group-hover:text-primary transition-colors truncate text-lg ${isSelectionMode && selectedModelIds.includes(model.id)
                            ? 'text-primary'
                            : 'text-card-foreground'
                            }`}>
                            {model.name}
                          </h3>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                            {model.description}
                          </p>

                          {/* Category */}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant="outline" className="text-xs font-medium">
                              {model.category}
                            </Badge>
                            {model.hidden && (
                              <Badge variant="outline" className="text-xs bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950 dark:border-orange-800 dark:text-orange-300">
                                Hidden
                              </Badge>
                            )}
                          </div>

                          {/* Tags */}
                          <div className="flex flex-wrap gap-1 mt-2">
                            {(model.tags || []).slice(0, 4).map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {(model.tags || []).length > 4 && (
                              <Badge variant="outline" className="text-xs">
                                +{(model.tags || []).length - 4}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Status and Stats */}
                        <div className="flex flex-col items-end gap-3 ml-6">
                          {(() => {
                            const effectiveCfg = config || ConfigManager.loadConfig();
                            const showBadge = effectiveCfg?.settings?.showPrintedBadge !== false;
                            if (!showBadge) return null;

                            return (
                              <Badge
                                variant={model.isPrinted ? "default" : "secondary"}
                                className="font-medium"
                              >
                                {model.isPrinted ? "✓ Printed" : "○ Not Printed"}
                              </Badge>
                            );
                          })()}

                          <div className="text-xs text-muted-foreground text-right space-y-1">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>{model.printTime}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Weight className="h-3 w-3" />
                              <span>{model.filamentUsed}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <HardDrive className="h-3 w-3" />
                              <span>{model.fileSize}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <>
                {collections.filter(Boolean).map((c) => (
                  <CollectionListRow
                    key={`col-row-${c.id}`}
                    collection={c}
                    categories={config?.categories || []}
                    onOpen={(id) => handleOpenCollection(id)}
                    onChanged={() => onCollectionChanged?.()}
                    onDeleted={() => onCollectionChanged?.()} collections={[]} />
                ))}
                {models.map((model, index) => (
                  <div
                    key={model.id}
                    data-testid={`row-${model.id}`}
                    onClick={(e) => handleModelInteraction(e, model, index)}
                    onMouseDown={(e) => {
                      if (isSelectionMode && e.shiftKey) e.preventDefault();
                    }}
                    className={`flex items-center gap-4 p-4 bg-card rounded-lg border hover:bg-accent/50 hover:border-primary/30 cursor-pointer transition-all duration-200 group shadow-sm hover:shadow-md ${isSelectionMode && selectedModelIds.includes(model.id)
                      ? 'border-primary bg-primary/5'
                      : ''
                      }`}
                  >
                    {isSelectionMode && (
                      <div className="flex-shrink-0 pl-1">
                        <Checkbox
                          checked={selectedModelIds.includes(model.id)}
                          onCheckedChange={() => { /* handled by click */ }}
                          onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleCheckboxClick(e, model.id, index)}
                          data-testid={`checkbox-${model.id}`}
                          className="w-5 h-5"
                        />
                      </div>
                    )}

                    {/* Thumbnail */}
                    <div className="flex-shrink-0">
                      <div className="relative">
                        <ImageWithFallback
                          src={resolveModelThumbnail(model)}
                          alt={model.name}
                          className={`w-20 h-20 object-cover rounded-lg border group-hover:border-primary/30 transition-colors ${isSelectionMode && selectedModelIds.includes(model.id)
                            ? 'border-primary'
                            : ''
                            }`}
                        />
                        {/* Print status overlay */}
                        {(() => {
                          const effectiveCfg = config || ConfigManager.loadConfig();
                          const showBadge = effectiveCfg?.settings?.showPrintedBadge !== false;

                          if (!model.isPrinted) {
                            return <div className={`absolute top-2 right-2 w-3 h-3 rounded-full border-2 border-card bg-yellow-500`} />;
                          }

                          if (model.isPrinted && showBadge) {
                            return <div className={`absolute top-2 right-2 w-3 h-3 rounded-full border-2 border-card bg-green-700`} />;
                          }

                          return null;
                        })()}
                      </div>
                    </div>

                    {/* Model Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className={`font-semibold group-hover:text-primary transition-colors truncate text-lg ${isSelectionMode && selectedModelIds.includes(model.id)
                            ? 'text-primary'
                            : 'text-card-foreground'
                            }`}>
                            {model.name}
                          </h3>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                            {model.description}
                          </p>

                          {/* Category */}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant="outline" className="text-xs font-medium">
                              {model.category}
                            </Badge>
                            {model.hidden && (
                              <Badge variant="outline" className="text-xs bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950 dark:border-orange-800 dark:text-orange-300">
                                Hidden
                              </Badge>
                            )}
                          </div>

                          {/* Tags */}
                          <div className="flex flex-wrap gap-1 mt-2">
                            {(Array.isArray(model.tags) ? model.tags : []).slice(0, 4).map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {(Array.isArray(model.tags) ? model.tags : []).length > 4 && (
                              <Badge variant="outline" className="text-xs">
                                +{(Array.isArray(model.tags) ? model.tags : []).length - 4}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Status and Stats */}
                        <div className="flex flex-col items-end gap-3 ml-6">
                          {(() => {
                            const effectiveCfg = config || ConfigManager.loadConfig();
                            const showBadge = effectiveCfg?.settings?.showPrintedBadge !== false;
                            if (!showBadge) return null;

                            return (
                              <Badge
                                variant={model.isPrinted ? "default" : "secondary"}
                                className="font-medium"
                              >
                                {model.isPrinted ? "✓ Printed" : "○ Not Printed"}
                              </Badge>
                            );
                          })()}

                          <div className="text-xs text-muted-foreground text-right space-y-1">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>{model.printTime}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Weight className="h-3 w-3" />
                              <span>{model.filamentUsed}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <HardDrive className="h-3 w-3" />
                              <span>{model.fileSize}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div >
        )}
      </div >

      <CollectionEditorDialog
        open={isEditorOpen}
        onOpenChange={setIsEditorOpen}
        collection={null}
        collections={allCollections}
        categories={config?.categories || []}
        models={models}
        initialMode={createCollectionMode}
        defaultParentId="root"
        onSave={async (colData) => {
          try {
            const response = await fetch('/api/collections', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(colData),
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.error);
            onCollectionChanged?.();
            setIsEditorOpen(false);
          } catch (e) {
            console.error(e); // Dialog handles error toast
          }
        }}
        onDelete={async () => { }}
      />

      {/* [NEW] Thingiverse Import Dialog */}
      <ThingiverseImportDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportComplete={() => {
          // Trigger a refresh of the model list
          onCollectionChanged?.();
        }}
      />

      {/* Create Collection Drawer (uses CollectionEditDrawer) */}
      <CollectionEditDrawer
        open={isCreateCollectionOpen}
        onOpenChange={(open) => {
          if (!open) setIsCreateCollectionOpen(false);
          else setIsCreateCollectionOpen(true);
        }}
        collection={null}
        collections={allCollections} // <--- [ADDED] THIS IS THE MISSING PIECE!
        categories={config?.categories || []}
        initialModelIds={selectedModelIds}
        onSaved={() => {
          setIsCreateCollectionOpen(false);
          onToggleSelectionMode?.();
          onCollectionChanged?.();
        }}
      />

    </ViewLayout >
  );
}