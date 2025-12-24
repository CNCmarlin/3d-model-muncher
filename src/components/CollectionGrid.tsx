import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { Model } from '../types/model';
import type { Collection } from '../types/collection';
import { ModelCard } from './ModelCard';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { ArrowLeft, ChevronRight, FileCheck, Folder, CloudDownload, Clock, Weight, HardDrive, FolderPlus, Upload } from 'lucide-react';
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { ImageWithFallback } from "./ImageWithFallback";
import { resolveModelThumbnail } from '../utils/thumbnailUtils';
import { ConfigManager } from "../utils/configManager";
import type { AppConfig } from '../types/config';
import CollectionEditDrawer from './CollectionEditDrawer';
import { SelectionModeControls } from './SelectionModeControls';
import { CollectionCard } from './CollectionCard';
import { CollectionListRow } from './CollectionListRow';
import { useLayoutSettings } from "./LayoutSettingsContext";
import { LayoutControls } from "./LayoutControls";
import { downloadMultipleModels } from "../utils/downloadUtils";
import { CollectionEditorDialog } from './CollectionEditorDialog';

interface CollectionGridProps {
  name: string;
  modelIds: string[];
  models: Model[];
  collections: Collection[];
  onOpenCollection: (col: Collection) => void;
  onBack: () => void;
  onModelClick: (model: Model) => void;
  onImportClick?: (collectionId: string) => void;
  config?: AppConfig | null;
  activeCollection?: Collection | null;
  isSelectionMode?: boolean;
  selectedModelIds?: string[];
  onModelSelection?: (modelId: string, opts?: { shiftKey?: boolean; index?: number }) => void;
  onToggleSelectionMode?: () => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  onBulkEdit?: () => void | Promise<void>;
  onBulkDelete?: () => void | Promise<void>;
  onCollectionChanged?: () => void;
  onCreateCollection?: (mode: 'manual' | 'folder') => void;
  isFiltering?: boolean;
  onUploadClick?: () => void;
}

export default function CollectionGrid({
  name,
  modelIds,
  models,
  collections,
  onOpenCollection,
  onBack,
  onImportClick,
  onModelClick,
  config,
  activeCollection,
  isFiltering = false,
  isSelectionMode = false,
  selectedModelIds = [],
  onModelSelection,
  onToggleSelectionMode,
  onSelectAll,
  onDeselectAll,
  onBulkEdit,
  onBulkDelete,
  onCollectionChanged,
  onUploadClick,
}: CollectionGridProps) {
  // 1. USE CONTEXT
  const { viewMode, getGridClasses } = useLayoutSettings();

  const items = useMemo(() => {
    if (isFiltering) {
      return models;
    }
    const set = new Set(modelIds);
    return models.filter(m => set.has(m.id));
  }, [modelIds, models, isFiltering]);

  const modelIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    models.forEach((m, idx) => map.set(m.id, idx));
    return map;
  }, [models]);

  const childCollections = useMemo(() => {
    if (isFiltering || !activeCollection) return [];
    return collections
      .filter(c => c.parentId === activeCollection.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [collections, activeCollection, isFiltering]);

  const breadcrumbs = useMemo(() => {
    if (!activeCollection) return [];
    const path: Collection[] = [activeCollection];
    let curr = activeCollection;
    while (curr.parentId) {
      const parent = collections.find(c => c.id === curr.parentId);
      if (parent) {
        path.unshift(parent);
        curr = parent;
      } else {
        break;
      }
    }
    return path;
  }, [collections, activeCollection]);

  const [isCreateCollectionOpen, setIsCreateCollectionOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [createCollectionMode, setCreateCollectionMode] = useState<'manual' | 'folder'>('manual');
  const [tempCollectionData, setTempCollectionData] = useState<Collection | null>(null);

  const openCreateDialog = (mode: 'manual' | 'folder') => {
    setCreateCollectionMode(mode);
    // If selecting models for a manual group, pass them in
    if (selectedModelIds.length > 0 && mode === 'manual') {
      setTempCollectionData({
        id: '', name: '', modelIds: selectedModelIds,
        tags: [], images: [], category: '', description: '',
        created: new Date().toISOString(), lastModified: new Date().toISOString()
      } as Collection);
    } else {
      setTempCollectionData(null);
    }
    setIsEditorOpen(true);
  };

  const handleModelInteraction = (e: MouseEvent, model: Model, fallbackIndex: number) => {
    const index = modelIndexMap.get(model.id) ?? fallbackIndex;
    if (isSelectionMode && onModelSelection) {
      onModelSelection(model.id, { shiftKey: e.shiftKey, index });
    } else {
      onModelClick(model);
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent<HTMLButtonElement>, modelId: string, index: number) => {
    e.stopPropagation();
    if (onModelSelection) {
      onModelSelection(modelId, { index, shiftKey: e.shiftKey });
    }
  };

  const selectedCount = selectedModelIds.length;

  const handleBulkDeleteClick = async () => {
    if (!onBulkDelete || selectedCount === 0) return;
    const res = onBulkDelete();
    if (res && typeof (res as any).then === 'function') {
      try {
        await res;
      } finally {
        onDeselectAll?.();
        if (isSelectionMode) {
          onToggleSelectionMode?.();
        }
      }
    }
  };

  const handleBulkDownload = async () => {
    if (selectedModelIds.length === 0) return;
    const targets = models.filter(m => selectedModelIds.includes(m.id));
    await downloadMultipleModels(targets);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 lg:p-6 border-b bg-card shadow-sm shrink-0 flex flex-wrap items-center justify-between gap-4">
        {/* Left Side: Back + Title + Layout Controls */}
        <div className="flex items-center gap-6"> {/* Increased gap for separation */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack} className="gap-2" title="Back">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="flex flex-col">
              <div className="font-semibold leading-tight">{name}</div>
              <div className="text-sm text-muted-foreground">{items.length} item{items.length === 1 ? '' : 's'}</div>
            </div>
          </div>

          {/* [MOVED] Layout Controls now on the Left */}
          {!isSelectionMode && (
            <LayoutControls />
          )}
        </div>

        {/* Right Side: Actions */}

        <div className="flex items-center gap-2">

          <SelectionModeControls
            isSelectionMode={isSelectionMode}
            selectedCount={selectedCount}
            onEnterSelectionMode={onToggleSelectionMode}
            onExitSelectionMode={onToggleSelectionMode}
            onBulkEdit={onBulkEdit}
            onCreateCollection={selectedCount > 0 ? () => openCreateDialog('manual') : undefined}
            onBulkDelete={onBulkDelete ? handleBulkDeleteClick : undefined}
            onBulkDownload={handleBulkDownload}
            onSelectAll={onSelectAll}
            onDeselectAll={onDeselectAll}
          />
          {/* [INSERT] Upload Button */}
          {!isSelectionMode && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={onUploadClick}
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Upload Files</span>
            </Button>
          )}
          {/* [NEW] New Collection (Folder) Button */}
          {!isSelectionMode && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 hidden sm:flex"
              onClick={() => openCreateDialog('folder')}
            >
              <FolderPlus className="h-4 w-4" />
              New Collection
            </Button>
          )}
          {!isSelectionMode && activeCollection && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => onImportClick?.(activeCollection.id)}
            >
              <CloudDownload className="h-4 w-4" />
              Thingiverse Import
            </Button>
          )}
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 lg:p-6 pb-8 lg:pb-12 space-y-6">

          {/* Breadcrumbs */}
          {breadcrumbs.length > 1 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
              <span className="cursor-pointer hover:text-foreground" onClick={onBack}>Collections</span>
              {breadcrumbs.map((col, idx) => (
                <div key={col.id} className="flex items-center gap-2">
                  <ChevronRight className="h-4 w-4" />
                  <span
                    className={idx === breadcrumbs.length - 1 ? "font-semibold text-foreground" : "cursor-pointer hover:text-foreground"}
                    onClick={() => idx !== breadcrumbs.length - 1 && onOpenCollection(col)}
                  >
                    {col.name}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Child Collections (Folders) - NOW DYNAMIC */}
          {childCollections.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Folder className="h-4 w-4" />
                Folders
              </div>

              {viewMode === 'grid' ? (
                // GRID VIEW
                <div className={`grid ${getGridClasses()} gap-4`}>
                  {childCollections.map(col => {
                    let fallback: string | undefined = undefined;
                    if (col.modelIds && col.modelIds.length > 0) {
                      for (const id of col.modelIds) {
                        const m = models.find((mod: Model) => mod.id === id);
                        if (m && m.images && m.images.length > 0) {
                          fallback = m.images[0];
                          break;
                        }
                      }
                    }

                    return (
                      <CollectionCard
                        key={col.id}
                        collection={col}
                        collections={collections}
                        categories={config?.categories || []}
                        onOpen={() => onOpenCollection(col)}
                        onChanged={onCollectionChanged}
                        fallbackImage={fallback}
                      />
                    );
                  })}
                </div>
              ) : (
                // LIST VIEW
                <div className="space-y-3">
                  {childCollections.map(col => (
                    <CollectionListRow
                      key={col.id}
                      collection={col}
                      collections={collections}
                      categories={config?.categories || []}
                      onOpen={() => onOpenCollection(col)}
                      onChanged={onCollectionChanged}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Models Grid / List */}
          {items.length === 0 && childCollections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <h2 className="font-semibold text-lg">Collection is empty</h2>
              <p className="text-muted-foreground text-sm">Return and add items to this collection.</p>
            </div>
          ) : (
            items.length > 0 && (
              <div className="space-y-3">
                {childCollections.length > 0 && (
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <FileCheck className="h-4 w-4" />
                    Models
                  </div>
                )}

                {/* 3. SWITCH BETWEEN GRID AND LIST */}
                {viewMode === 'grid' ? (
                  <div className={`grid ${getGridClasses()} gap-4 lg:gap-6`}>
                    {items.map((model, index) => {
                      const modelIndex = modelIndexMap.get(model.id) ?? index;
                      return (
                        <ModelCard
                          key={model.id}
                          model={model}
                          onClick={(e) => handleModelInteraction(e, model, modelIndex)}
                          isSelectionMode={isSelectionMode}
                          isSelected={selectedModelIds.includes(model.id)}
                          onSelectionChange={(id, shiftKey) => onModelSelection?.(id, { shiftKey, index: modelIndex })}
                          config={config || undefined}
                        />
                      );
                    })}
                  </div>
                ) : (
                  // LIST VIEW RENDER
                  <div className="space-y-3">
                    {items.map((model, index) => {
                      const modelIndex = modelIndexMap.get(model.id) ?? index;
                      return (
                        <div
                          key={model.id}
                          data-testid={`row-${model.id}`}
                          onClick={(e) => handleModelInteraction(e, model, modelIndex)}
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
                                onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleCheckboxClick(e, model.id, modelIndex)}
                                data-testid={`checkbox-${model.id}`}
                                className="w-5 h-5"
                              />
                            </div>
                          )}

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
                              {(() => {
                                const effectiveCfg = config ?? ConfigManager.loadConfig();
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
                              </div>
                              <div className="flex flex-col items-end gap-3 ml-6">
                                {(() => {
                                  const effectiveCfg = config ?? ConfigManager.loadConfig();
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
                    })}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </ScrollArea>
      <CollectionEditDrawer
        open={isCreateCollectionOpen}
        onOpenChange={setIsCreateCollectionOpen}
        collection={null}
        collections={collections}
        categories={config?.categories || []}
        removalCollection={activeCollection ?? null}
        initialModelIds={selectedModelIds}
        onSaved={() => {
          setIsCreateCollectionOpen(false);
          onCollectionChanged?.();
          onDeselectAll?.();
          if (isSelectionMode) {
            onToggleSelectionMode?.();
          }
        }}
      />
      {/* [NEW] Dialog for Folder/Manual Creation */}
      <CollectionEditorDialog
        open={isEditorOpen}
        onOpenChange={setIsEditorOpen}
        collection={tempCollectionData}
        collections={collections}
        categories={config?.categories || []}
        models={models}
        initialMode={createCollectionMode}
        defaultParentId={activeCollection?.id}
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
            onDeselectAll?.();
            if (isSelectionMode) onToggleSelectionMode?.();
            setIsEditorOpen(false);
          } catch (e) {
            console.error(e);
            throw e; // Dialog handles error toast
          }
        }}
        onDelete={async () => { }}
      />
    </div>
  );
}