import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { Model } from '../types/model';
import type { Collection } from '../types/collection';
import { ModelCard } from './ModelCard';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import {
  ArrowLeft, ChevronRight, FileCheck, Folder,
  CloudDownload, FolderPlus,
  Upload, Box, Maximize2, FileText, Sidebar, ExternalLink,
  X, FileCode,
  ChevronLeft
} from 'lucide-react';
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { ImageWithFallback } from "./ImageWithFallback";
import { resolveModelThumbnail } from '../utils/thumbnailUtils';
import type { AppConfig } from '../types/config';
import CollectionEditDrawer from './CollectionEditDrawer';
import { SelectionModeControls } from './SelectionModeControls';
import { CollectionCard } from './CollectionCard';
import { CollectionListRow } from './CollectionListRow';
import { useLayoutSettings } from "./LayoutSettingsContext";
import { LayoutControls } from "./LayoutControls";
import { downloadMultipleModels } from "../utils/downloadUtils";
import { CollectionEditorDialog } from './CollectionEditorDialog';
import { ProjectView } from './ProjectView';
import { toast } from 'sonner';


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

  // --- MODAL STATES ---
  const [isCreateCollectionOpen, setIsCreateCollectionOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // [NEW] State for opening the Edit Drawer for the CURRENT collection
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);

  const [createCollectionMode, setCreateCollectionMode] = useState<'manual' | 'folder'>('manual');
  const [tempCollectionData, setTempCollectionData] = useState<Collection | null>(null);

  // --- ZONE B: SIDEBAR STATE ---
  const [showDetailsPanel, setShowDetailsPanel] = useState(true);
  const [mobileTab, setMobileTab] = useState<'browse' | 'inspect'>('browse');
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // State for the "Floating Viewer" (Text/MD)
  const [viewingFile, setViewingFile] = useState<{ name: string, content: string, type: string } | null>(null);

  // [UPDATED] Full Screen Gallery State
  const [fullScreenIndex, setFullScreenIndex] = useState<number>(0); // Track index, not just URL
  const [isFullScreenOpen, setIsFullScreenOpen] = useState(false);

  // Helper to open full screen at a specific index
  const handleOpenFullScreen = (index: number) => {
    setFullScreenIndex(index);
    setIsFullScreenOpen(true);
  };

  // Helpers for Navigation
  const handleNextImage = () => {
    if (!activeCollection?.images) return;
    setFullScreenIndex((prev) => (prev + 1) % activeCollection.images!.length);
  };

  const handlePrevImage = () => {
    if (!activeCollection?.images) return;
    setFullScreenIndex((prev) =>
      prev === 0 ? activeCollection.images!.length - 1 : prev - 1
    );
  };

  useEffect(() => {
    if (!isFullScreenOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handleNextImage();
      if (e.key === 'ArrowLeft') handlePrevImage();
      if (e.key === 'Escape') setIsFullScreenOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreenOpen, activeCollection]);


  // FUNCTION: Handle file opening (PDF vs Text)
  const handleFileClick = async (file: any) => {
    if (!file.url) return;

    if (file.type === 'pdf' || file.name.endsWith('.pdf')) {
      window.open(file.url, '_blank');
    } else {
      try {
        const res = await fetch(file.url);
        if (!res.ok) throw new Error("Failed to load");
        const text = await res.text();

        setViewingFile({
          name: file.name,
          type: file.type || 'text',
          content: text
        });
      } catch (e) {
        toast.error("Could not preview file");
      }
    }
  };

  console.log("--- DEBUGGING FILES ---");
  console.log("Active Collection:", activeCollection);
  // check 'files', 'filePaths', 'attachments' - whatever it might be named
  console.log("Raw Files Property:", (activeCollection as any)?.documents || []);
  console.log("--------------------------");

  const normalizedFiles = useMemo(() => {
    // 1. Read from 'documents'
    const rawFiles = activeCollection?.documents || [];
    
    return rawFiles.map((file: any) => {
      if (typeof file === 'string') {
        const name = file.split('/').pop() || file;
        const isPdf = name.toLowerCase().endsWith('.pdf');
        
        // 2. FIX: Use the relative path directly. 
        // Do NOT prepend localhost:3001. 
        // The browser will resolve this against the current page's origin.
        const url = file; 
        
        return {
          name: name,
          url: url,
          type: isPdf ? 'pdf' : 'text', 
          size: '' 
        };
      }
      return file;
    });
  }, [activeCollection]);

  // [NEW] Handler to open the Edit Drawer for the Active Collection
  const handleEditActiveCollection = () => {
    if (!activeCollection) return;
    setIsEditDrawerOpen(true);
  };


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

  const dynamicGridClasses = useMemo(() => {
    if (!showDetailsPanel) {
      return getGridClasses(); // Global setting (e.g., Comfortable/Compact)
    }
    // "Sidebar Open" optimized classes:
    // We drop the column count by 1 at each breakpoint compared to standard
    return "grid-cols-1 min-[500px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4";
  }, [showDetailsPanel, getGridClasses]);

  // [PASTE THE INTERCEPT HERE]
  // If this collection is a PROJECT, show the Project View instead of the Grid
  if (activeCollection && activeCollection.type === 'project') {
    return (
      <ProjectView
        collection={activeCollection}
        models={models}
        onModelClick={onModelClick}
        onBack={onBack}
        onUpdateCollection={() => {
          onCollectionChanged?.();
        }}
      />
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">

      {/* --- HEADER SECTION --- */}
      <div className="p-4 lg:p-6 border-b bg-card shadow-sm shrink-0 flex flex-wrap items-center justify-between gap-4 z-20 relative">
        <div className="flex items-center gap-6">
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
          {!isSelectionMode && !showDetailsPanel && (<LayoutControls />)}
        </div>

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

          {!isSelectionMode && (
            <>
              {/* [UPDATED] Upload Button now opens Edit Drawer */}
              <Button variant="outline" size="sm" className="gap-2" onClick={handleEditActiveCollection}>
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">Upload / Manage</span>
              </Button>
              <Button variant="outline" size="sm" className="gap-2 hidden sm:flex" onClick={() => openCreateDialog('folder')}>
                <FolderPlus className="h-4 w-4" />
                New Collection
              </Button>
              {activeCollection && (
                <Button variant="outline" size="sm" className="gap-2" onClick={() => onImportClick?.(activeCollection.id)}>
                  <CloudDownload className="h-4 w-4" />
                </Button>
              )}
            </>
          )}

          <div className="h-6 w-px bg-border mx-2" />
          <Button
            variant={showDetailsPanel ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setShowDetailsPanel(!showDetailsPanel)}
            title="Toggle Details Panel"
          >
            <Sidebar className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* --- MAIN CONTENT SPLIT --- */}
      <div className="flex-1 flex overflow-hidden">

        {/* ZONE A: THE GRID */}
        <div className={`
            flex-col min-w-0 bg-background relative
            ${mobileTab === 'inspect' ? 'hidden lg:flex' : 'flex'} 
            flex-1
        `}>
          <ScrollArea className="h-full">
            <div className="p-4 lg:p-6 pb-24 space-y-6">

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

              {/* Child Collections (Folders) */}
              {childCollections.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Folder className="h-4 w-4" />
                    Folders
                  </div>
                  {viewMode === 'grid' ? (
                    <div className={`grid ${dynamicGridClasses} gap-4`}>
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
                    {viewMode === 'grid' ? (
                      <div className={`grid ${dynamicGridClasses} gap-4 lg:gap-6`}>
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
                      <div className="space-y-3">
                        {items.map((model, index) => {
                          const modelIndex = modelIndexMap.get(model.id) ?? index;
                          return (
                            <div
                              key={model.id}
                              data-testid={`row-${model.id}`}
                              onClick={(e) => handleModelInteraction(e, model, modelIndex)}
                              onMouseDown={(e) => { if (isSelectionMode && e.shiftKey) e.preventDefault(); }}
                              className={`flex items-center gap-4 p-4 bg-card rounded-lg border hover:bg-accent/50 hover:border-primary/30 cursor-pointer transition-all duration-200 group shadow-sm hover:shadow-md ${isSelectionMode && selectedModelIds.includes(model.id) ? 'border-primary bg-primary/5' : ''}`}
                            >
                              {isSelectionMode && (
                                <div className="flex-shrink-0 pl-1">
                                  <Checkbox
                                    checked={selectedModelIds.includes(model.id)}
                                    onCheckedChange={() => { }}
                                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleCheckboxClick(e, model.id, modelIndex)}
                                    className="w-5 h-5"
                                  />
                                </div>
                              )}
                              <div className="flex-shrink-0">
                                <ImageWithFallback
                                  src={resolveModelThumbnail(model)}
                                  alt={model.name}
                                  className={`w-16 h-16 object-cover rounded-md border ${isSelectionMode && selectedModelIds.includes(model.id) ? 'border-primary' : ''}`}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-base truncate">{model.name}</h3>
                                <p className="text-sm text-muted-foreground line-clamp-1">{model.description}</p>
                                <div className="flex gap-2 mt-1">
                                  <Badge variant="outline" className="text-xs scale-90 origin-left">{model.category}</Badge>
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
        </div>

        {/* ZONE B: THE SIDEBAR (Inspector) */}
        {activeCollection && (
          <div className={`
            flex-col bg-card border-l transition-all duration-300 shadow-sm z-0
            /* MOBILE */
            w-full h-full
            ${mobileTab === 'inspect' ? 'flex' : 'hidden'}
            /* DESKTOP */
            lg:w-[320px] 
            ${showDetailsPanel ? 'lg:flex' : 'lg:hidden'}
          `}>

            {/* SUB-ZONE B1: VIEWER */}
            <div className="h-52 lg:h-96 bg-muted/20 border-b relative group flex items-center justify-center overflow-hidden shrink-0">
              {activeCollection.images && activeCollection.images.length > 0 ? (
                <>
                  <img
                    src={activeCollection.images[activeImageIndex] || activeCollection.images[0]}
                    alt="Active View"
                    className="w-full h-full object-contain p-2"
                  />
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute bottom-2 right-2 h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                    // [UPDATED] Trigger the robust full screen mode
                    onClick={() => handleOpenFullScreen(activeImageIndex)}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground/50">
                  <Box className="h-12 w-12" />
                  <span className="text-xs">No Preview</span>
                </div>
              )}
            </div>

            {/* SUB-ZONE B2: CAROUSEL (Thumbnails) */}
            {activeCollection.images && activeCollection.images.length > 0 && (
              <div className="p-3 border-b bg-background shrink-0">
                <ScrollArea className="w-full whitespace-nowrap pb-2">
                  <div className="flex gap-2">
                    {activeCollection.images.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveImageIndex(idx)}
                        className={`relative w-16 h-16 rounded-md overflow-hidden border transition-all flex-shrink-0 ${activeImageIndex === idx ? 'ring-2 ring-primary border-transparent' : 'border-muted hover:border-primary/50'}`}
                      >
                        <img src={img} className="w-full h-full object-cover" />
                      </button>
                    ))}
                    {/* [UPDATED] Wire up Upload Click to Edit Drawer */}
                    <button
                      onClick={handleEditActiveCollection}
                      className="w-16 h-16 rounded-md border border-dashed flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex-shrink-0"
                    >
                      <Upload className="h-4 w-4" />
                    </button>
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* SUB-ZONE B3: FILES LIST */}
            <div className="flex-1 flex flex-col min-h-0 bg-background">
              <div className="p-3 border-b bg-muted/5 flex items-center justify-between shrink-0">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Attached Files
                </span>
                {/* [UPDATED] Wire up Upload Click to Edit Drawer */}
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleEditActiveCollection}>
                  <Upload className="h-3 w-3" />
                </Button>
              </div>

              <ScrollArea className="flex-1 p-2">
                <div className="space-y-1 pb-12">
                  {/* [UPDATED] Fix TypeScript errors by explicitly typing args */}
                  {normalizedFiles.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground italic">
                      No attached files
                    </div>
                  ) : (
                    normalizedFiles.map((file: any, idx: number) => (
                      <div
                        key={idx}
                        onClick={() => handleFileClick(file)}
                        className="flex items-center gap-3 p-2 rounded-md hover:bg-accent cursor-pointer group transition-colors"
                      >
                        <div className={`h-8 w-8 rounded flex items-center justify-center shrink-0 ${file.type === 'pdf' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                          {file.type === 'pdf' ? <FileText className="h-4 w-4" /> : <FileCode className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate" title={file.name}>{file.name}</div>
                          <div className="text-xs text-muted-foreground">{file.size}</div>
                        </div>
                        {file.type === 'pdf' && (
                          <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
      </div>

      {/* MOBILE BOTTOM BAR */}
      <div className="lg:hidden border-t bg-background p-2 flex justify-center gap-4 shrink-0 z-40 shadow-[0_-1px_4px_rgba(0,0,0,0.05)]">
        <Button
          variant={mobileTab === 'browse' ? 'default' : 'ghost'}
          onClick={() => setMobileTab('browse')}
          className="flex flex-col items-center justify-center gap-1 h-14 w-28 rounded-2xl"
        >
          <Folder className="h-5 w-5" />
          <span className="text-[10px] uppercase font-bold tracking-wide">Browse</span>
        </Button>

        <Button
          variant={mobileTab === 'inspect' ? 'default' : 'ghost'}
          onClick={() => setMobileTab('inspect')}
          className="flex flex-col items-center justify-center gap-1 h-14 w-28 rounded-2xl"
          disabled={!activeCollection}
        >
          <Sidebar className="h-5 w-5" />
          <span className="text-[10px] uppercase font-bold tracking-wide">Inspect</span>
        </Button>
      </div>

      {/* --- FLOATING FILE VIEWER OVERLAY --- */}
      {viewingFile && (
        <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 md:p-8">
          <div className="bg-background w-full max-w-3xl h-full max-h-[80vh] rounded-xl shadow-2xl flex flex-col overflow-hidden border animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <FileCode className="h-5 w-5 text-primary" />
                <span className="font-semibold">{viewingFile.name}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setViewingFile(null)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto bg-muted/10 p-6 font-mono text-sm whitespace-pre-wrap">
              {viewingFile.content}
            </div>
          </div>
        </div>
      )}

      {/* --- [UPDATED] FULLSCREEN CAROUSEL OVERLAY --- */}
      {isFullScreenOpen && activeCollection?.images && (
        <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-sm flex flex-col animate-in fade-in duration-200">

          {/* Top Bar: Close Button */}
          <div className="absolute top-4 right-4 z-[70]">
            <Button
              variant="ghost"
              size="icon"
              className="text-white/70 hover:text-white hover:bg-white/10 h-10 w-10 rounded-full"
              onClick={() => setIsFullScreenOpen(false)}
            >
              <X className="h-6 w-6" />
            </Button>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex items-center justify-center relative w-full h-full overflow-hidden">

            {/* Left Nav */}
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); handlePrevImage(); }}
              className="absolute left-4 z-[70] text-white hover:bg-white/20 h-12 w-12 rounded-full"
            >
              <ChevronLeft className="h-8 w-8" />
            </Button>

            {/* Main Image */}
            <div className="w-full h-full p-4 flex items-center justify-center">
              {/* Handle possible undefined images safely */}
              {(activeCollection.images || [])[fullScreenIndex] && (
                <img
                  src={(activeCollection.images || [])[fullScreenIndex]}
                  alt="Fullscreen"
                  className="max-w-full max-h-[calc(100vh-140px)] object-contain drop-shadow-2xl"
                />
              )}
            </div>

            {/* Right Nav */}
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); handleNextImage(); }}
              className="absolute right-4 z-[70] text-white hover:bg-white/20 h-12 w-12 rounded-full"
            >
              <ChevronRight className="h-8 w-8" />
            </Button>
          </div>

          {/* Bottom Thumbnails Strip */}
          <div className="h-24 bg-black/50 backdrop-blur-md border-t border-white/10 flex items-center justify-center gap-2 overflow-x-auto px-4 py-2 shrink-0">
            {(activeCollection.images || []).map((img, idx) => (
              <button
                key={idx}
                onClick={(e) => { e.stopPropagation(); setFullScreenIndex(idx); }}
                className={`
                  relative h-16 w-16 rounded-md overflow-hidden border-2 flex-shrink-0 transition-all
                  ${fullScreenIndex === idx ? 'border-primary ring-2 ring-primary/30 scale-105' : 'border-transparent opacity-50 hover:opacity-100'}
                `}
              >
                <img
                  src={img}
                  alt={`Thumb ${idx}`}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* --- DIALOGS --- */}

      {/* 1. Create New Collection Drawer */}
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
          if (isSelectionMode) onToggleSelectionMode?.();
        }}
      />

      {/* 2. [NEW] Edit ACTIVE Collection Drawer */}
      <CollectionEditDrawer
        open={isEditDrawerOpen}
        onOpenChange={setIsEditDrawerOpen}
        collection={activeCollection ?? null} // We pass the active collection here
        collections={collections}
        categories={config?.categories || []}
        removalCollection={null}
        initialModelIds={[]}
        onSaved={() => {
          setIsEditDrawerOpen(false);
          onCollectionChanged?.();
        }}
      />

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
            return result.collection;
          } catch (e) {
            console.error(e);
            throw e;
          }
        }}
        onDelete={async (id) => {
          try {
            const res = await fetch(`/api/collections/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            onCollectionChanged?.();
            onDeselectAll?.();
          } catch (e) {
            console.error(e);
            toast.error("Failed to delete collection");
          }
        }}
      />
    </div>
  );
}