import { useState, useEffect, useRef, useMemo } from "react";
import { Model } from "../types/model";
import { Category } from "../types/category";
import { ScrollArea } from "./ui/scroll-area";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { LICENSES, isKnownLicense } from '../constants/licenses';
import { Separator } from "./ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "./ui/alert-dialog";

import { compressImageFile } from "../utils/imageUtils";

import {
  Edit3, List, MinusCircle, Trash2,
  ArrowLeft, Eye, EyeOff, Sidebar,
  Upload, Layers,
  RefreshCw,
  Save
} from "lucide-react";
import { Download } from "lucide-react";
import { toast } from 'sonner';
import type { Collection } from "../types/collection";
import { triggerDownload, normalizeModelPath } from "../utils/downloadUtils";
import { downloadAllFiles } from '../utils/downloadUtils';
import { GcodeSection } from './GcodeSection';
import { MetadataSection } from './MetadataSection';
import { RelatedFilesSection } from './RelatedFilesSection'
import { DescriptionSection } from './DescriptionSection';
import { NotesSection } from './NotesSection';
import { SourceSection } from "./SourceSection";
import { ModelPreviewSection } from './ModelPreviewSection';
import { PrintSettingsSection } from "./PrintSettingsSection";
import { SiblingsSection } from "./SiblingsSection";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@radix-ui/react-tabs";
import { TagsSection } from "./TagsSection";
import { FilterSidebar } from "./FilterSidebar";
import { AppConfig } from "../types/config";
import { ProjectFolderDialog } from "./ProjectFolderDialog";
import { ModelUploadDialog } from "./ModelUploadDialog";




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
  config: AppConfig | null;
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
  config,
  isSidebarOpen,
  onOpenCollection,
  onFilterChange,
  onSettingsClick,
  collections,
}: ModelHubViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedModel, setEditedModel] = useState<Model | null>(null);
  const [invalidRelated, setInvalidRelated] = useState<string[]>([]);
  const [serverRejectedRelated, setServerRejectedRelated] = useState<string[]>([]);
  const [relatedVerifyStatus, setRelatedVerifyStatus] = useState<Record<number, { loading: boolean; ok?: boolean; message?: string }>>({});
  // Track whether a related file has an associated munchie JSON we can view
  const [availableRelatedMunchie, setAvailableRelatedMunchie] = useState<Record<number, boolean>>({});
  const detailsViewportRef = useRef<HTMLDivElement | null>(null);
  // Tag input state now managed by shared TagsInput
  const [focusRelatedIndex, setFocusRelatedIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'3d' | 'images' | 'doc'>(defaultModelView || 'images');
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const [restoreOriginalDescription, setRestoreOriginalDescription] = useState(false);
  const originalTopLevelDescriptionRef = useRef<string | null>(null);
  const originalUserDefinedDescriptionRef = useRef<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Add-to-Collection UI state
  const [isAddToCollectionOpen, setIsAddToCollectionOpen] = useState(false);
  const [addTargetCollectionId, setAddTargetCollectionId] = useState<string | null>(null);
  // Remove-from-Collection UI state
  const [isRemoveFromCollectionOpen, setIsRemoveFromCollectionOpen] = useState(false);
  const [removeTargetCollectionId, setRemoveTargetCollectionId] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // [NEW] State for siblings logic
  const [allModelsForSiblings, setAllModelsForSiblings] = useState<Model[]>([]);

  // 1. Add a hidden ref for the file input
  const [isProjectFolderOpen, setIsProjectFolderOpen] = useState(false);
  const [activeDocUrl, setActiveDocUrl] = useState<string | null>(null);

  const activeCollection = useMemo(() => {
    if (!model) return null;
    return collections.find(c => c.modelIds?.includes(model.id));
  }, [collections, model]);

  // 2. Sidebar Toggle State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // // Printer Integration UI state
  // const [availablePrinters, setAvailablePrinters] = useState<any[]>([]);
  // const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  // const [isSending, setIsSending] = useState(false);

  // // [INSERT NEW STATE]
  // interface PrinterStatus {
  //   index: number;
  //   name: string;
  //   type: string;
  //   status: string;
  // }

  // G-code upload state
  const gcodeInputRef = useRef<HTMLInputElement>(null);
  const [isGcodeExpanded, setIsGcodeExpanded] = useState(false);
  const [isUploadingGcode, setIsUploadingGcode] = useState(false);
  const [gcodeOverwriteDialog, setGcodeOverwriteDialog] = useState<{ open: boolean; file: File | null; existingPath: string }>({
    open: false,
    file: null,
    existingPath: ''
  });

  const handleViewDocument = (url: string) => {
    setActiveDocUrl(url);
    setViewMode('doc');
  };

  // 2. The Upload Handler
  const handleTargetedUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !model || files.length === 0) return;

    const formData = new FormData();
    formData.append('file', files[0]); // Start with single file for stability
    formData.append('modelId', model.id);
    formData.append('filePath', model.filePath);

    try {
      toast.loading("Uploading to project folder...");
      const resp = await fetch('/api/models/upload-document', {
        method: 'POST',
        body: formData
      });
      const result = await resp.json();
      if (result.success) {
        toast.success("Document added to project.");
        onModelUpdate(result.model); // Refresh the UI immediately
      }
    } catch (err) {
      toast.error("Upload failed.");
    }
  };

  // Track which file is being viewed in 3D (Main vs Related)
  const [active3DFile, setActive3DFile] = useState<string | null>(null);

  const currentModel = editedModel || model;
  const [isAssetDialogOpen, setIsAssetDialogOpen] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    if (!model) return;
    // We no longer need to fetch /api/collections here 
    // because App.tsx passes them in via props.
  }, [model?.id]);

  // [NEW] Fetch all models for siblings logic
  useEffect(() => {
    // If we don't have a model or we already have data, skip
    if (!model || allModelsForSiblings.length > 0) return;

    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setAllModelsForSiblings(data);
      })
      .catch(err => console.warn("Failed to load models for siblings", err));
  }, [model?.id]); // Trigger on model change

  // [NEW] Compute Siblings
  const siblings = useMemo(() => {
    if (!model || !collections.length) return [];
    const parentCollections = collections.filter(c => c.modelIds?.includes(model.id));
    if (parentCollections.length === 0) return [];

    const siblingIds = new Set<string>();
    parentCollections.forEach(c => {
      c.modelIds.forEach(id => { if (id !== model.id) siblingIds.add(id); });
    });

    return models.filter(m => siblingIds.has(m.id));
  }, [model, collections, models]);

  const handleDownloadAll = () => {
    if (currentModel) {
      // Helper to strip '/models/' prefix for the API
      const toRelative = (p: string) => p ? p.replace(/^(\/)?models\//, '') : '';

      // Prefer modelUrl (the actual binary) over filePath (often the json)
      const mainPath = toRelative(currentModel.modelUrl || currentModel.filePath || '');
      const relatedPaths = (currentModel.related_files || []).map(p => toRelative(p));

      if (!mainPath) {
        toast.error("Could not determine main file path.");
        return;
      }

      downloadAllFiles(mainPath, relatedPaths, currentModel.name);
    }
  };


  // Suggested tags for each category - now dynamically based on current categories
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

  // Combined Model Reset Logic
  useEffect(() => {
    if (model) {
      const has3D = !!(model.modelUrl || model.filePath);
      const preferredMode = defaultModelView === '3d' && !has3D ? 'images' : defaultModelView;

      const setting = defaultModelView || 'images';
      const resolvedMode = (setting === '3d' && !has3D) ? 'images' : setting;
      setSelectedImageIndex(0);

      const rawPath = model.modelUrl || model.filePath;
      setActive3DFile(normalizeModelPath(rawPath));

      setIsEditing(false);
      setEditedModel(null);
      setSelectedImageIndexes([]);
    }
  }, [model?.id, defaultModelView]); // Adding defaultModelView here is key

  // Helper to derive the munchie json path for a related file path
  const deriveMunchieCandidate = (raw: string) => {
    let candidate = raw || '';
    try {
      // G-code files (.gcode and .gcode.3mf) don't have munchie JSON files
      if (candidate.endsWith('.gcode') || candidate.endsWith('.gcode.3mf')) {
        return null;
      }

      if (candidate.endsWith('.3mf')) {
        candidate = candidate.replace(/\.3mf$/i, '-munchie.json');
      } else if (/\.stl$/i.test(candidate)) {
        candidate = candidate.replace(/\.stl$/i, '-stl-munchie.json');
      } else {
        // For any other file type, don't try to find a munchie file
        return null;
      }
      // strip leading /models/ if present
      if (candidate.startsWith('/models/')) candidate = candidate.replace(/^\/models\//, '');
      if (candidate.startsWith('models/')) candidate = candidate.replace(/^models\//, '');
    } catch (e) {
      // ignore and return as-is
      return null;
    }
    return candidate;
  };

  // Probe for munchie JSON existence for related files when in view mode
  useEffect(() => {
    if (isEditing) return;
    const rel = model?.related_files || [];
    if (!Array.isArray(rel) || rel.length === 0) return;

    let cancelled = false;
    (async () => {
      const map: Record<number, boolean> = {};
      await Promise.all(rel.map(async (p: string, idx: number) => {
        try {
          const candidate = deriveMunchieCandidate(p);
          // If no munchie candidate (e.g., .gcode files), mark as unavailable
          if (!candidate) {
            map[idx] = false;
            return;
          }
          const url = `/models/${candidate}`;
          // Try a HEAD first to minimize payload; fall back to GET if not allowed
          const resp = await fetch(url, { method: 'HEAD', cache: 'no-store' });
          map[idx] = resp.ok;
        } catch (e) {
          try {
            // Fallback to GET check
            const candidate = deriveMunchieCandidate(p);
            if (!candidate) {
              map[idx] = false;
              return;
            }
            const resp2 = await fetch(`/models/${candidate}`, { method: 'GET', cache: 'no-store' });
            map[idx] = resp2.ok;
          } catch (e2) {
            map[idx] = false;
          }
        }
      }));
      if (!cancelled) setAvailableRelatedMunchie(map);
    })();
    return () => { cancelled = true; };
  }, [isEditing, model?.related_files]);



  // In-window "fullscreen" (cover the browser viewport) for image previews
  const imageContainerRef = useRef<HTMLDivElement | null>(null);
  // Thumbnail strip container ref (used to programmatically scroll thumbnails into view)
  const thumbnailStripRef = useRef<HTMLDivElement | null>(null);
  const prevButtonRef = useRef<any>(null);
  const [isWindowFullscreen, setIsWindowFullscreen] = useState(false);
  // Ref mirror to synchronously track fullscreen state (avoids React state update race)
  const isWindowFullscreenRef = useRef<boolean>(false);
  // Hold a pending captured image if we need to start edit mode first
  const pendingCapturedImageRef = useRef<string | null>(null);

  const handleToggleFullscreen = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const next = !isWindowFullscreenRef.current;
    isWindowFullscreenRef.current = next;
    setIsWindowFullscreen(next);
  };

  // Exit fullscreen on Escape (keydown handler moved later, after allImages is defined)

  useEffect(() => {
    // Prevent background scrolling when in-window fullscreen is active
    const prev = document.body.style.overflow;
    if (isWindowFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = prev || '';
    }
    return () => {
      document.body.style.overflow = prev || '';
    };
  }, [isWindowFullscreen]);

  // Image selection state for edit mode (holds indexes into the gallery array)
  const [selectedImageIndexes, setSelectedImageIndexes] = useState<number[]>([]);

  const parsedImageCountRef = useRef<number>(0);

  const originalThumbnailExistsRef = useRef<boolean>(false);

  const parsedImagesSnapshotRef = useRef<string[]>([]);

  const [inlineCombined, setInlineCombined] = useState<string[] | null>(null);
  // Drag state for reordering thumbnails in edit mode
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // File input ref for adding new images in edit mode
  const addImageInputRef = useRef<HTMLInputElement | null>(null);

  // Handle clicking the add-image tile
  const handleAddImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditing) return;
    addImageInputRef.current?.click();
  };

  // Read selected files (multiple allowed), compress/resample and add as base64 data URLs
  const [addImageProgress, setAddImageProgress] = useState<{ processed: number; total: number } | null>(null);
  const [addImageError, setAddImageError] = useState<string | null>(null);

  const handleAddImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    setAddImageError(null);
    // Capture the input element synchronously because React may recycle the
    // synthetic event after an await (causing e.currentTarget to become null).
    const inputEl = e.currentTarget as HTMLInputElement;
    const files = inputEl.files ? Array.from(inputEl.files) : [];
    if (files.length === 0 || !editedModel) {
      // clear the input so the same file can be reselected later
      try { inputEl.value = ''; } catch (err) { /* ignore */ }
      return;
    }

    // Validate: reject very large files up front (e.g., > 20MB)
    const oversize = files.find(f => f.size > 20 * 1024 * 1024);
    if (oversize) {
      setAddImageError(`File ${oversize.name} is too large (>20MB).`);
      try { inputEl.value = ''; } catch (err) { /* ignore */ }
      return;
    }

    setAddImageProgress({ processed: 0, total: files.length });

    try {
      const newDataUrls: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Compress/resample to reasonable size
        const dataUrl = await compressImageFile(file, { maxWidth: 1600, maxHeight: 1600, maxSizeBytes: 800000 });
        newDataUrls.push(dataUrl);
        setAddImageProgress({ processed: i + 1, total: files.length });
      }

      // Apply to editedModel: store user-added images under userDefined.images and
      // update imageOrder descriptors so the new images are represented as
      // `user:<index>` tokens. Also update inlineCombined (UI-only ordering)
      // so new images appear at the end of the gallery in edit mode.
      setEditedModel(prev => {
        if (!prev) return prev;

        // Ensure userDefined is an object; use existing if present
        const udObj = (prev as any).userDefined && typeof (prev as any).userDefined === 'object'
          ? { ...(prev as any).userDefined }
          : {};

        // userDefined.images will hold user-added images (data URLs)
        const existingUserImages = Array.isArray(udObj.images) ? (udObj.images as any[]).slice() : [];

        // Append the new user images to the userDefined object
        const updatedUserImages = existingUserImages.concat(newDataUrls);

        // Get current imageOrder or build it
        const currentOrder = Array.isArray(udObj.imageOrder) ? (udObj.imageOrder as any[]).slice() : buildImageOrderFromModel(prev as Model);

        // Add descriptors for new user images
        const newUserDescriptors = newDataUrls.map((_, index) => `user:${existingUserImages.length + index}`);

        const updatedOrder = currentOrder.concat(newUserDescriptors);

        // Update userDefined with new images and order
        udObj.images = updatedUserImages;
        udObj.imageOrder = updatedOrder;

        // If no thumbnail is set and this is the first image, set it as thumbnail
        if ((!currentOrder.length || !udObj.thumbnail) && newUserDescriptors.length > 0) {
          udObj.thumbnail = newUserDescriptors[0]; // First added image becomes thumbnail
        }

        return { ...prev, userDefined: udObj } as Model;
      });

      // Update inlineCombined (UI) to reflect the appended items
      setInlineCombined(prev => {
        if (!prev) {
          // Build from current model using new structure
          const parsed = Array.isArray((editedModel as any)?.parsedImages) ? (editedModel as any).parsedImages : [];
          const existing = Array.isArray((editedModel as any)?.userDefined?.images)
            ? (editedModel as any).userDefined.images.map((u: any) => getUserImageData(u))
            : [];
          const base = [...parsed, ...existing];
          return base.concat(newDataUrls);
        }
        return [...prev, ...newDataUrls];
      });

      // Compute the index of the last item added in the gallery deterministically.
      // Gallery is constructed as: [top-level thumbnail, ...top-level images, ...userDefined.images]
      const parsedCount = parsedImageCountRef.current;
      // Count existing user images before this operation (use editedModel snapshot)
      const userImagesBefore = Array.isArray(((editedModel as any)?.userDefined?.images))
        ? (editedModel as any).userDefined.images.length
        : 0;
      const lastIndex = Math.max(0, parsedCount + userImagesBefore + newDataUrls.length - 1);
      setSelectedImageIndex(lastIndex);
    } catch (err: any) {
      console.error('Error adding images:', err);
      setAddImageError(String(err?.message || err));
    } finally {
      setAddImageProgress(null);
      try { inputEl.value = ''; } catch (err) { /* ignore */ }
    }
  };

  // Compute the full images array (thumbnail + additional images) from the
  // currently-displayed model. During edit mode prefer the in-edit
  // `inlineCombined` ordering when present so the UI can show arbitrary
  // placements; otherwise build from the model state.
  // Helper: extract data URL from userDefined image entry (supports legacy string and new object form)
  const getUserImageData = (entry: any) => {
    if (!entry) return '';
    if (typeof entry === 'string') return entry;
    if (typeof entry === 'object' && typeof entry.data === 'string') return entry.data;
    return '';
  };
  // Resolve a descriptor to actual image data for the new parsedImages structure
  const resolveDescriptorToData = (desc: string | undefined, m: Model): string | undefined => {
    if (!desc) return undefined;

    // Get parsedImages (new structure) or fall back to legacy
    const parsedImages = Array.isArray(m.parsedImages) ? m.parsedImages : [];
    const legacyImages = Array.isArray(m.images) ? m.images : [];
    const userArr = Array.isArray((m as any).userDefined?.images) ? (m as any).userDefined.images : [];

    if (desc.startsWith('parsed:')) {
      const idx = parseInt(desc.split(':')[1] || '', 10);
      // Try new structure first, then fall back to legacy
      if (!isNaN(idx)) {
        if (parsedImages[idx]) return parsedImages[idx];
        // For backward compatibility, check legacy structure
        if (idx === 0 && m.thumbnail) return m.thumbnail;
        if (legacyImages[idx - 1]) return legacyImages[idx - 1]; // offset by 1 since legacy had thumbnail separate
      }
      return undefined;
    }

    if (desc.startsWith('user:')) {
      const idx = parseInt(desc.split(':')[1] || '', 10);
      if (!isNaN(idx) && userArr[idx] !== undefined) return getUserImageData(userArr[idx]);
      return undefined;
    }

    // For backward compatibility, treat non-descriptor strings as literal data URLs
    return desc;
  };

  // Simplified image ordering resolution for new structure
  const resolveImageOrderToUrls = (m: Model) => {
    const order = Array.isArray((m as any).userDefined?.imageOrder) ? (m as any).userDefined.imageOrder : undefined;
    if (!m || !order || order.length === 0) return null;

    const urls: string[] = [];
    for (const desc of order) {
      if (typeof desc !== 'string') continue;
      const resolved = resolveDescriptorToData(desc, m);
      if (resolved) urls.push(resolved);
    }
    return urls.length > 0 ? urls : null;
  };

  // Simplified imageOrder builder for new structure
  const buildImageOrderFromModel = (m: Model) => {
    const result: string[] = [];
    if (!m) return result;

    // Use new parsedImages structure when available
    const parsedImages = Array.isArray(m.parsedImages) ? m.parsedImages : [];
    const userArr = Array.isArray((m as any).userDefined?.images) ? (m as any).userDefined.images : [];

    // Add parsed image descriptors
    for (let i = 0; i < parsedImages.length; i++) {
      result.push(`parsed:${i}`);
    }

    // Add user image descriptors
    for (let i = 0; i < userArr.length; i++) {
      result.push(`user:${i}`);
    }

    // For backward compatibility with legacy structure (when parsedImages doesn't exist)
    if (parsedImages.length === 0) {
      const legacyImages = Array.isArray(m.images) ? m.images : [];
      const thumbnail = m.thumbnail;

      // If there's a thumbnail, add it as parsed:0
      if (thumbnail) {
        result.push('parsed:0');
      }

      // Add legacy images as parsed:1, parsed:2, etc.
      for (let i = 0; i < legacyImages.length; i++) {
        result.push(`parsed:${i + (thumbnail ? 1 : 0)}`);
      }
    }

    return result;
  };

  const allImages = (() => {
    if (isEditing && inlineCombined) return inlineCombined.slice();
    const src = editedModel || model;
    if (!src) return [];

    // SIMPLIFIED: Use new parsedImages structure when available
    const parsedImages = Array.isArray(src.parsedImages) ? src.parsedImages : [];
    const userImages = Array.isArray((src as any).userDefined?.images)
      ? (src as any).userDefined.images.map((u: any) => getUserImageData(u))
      : [];

    // If we have custom image ordering, use it
    const resolved = resolveImageOrderToUrls(src as Model);
    if (resolved && resolved.length > 0) return resolved;

    // For new structure: parsedImages + userImages
    if (parsedImages.length > 0) {
      return [...parsedImages, ...userImages];
    }

    // Fallback to legacy structure for backward compatibility
    const legacyImages = Array.isArray(src.images) ? src.images : [];
    const thumbnail = src.thumbnail ? [src.thumbnail] : [];
    return [...thumbnail, ...legacyImages, ...userImages];
  })();

  // Key handling for in-window fullscreen navigation (Escape, ArrowLeft, ArrowRight)
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!isWindowFullscreen) return;

      if (ev.key === 'Escape') {
        // Close fullscreen but do not allow the Escape to bubble to the Sheet drawer
        ev.preventDefault();
        ev.stopPropagation();
        try { ev.stopImmediatePropagation(); } catch (e) { /* ignore */ }
        // update ref synchronously to avoid race with onOpenChange
        isWindowFullscreenRef.current = false;
        setIsWindowFullscreen(false);
        return;
      }

      if (ev.key === 'ArrowLeft') {
        ev.preventDefault();
        setSelectedImageIndex((prev) => (prev - 1 + allImages.length) % allImages.length);
        return;
      }

      if (ev.key === 'ArrowRight') {
        ev.preventDefault();
        setSelectedImageIndex((prev) => (prev + 1) % allImages.length);
        return;
      }
    };

    // Use capture phase so we intercept Escape before other handlers (like the Sheet's) that may close the drawer
    document.addEventListener('keydown', onKey, true);
    // Also intercept keyup in case other libraries (Radix) listen on keyup for Escape
    const onKeyUp = (ev: KeyboardEvent) => {
      if (!isWindowFullscreen) return;
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        try { ev.stopImmediatePropagation(); } catch (e) { /* ignore */ }
        // ensure ref is in sync
        isWindowFullscreenRef.current = false;
      }
    };
    document.addEventListener('keyup', onKeyUp, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('keyup', onKeyUp, true);
    };
  }, [isWindowFullscreen, allImages.length]);

  // Helper: is an image (by gallery index) selected for deletion
  const isImageSelected = (index: number) => selectedImageIndexes.includes(index);

  // Toggle selection (only in edit mode and not in fullscreen)
  const toggleImageSelection = (index: number) => {
    if (!isEditing || isWindowFullscreen) return;
    setSelectedImageIndexes(prev => {
      const set = new Set(prev);
      if (set.has(index)) set.delete(index);
      else set.add(index);
      return Array.from(set).sort((a, b) => a - b);
    });
  };

  // Drag handlers: only enable when editing and not fullscreen
  const handleDragStart = (e: React.DragEvent, sourceIndex: number) => {
    if (!isEditing || isWindowFullscreen) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', String(sourceIndex));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetIndex: number) => {
    if (!isEditing || isWindowFullscreen) return;
    e.preventDefault(); // allow drop
    setDragOverIndex(targetIndex);
  };

  const handleDragLeave = (_e: React.DragEvent) => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    if (!isEditing || isWindowFullscreen) return;
    e.preventDefault();
    const src = e.dataTransfer.getData('text/plain');
    if (!src) return setDragOverIndex(null);
    const sourceIndex = parseInt(src, 10);
    if (isNaN(sourceIndex)) return setDragOverIndex(null);
    if (!editedModel) return setDragOverIndex(null);
    // Reorder descriptors only. Determine the current descriptor array (imageOrder)
    // or build an initial one for legacy models.
    const currentDescriptors = Array.isArray((editedModel as any).userDefined?.imageOrder)
      ? (editedModel as any).userDefined.imageOrder.slice()
      : buildImageOrderFromModel(editedModel);

    // bounds check against descriptor length
    if (sourceIndex < 0 || sourceIndex >= currentDescriptors.length || targetIndex < 0 || targetIndex >= currentDescriptors.length) {
      setDragOverIndex(null);
      return;
    }

    // perform descriptor reordering (move source -> target)
    const descItem = currentDescriptors.splice(sourceIndex, 1)[0];
    currentDescriptors.splice(targetIndex, 0, descItem);
    // Determine if the new first descriptor references a user or parsed image
    // so we can persist it as userDefined.thumbnail (descriptor form).
    let firstDescriptor: string | undefined = undefined;
    if (currentDescriptors.length > 0 && typeof currentDescriptors[0] === 'string') {
      firstDescriptor = currentDescriptors[0] as string;
    }
    // Try to normalize a literal (non-descriptor) into a descriptor using
    // the current editedModel snapshot (prefer user images). We resolve the
    // effective first image using the reordered `currentDescriptors` so that
    // any index changes are accounted for.
    let normalizedThumbDescriptor: string | undefined = undefined;
    try {
      // Build a temporary userDefined object snapshot (new canonical shape)
      const tempUdObj = (editedModel as any).userDefined && typeof (editedModel as any).userDefined === 'object'
        ? { ...(editedModel as any).userDefined }
        : {};
      tempUdObj.imageOrder = currentDescriptors;
      const tempModelForResolve = { ...(editedModel as any), userDefined: tempUdObj } as Model;
      const resolvedUrls = resolveImageOrderToUrls(tempModelForResolve) || [];
      const firstUrl = resolvedUrls[0];
      if (firstUrl) {
        const parsedSnapshot = parsedImagesSnapshotRef.current || [];
        const userArr = Array.isArray((editedModel as any)?.userDefined?.images) ? (editedModel as any).userDefined.images : [];
        const uidx = userArr.findIndex((u: any) => getUserImageData(u) === firstUrl);
        if (uidx !== -1) normalizedThumbDescriptor = `user:${uidx}`;
        else {
          const pidx = parsedSnapshot.indexOf(firstUrl);
          if (pidx !== -1) normalizedThumbDescriptor = `parsed:${pidx}`;
        }
      } else if (firstDescriptor) {
        // If we couldn't resolve via order, fall back to heuristics using
        // the literal firstDescriptor value.
        if (/^(user:|parsed:)/.test(firstDescriptor)) {
          normalizedThumbDescriptor = firstDescriptor;
        } else {
          const parsed = Array.isArray(editedModel?.images) ? editedModel.images : [];
          const userArr = Array.isArray((editedModel as any)?.userDefined?.images) ? (editedModel as any).userDefined.images : [];
          const pidx = parsed.indexOf(firstDescriptor);
          if (pidx !== -1) normalizedThumbDescriptor = `parsed:${pidx}`;
          else {
            const uidx = userArr.findIndex((u: any) => getUserImageData(u) === firstDescriptor);
            if (uidx !== -1) normalizedThumbDescriptor = `user:${uidx}`;
          }
        }
      }
    } catch (e) {
      // leave normalizedThumbDescriptor undefined on failure
      normalizedThumbDescriptor = undefined;
    }

    // Fallback: if we couldn't derive a normalized thumbnail but the user
    // moved a descriptor into the first slot, prefer that moved descriptor
    // when it's already a concrete token like 'parsed:N' or 'user:N'. This
    // ensures a drag of parsed:2 -> index 0 updates the nested thumbnail.
    if (!normalizedThumbDescriptor && targetIndex === 0 && typeof descItem === 'string') {
      if (/^(user:\d+|parsed:\d+)$/.test(descItem)) {
        normalizedThumbDescriptor = descItem;
      } else {
        // try to map literal value to parsed/user
        const parsedSnapshot = parsedImagesSnapshotRef.current || [];
        const userArr = Array.isArray((editedModel as any)?.userDefined?.images) ? (editedModel as any).userDefined.images : [];
        const pidx = parsedSnapshot.indexOf(descItem);
        if (pidx !== -1) normalizedThumbDescriptor = `parsed:${pidx}`;
        else {
          const uidx = userArr.findIndex((u: any) => getUserImageData(u) === descItem);
          if (uidx !== -1) normalizedThumbDescriptor = `user:${uidx}`;
        }
      }
    }

    // Update editedModel to set imageOrder and optionally update nested thumbnail
    // Debug: log normalization result so we can see what the UI computed on drop
    try {
      console.debug('DEBUG handleDrop: currentDescriptors =', currentDescriptors);
      console.debug('DEBUG handleDrop: firstDescriptor =', firstDescriptor, 'normalizedThumbDescriptor =', normalizedThumbDescriptor, 'descItem =', descItem);
    } catch (e) {
      // ignore debug errors
    }

    setEditedModel(prev => {
      if (!prev) return prev;
      const udObj = prev.userDefined && typeof prev.userDefined === 'object' ? { ...(prev.userDefined as any) } : {};
      udObj.imageOrder = currentDescriptors;
      // Only set nested thumbnail if we determined a safe descriptor
      if (typeof normalizedThumbDescriptor === 'string') {
        // Avoid overwriting an explicit nested thumbnail unless it changed
        if (udObj.thumbnail !== normalizedThumbDescriptor) {
          udObj.thumbnail = normalizedThumbDescriptor as any;
        }
      }
      const updated = { ...prev, userDefined: udObj } as any;
      return updated as Model;
    });

    // Update inlineCombined (UI) to reflect new order by resolving descriptors
    const tempUdObj2 = (editedModel as any).userDefined && typeof (editedModel as any).userDefined === 'object'
      ? { ...(editedModel as any).userDefined }
      : {};
    tempUdObj2.imageOrder = currentDescriptors;
    const tempModelForResolve = { ...editedModel, userDefined: tempUdObj2 } as Model;
    const resolved = resolveImageOrderToUrls(tempModelForResolve) || [];
    setInlineCombined(resolved);
    // update preview index to the dropped location
    setSelectedImageIndex(targetIndex);
    // clear selection indexes because indexes changed
    setSelectedImageIndexes([]);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => setDragOverIndex(null);

  // When entering fullscreen, move keyboard focus to the previous-image button
  useEffect(() => {
    if (isWindowFullscreen) {
      // wait for the DOM to render the button
      const t = window.setTimeout(() => {
        try {
          prevButtonRef?.current?.focus?.();
        } catch (e) {
          // ignore
        }
      }, 0);
      return () => window.clearTimeout(t);
    }
    return;
  }, [isWindowFullscreen]);

  // Scroll the thumbnail strip so the selected thumbnail is visible.
  useEffect(() => {
    if (isWindowFullscreen) return; // thumbnails are hidden in fullscreen
    const container = thumbnailStripRef.current;
    if (!container) return;
    const selector = `[data-thumb-index=\"${selectedImageIndex}\"]`;
    const active = container.querySelector<HTMLElement>(selector);
    if (!active) return;

    // Use smooth scrolling when possible; center the thumbnail in view
    const containerRect = container.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const offset = (activeRect.left + activeRect.right) / 2 - (containerRect.left + containerRect.right) / 2;
    // Scroll by offset, but keep within bounds
    const desired = container.scrollLeft + offset;
    const final = Math.max(0, Math.min(desired, container.scrollWidth - container.clientWidth));
    try {
      container.scrollTo({ left: final, behavior: 'smooth' });
    } catch (e) {
      container.scrollLeft = final;
    }
  }, [selectedImageIndex, isWindowFullscreen]);


  // G-code upload handler
  const handleGcodeUpload = async (file: File, forceOverwrite = false) => {
    if (!currentModel?.filePath) {
      toast.error('Model file path is required');
      return;
    }

    setIsUploadingGcode(true);
    try {
      // Load config to get storage behavior settings
      const configResp = await fetch('/api/load-config');
      let storageMode = 'parse-only';
      let autoOverwrite = false;

      if (configResp.ok) {
        const configData = await configResp.json();
        storageMode = configData.config?.settings?.gcodeStorageBehavior || 'parse-only';
        autoOverwrite = configData.config?.settings?.gcodeOverwriteBehavior === 'overwrite';
      }

      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('modelFilePath', currentModel.filePath);
      // Send the actual model file path (from modelUrl) for G-code save location
      if (currentModel.modelUrl) {
        formData.append('modelFileUrl', currentModel.modelUrl);
      }
      formData.append('storageMode', storageMode);

      if (forceOverwrite || autoOverwrite) {
        formData.append('overwrite', 'true');
      }

      // Upload and parse
      const response = await fetch('/api/parse-gcode', {
        method: 'POST',
        body: formData
      });

      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        console.error('[G-code Upload] Failed to parse JSON:', parseError);
        toast.error('Server returned invalid response');
        return;
      }

      // Check for file exists prompt (can happen with 200 OK status)
      if (result.fileExists && !forceOverwrite) {
        setGcodeOverwriteDialog({
          open: true,
          file,
          existingPath: result.existingPath || ''
        });
        return;
      }

      if (!response.ok) {
        console.error('[G-code Upload] Non-OK response:', response.status, result);
        toast.error(result.error || `Server error: ${response.status}`);
        return;
      }

      if (result.success && result.gcodeData) {
        // Build changes object for save-model API
        const changes: any = {
          filePath: currentModel.filePath,
          id: currentModel.id,
          gcodeData: result.gcodeData,
          // Legacy fields
          printTime: result.gcodeData.printTime || currentModel.printTime,
          filamentUsed: result.gcodeData.totalFilamentWeight || currentModel.filamentUsed
        };

        // [FIX] Explicitly add printSettings to the changes so the UI updates immediately
        if (result.gcodeData.printSettings) {
          changes.printSettings = {
            ...(currentModel.printSettings || {}), // Keep existing
            ...result.gcodeData.printSettings      // Overwrite with new
          };
        }

        // If storage mode is save-and-link, add to related_files
        if (storageMode === 'save-and-link' && result.gcodeData.gcodeFilePath) {
          const relatedFiles = Array.isArray(currentModel.related_files)
            ? [...currentModel.related_files]
            : [];

          const normalizePath = (p: string) => p.replace(/\\/g, '/').replace(/^\/+/, '');
          const normalizedNewPath = normalizePath(result.gcodeData.gcodeFilePath);
          const alreadyExists = relatedFiles.some(
            (existing: string) => normalizePath(existing) === normalizedNewPath
          );

          if (!alreadyExists) {
            relatedFiles.push(result.gcodeData.gcodeFilePath);
            changes.related_files = relatedFiles;
          }
        }

        // Save updated model
        const saveResp = await fetch('/api/save-model', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes)
        });

        if (saveResp.ok) {
          toast.success('G-code parsed and saved successfully');
          // Update the model in UI with the merged changes
          const updatedModel = { ...currentModel, ...changes };
          onModelUpdate(updatedModel);
        } else {
          const saveError = await saveResp.json().catch(() => ({ error: 'Unknown error' }));
          toast.error(`Failed to save G-code data: ${saveError.error || saveResp.statusText}`);
        }
      } else {
        console.error('[G-code Upload] Unexpected response:', { success: result.success, hasGcodeData: !!result.gcodeData });
        toast.error('Unexpected server response');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(`Upload failed: ${errorMsg}`);
    } finally {
      setIsUploadingGcode(false);
    }
  };

  // Re-analyze existing G-code
  const handleReanalyzeGcode = async () => {
    if (!currentModel?.gcodeData?.gcodeFilePath) {
      toast.error('No G-code file path found');
      return;
    }

    setIsUploadingGcode(true);
    try {
      const formData = new FormData();
      formData.append('modelFilePath', currentModel.filePath);
      formData.append('gcodeFilePath', currentModel.gcodeData.gcodeFilePath);
      formData.append('storageMode', 'parse-only');

      const response = await fetch('/api/parse-gcode', {
        method: 'POST',
        body: formData
      });

      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        toast.error('Server returned invalid response');
        return;
      }

      if (result.success && result.gcodeData) {
        // Build changes object for save-model API
        const changes: any = {
          filePath: currentModel.filePath,
          id: currentModel.id,
          gcodeData: result.gcodeData,
          printTime: result.gcodeData.printTime || currentModel.printTime,
          filamentUsed: result.gcodeData.totalFilamentWeight || currentModel.filamentUsed
        };

        if (result.gcodeData.printSettings) {
          changes.printSettings = {
            ...(currentModel.printSettings || {}),
            ...result.gcodeData.printSettings
          };
        }

        const saveResp = await fetch('/api/save-model', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes)
        });

        if (saveResp.ok) {
          toast.success('G-code re-analyzed successfully');
          // Update the model in UI with the merged changes
          const updatedModel = { ...currentModel, ...changes };
          onModelUpdate(updatedModel);
        } else {
          const saveError = await saveResp.json().catch(() => ({ error: 'Unknown error' }));
          toast.error(`Failed to save re-analyzed G-code data: ${saveError.error || saveResp.statusText}`);
        }
      } else {
        toast.error(result.error || 'Failed to re-analyze G-code');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(`Re-analysis failed: ${errorMsg}`);
    } finally {
      setIsUploadingGcode(false);
    }
  };

  // Handle drag and drop for G-code
  const handleGcodeDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleGcodeDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files[0];
    if (file && (file.name.toLowerCase().endsWith('.gcode') || file.name.toLowerCase().endsWith('.gcode.3mf'))) {
      handleGcodeUpload(file);
    } else {
      toast.error('Please drop a .gcode or .gcode.3mf file');
    }
  };

  const startEditing = () => {
    // Ensure filePath is present for saving - convert to JSON file path
    let jsonFilePath;
    const srcModel = model!;
    if (srcModel.filePath) {
      // Convert from .3mf/.stl path to -munchie.json path
      if (srcModel.filePath.endsWith('.3mf')) {
        jsonFilePath = srcModel.filePath.replace('.3mf', '-munchie.json');
      } else if (srcModel.filePath.endsWith('.stl') || srcModel.filePath.endsWith('.STL')) {
        // Handle both lowercase and uppercase STL extensions
        jsonFilePath = srcModel.filePath.replace(/\.stl$/i, '-stl-munchie.json');
      } else if (srcModel.filePath.endsWith('-munchie.json') || srcModel.filePath.endsWith('-stl-munchie.json')) {
        // Already a JSON path, use as-is
        jsonFilePath = srcModel.filePath;
      } else {
        // Assume it's a base name and add the JSON extension
        jsonFilePath = `${srcModel.filePath}-munchie.json`;
      }
    } else if (srcModel.modelUrl) {
      // Construct the path based on the modelUrl to match the actual JSON file location
      let relativePath = srcModel.modelUrl.replace('/models/', '');
      // Replace .3mf/.stl extension with appropriate -munchie.json
      if (relativePath.endsWith('.3mf')) {
        relativePath = relativePath.replace('.3mf', '-munchie.json');
      } else if (relativePath.endsWith('.stl') || relativePath.endsWith('.STL')) {
        // Handle both lowercase and uppercase STL extensions
        relativePath = relativePath.replace(/\.stl$/i, '-stl-munchie.json');
      } else if (relativePath.endsWith('-munchie.json') || relativePath.endsWith('-stl-munchie.json')) {
        // Already a JSON path, use as-is
        relativePath = relativePath;
      } else {
        // Assume it's a base name and add the JSON extension
        relativePath = `${relativePath}-munchie.json`;
      }
      jsonFilePath = relativePath;
    } else {
      // Fallback to using the model name
      jsonFilePath = `${srcModel.name}-munchie.json`;
    }
    // Prefer a user-provided description stored in userDefined
    let initialDescription = (srcModel as any).description;
    try {
      const ud = (srcModel as any).userDefined;
      if (ud && typeof ud === 'object' && typeof ud.description === 'string') {
        initialDescription = ud.description;
      }
    } catch (e) {
      // ignore and fallback to top-level description
    }

    // stash originals so the edit UI can toggle restoring the top-level description
    originalTopLevelDescriptionRef.current = typeof (srcModel as any).description === 'string' ? (srcModel as any).description : null;
    try {
      const ud = (srcModel as any).userDefined;
      if (ud && typeof ud === 'object' && Object.prototype.hasOwnProperty.call(ud, 'description')) {
        originalUserDefinedDescriptionRef.current = typeof ud.description === 'string' ? ud.description : null;
      } else {
        originalUserDefinedDescriptionRef.current = null;
      }
    } catch (e) {
      originalUserDefinedDescriptionRef.current = null;
    }
    setRestoreOriginalDescription(false);

    // Ensure editedModel uses the new parsedImages structure
    const { images: legacyImages, ...srcModelWithoutImages } = srcModel;
    const parsedImages = Array.isArray(srcModel.parsedImages)
      ? srcModel.parsedImages
      : (Array.isArray(legacyImages) ? legacyImages : []);

    setEditedModel({
      ...srcModelWithoutImages,
      filePath: jsonFilePath,
      tags: srcModel.tags || [], // Ensure tags is always an array
      description: initialDescription,
      parsedImages: parsedImages // Use new structure
    } as Model);
    // Capture how many images came from parsing (top-level images). We need
    // to detect whether the existing `thumbnail` value is one of the parsed
    // top-level images or whether it already points into the userDefined
    // images. This disambiguation is important so we don't accidentally treat
    // userDefined images as parsed when splitting the combined gallery later.
    const parsedImgs = parsedImages; // Use the parsedImages we just established
    // If thumbnail matches one of the parsed images by reference/value, then
    // the server produced a true top-level thumbnail. Otherwise, if the
    // thumbnail appears in userDefined.images, treat it as a user image.
    const udImgs = Array.isArray((srcModel as any).userDefined?.images) ? (srcModel as any).userDefined.images : [];
    const thumbnailVal = srcModel.thumbnail;
    const thumbnailIsParsed = typeof thumbnailVal === 'string' && thumbnailVal !== '' && parsedImgs.includes(thumbnailVal);
    const thumbnailIsUser = typeof thumbnailVal === 'string' && thumbnailVal !== '' && udImgs.includes(thumbnailVal);

    if (thumbnailIsParsed) {
      // thumbnail is counted as part of parsedImageCount (as "1"), so include it
      parsedImageCountRef.current = 1 + parsedImgs.length;
      originalThumbnailExistsRef.current = true;
    } else if (thumbnailIsUser) {
      // thumbnail actually comes from userDefined.images; treat parsed images
      // as only the parsedImgs array (no top-level thumbnail)
      parsedImageCountRef.current = parsedImgs.length;
      originalThumbnailExistsRef.current = false;
    } else {
      // No thumbnail or unknown string: fall back to conservative count
      parsedImageCountRef.current = (srcModel.thumbnail ? 1 : 0) + parsedImgs.length;
      originalThumbnailExistsRef.current = !!srcModel.thumbnail;
    }
    // Capture a snapshot of the parsed image values so we can reliably
    // classify images later even if the thumbnail or counts change in edit mode.
    parsedImagesSnapshotRef.current = parsedImgs.slice();
    // Initialize inlineCombined. Prefer an explicit imageOrder when present
    // so edit mode reflects the canonical ordering. For legacy files without
    // imageOrder we intentionally show only the top-level thumbnail + parsed
    // images (userDefined images were not present for legacy files).
    const resolvedFromOrder = resolveImageOrderToUrls(srcModel as Model);
    if (resolvedFromOrder && resolvedFromOrder.length > 0) {
      setInlineCombined(resolvedFromOrder);
    } else {
      const initialCombined = [srcModel.thumbnail, ...parsedImgs].filter((img): img is string => Boolean(img));
      setInlineCombined(initialCombined);
    }
    // Clear any previous image selections when entering edit mode
    setSelectedImageIndexes([]);
    setIsEditing(true);
  };

  // Insert a captured image data URL into editedModel similar to a user upload.
  const insertCapturedImageIntoEditedModel = (dataUrl: string) => {
    if (!editedModel) {
      // Shouldn't happen; caller ensures editedModel exists or will call startEditing
      return;
    }

    // Ensure userDefined structure exists
    const udObj = (editedModel as any).userDefined && typeof (editedModel as any).userDefined === 'object'
      ? { ...(editedModel as any).userDefined }
      : {};

    const existingUserImages: any[] = Array.isArray(udObj.images) ? udObj.images.slice() : [];
    // Push the new captured image as a simple data URL entry (legacy string form supported)
    existingUserImages.push(dataUrl);
    udObj.images = existingUserImages;

    // Build or extend imageOrder to include a descriptor for the new user image.
    const currentOrder: string[] = Array.isArray(udObj.imageOrder) ? udObj.imageOrder.slice() : buildImageOrderFromModel(editedModel);
    const newUserIndex = existingUserImages.length - 1;
    currentOrder.push(`user:${newUserIndex}`);
    udObj.imageOrder = currentOrder;

    const nextModel = { ...(editedModel as any), userDefined: udObj } as Model;

    // Update edited model and UI gallery (inlineCombined) so the new image appears immediately.
    setEditedModel(nextModel);
    const resolved = resolveImageOrderToUrls(nextModel) || [];
    setInlineCombined(resolved);
    // Select the newly-added image
    setSelectedImageIndex(resolved.length - 1);
    setSelectedImageIndexes([]);
    try { toast.success('Captured image added to model\'s gallery'); } catch (e) { /* ignore */ }
  };

  const cancelEditing = () => {
    setEditedModel(null);
    setIsEditing(false);
    // no-op for newTag
    setSelectedImageIndexes([]);
    setInlineCombined(null);
  };

  // Called by ModelViewer3D when user captures the current canvas as a PNG data URL.
  const handleCapturedImage = (dataUrl: string) => {
    // If not editing yet, stash and start editing. Once editedModel is created,
    // a useEffect below will consume pendingCapturedImageRef and insert it.
    pendingCapturedImageRef.current = dataUrl;
    if (!isEditing) {
      startEditing();
    } else if (editedModel) {
      insertCapturedImageIntoEditedModel(dataUrl);
      pendingCapturedImageRef.current = null;
    }
  };

  // When editedModel becomes available after startEditing(), check for a pending capture
  useEffect(() => {
    if (pendingCapturedImageRef.current && editedModel) {
      const dataUrl = pendingCapturedImageRef.current;
      pendingCapturedImageRef.current = null;
      insertCapturedImageIntoEditedModel(dataUrl);
    }
  }, [editedModel]);

  // Validate and normalize related_files. Returns { cleaned, invalid }.
  // Rules:
  const validateAndNormalizeRelatedFiles = (arr?: string[]) => {
    const cleaned: string[] = [];
    const invalid: string[] = [];
    if (!Array.isArray(arr)) return { cleaned, invalid };
    const seen = new Set<string>();
    for (const raw of arr) {
      if (typeof raw !== 'string') {
        invalid.push(String(raw));
        continue;
      }
      let s = raw.trim();
      if (s === '') {
        invalid.push(raw);
        continue;
      }
      // Remove surrounding single or double quotes for validation purposes
      const hadOuterQuotes = /^['"].*['"]$/.test(s);
      if (hadOuterQuotes) {
        s = s.replace(/^['"]|['"]$/g, '').trim();
        if (s === '') {
          invalid.push(raw);
          continue;
        }
      }
      if (s.includes('..')) {
        invalid.push(raw);
        continue;
      }
      s = s.replace(/\\/g, '/');
      // Reject UNC paths for security (\\server\share -> //server/share)
      if (s.startsWith('//')) {
        invalid.push(raw);
        continue;
      }
      // Reject absolute Windows drive paths (e.g., C:/something or C:\something)
      if (/^[a-zA-Z]:\//.test(s)) {
        invalid.push(raw);
        continue;
      }
      // Strip a single leading slash for relative paths
      if (s.startsWith('/')) s = s.substring(1);
      const key = s.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        cleaned.push(s);
      }
    }
    return { cleaned, invalid };
  };

  const saveModelToFile = async (edited: Model, original: Model) => {
    if (!edited.filePath) {
      console.error("No filePath specified for model");
      return { success: false, error: "Missing file path" };
    }

    // 1. PATH VALIDATION & NORMALIZATION (Original Logic)
    // Ensures related_files are clean relative paths for the backend
    const { cleaned, invalid } = validateAndNormalizeRelatedFiles(edited.related_files as any);
    if (invalid.length > 0) {
      setInvalidRelated(invalid);
      return { success: false, error: 'validation_failed', invalid } as any;
    }

    // 2. PREPARE THE CHANGE PAYLOAD (Optimized Diffing)
    const changes: any = { id: edited.id };

    // Explicit keys to sync. We ignore computed server fields like 'modelUrl'
    const keysToSync = [
      'name', 'category', 'license', 'tags', 'price',
      'isPrinted', 'hidden', 'printSettings', 'designer',
      'printTime', 'filamentUsed', 'userDefined', 'related_files'
    ];

    keysToSync.forEach(key => {
      const newVal = (edited as any)[key];
      const oldVal = (original as any)[key];
      if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
        changes[key] = newVal;
      }
    });

    // 3. DESCRIPTION OVERRIDE LOGIC (Original Feature)
    // Logic to determine if we are sending a new override or deleting an old one
    const currentText = edited.description;
    const originalLoadedText = originalUserDefinedDescriptionRef.current !== null
      ? originalUserDefinedDescriptionRef.current
      : originalTopLevelDescriptionRef.current;

    if (restoreOriginalDescription) {
      if (!changes.userDefined) changes.userDefined = {};
      changes.userDefined.description = null; // Tell server to delete override
      delete changes.description;
    } else if (currentText !== originalLoadedText) {
      if (!changes.userDefined) changes.userDefined = {};
      const isEmpty = typeof currentText === 'string' && currentText.trim() === '';
      changes.userDefined.description = isEmpty ? null : currentText;
      delete changes.description;
    }

    // 4. IMAGE DESCRIPTOR & THUMBNAIL ENFORCEMENT (Original Feature)
    // Ensures we send 'parsed:0' instead of a 2MB base64 string
    try {
      const udObj = edited.userDefined && typeof edited.userDefined === 'object'
        ? { ...(edited.userDefined as any) }
        : {};

      // Recalculate image order to ensure index integrity
      let imageOrderFinal = Array.isArray(udObj.imageOrder) ? udObj.imageOrder : buildImageOrderFromModel(edited);

      if (Array.isArray(imageOrderFinal) && imageOrderFinal.length > 0) {
        if (!changes.userDefined) changes.userDefined = {};
        changes.userDefined.imageOrder = imageOrderFinal;
        // Final Enforcement: First item in order is ALWAYS the thumbnail descriptor
        changes.userDefined.thumbnail = imageOrderFinal[0];

        // Clean up top-level to prevent bloating main database
        delete changes.images;
        delete changes.thumbnail;
      }
    } catch (e) {
      console.warn('Nested thumbnail enforcement failed:', e);
    }

    // 5. THE API CALL
    try {
      console.debug('POST Payload Preview:', { filePath: edited.filePath, changes });

      const response = await fetch('/api/save-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: edited.filePath, changes })
      });

      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to save');

      // 6. AUTHORITATIVE REFRESH (Crucial for Hero View)
      // We re-fetch to ensure the UI matches the actual file on disk exactly.
      let refreshedModel: Model | undefined;
      const allResp = await fetch('/api/models');
      if (allResp.ok) {
        const all = await allResp.json();
        refreshedModel = all.find((m: any) => m.id === edited.id);
      }

      return { success: true, serverResponse: result, refreshedModel };
    } catch (err: any) {
      console.error("Save process failed:", err);
      return { success: false, error: err.message };
    }
  };


  const saveChanges = async () => {
    if (!editedModel || isSaving) return;
    setIsSaving(true);

    try {
      // Step 1: Run the deep-logic save
      const result = await saveModelToFile(editedModel, model!);

      if (result && result.success) {
        // Step 2: Update the Main App State
        // Prefer the authoritative model from server, fallback to local edited state
        const finalModelToUpdate = result.refreshedModel || editedModel;
        onModelUpdate(finalModelToUpdate);

        // Step 3: Clean up UI state
        setIsEditing(false);
        setEditedModel(null);
        setSelectedImageIndexes([]);
        setInlineCombined(null);
        toast.success('Changes saved successfully');
      } else {
        // Error Handling: If validation fails, don't close the editor
        const errorMsg = result?.error === 'validation_failed'
          ? "Invalid file paths detected"
          : (result?.error || "Unknown error");
        toast.error(`Save failed: ${errorMsg}`);
      }
    } catch (err) {
      console.error("Critical save error:", err);
      toast.error("An unexpected error occurred during save");
    } finally {
      setIsSaving(false);
    }
  };

  // Live-validate related_files whenever the edited model's related_files changes
  useEffect(() => {
    if (!editedModel) {
      setInvalidRelated([]);
      return;
    }
    const { invalid } = validateAndNormalizeRelatedFiles(editedModel.related_files as any);
    setInvalidRelated(invalid);
  }, [editedModel?.related_files]);

  // Focus newly-added related_files input when created
  useEffect(() => {
    if (focusRelatedIndex === null) return;
    // Query the input with the data attribute and focus it
    const selector = `input[data-related-index=\"${focusRelatedIndex}\"]`;
    const el = document.querySelector<HTMLInputElement>(selector);
    if (el) {
      try { el.focus(); el.select(); } catch (e) { /* ignore */ }
    }
    // Clear the target so we don't refocus later
    setFocusRelatedIndex(null);
  }, [focusRelatedIndex]);

  const getSuggestedTags = () => {
    if (!editedModel || !editedModel.category) return [];

    const suggestedTags = getCategoryTags(editedModel.category);
    // Filter out tags that already exist on the editedModel (case-insensitive)
    const existing = new Set((editedModel.tags || []).map(t => t.toLowerCase()));
    return suggestedTags.filter((tag: string) => !existing.has(tag.toLowerCase()));
  };

  const handleSuggestedTagClick = (tag: string) => {
    if (!editedModel) return;
    // Prevent duplicates (case-insensitive)
    const currentTags = editedModel.tags || [];
    const lowerTag = tag.toLowerCase();
    if (currentTags.some(t => t.toLowerCase() === lowerTag)) return;

    setEditedModel({
      ...editedModel,
      tags: [...currentTags, tag]
    });
  };

  const handleNextImage = () => {
    setSelectedImageIndex((prev) => (prev + 1) % allImages.length);
  };

  const handlePreviousImage = () => {
    setSelectedImageIndex((prev) => (prev - 1 + allImages.length) % allImages.length);
  };

  // Set an image as the main thumbnail
  const handleSetAsMain = (imageIndex: number) => {
    if (!isEditing || !editedModel) return;

    // Get current imageOrder or build it
    const currentOrder = Array.isArray((editedModel as any).userDefined?.imageOrder)
      ? (editedModel as any).userDefined.imageOrder.slice()
      : buildImageOrderFromModel(editedModel);

    if (imageIndex < 0 || imageIndex >= currentOrder.length) return;

    const selectedDescriptor = currentOrder[imageIndex];

    // Update the model to set this image as the thumbnail
    setEditedModel(prev => {
      if (!prev) return prev;

      const udObj = prev.userDefined && typeof prev.userDefined === 'object' ? { ...(prev.userDefined as any) } : {};
      // Set the thumbnail descriptor
      udObj.thumbnail = selectedDescriptor;
      // Move this descriptor to the front of imageOrder so it appears first
      const newOrder = [selectedDescriptor, ...currentOrder.filter((_: any, idx: number) => idx !== imageIndex)];
      udObj.imageOrder = newOrder;
      return { ...prev, userDefined: udObj } as Model;
    });

    // Update inlineCombined to reflect new order
    if (inlineCombined) {
      const selectedImage = inlineCombined[imageIndex];
      const newOrder = [selectedImage, ...inlineCombined.filter((_, idx) => idx !== imageIndex)];
      setInlineCombined(newOrder);
    }

    // Set the preview to show the new main image
    setSelectedImageIndex(0);
  };


  // Download handler for model file
  const handleDownloadClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // Determine default extension based on modelUrl if available
    // Determine default extension based on modelUrl if available
    const defaultExtension = currentModel!.modelUrl?.toLowerCase().endsWith('.stl') ? '.stl' : '.3mf';

    // If a filePath (JSON path) is present, prefer using it to derive the
    // model file location. `filePath` may include subdirectories (e.g.
    // "subdir/model-stl-munchie.json") so derive the original model file
    // name by replacing the -munchie.json suffix with the original extension
    // when possible. Otherwise fall back to modelUrl which may already be a
    // full "/models/.." URL.
    let outFilePath: string | undefined;

    if (currentModel!.filePath) {
      // filePath is typically the JSON file on disk; try to map it back to
      // the model file name. Preserve any subdirectory present in filePath.
      const fp = currentModel!.filePath.replace(/^\/*/, ''); // remove leading slash
      // If the filePath ends with -munchie.json or -stl-munchie.json, strip
      // that suffix and try to append the likely extension.
      let base = fp;
      base = base.replace(/-stl-munchie\.json$/i, '');
      base = base.replace(/-munchie\.json$/i, '');

      // If the remaining base already has a known model extension, use it;
      // otherwise default to modelUrl's extension or .3mf
      const hasExt = /\.(stl|3mf)$/i.test(base);
      let finalName = base;
      if (!hasExt) {
        // Try to infer from modelUrl
        if (currentModel!.modelUrl && /\.stl$/i.test(currentModel!.modelUrl)) finalName = `${base}.stl`;
        else finalName = `${base}.3mf`;
      }

      // Prepend /models/ so triggerDownload receives a path consistent with
      // other callers that expect model files under /models/.
      outFilePath = `/models/${finalName}`;
    } else if (currentModel!.modelUrl) {
      // modelUrl often already contains `/models/...` so use it as-is.
      outFilePath = currentModel!.modelUrl;
    } else {
      // Fallback: construct a filename from the model name
      const name = currentModel!.name || 'model';
      outFilePath = `/models/${name}${defaultExtension}`;
    }

    // Use shared triggerDownload to normalize and trigger the download
    // Compute a safe download filename (basename only) so the browser doesn't
    // include any directory prefix in the saved file name.
    const safeBaseName = outFilePath ? outFilePath.replace(/^\/+/, '').replace(/\\/g, '/').split('/').pop() || '' : '';

    // Normalize backslashes in the outgoing path so HEAD and downloads are consistent
    const normalizedOut = outFilePath ? outFilePath.replace(/\\/g, '/') : outFilePath;
    // Trigger the download using the normalized path and explicit basename.
    // Path normalization ensures we don't leak Windows backslashes into the
    // suggested download filename.
    triggerDownload(normalizedOut, e.nativeEvent as any as MouseEvent, safeBaseName);
  };

  // Ensure we have a model to render. Keep this check after all hooks so hook order remains stable.
  if (!currentModel) return null;

  // Display path: prefer filePath (JSON path), fall back to modelUrl (trim leading /models/) or a default filename
  const displayModelPath = currentModel.filePath
    ? currentModel.filePath
    : currentModel.modelUrl
      ? currentModel.modelUrl.replace(/^\/models\//, '')
      : `${currentModel.name}.3mf`;
  // Defensive: ensure printSettings is always an object with string fields
  const safePrintSettings = {
    layerHeight: model?.printSettings?.layerHeight || model?.userDefined?.printSettings?.layerHeight || 'Unknown',
    infill: model?.printSettings?.infill || model?.userDefined?.printSettings?.infill || 'Unknown',
    nozzle: model?.printSettings?.nozzle || model?.userDefined?.printSettings?.nozzle || 'Unknown',
    printer: model?.printSettings?.printer || 'Unknown',
    material: model?.printSettings?.material || model?.userDefined?.printSettings?.material || 'Unknown'
  };

  // Determine if the underlying model is STL or 3MF using filePath/modelUrl
  const isStlModel = (() => {
    try {
      const p = (currentModel.filePath || currentModel.modelUrl || '').toLowerCase();
      return p.endsWith('.stl') || p.endsWith('-stl-munchie.json');
    } catch (_) { return false; }
  })();

  const handleDeleteClick = () => {
    setIsDeleteConfirmOpen(true);
  };

  const handleToggleHide = async () => {
    if (!currentModel) return;
    const newHiddenStatus = !currentModel.hidden;

    try {
      const response = await fetch('/api/save-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: currentModel.filePath,
          id: currentModel.id,
          changes: { hidden: newHiddenStatus }
        })
      });

      if (response.ok) {
        // Update local state and parent list immediately
        handleLocalUpdate({ hidden: newHiddenStatus });
        toast.success(newHiddenStatus ? "Model hidden" : "Model visible");
      } else {
        toast.error("Failed to update visibility");
      }
    } catch (error) {
      toast.error("Network error updating visibility");
    }
  };

  const confirmDelete = () => {
    if (onDelete && model) {
      onDelete(model);
      setIsDeleteConfirmOpen(false);
      onClose(); // Close the hero view after deletion
    }
  };

  const handleLocalUpdate = (updates: Partial<Model>) => {
    setEditedModel(prev => {
      // If we aren't in edit mode yet, we need to initialize from the current model
      const base = prev || model;
      if (!base) return null;

      // Create a shallow copy of the entire model
      const next = { ...base, ...updates };

      // Handle deep merging for the nested printSettings object
      if (updates.printSettings) {
        next.printSettings = {
          ...(base.printSettings || {}),
          ...updates.printSettings
        };
      }

      // Handle deep merging for the nested userDefined object
      if (updates.userDefined) {
        next.userDefined = {
          ...(base.userDefined || {}),
          ...updates.userDefined
        };
      }

      return next as Model;
    });
  };

  if (!model) return null;
  const activeModel = model;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">

      {/* --- ACTION BAR (Breadcrumb Style) --- */}
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

            {/* Category Label */}
            {activeModel.category && (
              <span className="text-[10px] text-muted-foreground/50 font-bold uppercase tracking-wider group-hover:text-muted-foreground transition-colors">
                {activeModel.category}
              </span>
            )}

          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isEditing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-2 opacity-50 hover:opacity-100"
              disabled={isMoving}
              // [FIX] Trigger the state that opens the dialog, NOT the hidden input
              onClick={() => setIsAssetDialogOpen(true)}
            >
              {isMoving ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}

              <span>{isMoving ? "Reorganizing..." : "Manage / Upload"}</span>
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="h-full">
        <div className="p-4 lg:p-10 pb-32">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 max-w-[1600px] mx-auto">

            {/* <div className="flex items-center gap-3">
              {currentModel.isPrinted && (
                <Badge className="bg-green-500/10 text-green-600 border-green-500/20 gap-1.5 px-3 py-1">
                  <FileCheck className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-bold uppercase">Printed</span>
                </Badge>
              )}
              <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </header> */}

            {/* --- 2. MAIN SCROLLABLE CONTENT ---
          <ScrollArea className="flex-1 overflow-y-auto" scrollHideDelay={100}>
            <div className="max-w-[1600px] mx-auto p-4 lg:p-8">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12"> */}

            {/* --- LEFT COLUMN: MEDIA & TABS (7/12) --- */}
            <div className="lg:col-span-7 space-y-8">
              {/* The 3D/Image Preview Stage */}
              <div className="rounded-2xl overflow-hidden border bg-card shadow-sm">
                <ModelPreviewSection
                  viewMode={viewMode}
                  setViewMode={setViewMode}
                  currentModel={currentModel}
                  activeDocUrl={activeDocUrl}
                  handleViewDocument={handleViewDocument}
                  active3DFile={active3DFile}
                  setActive3DFile={setActive3DFile}
                  allImages={allImages}
                  selectedImageIndex={selectedImageIndex}
                  setSelectedImageIndex={setSelectedImageIndex}
                  handleCapturedImage={handleCapturedImage}
                  defaultModelColor={defaultModelColor || undefined}
                  isWindowFullscreen={isWindowFullscreen}
                  setIsWindowFullscreen={setIsWindowFullscreen}
                  imageContainerRef={imageContainerRef}
                  prevButtonRef={prevButtonRef}
                  thumbnailStripRef={thumbnailStripRef}
                  addImageInputRef={addImageInputRef}
                  handlePreviousImage={handlePreviousImage}
                  handleNextImage={handleNextImage}
                  handleToggleFullscreen={handleToggleFullscreen}
                  isEditing={isEditing}
                  handleSetAsMain={handleSetAsMain}
                  handleAddImageClick={handleAddImageClick}
                  handleAddImageFile={handleAddImageFile}
                  addImageProgress={addImageProgress}
                  addImageError={addImageError}
                  toggleImageSelection={toggleImageSelection}
                  isImageSelected={isImageSelected}
                  handleDragStart={handleDragStart}
                  handleDragOver={handleDragOver}
                  handleDrop={handleDrop}
                  handleDragLeave={handleDragLeave}
                  handleDragEnd={handleDragEnd}
                  dragOverIndex={dragOverIndex}
                  onTogglePrinted={(val) => {
                    const updatedModel = { ...activeModel, isPrinted: val };
                    onModelUpdate(updatedModel);
                  }}

                />
              </div>

              {/* Tabbed Sub-content */}
              <Tabs defaultValue="details" className="w-full">
                <TabsList className="w-full justify-start bg-transparent border-b rounded-none h-11 p-0 gap-8">
                  <TabsTrigger value="details" className="data-[state=active]:border-primary border-b-2 border-transparent rounded-none bg-transparent px-1 h-full font-bold text-xs uppercase tracking-wider">Details</TabsTrigger>
                  <TabsTrigger value="related" className="data-[state=active]:border-primary border-b-2 border-transparent rounded-none bg-transparent px-1 h-full font-bold text-xs uppercase tracking-wider">Related Files</TabsTrigger>
                  <TabsTrigger value="siblings" className="data-[state=active]:border-primary border-b-2 border-transparent rounded-none bg-transparent px-1 h-full font-bold text-xs uppercase tracking-wider">Collection</TabsTrigger>
                  <TabsTrigger value="notes" className="data-[state=active]:border-primary border-b-2 border-transparent rounded-none bg-transparent px-1 h-full font-bold text-xs uppercase tracking-wider">Notes</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="pt-6 animate-in fade-in slide-in-from-left-2 duration-300">
                  <DescriptionSection
                    isEditing={isEditing}
                    currentModel={currentModel}
                    originalUserDefinedDescriptionRef={originalUserDefinedDescriptionRef}
                    originalTopLevelDescriptionRef={originalTopLevelDescriptionRef}
                    restoreOriginalDescription={restoreOriginalDescription}
                    setRestoreOriginalDescription={setRestoreOriginalDescription}
                    setEditedModel={setEditedModel}
                    editedModel={editedModel}
                  />
                </TabsContent>

                <TabsContent value="related" className="pt-6">
                  <RelatedFilesSection
                    isEditing={isEditing}
                    currentModel={currentModel}
                    editedModel={editedModel}
                    setEditedModel={setEditedModel}
                    active3DFile={active3DFile}
                    setActive3DFile={setActive3DFile}
                    setFocusRelatedIndex={setFocusRelatedIndex}
                    relatedVerifyStatus={relatedVerifyStatus}
                    setRelatedVerifyStatus={setRelatedVerifyStatus}
                    invalidRelated={invalidRelated}
                    serverRejectedRelated={serverRejectedRelated}
                    onModelUpdate={onModelUpdate}
                    triggerDownload={triggerDownload}
                    deriveMunchieCandidate={deriveMunchieCandidate}
                    availableRelatedMunchie={availableRelatedMunchie}
                    detailsViewportRef={detailsViewportRef}
                    toast={toast}
                    handleViewDocument={handleViewDocument} />
                </TabsContent>

                <TabsContent value="siblings" className="pt-6">
                  {/* Siblings section we built earlier */}
                  <SiblingsSection
                    siblings={siblings}
                    onModelUpdate={onModelUpdate}
                    detailsViewportRef={detailsViewportRef}
                  />
                </TabsContent>

                <TabsContent value="notes" className="pt-6">
                  <NotesSection
                    currentModel={model} // Your guarded, non-null model
                    onSave={(newNotes) => {
                      // This uses your working App.tsx persistence
                      onModelUpdate({ ...model, notes: newNotes });
                    }}
                  />
                </TabsContent>
              </Tabs>
            </div>

            {/* --- RIGHT COLUMN: STATS & SETTINGS (5/12) --- */}
            <aside className="lg:col-span-5 space-y-6">

              {/* NEW: Collection Quick Actions */}
              {!isEditing && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button
                    onClick={() => setIsAddToCollectionOpen(true)}
                    variant="outline"
                    size="sm"
                    className="justify-start gap-2 bg-card hover:bg-accent"
                    disabled={!collections || collections.length === 0}
                  >
                    <List className="h-4 w-4" />
                    Add to Collection
                  </Button>
                  <Button
                    onClick={() => setIsRemoveFromCollectionOpen(true)}
                    variant="outline"
                    size="sm"
                    className="justify-start gap-2 bg-card hover:bg-accent"
                    disabled={!collections.some(c => Array.isArray(c.modelIds) && c.modelIds.includes(currentModel.id))}
                  >
                    <MinusCircle className="h-4 w-4" />
                    Remove from Collection
                  </Button>
                </div>
              )}
              {/* Print Settings & Spoolman Card */}
              <section className="bg-card border rounded-2xl p-6 shadow-sm space-y-6">
                <PrintSettingsSection
                  currentModel={currentModel}
                  safePrintSettings={safePrintSettings}
                />

                {/* Gcode Section remains inside or directly below Print Settings */}
                <div className="mt-6 pt-6 border-t">
                  <GcodeSection
                    currentModel={currentModel}
                    isEditing={isEditing}
                    gcodeInputRef={gcodeInputRef}
                    isUploadingGcode={isUploadingGcode}
                    handleGcodeUpload={handleGcodeUpload}
                    handleReanalyzeGcode={handleReanalyzeGcode}
                    isGcodeExpanded={isGcodeExpanded}
                    setIsGcodeExpanded={setIsGcodeExpanded}
                    handleGcodeDragOver={handleGcodeDragOver}
                    handleGcodeDrop={handleGcodeDrop}
                  />
                </div>
              </section>

              {/* Tags, Notes, and Source Section */}
              <section className="bg-card border rounded-2xl p-6 shadow-sm space-y-6">
                <MetadataSection
                  isEditing={isEditing}
                  isStlModel={isStlModel}
                  editedModel={editedModel}
                  setEditedModel={setEditedModel}
                  categories={categories}
                  isKnownLicense={isKnownLicense}
                  LICENSES={LICENSES}
                  onLocalUpdate={handleLocalUpdate}
                />

                {!isEditing && (
                  <div className="space-y-6">
                    <TagsSection
                      isEditing={isEditing}
                      currentModel={currentModel}
                      editedModel={editedModel}
                      setEditedModel={setEditedModel}
                      getSuggestedTags={getSuggestedTags}
                      handleSuggestedTagClick={handleSuggestedTagClick}
                    />
                    <SourceSection
                      isEditing={isEditing}
                      currentModel={currentModel}
                      editedModel={editedModel}
                      setEditedModel={setEditedModel}
                    />
                  </div>
                )}
              </section>
            </aside>
          </div>
          <div className="h-32" /> {/* Layout Spacer */}
        </div>
      </ScrollArea>

      {/* --- 3. THE FLOATING COMMAND BAR --- */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-fit px-4 pointer-events-none">
        <div className="
                        pointer-events-auto
                        flex items-center gap-2 p-2 
                        bg-background/70 backdrop-blur-2xl 
                        border border-white/20 dark:border-white/10 
                        shadow-[0_20px_50px_rgba(0,0,0,0.4)] 
                        rounded-2xl 
                        animate-in slide-in-from-bottom-6 duration-700
                    ">
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/10 h-11 w-11 rounded-xl transition-colors"
            onClick={handleDeleteClick}
          >
            <Trash2 className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className={`h-11 w-11 rounded-xl transition-all ${isEditing ? 'bg-primary text-primary-foreground' : ''}`}
            onClick={() => setIsEditing(!isEditing)}
          >
            <Edit3 className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className={`h-11 w-11 rounded-xl transition-all ${currentModel.hidden ? 'text-orange-500' : ''}`}
            onClick={handleToggleHide}
          >
            {currentModel.hidden ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
          </Button>

          <Separator orientation="vertical" className="h-8 mx-1 bg-border/50" />

          <Button
            className="
                                h-11 px-8 rounded-xl 
                                bg-primary text-primary-foreground 
                                hover:shadow-[0_0_20px_rgba(var(--primary),0.4)] 
                                transition-all font-bold tracking-tight
                                gap-2
                            "
            onClick={() => handleDownloadAll()}
          >
            <Download className="h-5 w-5" />
            <span>Download All</span>
          </Button>

          {/* INTEGRATED EDIT/SAVE CONTROLS */}
          {isEditing && (
            <div className="flex items-center gap-1 animate-in fade-in slide-in-from-left-2 duration-200">
              <div className="h-4 w-px bg-border mx-1" />

              <Button
                variant="ghost"
                size="sm"
                disabled={isSaving}
                className="h-8 px-2 text-[10px] font-bold uppercase text-muted-foreground hover:text-destructive"
                onClick={cancelEditing} // Using your variable
              >
                Cancel
              </Button>

              <Button
                variant="default"
                size="sm"
                disabled={invalidRelated.length > 0 || isSaving}
                className="h-8 px-3 text-[10px] font-black uppercase bg-primary shadow-lg shadow-primary/20 transition-all"
                onClick={saveChanges} // Using your variable
              >
                {isSaving ? (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                )}
                {isSaving ? 'Committing...' : 'Commit_Changes'}
              </Button>
            </div>
          )}
        </div>
      </div>



      {/* --- 4. MODALS & DIALOGS --- */}
      {isAddToCollectionOpen && currentModel && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setIsAddToCollectionOpen(false)}>
          <div className="bg-card border rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">Add to Collection</h3>
            <div className="space-y-4">
              <Select value={addTargetCollectionId || ''} onValueChange={setAddTargetCollectionId}>
                <SelectTrigger><SelectValue placeholder="Select a collection" /></SelectTrigger>
                <SelectContent>
                  {collections.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setIsAddToCollectionOpen(false)}>Cancel</Button>
                <Button disabled={!addTargetCollectionId} onClick={async () => {
                  const col = collections.find(c => c.id === addTargetCollectionId);
                  if (!col) return;
                  const nextIds = Array.from(new Set([...(col.modelIds || []), currentModel.id]));
                  const resp = await fetch('/api/collections', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...col, modelIds: nextIds })
                  });
                  if (resp.ok) {
                    setIsAddToCollectionOpen(false);
                    setAddTargetCollectionId(null);
                    toast.success('Added to collection');
                  }
                }}>Add</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isRemoveFromCollectionOpen && currentModel && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setIsRemoveFromCollectionOpen(false)}>
          <div className="bg-card border rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4 text-destructive">Remove from Collection</h3>
            <Select value={removeTargetCollectionId || ''} onValueChange={setRemoveTargetCollectionId}>
              <SelectTrigger><SelectValue placeholder="Select a collection" /></SelectTrigger>
              <SelectContent>
                {collections.filter(c => c.modelIds?.includes(currentModel.id)).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="ghost" onClick={() => setIsRemoveFromCollectionOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={async () => {
                const col = collections.find(c => c.id === removeTargetCollectionId);
                if (!col) return;
                const nextIds = (col.modelIds || []).filter(id => id !== currentModel.id);
                const resp = await fetch('/api/collections', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...col, modelIds: nextIds })
                });
                if (resp.ok) {
                  setIsRemoveFromCollectionOpen(false);
                  setRemoveTargetCollectionId(null);
                  toast.success('Removed from collection');
                }
              }}>Remove</Button>
            </div>
          </div>
        </div>
      )}

      {activeModel && (
        <ModelUploadDialog
          isOpen={isAssetDialogOpen}
          onClose={() => setIsAssetDialogOpen(false)}
          initialFolder={activeModel.filePath}
          targetModel={activeModel}
          onIsMovingChange={setIsMoving} 
          onUploaded={(updatedModel) => {
            onModelUpdate(updatedModel || activeModel);
          }}
        />
      )}

      {/* G-code Overwrite */}
      <AlertDialog open={gcodeOverwriteDialog.open} onOpenChange={(open) => !open && setGcodeOverwriteDialog({ open: false, file: null, existingPath: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite existing G-code?</AlertDialogTitle>
            <AlertDialogDescription>{gcodeOverwriteDialog.existingPath}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleGcodeUpload(gcodeOverwriteDialog.file!, true)}>Overwrite</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{currentModel.name}</strong>.
            </AlertDialogDescription>
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

//   {/* G-code overwrite confirmation dialog */ }
//   <AlertDialog open={gcodeOverwriteDialog.open} onOpenChange={(open) => !open && setGcodeOverwriteDialog({ open: false, file: null, existingPath: '' })}>
//     <AlertDialogContent>
//       <AlertDialogHeader>
//         <AlertDialogTitle>G-code file already exists</AlertDialogTitle>
//         <AlertDialogDescription>
//           A G-code file already exists at: <strong>{gcodeOverwriteDialog.existingPath}</strong>
//           <br /><br />
//           Do you want to overwrite it with the new file?
//         </AlertDialogDescription>
//       </AlertDialogHeader>
//       <AlertDialogFooter>
//         <AlertDialogCancel onClick={() => setGcodeOverwriteDialog({ open: false, file: null, existingPath: '' })}>
//           Cancel
//         </AlertDialogCancel>
//         <AlertDialogAction onClick={() => {
//           if (gcodeOverwriteDialog.file) {
//             handleGcodeUpload(gcodeOverwriteDialog.file, true);
//           }
//           setGcodeOverwriteDialog({ open: false, file: null, existingPath: '' });
//         }}>
//           Overwrite
//         </AlertDialogAction>
//       </AlertDialogFooter>
//     </AlertDialogContent>
//   </AlertDialog>
//       </SheetContent >
//     </Sheet >
//   );
// }

// // Helper to send only changed fields to backend
// const saveModelToFile = async (edited: Model, original: Model) => {
//   console.log("DEBUG: Original Model:", original);
//   console.log("DEBUG: Edited Model (to be saved):", edited);

//   if (!edited.filePath) {
//     console.error("No filePath specified for model");
//     return;
//   }

//   const editedForSave: any = { ...edited };
//   const { cleaned, invalid } = validateAndNormalizeRelatedFiles(editedForSave.related_files as any);
//   setInvalidRelated(invalid);
//   if (invalid.length > 0) {
//     // Block save client-side; caller can decide what to do
//     return { success: false, error: 'validation_failed', invalid } as any;
//   }
//   editedForSave.related_files = cleaned;
//   try {
//     const udExists = editedForSave.userDefined && typeof editedForSave.userDefined === 'object';
//     const ud0 = udExists ? editedForSave.userDefined : undefined;
//     let imageOrder = ud0 && Array.isArray(ud0.imageOrder) ? ud0.imageOrder : undefined;
//     try {
//       if ((!imageOrder || imageOrder.length === 0) && typeof buildImageOrderFromModel === 'function') {
//         imageOrder = buildImageOrderFromModel(editedForSave as Model);
//       }
//     } catch (e) {
//       // ignore - fall back to not deriving a thumbnail
//       imageOrder = imageOrder;
//     }

//     if (imageOrder && imageOrder.length > 0) {
//       const first = imageOrder[0];
//       let derived: string | undefined = undefined;
//       if (typeof first === 'string') {
//         if (/^(user:|parsed:)/.test(first)) {
//           derived = first;
//         } else {
//           // Try to match literal value against userDefined images
//           const candidateUserImgs = ud0 && Array.isArray(ud0.images) ? ud0.images : (Array.isArray(edited.userDefined?.images) ? edited.userDefined.images : []);
//           const userIdx = candidateUserImgs.findIndex((u: any) => getUserImageData(u) === first);
//           if (userIdx !== -1) derived = `user:${userIdx}`;
//           else {
//             // Try to match against parsed top-level images
//             const parsedArr = Array.isArray(edited.images) ? edited.images : [];
//             const pidx = parsedArr.indexOf(first);
//             if (pidx !== -1) derived = `parsed:${pidx}`;
//           }
//         }
//       }

//       if (typeof derived !== 'undefined') {
//         // Ensure userDefined exists and preserve images
//         const copy0 = ud0 && typeof ud0 === 'object' ? { ...(ud0 as any) } : {};
//         // Preserve images array if present
//         if (ud0 && Array.isArray(ud0.images)) copy0.images = ud0.images;
//         copy0.thumbnail = derived;
//         editedForSave.userDefined = copy0;
//       }
//     }
//   } catch (e) {
//     // Defensive: if thumbnail derivation fails, continue without blocking save
//     console.warn('Failed to derive nested thumbnail from imageOrder before save:', e);
//   }

//   // Enforce: always set userDefined.thumbnail to the first descriptor in
//   // userDefined.imageOrder after recalculating imageOrder if necessary.
//   try {
//     const udExists2 = editedForSave.userDefined && typeof editedForSave.userDefined === 'object';
//     const udObj2 = udExists2 ? { ...(editedForSave.userDefined as any) } : {};
//     let imageOrderFinal = Array.isArray(udObj2.imageOrder) ? udObj2.imageOrder : undefined;
//     try {
//       if ((!imageOrderFinal || imageOrderFinal.length === 0) && typeof buildImageOrderFromModel === 'function') {
//         imageOrderFinal = buildImageOrderFromModel(editedForSave as Model);
//       }
//     } catch (e) {
//       // ignore - fall back to existing order
//       imageOrderFinal = imageOrderFinal;
//     }
//     if (Array.isArray(imageOrderFinal) && imageOrderFinal.length > 0) {
//       udObj2.imageOrder = imageOrderFinal;
//       // Always set nested thumbnail to the first descriptor in the final order
//       udObj2.thumbnail = imageOrderFinal[0];
//       editedForSave.userDefined = udObj2;
//     }
//   } catch (e) {
//     console.warn('Failed to enforce nested thumbnail from recalculated imageOrder before save:', e);
//   }

//   // Compute changed fields (excluding computed properties like filePath and modelUrl)
//   const changes: any = { filePath: editedForSave.filePath, id: editedForSave.id };
//   Object.keys(editedForSave).forEach(key => {
//     if (key === 'filePath' || key === 'id' || key === 'modelUrl') return;
//     const editedValue = JSON.stringify((editedForSave as any)[key]);
//     const originalValue = JSON.stringify((original as any)[key]);
//     if (editedValue !== originalValue) {
//       changes[key] = (editedForSave as any)[key];
//     }
//   });

//   if (typeof changes.thumbnail === 'string' && /^(user:|parsed:)/.test(changes.thumbnail)) {
//     const descriptor = changes.thumbnail;
//     delete changes.thumbnail;
//     if (!changes.userDefined || typeof changes.userDefined !== 'object') changes.userDefined = {};
//     // Only set if not already present to avoid overwriting nested thumbnail handling
//     if (!changes.userDefined.thumbnail) changes.userDefined.thumbnail = descriptor;
//   }

//   if (typeof changes.thumbnail === 'string' && !/^(user:|parsed:)/.test(changes.thumbnail)) {
//     const s = changes.thumbnail as string;
//     let safeThumb: string | undefined = undefined;
//     // Prefer images that are about to be sent in the same payload (changes.userDefined)
//     const changeUDImgs = Array.isArray(changes.userDefined?.images)
//       ? changes.userDefined.images
//       : (Array.isArray(editedForSave.userDefined?.images) ? editedForSave.userDefined.images : []);
//     const originalParsed = Array.isArray((original as any).images) ? (original as any).images : [];
//     const originalTop = (original as any).thumbnail || '';

//     if (s.startsWith('data:')) {
//       const uidx = changeUDImgs.findIndex((u: any) => getUserImageData(u) === s);
//       if (uidx !== -1) safeThumb = `user:${uidx}`;
//       else if (originalTop && s === originalTop) safeThumb = 'parsed:0';
//       else if (originalParsed.includes(s)) safeThumb = `parsed:${originalParsed.indexOf(s)}`;
//     } else {
//       // Non-data string: try to match against parsed or original thumbnail
//       const pidx = originalParsed.indexOf(s);
//       if (pidx !== -1) safeThumb = `parsed:${pidx}`;
//       else if (s === originalTop) safeThumb = 'parsed:0';
//     }

//     if (typeof safeThumb !== 'undefined') {
//       if (!changes.userDefined || typeof changes.userDefined !== 'object') changes.userDefined = {};
//       changes.userDefined.thumbnail = safeThumb;
//     }
//     // Remove top-level thumbnail change in all cases to avoid sending raw data
//     delete changes.thumbnail;
//   }

//   // 1. Determine if the text actually changed compared to what was loaded into the editor
//   const currentText = editedForSave.description;
//   const originalLoadedText = originalUserDefinedDescriptionRef.current !== null
//     ? originalUserDefinedDescriptionRef.current
//     : originalTopLevelDescriptionRef.current;

//   const textHasChanged = currentText !== originalLoadedText;

//   if (restoreOriginalDescription) {
//     // User explicitly wants to go back to system default
//     if (!changes.userDefined) changes.userDefined = {};
//     changes.userDefined.description = null;
//     delete changes.description;
//   }
//   else if (textHasChanged) {
//     // User actually typed something new
//     if (!changes.userDefined) changes.userDefined = {};

//     const isEmpty = typeof currentText === 'string' && currentText.trim() === '';
//     // If they cleared the box, send null to delete the override, otherwise send the text
//     changes.userDefined.description = isEmpty ? null : currentText;

//     // Always remove from top-level to prevent bloating the main DB
//     delete changes.description;
//   } else {
//     // No change or matches what was already there, don't send it at all
//     delete changes.description;
//   }
//   const editedUD = (editedForSave as any).userDefined;
//   if (editedUD && Array.isArray(editedUD.images) && editedUD.images.length > 0) {
//     // If changes.userDefined already exists, merge images into it, otherwise set it.
//     if (changes.userDefined && typeof changes.userDefined === 'object') {
//       changes.userDefined = { ...(changes.userDefined as any), images: editedUD.images };
//     } else {
//       changes.userDefined = { images: editedUD.images };
//     }
//   }
//   try {
//     if (changes.userDefined && typeof (changes.userDefined as any).thumbnail === 'string' && !/^(user:|parsed:)/.test((changes.userDefined as any).thumbnail)) {
//       const rawThumb = (changes.userDefined as any).thumbnail as string;
//       const outgoingImgs = Array.isArray(changes.userDefined.images) ? (changes.userDefined as any).images : (Array.isArray(editedForSave.userDefined?.images) ? editedForSave.userDefined.images : []);
//       const originalParsed = Array.isArray((original as any).images) ? (original as any).images : [];
//       const originalTop = (original as any).thumbnail || '';
//       let safeThumb: string | undefined = undefined;
//       if (rawThumb.startsWith('data:')) {
//         const uidx = outgoingImgs.findIndex((u: any) => getUserImageData(u) === rawThumb);
//         if (uidx !== -1) safeThumb = `user:${uidx}`;
//         else if (originalTop && rawThumb === originalTop) safeThumb = 'parsed:0';
//         else if (originalParsed.includes(rawThumb)) safeThumb = `parsed:${originalParsed.indexOf(rawThumb)}`;
//       } else {
//         const pidx = originalParsed.indexOf(rawThumb);
//         if (pidx !== -1) safeThumb = `parsed:${pidx}`;
//         else if (rawThumb === originalTop) safeThumb = 'parsed:0';
//       }
//       if (typeof safeThumb !== 'undefined') {
//         (changes.userDefined as any).thumbnail = safeThumb;
//       } else {
//         // If we can't safely convert, remove the raw thumbnail to avoid sending base64
//         delete (changes.userDefined as any).thumbnail;
//       }
//     }
//   } catch (e) {
//     console.warn('Failed to normalize existing changes.userDefined.thumbnail:', e);
//   }
//   try {
//     const hasUdChanges = changes.userDefined && typeof changes.userDefined === 'object';
//     const hasUdThumb = hasUdChanges && typeof (changes.userDefined as any).thumbnail !== 'undefined';
//     const editedForSaveUd = editedForSave && (editedForSave as any).userDefined && typeof (editedForSave as any).userDefined === 'object'
//       ? (editedForSave as any).userDefined
//       : undefined;
//     if (!hasUdThumb && editedForSaveUd && typeof editedForSaveUd.thumbnail !== 'undefined') {
//       const candidateThumb = editedForSaveUd.thumbnail as any;
//       // Build the images array that will be sent (prefer changes.userDefined.images)
//       const outgoingImgs = Array.isArray(changes.userDefined?.images)
//         ? (changes.userDefined as any).images
//         : (Array.isArray(editedForSaveUd?.images) ? editedForSaveUd.images : []);

//       let computed: string | undefined = undefined;
//       const originalParsed = Array.isArray((original as any).images) ? (original as any).images : [];
//       const originalTop = (original as any).thumbnail || '';

//       if (typeof candidateThumb === 'string') {
//         const s = candidateThumb;
//         if (/^(user:|parsed:)/.test(s)) {
//           computed = s;
//         } else if (s.startsWith('data:')) {
//           const uidx = outgoingImgs.findIndex((u: any) => getUserImageData(u) === s);
//           if (uidx !== -1) computed = `user:${uidx}`;
//           else if (originalTop && s === originalTop) computed = 'parsed:0';
//           else if (originalParsed.includes(s)) computed = `parsed:${originalParsed.indexOf(s)}`;
//         } else {
//           const pidx = originalParsed.indexOf(s);
//           if (pidx !== -1) computed = `parsed:${pidx}`;
//           else if (s === originalTop) computed = 'parsed:0';
//         }
//       } else if (candidateThumb && typeof candidateThumb === 'object' && typeof (candidateThumb as any).data === 'string') {
//         const data = (candidateThumb as any).data;
//         const uidx = outgoingImgs.findIndex((u: any) => getUserImageData(u) === data);
//         if (uidx !== -1) computed = `user:${uidx}`;
//         else if (originalTop && data === originalTop) computed = 'parsed:0';
//         else if (originalParsed.includes(data)) computed = `parsed:${originalParsed.indexOf(data)}`;
//       }

//       if (typeof computed !== 'undefined') {
//         if (!changes.userDefined || typeof changes.userDefined !== 'object') changes.userDefined = {};
//         (changes.userDefined as any).thumbnail = computed;
//       }
//     }
//   } catch (e) {
//     // Non-fatal: continue without forcing thumbnail
//     console.warn('Failed to include edited nested thumbnail into changes (defensive):', e);
//   }
//   if (editedUD && typeof editedUD === 'object') {
//     const editedThumb = (editedUD as any).thumbnail;
//     const origUD = (original as any).userDefined && typeof (original as any).userDefined === 'object' ? (original as any).userDefined : undefined;
//     const origThumb = origUD ? (origUD as any).thumbnail : undefined;
//     // Compare serialized forms to detect changes (handles string or object forms)
//     const editedThumbStr = typeof editedThumb === 'undefined' ? undefined : JSON.stringify(editedThumb);
//     const origThumbStr = typeof origThumb === 'undefined' ? undefined : JSON.stringify(origThumb);
//     if (editedThumbStr !== origThumbStr) {
//       if (!changes.userDefined || typeof changes.userDefined !== 'object') changes.userDefined = {};
//       const editedThumbAny = (editedUD as any).thumbnail;
//       let safeThumb: string | undefined = undefined;
//       const changeUDImgs = Array.isArray(changes.userDefined?.images) ? changes.userDefined.images : (Array.isArray(editedUD?.images) ? editedUD.images : []);
//       const originalParsed = Array.isArray((original as any).images) ? (original as any).images : [];
//       const originalTop = (original as any).thumbnail || '';

//       if (typeof editedThumbAny === 'string') {
//         const s = editedThumbAny;
//         if (/^(user:|parsed:)/.test(s)) {
//           safeThumb = s; // already a descriptor
//         } else if (s.startsWith('data:')) {
//           // try to find in outgoing user images
//           const uidx = changeUDImgs.findIndex((u: any) => getUserImageData(u) === s);
//           if (uidx !== -1) safeThumb = `user:${uidx}`;
//           else if (originalTop && s === originalTop) safeThumb = 'parsed:0';
//           else if (originalParsed.includes(s)) safeThumb = `parsed:${originalParsed.indexOf(s)}`;
//           // otherwise leave undefined to avoid sending raw data
//         } else {
//           // non-data string - maybe matches a parsed image
//           const pidx = originalParsed.indexOf(s);
//           if (pidx !== -1) safeThumb = `parsed:${pidx}`;
//           else if (s === originalTop) safeThumb = 'parsed:0';
//           else {
//             // Unknown string; do not send raw unknown values
//           }
//         }
//       } else if (editedThumbAny && typeof editedThumbAny === 'object' && typeof (editedThumbAny as any).data === 'string') {
//         const data = (editedThumbAny as any).data;
//         const uidx = changeUDImgs.findIndex((u: any) => getUserImageData(u) === data);
//         if (uidx !== -1) safeThumb = `user:${uidx}`;
//         else if (originalTop && data === originalTop) safeThumb = 'parsed:0';
//         else if (originalParsed.includes(data)) safeThumb = `parsed:${originalParsed.indexOf(data)}`;
//       }

//       if (typeof safeThumb !== 'undefined') {
//         if (!changes.userDefined || typeof changes.userDefined !== 'object') changes.userDefined = {};
//         changes.userDefined.thumbnail = safeThumb;
//       } else {
//         // omit thumbnail change to avoid sending base64; let server preserve parsed thumbnail
//       }
//     }
//   }

//
//   try {
//     const ud0 = (editedForSave as any).userDefined && typeof (editedForSave as any).userDefined === 'object' ? (editedForSave as any).userDefined : undefined;
//     // If there's an explicit imageOrder, prefer its first descriptor as the thumbnail
//     if (ud0 && Array.isArray(ud0.imageOrder) && ud0.imageOrder.length > 0) {
//       try {
//         ud0.thumbnail = ud0.imageOrder[0];
//       } catch (e) {
//         // ignore
//       }
//     }
//     if (ud0 && typeof ud0.thumbnail === 'string' && ud0.thumbnail.length > 0) {
//       if (!changes.userDefined || typeof changes.userDefined !== 'object') changes.userDefined = {};
//       // Do not overwrite an explicit thumbnail already present in changes.userDefined
//       if (!(changes.userDefined && (changes.userDefined as any).thumbnail)) {
//         changes.userDefined = { ...(changes.userDefined as any), thumbnail: ud0.thumbnail };
//       }
//     }
//   } catch (e) {
//     // Non-fatal: proceed without forcing thumbnail into changes
//     console.warn('Failed to defensively include nested thumbnail into changes', e);
//   }
//   try {
//     const editedUdFinal = (editedForSave as any).userDefined && typeof (editedForSave as any).userDefined === 'object'
//       ? (editedForSave as any).userDefined
//       : undefined;
//     if (editedUdFinal && Array.isArray(editedUdFinal.imageOrder) && editedUdFinal.imageOrder.length > 0) {
//       const firstDesc = editedUdFinal.imageOrder[0];
//       if (typeof firstDesc === 'string' && firstDesc.length > 0) {
//         if (!changes.userDefined || typeof changes.userDefined !== 'object') changes.userDefined = {};
//         // Only overwrite if it's missing or different to avoid stomping other client intent
//         if ((changes.userDefined as any).thumbnail !== firstDesc) {
//           (changes.userDefined as any).thumbnail = firstDesc;
//         }
//       }
//     }
//   } catch (e) {
//     // Non-fatal - continue with the best effort payload
//     console.warn('Failed final enforcement of nested thumbnail into outgoing changes:', e);
//   }
//   try {
//     // Log a compact preview of the outgoing payload for debugging (avoid dumping full base64 blobs)
//     try {
//       const preview = { filePath: editedForSave.filePath, changes: { ...changes } } as any;
//       if (preview.changes && preview.changes.userDefined && typeof preview.changes.userDefined === 'object') {
//         const ud0 = preview.changes.userDefined;
//         if (ud0 && Array.isArray(ud0.images)) {
//           preview.changes.userDefined = { ...ud0, images: `[${ud0.images.length} images]` } as any;
//         }
//       }
//       console.debug('POST /api/save-model payload preview:', preview);
//     } catch (e) {
//       // Don't let logging break the save flow
//       console.warn('Failed to produce save-model preview log', e);
//     }
//     try {
//       const udPreview = changes.userDefined && typeof changes.userDefined === 'object'
//         ? { ...changes.userDefined, images: Array.isArray(changes.userDefined.images) ? `[${changes.userDefined.images.length} images]` : changes.userDefined.images }
//         : undefined;
//       const preview = { filePath: editedForSave.filePath, changes: { ...changes, userDefined: udPreview ? udPreview : undefined } };
//       console.debug('POST /api/save-model payload preview (sanitized):', preview);
//     } catch (e) {
//       console.warn('Failed to produce save-model preview log', e);
//     }

//     const response = await fetch('/api/save-model', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ filePath: editedForSave.filePath, changes })
//     });
//     const result = await response.json();
//     if (!result.success) {
//       throw new Error(result.error || 'Failed to save model');
//     }
//     // Show any server-side rejections (e.g., UNC paths removed)
//     if (result && Array.isArray(result.rejected_related_files) && result.rejected_related_files.length > 0) {
//       setServerRejectedRelated(result.rejected_related_files);
//     } else {
//       setServerRejectedRelated([]);
//     }
//     let refreshedModel: Model | undefined = undefined;
//     try {
//       const allResp = await fetch('/api/models');
//       if (allResp.ok) {
//         const all = await allResp.json();
//         // Prefer matching by id, fallback to matching by filePath if provided
//         const candidate = all.find((m: any) => (editedForSave.id && m.id === editedForSave.id) || (editedForSave.filePath && m.filePath === editedForSave.filePath));
//         if (candidate) refreshedModel = candidate as Model;
//       }
//     } catch (e) {
//       console.warn('Failed to refresh model after save:', e);
//     }

//     return { success: true, serverResponse: result, refreshedModel };
//   } catch (err: unknown) {
//     console.error("Failed to save model to file:", err);
//     const msg = err instanceof Error ? err.message : String(err);
//     return { success: false, error: msg } as any;
//   }
// };

// Check connection on open
// useEffect(() => {
//   if (isOpen) {
//     fetch('/api/printer/status')
//       .then(r => r.json())
//       .then(d => {
//         // Check if we have a valid list of printers
//         if (d.printers && Array.isArray(d.printers)) {
//           setAvailablePrinters(d.printers);
//         } else {
//           setAvailablePrinters([]);
//         }
//       })
//       .catch(() => setAvailablePrinters([]));
//   }
// }, [isOpen]);

// const handleSendToPrinter = async (printerIndex: number) => {
//   // Requires a G-code file path
//   if (!currentModel || !currentModel.gcodeData?.gcodeFilePath) return;

//   setIsSending(true);
//   try {
//     const res = await fetch('/api/printer/print', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({
//         filePath: currentModel.gcodeData.gcodeFilePath,
//         printerIndex: printerIndex // Send specific index
//       })
//     });
//     const data = await res.json();
//     if (data.success) {
//       toast.success(data.message || "Sent to Printer!");
//       setIsPrintDialogOpen(false); // Close dialog
//     }
//     else toast.error("Failed: " + data.error);
//   } catch (e) {
//     toast.error("Network error");
//   } finally {
//     setIsSending(false);
//   }
// };

// const saveChanges = async () => {
//   if (editedModel) {
//     if (isSaving) return; // prevent double-submit
//     setIsSaving(true);
//     try {
//       let modelToPersist = editedModel;
//       if (inlineCombined) {
//         const combined = inlineCombined.slice();
//         const parsedSnapshotInline = parsedImagesSnapshotRef.current || [];
//         const newParsedImages = parsedSnapshotInline.slice();
//         const originalUserImages = (editedModel as any).userDefined && typeof (editedModel as any).userDefined === 'object' && Array.isArray((editedModel as any).userDefined.images)
//           ? (editedModel as any).userDefined.images.slice()
//           : [];
//         const udObj = (editedModel as any).userDefined && typeof (editedModel as any).userDefined === 'object' ? { ...(editedModel as any).userDefined } : {};
//         udObj.images = originalUserImages;
//         const newImageOrder: string[] = [];
//         for (const img of combined) {
//           if (parsedSnapshotInline.includes(img)) {
//             // This is a parsed image - find its index in the ORIGINAL parsed array
//             const parsedIdx = parsedSnapshotInline.indexOf(img);
//             newImageOrder.push(`parsed:${parsedIdx}`);
//           } else {
//             const userIdx = originalUserImages.findIndex((u: any) => getUserImageData(u) === img);
//             if (userIdx !== -1) {
//               newImageOrder.push(`user:${userIdx}`);
//             }
//           }
//         }
//         const firstDescriptor = newImageOrder[0];
//         const copyUd0 = { ...(udObj as any) };
//         if (firstDescriptor) {
//           copyUd0.thumbnail = firstDescriptor;
//         } else {
//           if (copyUd0.thumbnail) delete copyUd0.thumbnail;
//         }
//         copyUd0.imageOrder = newImageOrder;
//         modelToPersist = { ...editedModel, parsedImages: newParsedImages, userDefined: copyUd0 } as Model;
//       } else {
//         const cleanedModel = { ...editedModel };
//         if ('images' in cleanedModel) {
//           delete (cleanedModel as any).images;
//         }
//         const udObj = cleanedModel.userDefined && typeof cleanedModel.userDefined === 'object' ? { ...(cleanedModel.userDefined as any) } : {};
//         const currentImageOrder = Array.isArray(udObj.imageOrder) ? udObj.imageOrder : [];
//         const firstDescriptor = currentImageOrder[0];
//         if (firstDescriptor && typeof firstDescriptor === 'string') {
//           udObj.thumbnail = firstDescriptor;
//           cleanedModel.userDefined = udObj;
//         }

//         modelToPersist = cleanedModel;
//       }
//       let finalModel = modelToPersist;
//       if (selectedImageIndexes.length > 0) {
//         const sel = new Set(selectedImageIndexes);
//         const parsedImages = Array.isArray(finalModel.parsedImages) ? finalModel.parsedImages.slice() : [];
//         const userImages = Array.isArray((finalModel as any).userDefined?.images)
//           ? (finalModel as any).userDefined.images.slice()
//           : [];
//         const currentOrder = Array.isArray((finalModel as any).userDefined?.imageOrder)
//           ? (finalModel as any).userDefined.imageOrder.slice()
//           : buildImageOrderFromModel(finalModel);
//         const parsedToRemove = new Set<number>();
//         const userToRemove = new Set<number>();
//         const remainingOrder: string[] = [];
//         currentOrder.forEach((desc: string, orderIndex: number) => {
//           if (sel.has(orderIndex)) {
//             if (typeof desc === 'string' && desc.startsWith('parsed:')) {
//               const parsedIndex = parseInt(desc.split(':')[1] || '', 10);
//               if (!isNaN(parsedIndex)) {
//                 parsedToRemove.add(parsedIndex);
//               }
//             } else if (typeof desc === 'string' && desc.startsWith('user:')) {
//               const userIndex = parseInt(desc.split(':')[1] || '', 10);
//               if (!isNaN(userIndex)) {
//                 userToRemove.add(userIndex);
//               }
//             }
//           } else {
//             // Keep this descriptor, but may need to adjust indices
//             remainingOrder.push(desc);
//           }
//         });
//         const newParsedImages = parsedImages.filter((_: any, index: number) => !parsedToRemove.has(index));
//         const newUserImages = userImages.filter((_: any, index: number) => !userToRemove.has(index));
//         const adjustedOrder: string[] = [];
//         let parsedShift = 0;
//         let userShift = 0;

//         remainingOrder.forEach(desc => {
//           if (typeof desc === 'string' && desc.startsWith('parsed:')) {
//             const oldIndex = parseInt(desc.split(':')[1] || '', 10);
//             if (!isNaN(oldIndex)) {
//               // Count how many parsed images with lower indices were removed
//               parsedShift = Array.from(parsedToRemove).filter(removedIdx => removedIdx < oldIndex).length;
//               const newIndex = oldIndex - parsedShift;
//               if (newIndex >= 0 && newIndex < newParsedImages.length) {
//                 adjustedOrder.push(`parsed:${newIndex}`);
//               }
//             }
//           } else if (typeof desc === 'string' && desc.startsWith('user:')) {
//             const oldIndex = parseInt(desc.split(':')[1] || '', 10);
//             if (!isNaN(oldIndex)) {
//               userShift = Array.from(userToRemove).filter(removedIdx => removedIdx < oldIndex).length;
//               const newIndex = oldIndex - userShift;
//               if (newIndex >= 0 && newIndex < newUserImages.length) {
//                 adjustedOrder.push(`user:${newIndex}`);
//               }
//             }
//           } else {
//             adjustedOrder.push(desc);
//           }
//         });
//         const finalUdObj = finalModel.userDefined && typeof finalModel.userDefined === 'object' ? { ...(finalModel.userDefined as any) } : {};
//         finalUdObj.images = newUserImages;
//         finalUdObj.imageOrder = adjustedOrder;
//         if (adjustedOrder.length > 0) {
//           finalUdObj.thumbnail = adjustedOrder[0]; // First image becomes thumbnail
//         } else {
//           // No images left, clear thumbnail
//           delete finalUdObj.thumbnail;
//         }
//         finalModel = {
//           ...finalModel,
//           parsedImages: newParsedImages,
//           userDefined: finalUdObj
//         } as Model;
//       }
//       // Validate related_files before applying to the app state and saving
//       const { cleaned, invalid } = validateAndNormalizeRelatedFiles(finalModel.related_files as any);
//       setInvalidRelated(invalid);
//       if (invalid.length > 0) {
//         // Block save and keep user in edit mode
//         return;
//       }

//       // Replace with cleaned values before persisting
//       finalModel = { ...finalModel, related_files: cleaned } as Model;

//       // Ensure nested thumbnail is set to the first imageOrder descriptor
//       // so it will be picked up by the diff and included in the save payload.
//       try {
//         const udObj = finalModel.userDefined && typeof finalModel.userDefined === 'object' ? { ...(finalModel.userDefined as any) } : undefined;
//         const order = udObj && Array.isArray(udObj.imageOrder) ? udObj.imageOrder : undefined;
//         if (order && order.length > 0 && typeof order[0] === 'string') {
//           // Set nested thumbnail to the first descriptor (parsed:N or user:N)
//           udObj.thumbnail = order[0];
//           finalModel = { ...finalModel, userDefined: udObj } as Model;
//         }
//       } catch (e) {
//         console.warn('Failed to ensure nested thumbnail before save:', e);
//       }
//       try {
//         // Read imageOrder from userDefined.imageOrder (canonical place)
//         const imageOrder: string[] | undefined = Array.isArray((finalModel as any).userDefined?.imageOrder)
//           ? (finalModel as any).userDefined.imageOrder
//           : undefined;
//         if (Array.isArray(imageOrder) && imageOrder.length > 0) {
//           const parsedSnapshot = parsedImagesSnapshotRef.current || [];
//           const finalParsed: string[] = [];
//           let resolvedThumbnail = finalModel.thumbnail || '';
//           for (const desc of imageOrder) {
//             if (typeof desc !== 'string') continue;
//             if (desc.startsWith('parsed:')) {
//               const idx = parseInt(desc.split(':')[1] || '', 10);
//               if (!isNaN(idx) && parsedSnapshot[idx]) finalParsed.push(parsedSnapshot[idx]);
//             } else if (desc.startsWith('user:')) {
//               // skip - user images belong in userDefined only
//             } else {
//               // fallback: try to match in parsedSnapshot
//               const pidx = parsedSnapshot.indexOf(desc);
//               if (pidx !== -1) finalParsed.push(parsedSnapshot[pidx]);
//             }
//           }
//           finalModel = { ...finalModel, images: finalParsed, thumbnail: resolvedThumbnail } as Model;
//         } else {
//           // No imageOrder: legacy behavior keeps existing images as-is
//         }
//       } catch (e) {
//         console.warn('Failed to normalize images from imageOrder before save:', e);
//       }

//       // Persist to server first. After successful save, update the app state.
//       const result = await saveModelToFile(finalModel, model!); // Only send changed fields
//       if (result && result.success) {
//         const refreshed: Model | undefined = (result as any).refreshedModel;
//         if (refreshed) {
//           onModelUpdate(refreshed);
//         } else {
//           onModelUpdate(finalModel);
//         }
//         setIsEditing(false);
//         setEditedModel(null);
//         setSelectedImageIndexes([]);
//         setInlineCombined(null);
//       } else {
//         return;
//       }
//     } finally {
//       setIsSaving(false);
//     }
//   }
// };