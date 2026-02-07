import { useEffect, useMemo, useRef, useState } from "react";
import { LICENSES, isKnownLicense } from '../constants/licenses';
import { Category } from "../types/category";
import { Model } from "../types/model";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Separator } from "./ui/separator";

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
import type { Collection } from "../types/collection";
import { downloadAllFiles, triggerDownload } from "../utils/downloadUtils";
import { DescriptionSection } from './DescriptionSection';
import { GcodeSection } from './GcodeSection';
import { MetadataSection } from './MetadataSection';
import { ModelPreviewSection } from './ModelPreviewSection';
import { ModelUploadDialog } from "./ModelUploadDialog";
import { NotesSection } from './NotesSection';
import { PrintSettingsSection } from "./PrintSettingsSection";
import { RelatedFilesSection } from './RelatedFilesSection';
import { SiblingsSection } from "./SiblingsSection";
import { SourceSection } from "./SourceSection";
import { TagsSection } from "./TagsSection";

// Hooks
import { useDocumentUpload } from "../hooks/hub/useDocumentUpload";
import { useGcodeHandler } from "../hooks/hub/useGcodeHandler";
import { useModelEdit } from "../hooks/hub/useModelEdit";
import { useModelGallery } from "../hooks/hub/useModelGallery";
import { useRelatedFiles } from "../hooks/hub/useRelatedFiles";
import { useSiblings } from "../hooks/hub/useSiblings";

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
}

export function ModelHubView({
  model,
  models,
  onClose,
  onModelUpdate,
  onDelete,
  defaultModelView,
  defaultModelColor,
  categories,
  onOpenCollection,
  collections,
}: ModelHubViewProps) {

  // -- HOOKS --
  const editLogic = useModelEdit({ model, onModelUpdate });
  const galleryLogic = useModelGallery({
    model,
    editedModel: editLogic.editedModel,
    isEditing: editLogic.isEditing,
    inlineCombined: editLogic.inlineCombined,
    defaultModelView
  });
  const gcodeLogic = useGcodeHandler({ currentModel: model, onModelUpdate });
  const uploadLogic = useDocumentUpload(model, onModelUpdate);
  const siblingsLogic = useSiblings(model, collections, models);
  const relatedLogic = useRelatedFiles(model, editLogic.isEditing);

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
    const existing = new Set((activeModelNullable.tags || []).map(t => t.toLowerCase()));
    return suggestedTags.filter((tag: string) => !existing.has(tag.toLowerCase()));
  };

  const handleSuggestedTagClick = (tag: string) => {
    if (!editLogic.editedModel) return;
    const currentTags = editLogic.editedModel.tags || [];
    const lowerTag = tag.toLowerCase();
    if (currentTags.some(t => t.toLowerCase() === lowerTag)) return;

    editLogic.setEditedModel({
      ...editLogic.editedModel,
      tags: [...currentTags, tag]
    });
  };

  // Visibility Toggle
  const handleToggleHide = async () => {
    if (!activeModelNullable || !model) return; // Need base model for ID
    const newHiddenStatus = !activeModelNullable.hidden;

    try {
      const response = await fetch('/api/save-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: activeModelNullable.filePath,
          id: activeModelNullable.id,
          changes: { hidden: newHiddenStatus }
        })
      });

      if (response.ok) {
        // If editing, update local state
        if (editLogic.isEditing && editLogic.editedModel) {
          editLogic.setEditedModel({ ...editLogic.editedModel, hidden: newHiddenStatus });
        }
        // Always update parent
        onModelUpdate({ ...model, hidden: newHiddenStatus });
        toast.success(newHiddenStatus ? "Model hidden" : "Model visible");
      } else {
        toast.error("Failed to update visibility");
      }
    } catch (error) {
      toast.error("Network error updating visibility");
    }
  };

  const handleDeleteClick = () => setIsDeleteConfirmOpen(true);

  const confirmDelete = () => {
    if (onDelete && model) {
      onDelete(model);
      setIsDeleteConfirmOpen(false);
      onClose();
    }
  };

  // Download Logic
  const handleDownloadAll = () => {
    if (activeModelNullable) {
      const toRelative = (p: string) => p ? p.replace(/^(\/)?models\//, '') : '';
      const mainPath = toRelative(activeModelNullable.modelUrl || activeModelNullable.filePath || '');
      const relatedPaths = (activeModelNullable.related_files || []).map(p => toRelative(p));

      if (!mainPath) {
        toast.error("Could not determine main file path.");
        return;
      }
      downloadAllFiles(mainPath, relatedPaths, activeModelNullable.name);
    }
  };

  // Local Update Helper for MetadataSection
  const handleLocalUpdate = (updates: Partial<Model>) => {
    editLogic.setEditedModel(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...updates };
      if (updates.printSettings) {
        next.printSettings = { ...(prev.printSettings || {}), ...updates.printSettings };
      }
      if (updates.userDefined) {
        next.userDefined = { ...(prev.userDefined || {}), ...updates.userDefined };
      }
      return next as Model;
    });
  };

  // Render Check
  if (!model || !activeModelNullable) return null;
  const activeModel = activeModelNullable; // Safe now

  // Derive display stuff
  const safePrintSettings = {
    layerHeight: activeModel.printSettings?.layerHeight || activeModel.userDefined?.printSettings?.layerHeight || 'Unknown',
    infill: activeModel.printSettings?.infill || activeModel.userDefined?.printSettings?.infill || 'Unknown',
    nozzle: activeModel.printSettings?.nozzle || activeModel.userDefined?.printSettings?.nozzle || 'Unknown',
    printer: activeModel.printSettings?.printer || 'Unknown',
    material: activeModel.printSettings?.material || activeModel.userDefined?.printSettings?.material || 'Unknown'
  };

  const isStlModel = (() => {
    try {
      const p = (activeModel.filePath || activeModel.modelUrl || '').toLowerCase();
      return p.endsWith('.stl') || p.endsWith('-stl-munchie.json');
    } catch (_) { return false; }
  })();

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* HEADER */}
      <div className="px-4 lg:px-6 py-3 border-b bg-card/30 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onClose} className="gap-2 h-8 text-[11px] font-bold uppercase tracking-wider">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="h-4 w-px bg-border mx-1" />
          <div
            className="flex items-center gap-2 cursor-pointer group"
            onClick={() => activeCollection && onOpenCollection?.(activeCollection)}
          >
            <Layers className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="text-sm font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
              {activeCollection?.name || "Library"}
            </span>
            {activeModel.category && (
              <span className="text-[10px] text-muted-foreground/50 font-bold uppercase tracking-wider group-hover:text-muted-foreground transition-colors">
                {activeModel.category}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!editLogic.isEditing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-2 opacity-50 hover:opacity-100"
              disabled={isMoving}
              onClick={() => setIsAssetDialogOpen(true)}
            >
              {isMoving ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" /> : <Upload className="h-3.5 w-3.5" />}
              <span>{isMoving ? "Reorganizing..." : "Manage / Upload"}</span>
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
                <ModelPreviewSection
                  // Gallery State
                  viewMode={galleryLogic.viewMode}
                  setViewMode={galleryLogic.setViewMode}
                  currentModel={activeModel}
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
                  onTogglePrinted={(val) => onModelUpdate({ ...model, isPrinted: val })}
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
                  <DescriptionSection
                    isEditing={editLogic.isEditing}
                    currentModel={activeModel}
                    originalUserDefinedDescriptionRef={editLogic.originalUserDefinedDescriptionRef}
                    originalTopLevelDescriptionRef={editLogic.originalTopLevelDescriptionRef}
                    restoreOriginalDescription={editLogic.restoreOriginalDescription}
                    setRestoreOriginalDescription={editLogic.setRestoreOriginalDescription}
                    setEditedModel={editLogic.setEditedModel}
                    editedModel={editLogic.editedModel}
                    onModelUpdate={(updated) => onModelUpdate({ ...model, ...updated })}
                  />
                </TabsContent>

                <TabsContent value="related" className="pt-6">
                  <RelatedFilesSection
                    isEditing={editLogic.isEditing}
                    currentModel={activeModel}
                    editedModel={editLogic.editedModel}
                    setEditedModel={editLogic.setEditedModel}
                    active3DFile={galleryLogic.active3DFile}
                    setActive3DFile={galleryLogic.setActive3DFile}
                    setFocusRelatedIndex={setFocusRelatedIndex}
                    relatedVerifyStatus={relatedVerifyStatus}
                    setRelatedVerifyStatus={setRelatedVerifyStatus}
                    invalidRelated={editLogic.invalidRelated}
                    serverRejectedRelated={[]} // Not using currently
                    onModelUpdate={onModelUpdate}
                    triggerDownload={triggerDownload}
                    deriveMunchieCandidate={relatedLogic.deriveMunchieCandidate}
                    availableRelatedMunchie={relatedLogic.availableRelatedMunchie}
                    detailsViewportRef={detailsViewportRef}
                    toast={toast}
                    handleViewDocument={galleryLogic.handleViewDocument}
                    handleTargetedUpload={uploadLogic.handleTargetedUpload}
                  />
                </TabsContent>

                <TabsContent value="siblings" className="pt-6">
                  <SiblingsSection
                    siblings={siblingsLogic.siblings}
                    onModelUpdate={onModelUpdate}
                    detailsViewportRef={detailsViewportRef}
                  />
                </TabsContent>

                <TabsContent value="notes" className="pt-6">
                  <NotesSection
                    currentModel={model}
                    onSave={(newNotes) => onModelUpdate({ ...model, notes: newNotes })}
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
                <PrintSettingsSection currentModel={activeModel} safePrintSettings={safePrintSettings} />
                <div className="mt-6 pt-6 border-t">
                  <GcodeSection
                    currentModel={activeModel}
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
                <MetadataSection
                  isEditing={editLogic.isEditing}
                  isStlModel={isStlModel}
                  editedModel={editLogic.editedModel}
                  setEditedModel={editLogic.setEditedModel}
                  categories={categories}
                  isKnownLicense={isKnownLicense}
                  LICENSES={LICENSES}
                  onLocalUpdate={handleLocalUpdate}
                />
                {!editLogic.isEditing && (
                  <div className="space-y-6">
                    <TagsSection
                      isEditing={editLogic.isEditing}
                      currentModel={model}
                      editedModel={null} // Not used in view
                      setEditedModel={() => { }} // Not used
                      getSuggestedTags={() => []} // Not used in view
                      handleSuggestedTagClick={() => { }}
                    />
                    <SourceSection
                      isEditing={false}
                      currentModel={model}
                      editedModel={null}
                      setEditedModel={() => { }}
                    />
                  </div>
                )}
                {editLogic.isEditing && (
                  <div className="space-y-6">
                    {/* Tags Section Edit Mode */}
                    <TagsSection
                      isEditing={true}
                      currentModel={activeModel} // editedModel
                      editedModel={editLogic.editedModel}
                      setEditedModel={editLogic.setEditedModel}
                      getSuggestedTags={getSuggestedTags}
                      handleSuggestedTagClick={handleSuggestedTagClick}
                    />
                    <SourceSection
                      isEditing={true}
                      currentModel={activeModel}
                      editedModel={editLogic.editedModel}
                      setEditedModel={editLogic.setEditedModel}
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
              <Button variant="default" size="sm" disabled={editLogic.invalidRelated.length > 0 || editLogic.isSaving}
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
        <AddToCollectionDialog modelId={model.id} collections={collections} onClose={() => setIsAddToCollectionOpen(false)} />
      )}
      {isRemoveFromCollectionOpen && model && (
        <RemoveFromCollectionDialog modelId={model.id} collections={collections} onClose={() => setIsRemoveFromCollectionOpen(false)} />
      )}

      {model && (
        <ModelUploadDialog
          isOpen={isAssetDialogOpen}
          onClose={() => setIsAssetDialogOpen(false)}
          initialFolder={model.filePath}
          targetModel={model}
          onIsMovingChange={setIsMoving}
          onUploaded={(updatedModel) => onModelUpdate(updatedModel || model)}
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

function AddToCollectionDialog({ modelId, collections, onClose }: { modelId: string, collections: Collection[], onClose: () => void }) {
  const [target, setTarget] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-4">Add to Collection</h3>
        <div className="space-y-4">
          <Select value={target || ''} onValueChange={setTarget}>
            <SelectTrigger><SelectValue placeholder="Select a collection" /></SelectTrigger>
            <SelectContent>
              {collections.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button disabled={!target} onClick={async () => {
              const col = collections.find(c => c.id === target);
              if (!col) return;
              const nextIds = Array.from(new Set([...(col.modelIds || []), modelId]));
              const resp = await fetch('/api/collections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...col, modelIds: nextIds })
              });
              if (resp.ok) {
                toast.success('Added to collection');
                onClose();
              }
            }}>Add</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RemoveFromCollectionDialog({ modelId, collections, onClose }: { modelId: string, collections: Collection[], onClose: () => void }) {
  const [target, setTarget] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-4 text-destructive">Remove from Collection</h3>
        <div className="space-y-4">
          <Select value={target || ''} onValueChange={setTarget}>
            <SelectTrigger><SelectValue placeholder="Select a collection" /></SelectTrigger>
            <SelectContent>
              {collections.filter(c => c.modelIds?.includes(modelId)).map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="destructive" disabled={!target} onClick={async () => {
              const col = collections.find(c => c.id === target);
              if (!col) return;
              const nextIds = (col.modelIds || []).filter(id => id !== modelId);
              const resp = await fetch('/api/collections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...col, modelIds: nextIds })
              });
              if (resp.ok) {
                toast.success('Removed from collection');
                onClose();
              }
            }}>Remove</Button>
          </div>
        </div>
      </div>
    </div>
  );
}