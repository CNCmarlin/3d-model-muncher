import { SearchableSelect_DB } from "@/components/common/SearchableSelect_DB";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { LICENSES, isKnownLicense } from '@/constants/licenses';
import { Category } from "@/types/category";
import { Model } from "@/types/model_db";
import { useEffect, useMemo, useRef, useState } from "react";

import { DescriptionSection_DB } from '@/components/models/details/DescriptionSection_DB';
import { GcodeSection_DB } from '@/components/models/details/GcodeSection_DB';
import { MetadataSection_DB } from '@/components/models/details/MetadataSection_DB';
import { NotesSection_DB } from '@/components/models/details/NotesSection_DB';
import { PrintSettingsSection_DB } from "@/components/models/details/PrintSettingsSection_DB";
import { RelatedFilesSection_DB } from '@/components/models/details/RelatedFilesSection_DB';
import { SiblingsSection_DB } from "@/components/models/details/SiblingsSection_DB";
import { SourceSection_DB } from "@/components/models/details/SourceSection_DB";
import { TagsSection_DB } from "@/components/models/details/TagsSection_DB";
import { ModelPreviewSection_DB } from '@/components/models/ModelPreviewSection_DB';
import { ModelUploadDialog_DB } from "@/components/models/ModelUploadDialog_DB";
import type { Collection } from "@/types/collection_db";
import { downloadAllFiles_db, triggerDownload_db } from "@/utils/downloadUtils_db";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radix-ui/react-tabs";
import {
  ArrowLeft,
  Download,
  Edit3,
  Eye, EyeOff,
  Layers,
  List, MinusCircle,
  RefreshCw, Save,
  Trash2,
  Upload
} from "lucide-react";
import { toast } from 'sonner';

// Hooks
import { useDocumentUpload_db } from "@/hooks/hub/useDocumentUpload_db";
import { useGcodeHandler_db } from "@/hooks/hub/useGcodeHandler_db";
import { useModelEdit_db } from "@/hooks/hub/useModelEdit_db";
import { useModelGallery_db } from "@/hooks/hub/useModelGallery_db";
import { useRelatedFiles_db } from "@/hooks/hub/useRelatedFiles_db";
import { useSiblings_db } from "@/hooks/hub/useSiblings_db";
import { useDeleteModel_db } from "@/hooks/mutations/useDeleteModel_db";
import { useUpdateCollection_db } from "@/hooks/mutations/useUpdateCollection_db";
import { useUpdateModel_db } from "@/hooks/mutations/useUpdateModel_db";
import { useModel_db } from "@/hooks/queries/useModel_db";

interface ModelHubViewProps {
  model: Model | null;
  onClose: () => void;
  onModelUpdate: (model: Model) => void;
  onDelete?: (model: Model) => void;
  defaultModelView?: '3d' | 'images';
  categories: Category[];
  defaultModelColor?: string | null;
  models: Model[];
  collections: Collection[];
  isSidebarOpen: boolean;
  onOpenCollection: (col: Collection) => void;
  onFilterChange: (filters: any) => void;
  onSettingsClick: () => void;
  onImportClick?: (collectionId: string) => void;
  onSelectModel: (model: Model) => void;
}

export function ModelHubView_DB({
  model: initialModel,
  models,
  onClose,
  onModelUpdate, // Deprecated, kept for compatibility but should rely on query invalidation
  onDelete,
  defaultModelView,
  defaultModelColor,
  categories,
  onOpenCollection,
  collections,
  onSelectModel
}: ModelHubViewProps) {
  // -- QUERY HOOKS --
  // Use the ID from the prop, but fetch fresh data
  const { data: fetchedModel } = useModel_db(initialModel?.id || '', {
    initialData: (initialModel || undefined) as any,
    enabled: !!initialModel?.id
  });

  // Use fetchedModel if available, fall back to initialModel (prop)
  const model = fetchedModel || initialModel;

  // -- MUTATION HOOKS --
  const updateModel = useUpdateModel_db();
  const deleteModel = useDeleteModel_db();
  const updateCollection = useUpdateCollection_db();

  // We need to wrap the mutation in a handler that matches the old signature for now
  // or update the hooks to expect the new signature.
  // useModelEdit expects onModelUpdate. We'll shim it.
  const handleModelUpdateParams = (updated: Model) => {
    // CRITICAL FIX: Only send changed fields, not the entire model
    // Compute diff between original model and updated model
    const changes: Partial<Model> = {};

    if (!model) return;

    console.log('[ModelHubView] === DIFF DEBUG ===');
    console.log('[ModelHubView] Original model category:', model.category);
    console.log('[ModelHubView] Updated model category:', updated.category);
    console.log('[ModelHubView] Original printSettings:', (model as any).printSettings);
    console.log('[ModelHubView] Updated printSettings:', (updated as any).printSettings);

    // Dynamically sync fields instead of using a hardcoded allowlist
    const excludedKeys = new Set([
      'id', 'createdAt', 'updatedAt', 'collection', 'images', 'thumbnail',
      'parsedImages', 'files', // exclude internal or non-editable relation arrays
      '_count', 'userDefined'
    ]);

    Object.keys(updated).forEach((key) => {
      if (excludedKeys.has(key)) return;

      const modelKey = key as keyof Model;
      const oldValue = (model as any)[modelKey];
      const newValue = (updated as any)[modelKey];

      if (newValue === undefined) return; // Prevent serialization crashes

      // Deep compare for objects/arrays
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        console.log(`[ModelHubView] Field changed: ${key}`, { old: oldValue, new: newValue });
        (changes as any)[modelKey] = newValue;
      }
    });

    console.log('[ModelHubView] Final changes object:', changes);
    console.log('[ModelHubView] === END DIFF DEBUG ===');

    // Only send update if there are actual changes
    if (Object.keys(changes).length > 0) {
      updateModel.mutate({
        id: updated.id,
        data: changes  // ← Send only changed fields!
      });
    }

    // Optimistically update parent layout if needed via prop
    onModelUpdate(updated);
  };

  // useModelEdit handles its own mutations. We just need to know when it's done to verify validity or close.
  // We do NOT want to trigger *another* mutation here.
  const handleEditComplete = (updatedModel: Model) => {
    // Just update local view state if necessary, or rely on React Query invalidation.
    // Do NOT call updateModel.mutate here.
    if (onModelUpdate) onModelUpdate(updatedModel); // notify parent if needed
  };

  const editLogic = useModelEdit_db({ model: model as any, onModelUpdate: handleEditComplete as any });
  const [isSourceValid, setIsSourceValid] = useState(true);

  const galleryLogic = useModelGallery_db({
    model: model as any,
    editedModel: editLogic.editedModel as any,
    isEditing: editLogic.isEditing,
    inlineCombined: editLogic.inlineCombined as any,
    defaultModelView
  });
  const gcodeLogic = useGcodeHandler_db({ currentModel: model as any, onModelUpdate: handleModelUpdateParams as any });
  const uploadLogic = useDocumentUpload_db(model as any, handleModelUpdateParams as any);
  const siblingsLogic = useSiblings_db(model as any, collections as any, models as any);
  const relatedLogic = useRelatedFiles_db(model as any, editLogic.isEditing);

  // -- LOCAL UI STATE --
  const [isAddToCollectionOpen, setIsAddToCollectionOpen] = useState(false);
  const [isRemoveFromCollectionOpen, setIsRemoveFromCollectionOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const [isAssetDialogOpen, setIsAssetDialogOpen] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  const [focusRelatedIndex, setFocusRelatedIndex] = useState<number | null>(null);
  const [relatedVerifyStatus, setRelatedVerifyStatus] = useState<Record<number, { loading: boolean; ok?: boolean; message?: string }>>({});

  const detailsViewportRef = useRef<HTMLDivElement | null>(null);
  const addImageInputRef = useRef<HTMLInputElement>(null);

  // Focus newly-added related_files input when created
  useEffect(() => {
    if (focusRelatedIndex === null) return;
    const selector = `input[data-related-index="${focusRelatedIndex}"]`;
    const el = document.querySelector<HTMLInputElement>(selector);
    if (el) {
      try { el.focus(); el.select(); } catch (e) { }
    }
    setFocusRelatedIndex(null);
  }, [focusRelatedIndex]);


  // Computed
  const activeModelNullable = editLogic.editedModel || model;

  const activeCollection = useMemo(() => {
    if (!model) return null;
    // Database mode: Find collection where model.collections includes collection.id
    // Fallback to searching collections.modelIds if needed
    const colId = model.collections?.[0] || (model as any).collectionId;
    if (colId) return collections.find(c => c.id === colId);
    return collections.find(c => c.modelIds?.includes(model.id));
  }, [collections, model]);


  // Tag Suggestions Logic
  const getCategoryTags = (categoryLabel: string): string[] => {
    const defaultTags: Record<string, string[]> = {
      Miniatures: ["Miniature", "Fantasy", "Sci-Fi", "Dragon", "Warrior", "Monster", "D&D", "Tabletop"],
      Utility: ["Organizer", "Tool", "Stand", "Holder", "Clip", "Mount", "Storage", "Functional"],
      Decorative: ["Vase", "Ornament", "Art", "Display", "Sculpture", "Modern", "Elegant", "Beautiful"],
      Games: ["Chess", "Dice", "Board Game", "Puzzle", "Token", "Counter", "Gaming", "Entertainment"],
      Props: ["Cosplay", "Weapon", "Armor", "Helmet", "Shield", "Fantasy", "Replica", "Convention"]
    };
    return defaultTags[categoryLabel] || [];
  };

  const getSuggestedTags = () => {
    if (!activeModelNullable || !activeModelNullable.category) return [];
    const suggestedTags = getCategoryTags(activeModelNullable.category);
    const existing = new Set((activeModelNullable.tags || []).map((t: any) => (typeof t === 'string' ? t : t?.tag?.name || '').toLowerCase()));
    return suggestedTags.filter((tag: string) => !existing.has(tag.toLowerCase()));
  };

  const handleSuggestedTagClick = (tag: string) => {
    if (!editLogic.editedModel) return;
    const currentTags = editLogic.editedModel.tags || [];
    const lowerTag = tag.toLowerCase();
    if (currentTags.some((t: any) => (typeof t === 'string' ? t : t?.tag?.name || '').toLowerCase() === lowerTag)) return;

    editLogic.setEditedModel({
      ...editLogic.editedModel,
      tags: [...currentTags, tag as any]
    });
  };

  // Visibility Toggle
  const handleToggleHide = () => {
    if (!activeModelNullable || !model) return;
    const newHiddenStatus = !activeModelNullable.hidden;

    updateModel.mutate({
      id: model.id,
      data: { hidden: newHiddenStatus }
    }, {
      onSuccess: () => {
        // If editing, update local state
        if (editLogic.isEditing && editLogic.editedModel) {
          editLogic.setEditedModel({ ...editLogic.editedModel, hidden: newHiddenStatus });
        }
        // Always update parent/cache via standard flow, handled by QueryClient
        toast.success(newHiddenStatus ? "Model hidden" : "Model visible");
      }
    });
  };

  const handleDeleteClick = () => setIsDeleteConfirmOpen(true);

  const confirmDelete = () => {
    if (model) {
      deleteModel.mutate(model.id, {
        onSuccess: () => {
          onClose(); // Close the modal
          // onDelete callback might be used by parent to clear selection
          if (onDelete) onDelete(model as any);
        }
      });
      setIsDeleteConfirmOpen(false);
    }
  };

  // Download Logic
  const handleDownloadAll = () => {
    if (activeModelNullable) {
      const toRelative = (p: string) => p ? p.replace(/^(\/)?models\//, '') : '';
      const mainPath = toRelative(activeModelNullable.modelUrl || activeModelNullable.filePath || '');
      const relatedPaths = (activeModelNullable.metadata?.related_files || []).map((p: string) => toRelative(p));
      const imagePaths = (galleryLogic.allImages || []).map(p => toRelative(p));

      if (!mainPath) {
        toast.error("Could not determine main file path.");
        return;
      }
      downloadAllFiles_db(mainPath, relatedPaths, imagePaths, activeModelNullable.name);
    }
  };

  // Local Update Helper for MetadataSection
  const handleLocalUpdate = (updates: Partial<Model>) => {
    editLogic.setEditedModel((prev: any) => {
      if (!prev) return prev;
      const next = { ...prev, ...updates } as any;
      if (updates.metadata?.userDefined) {
        next.metadata = { ...(prev.metadata || {}), userDefined: { ...((prev.metadata as any)?.userDefined || {}), ...(updates.metadata.userDefined) } };
      }
      return next as Model;
    });
  };

  // Render Check
  if (!model || !activeModelNullable) return null;
  const activeModel = activeModelNullable; // Safe now

  // Derive display stuff
  const safePrintSettings = {
    layerHeight: activeModel.layerHeight || 'Unknown',
    infill: activeModel.infill || 'Unknown',
    nozzle: activeModel.nozzle || 'Unknown',
    printer: activeModel.printer || 'Unknown',
    material: activeModel.material || 'Unknown'
  };

  const canHavePrintSettings = (() => {
    try {
      const p = (activeModel.filePath || activeModel.modelUrl || '').toLowerCase();
      return p.endsWith('.stl') || p.endsWith('.3mf') || p.endsWith('.gcode') || p.endsWith('-munchie.json') || p.endsWith('-stl-munchie.json');
    } catch (_) { return false; }
  })();

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* HEADER */}
      <div className="px-4 lg:px-6 py-3 border-b bg-card/10 flex items-center justify-between shrink-0 z-20 gap-4">
        {/* Left Section: Back + Breadcrumb */}
        <div className="flex items-center gap-4 shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose} className="gap-2 h-8 text-[11px] font-bold uppercase tracking-wider shrink-0">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          <div className="h-4 w-px bg-border mx-1 hidden sm:block" />
          <div
            className="flex items-center gap-2 cursor-pointer group truncate"
            onClick={() => activeCollection && onOpenCollection?.(activeCollection)}
          >
            <Layers className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            <span className="text-sm font-semibold text-muted-foreground group-hover:text-foreground transition-colors truncate max-w-[200px]">
              {activeCollection?.name || "Library"}
            </span>
            {activeModel.category && (
              <span className="text-[10px] text-muted-foreground/30 font-bold uppercase tracking-wider group-hover:text-muted-foreground transition-colors hidden md:inline shrink-0">
                / {activeModel.category}
              </span>
            )}
          </div>
        </div>

        {/* Right Section: Actions */}
        <div className="flex items-center gap-4 flex-1 justify-end shrink-0">
          {!editLogic.isEditing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-2 opacity-50 hover:opacity-100 transition-opacity"
              disabled={isMoving}
              onClick={() => setIsAssetDialogOpen(true)}
            >
              {isMoving ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" /> : <Upload className="h-3.5 w-3.5" />}
              <span className="hidden lg:inline">{isMoving ? "Reorganizing..." : "Manage / Upload"}</span>
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="h-full">
        <div className="p-4 lg:p-10 pb-32">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 max-w-[1600px] mx-auto">

            {/* LEFT COLUMN: PREVIEW */}
            <div className="lg:col-span-7 space-y-8">
              <div className="rounded-2xl overflow-hidden border bg-card shadow-sm">
                <ModelPreviewSection_DB
                  // Gallery State
                  viewMode={galleryLogic.viewMode}
                  setViewMode={galleryLogic.setViewMode}
                  currentModel={activeModel as any}
                  activeDocUrl={galleryLogic.activeDocUrl}
                  handleViewDocument={galleryLogic.handleViewDocument}
                  active3DFile={galleryLogic.active3DFile}
                  setActive3DFile={galleryLogic.setActive3DFile}
                  allImages={galleryLogic.allImages}
                  selectedImageIndex={galleryLogic.selectedImageIndex}
                  setSelectedImageIndex={galleryLogic.setSelectedImageIndex}
                  isWindowFullscreen={galleryLogic.isWindowFullscreen}
                  setIsWindowFullscreen={galleryLogic.setIsWindowFullscreen}
                  imageContainerRef={galleryLogic.imageContainerRef}
                  prevButtonRef={galleryLogic.prevButtonRef}
                  thumbnailStripRef={galleryLogic.thumbnailStripRef}
                  handlePreviousImage={galleryLogic.handlePreviousImage}
                  handleNextImage={galleryLogic.handleNextImage}
                  handleToggleFullscreen={galleryLogic.handleToggleFullscreen}

                  // Edit Logic Interaction
                  isEditing={editLogic.isEditing}
                  handleCapturedImage={editLogic.handleCapturedImage}
                  handleAddImageClick={(e) => {
                    e.stopPropagation();
                    if (!editLogic.isEditing) return;
                    addImageInputRef.current?.click();
                  }}
                  addImageInputRef={addImageInputRef}
                  handleAddImageFile={editLogic.handleAddImageFile}
                  addImageProgress={editLogic.addImageProgress}
                  addImageError={editLogic.addImageError}

                  // Drag & Drop
                  toggleImageSelection={(idx) => editLogic.toggleImageSelection(idx, galleryLogic.isWindowFullscreen)}
                  isImageSelected={(idx) => editLogic.selectedImageIndexes.includes(idx)}
                  handleDragStart={(e, idx) => editLogic.handleDragStart(e, idx, galleryLogic.isWindowFullscreen)}
                  handleDragOver={(e, idx) => editLogic.handleDragOver(e, idx, galleryLogic.isWindowFullscreen)}
                  handleDrop={(e, idx) => {
                    const newIdx = editLogic.handleDrop(e, idx, galleryLogic.isWindowFullscreen);
                    if (typeof newIdx === 'number') galleryLogic.setSelectedImageIndex(newIdx);
                  }}
                  handleDragLeave={() => editLogic.setDragOverIndex(null)}
                  handleDragEnd={() => editLogic.setDragOverIndex(null)}
                  dragOverIndex={editLogic.dragOverIndex}

                  handleSetAsMain={(idx) => {
                    editLogic.handleSetAsMain(idx);
                    galleryLogic.setSelectedImageIndex(0);
                  }}

                  defaultModelColor={defaultModelColor || undefined}
                  onTogglePrinted={(val) => handleModelUpdateParams({ ...model, isPrinted: val } as any)}
                />
              </div>

              {/* TABS */}
              <Tabs defaultValue="details" className="w-full">
                <TabsList className="w-full justify-start bg-transparent border-b rounded-none h-11 p-0 gap-8">
                  <TabsTrigger value="details" className="data-[state=active]:border-primary border-b-2 border-transparent rounded-none bg-transparent px-1 h-full font-bold text-xs uppercase tracking-wider">Details</TabsTrigger>
                  <TabsTrigger value="related" className="data-[state=active]:border-primary border-b-2 border-transparent rounded-none bg-transparent px-1 h-full font-bold text-xs uppercase tracking-wider">Related Files</TabsTrigger>
                  <TabsTrigger value="siblings" className="data-[state=active]:border-primary border-b-2 border-transparent rounded-none bg-transparent px-1 h-full font-bold text-xs uppercase tracking-wider">Collection</TabsTrigger>
                  <TabsTrigger value="notes" className="data-[state=active]:border-primary border-b-2 border-transparent rounded-none bg-transparent px-1 h-full font-bold text-xs uppercase tracking-wider">Notes</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="pt-6">
                  <DescriptionSection_DB
                    isEditing={editLogic.isEditing}
                    currentModel={activeModel as any}
                    originalUserDefinedDescriptionRef={editLogic.originalUserDefinedDescriptionRef}
                    originalTopLevelDescriptionRef={editLogic.originalTopLevelDescriptionRef}
                    restoreOriginalDescription={editLogic.restoreOriginalDescription}
                    setRestoreOriginalDescription={editLogic.setRestoreOriginalDescription}
                    setEditedModel={editLogic.setEditedModel as any}
                    editedModel={editLogic.editedModel as any}
                    onModelUpdate={(updated) => handleModelUpdateParams({ ...model, ...updated } as any)}
                  />
                </TabsContent>

                <TabsContent value="related" className="pt-6">
                  <RelatedFilesSection_DB
                    isEditing={editLogic.isEditing}
                    currentModel={activeModel as any}
                    active3DFile={galleryLogic.active3DFile}
                    setActive3DFile={galleryLogic.setActive3DFile}
                    relatedVerifyStatus={relatedVerifyStatus}
                    setRelatedVerifyStatus={setRelatedVerifyStatus}
                    invalidRelated={editLogic.invalidRelated as any}
                    serverRejectedRelated={[]} // Not using currently
                    onModelUpdate={handleModelUpdateParams as any}
                    onNavigate={onSelectModel as any}
                    triggerDownload={triggerDownload_db}
                    availableRelatedMunchie={relatedLogic.availableRelatedMunchie}
                    detailsViewportRef={detailsViewportRef}
                    toast={toast}
                    handleViewDocument={galleryLogic.handleViewDocument}
                    handleTargetedUpload={uploadLogic.handleTargetedUpload}
                    onAnalyze={gcodeLogic.handleReanalyzeGcode}
                  />
                </TabsContent>

                <TabsContent value="siblings" className="pt-6">
                  <SiblingsSection_DB
                    siblings={siblingsLogic.siblings}
                    onNavigate={(id) => {
                      const target = models.find(m => m.id === id);
                      if (target) onSelectModel(target);
                    }}
                    detailsViewportRef={detailsViewportRef}
                  />
                </TabsContent>

                <TabsContent value="notes" className="pt-6">
                  <NotesSection_DB
                    currentModel={model as any}
                    onSave={(newNotes) => handleModelUpdateParams({ ...model, notes: newNotes } as any)}
                  />
                </TabsContent>
              </Tabs>
            </div>

            {/* RIGHT COLUMN */}
            <aside className="lg:col-span-5 space-y-6">
              {!editLogic.isEditing && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button onClick={() => setIsAddToCollectionOpen(true)} variant="outline" size="sm" className="justify-start gap-2 bg-card hover:bg-accent" disabled={!collections || collections.length === 0}>
                    <List className="h-4 w-4" /> Add to Collection
                  </Button>
                  <Button onClick={() => setIsRemoveFromCollectionOpen(true)} variant="outline" size="sm" className="justify-start gap-2 bg-card hover:bg-accent" disabled={!collections.some(c => c.modelIds?.includes(model.id))}>
                    <MinusCircle className="h-4 w-4" /> Remove from Collection
                  </Button>
                </div>
              )}

              <section className="bg-card border rounded-2xl p-6 shadow-sm space-y-6">
                <PrintSettingsSection_DB currentModel={activeModel as any} safePrintSettings={safePrintSettings} />
                <div className="mt-6 pt-6 border-t">
                  <GcodeSection_DB
                    currentModel={activeModel as any}
                    isEditing={editLogic.isEditing}
                    gcodeInputRef={gcodeLogic.gcodeInputRef}
                    isUploadingGcode={gcodeLogic.isUploadingGcode}
                    handleGcodeUpload={gcodeLogic.handleGcodeUpload}
                    handleReanalyzeGcode={gcodeLogic.handleReanalyzeGcode}
                    isGcodeExpanded={gcodeLogic.isGcodeExpanded}
                    setIsGcodeExpanded={gcodeLogic.setIsGcodeExpanded}
                    handleGcodeDragOver={gcodeLogic.handleGcodeDragOver}
                    handleGcodeDrop={gcodeLogic.handleGcodeDrop}
                  />
                </div>
              </section>

              <section className="bg-card border rounded-2xl p-6 shadow-sm space-y-6">
                <MetadataSection_DB
                  isEditing={editLogic.isEditing}
                  canHavePrintSettings={canHavePrintSettings}
                  editedModel={editLogic.editedModel as any}
                  setEditedModel={editLogic.setEditedModel as any}
                  categories={categories}
                  isKnownLicense={isKnownLicense}
                  LICENSES={LICENSES}
                  onLocalUpdate={handleLocalUpdate as any}
                />
                {!editLogic.isEditing && (
                  <div className="space-y-6">
                    <TagsSection_DB
                      isEditing={editLogic.isEditing}
                      currentModel={model as any}
                      editedModel={null} // Not used in view
                      setEditedModel={() => { }} // Not used
                      getSuggestedTags={() => []} // Not used in view
                      handleSuggestedTagClick={() => { }}
                    />
                    <SourceSection_DB
                      isEditing={false}
                      currentModel={model as any}
                      editedModel={null}
                      setEditedModel={() => { }}
                    />
                  </div>
                )}
                {editLogic.isEditing && (
                  <div className="space-y-6">
                    {/* Tags Section Edit Mode */}
                    <TagsSection_DB
                      isEditing={true}
                      currentModel={activeModel as any} // editedModel
                      editedModel={editLogic.editedModel as any}
                      setEditedModel={editLogic.setEditedModel as any}
                      getSuggestedTags={getSuggestedTags}
                      handleSuggestedTagClick={handleSuggestedTagClick}
                    />
                    <SourceSection_DB
                      isEditing={true}
                      currentModel={activeModel as any}
                      editedModel={editLogic.editedModel as any}
                      setEditedModel={editLogic.setEditedModel as any}
                      onValidationChange={setIsSourceValid}
                    />
                  </div>
                )}
              </section>
            </aside>
          </div>
          <div className="h-32" />
        </div>
      </ScrollArea>

      {/* FLOATING ACTION BAR */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-fit px-4 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 p-2 bg-background/70 backdrop-blur-2xl border border-white/20 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.4)] rounded-2xl animate-in slide-in-from-bottom-6 duration-700">
          <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 h-11 w-11 rounded-xl transition-colors" onClick={handleDeleteClick}>
            <Trash2 className="h-5 w-5" />
          </Button>

          <Button variant="ghost" size="icon"
            className={`h-11 w-11 rounded-xl transition-all ${editLogic.isEditing ? 'bg-primary text-primary-foreground' : ''}`}
            onClick={() => editLogic.isEditing ? editLogic.cancelEditing() : editLogic.startEditing()}
          >
            <Edit3 className="h-5 w-5" />
          </Button>

          <Button variant="ghost" size="icon"
            className={`h-11 w-11 rounded-xl transition-all ${activeModel.hidden ? 'text-orange-500' : ''}`}
            onClick={handleToggleHide}
          >
            {activeModel.hidden ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
          </Button>

          <Separator orientation="vertical" className="h-8 mx-1 bg-border/50" />

          <Button className="h-11 px-8 rounded-xl bg-primary text-primary-foreground hover:shadow-[0_0_20px_rgba(var(--primary),0.4)] transition-all font-bold tracking-tight gap-2"
            onClick={handleDownloadAll}
          >
            <Download className="h-5 w-5" /> <span>Download All</span>
          </Button>

          {editLogic.isEditing && (
            <div className="flex items-center gap-1 animate-in fade-in slide-in-from-left-2 duration-200">
              <div className="h-4 w-px bg-border mx-1" />
              <Button variant="ghost" size="sm" disabled={editLogic.isSaving}
                className="h-8 px-2 text-[10px] font-bold uppercase text-muted-foreground hover:text-destructive"
                onClick={editLogic.cancelEditing}
              >
                Cancel
              </Button>
              <Button variant="default" size="sm" disabled={editLogic.invalidRelated.length > 0 || editLogic.isSaving || !isSourceValid}
                className="h-8 px-3 text-[10px] font-black uppercase bg-primary shadow-lg shadow-primary/20 transition-all"
                onClick={editLogic.saveChanges}
              >
                {editLogic.isSaving ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                {editLogic.isSaving ? 'Committing...' : 'Commit_Changes'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* DIALOGS */}
      {isAddToCollectionOpen && model && (
        <AddToCollectionDialog
          modelId={model.id}
          collections={collections}
          onClose={() => setIsAddToCollectionOpen(false)}
          updateCollection={updateCollection}
        />
      )}
      {isRemoveFromCollectionOpen && model && (
        <RemoveFromCollectionDialog
          modelId={model.id}
          collections={collections}
          onClose={() => setIsRemoveFromCollectionOpen(false)}
          updateCollection={updateCollection}
        />
      )}

      {model && (
        <ModelUploadDialog_DB
          isOpen={isAssetDialogOpen}
          onClose={() => setIsAssetDialogOpen(false)}
          initialFolder={(model as any).filePath}
          targetModel={model as any}
          onIsMovingChange={setIsMoving}
          onUploaded={(updatedModel) => handleModelUpdateParams((updatedModel || model) as any)}
        />
      )}

      <AlertDialog open={gcodeLogic.gcodeOverwriteDialog.open} onOpenChange={(open) => !open && gcodeLogic.setGcodeOverwriteDialog({ open: false, file: null, existingPath: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite existing G-code?</AlertDialogTitle>
            <AlertDialogDescription>{gcodeLogic.gcodeOverwriteDialog.existingPath}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => gcodeLogic.handleGcodeUpload(gcodeLogic.gcodeOverwriteDialog.file!, true)}>Overwrite</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete <strong>{activeModel.name}</strong>.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive" onClick={confirmDelete}>Delete Model</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

// Updated Dialogs using Mutation Hook
function AddToCollectionDialog({ modelId, collections, onClose, updateCollection }: { modelId: string, collections: Collection[], onClose: () => void, updateCollection: any }) {
  const [target, setTarget] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-4">Add to Collection</h3>
        <div className="space-y-4">
          <SearchableSelect_DB
            value={target || ''}
            onValueChange={setTarget}
            placeholder="Select a collection"
            options={collections.map(c => ({ value: c.id, label: c.name || 'Unnamed' }))}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button disabled={!target || updateCollection.isPending} onClick={() => {
              const col = collections.find(c => c.id === target);
              if (!col) return;
              const nextIds = Array.from(new Set([...(col.modelIds || []), modelId]));

              updateCollection.mutate({
                id: col.id,
                data: { modelIds: nextIds }
              }, {
                onSuccess: () => onClose()
              });
            }}>Add</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RemoveFromCollectionDialog({ modelId, collections, onClose, updateCollection }: { modelId: string, collections: Collection[], onClose: () => void, updateCollection: any }) {
  const [target, setTarget] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-4 text-destructive">Remove from Collection</h3>
        <div className="space-y-4">
          <SearchableSelect_DB
            value={target || ''}
            onValueChange={setTarget}
            placeholder="Select a collection"
            options={collections.filter(c => c.modelIds?.includes(modelId)).map(c => ({ value: c.id, label: c.name || 'Unnamed' }))}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="destructive" disabled={!target || updateCollection.isPending} onClick={() => {
              const col = collections.find(c => c.id === target);
              if (!col) return;
              const nextIds = (col.modelIds || []).filter(id => id !== modelId);

              updateCollection.mutate({
                id: col.id,
                data: { modelIds: nextIds }
              }, {
                onSuccess: () => onClose()
              });
            }}>Remove</Button>
          </div>
        </div>
      </div>
    </div>
  );
}