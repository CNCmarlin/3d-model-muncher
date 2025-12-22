import { useState, useEffect, useMemo } from "react";
import { FilterSidebar } from "./components/FilterSidebar";
import { ModelGrid } from "./components/ModelGrid";
import { ModelDetailsDrawer } from "./components/ModelDetailsDrawer";
import { BulkEditDrawer } from "./components/BulkEditDrawer";
import { DonationDialog } from "./components/DonationDialog";
import { SettingsPage } from "./components/SettingsPage";
import { DemoPage } from "./components/DemoPage";
import { ThemeProvider } from "./components/ThemeProvider";
import { TagsProvider } from "./components/TagsContext";
import { ThemeToggle } from "./components/ThemeToggle";
import { Model } from "./types/model";
import { Category } from "./types/category";
import { AppConfig } from "./types/config";
import { ConfigManager } from "./utils/configManager";
// Import package.json to read the last published version
import * as pkg from '../package.json';
import { applyFiltersToModels, FilterState } from "./utils/filterUtils";
import { sortModels, sortCollections, SortKey } from "./utils/sortUtils";
import { Menu, RefreshCw, Heart, FileCheck, Files, Box, Upload, List } from "lucide-react";
import ModelUploadDialog from "./components/ModelUploadDialog";
import { Button } from "./components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./components/ui/dropdown-menu";
import { Checkbox } from "./components/ui/checkbox";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./components/ui/alert-dialog";
import { Separator } from "./components/ui/separator";
import CollectionGrid from "./components/CollectionGrid";
import type { Collection } from "./types/collection";
import { applyThemeColor } from "./utils/themeUtils"; 
import { ThingiverseImportDialog } from "./components/ThingiverseImportDialog";
import { CollectionCard } from "./components/CollectionCard";
import { LayoutSettingsProvider } from "./components/LayoutSettingsContext";
import { CollectionListRow } from "./components/CollectionListRow"; 
import { useLayoutSettings } from "./components/LayoutSettingsContext";
import { LayoutControls } from "./components/LayoutControls";

// Initial type for view
type ViewType = 'models' | 'settings' | 'demo' | 'collections' | 'collection-view';

// Helper: Recursively get all model IDs from a collection and its children
const getRecursiveModelIds = (col: Collection, allCols: Collection[]): Set<string> => {
  const ids = new Set(col.modelIds || []);
  const children = allCols.filter(c => c.parentId === col.id);
  for (const child of children) {
    const childIds = getRecursiveModelIds(child, allCols);
    childIds.forEach(id => ids.add(id));
  }
  return ids;
};

function AppContent() {
  const { viewMode, getGridClasses } = useLayoutSettings();
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [filteredModels, setFilteredModels] = useState<Model[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentView, setCurrentView] = useState<ViewType>('models');
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModelsLoading, setIsModelsLoading] = useState(false);
  const [lastCategoryFilter, setLastCategoryFilter] = useState<string>('all');

  // Dialog states
  const [isDonationDialogOpen, setIsDonationDialogOpen] = useState(false);
  const [isReleaseNotesOpen, setIsReleaseNotesOpen] = useState(false);
  const [dontShowReleaseNotes, setDontShowReleaseNotes] = useState(false);

  // Bulk selection state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [selectionAnchorIndex, setSelectionAnchorIndex] = useState<number | null>(null);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Collections state
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeCollection, setActiveCollection] = useState<Collection | null>(null);

  const [lastFilters, setLastFilters] = useState<{ search: string; category: string; printStatus: string; license: string; fileType: string; tags: string[]; showHidden: boolean; showMissingImages: boolean; sortBy?: string }>(
    { search: '', category: 'all', printStatus: 'all', license: 'all', fileType: 'all', tags: [], showHidden: false, showMissingImages: false, sortBy: 'none' }
  );

  const [sidebarResetKey, setSidebarResetKey] = useState(0);
  const [currentSortBy, setCurrentSortBy] = useState<SortKey>('none');

  const hasActiveFilters = useMemo(() => {
    return lastFilters.search.length > 0 || 
           lastFilters.tags.length > 0 || 
           lastFilters.category !== 'all' ||
           lastFilters.printStatus !== 'all' ||
           lastFilters.license !== 'all';
  }, [lastFilters]);

  const collectionBaseModels = useMemo(() => {
    if (activeCollection) {
      // Use recursive helper to get ALL nested model IDs so tags populate correctly
      const idSet = getRecursiveModelIds(activeCollection, collections);
      return models.filter(m => idSet.has(m.id));
    }
    return models;
  }, [models, activeCollection, collections]);

  const [includeThreeMfFiles, setIncludeThreeMfFiles] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<string | undefined>(undefined);
  const [settingsAction, setSettingsAction] = useState<null | { type: 'hash-check' | 'generate'; fileType: '3mf' | 'stl' }>(null);
  const [pendingBulkCollectionId, setPendingBulkCollectionId] = useState<string | null>(null);

  const handleCollectionCreatedForBulkEdit = (collectionId: string) => {
    setPendingBulkCollectionId(collectionId);
    // Switch to models view so the BulkEditDrawer (and grid) can render
    setCurrentView('models');

    // Ensure selection mode is on; the useEffect below will open the drawer
    if (!isSelectionMode) {
      setIsSelectionMode(true);
    } else {
      setIsBulkEditOpen(true);
    }
  };

  // Watch for pending collection actions to auto-open the drawer
  useEffect(() => {
    if (pendingBulkCollectionId && isSelectionMode) {
      setIsBulkEditOpen(true);
    }
  }, [pendingBulkCollectionId, isSelectionMode]);

  // [NEW] CRITICAL FIX: Theme Persistence
  // This useEffect ensures the theme color is re-applied whenever the config changes.
  // It handles the case where ThemeProvider wipes styles on mount, or when config loads late.
  useEffect(() => {
    if (appConfig) {
      const color = appConfig.settings?.primaryColor || null;
      applyThemeColor(color);
    }
  }, [appConfig]);

  useEffect(() => {
    async function loadInitialData() {
      try {
        let config: AppConfig | null = null;

        // 1. Try to load from LocalStorage first (Fastest)
        try {
          const stored = localStorage.getItem('3d-model-muncher-config');
          if (stored) {
            config = ConfigManager.loadConfig();
          }
        } catch (e) { console.warn(e); }

        // 2. Try to load from Server (Authoritative)
        // Note: Logic allows local storage to win if it exists, to support offline dev or overrides
        if (!config) {
          try {
            const resp = await fetch('/api/load-config');
            if (resp.ok) {
              const data = await resp.json();
              if (data && data.success && data.config) {
                config = data.config;
                // Sync server config to local storage
                try { ConfigManager.saveConfig(data.config); } catch (e) { console.warn(e); }
              }
            }
          } catch (e) { console.warn(e); }
        }

        // 3. Fallback to Defaults
        if (!config) {
          config = ConfigManager.getDefaultConfig();
        }

        // 4. Apply Theme Immediately (Prevent Flash)
        // We do this before setting state so it paints as fast as possible
        const savedColor = config.settings?.primaryColor || null;
        if (savedColor) {
          applyThemeColor(savedColor);
        } else {
          // Ensure we reset if no color is saved
          applyThemeColor(null);
        }

        setAppConfig(config);
        setCategories(config.categories);

        setIsModelsLoading(true);
        toast("Loading model metadata...", {
          description: "Models are being loaded. This may take a minute for large libraries. Please wait."
        });

        const response = await fetch('/api/models');
        if (!response.ok) {
          throw new Error('Failed to fetch models');
        }
        const loadedModels = await response.json();
        setModels(loadedModels);

        const defaultFilters = config.filters || { defaultCategory: 'all', defaultPrintStatus: 'all', defaultLicense: 'all' };
        const initialFilterState = {
          search: '',
          category: defaultFilters.defaultCategory,
          printStatus: defaultFilters.defaultPrintStatus,
          license: defaultFilters.defaultLicense,
          fileType: 'all',
          tags: [] as string[],
          showHidden: false,
          showMissingImages: false,
          sortBy: defaultFilters.defaultSortBy || 'none',
        };

        const visibleModels = applyFiltersToModels(loadedModels, initialFilterState as FilterState);
        setFilteredModels(visibleModels);
        setLastFilters(initialFilterState);
        setCurrentSortBy((initialFilterState.sortBy || 'none') as SortKey);
        setIsModelsLoading(false);

        try {
          const colResp = await fetch('/api/collections');
          if (colResp.ok) {
            const data = await colResp.json();
            if (data && data.success && Array.isArray(data.collections)) setCollections(data.collections);
          }
        } catch (e) { /* ignore */ }
      } catch (error) {
        console.error('Failed to load configuration or models:', error);
        const defaultConfig = ConfigManager.getDefaultConfig();
        setAppConfig(defaultConfig);
        setCategories(defaultConfig.categories);
        setIsModelsLoading(false);
      }
    }

    loadInitialData();
  }, []);

  useEffect(() => {
    if (!appConfig) return;
    try {
      const getMajorMinor = (v: string) => {
        const parts = (v || '').split('.');
        return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : v;
      };
      const rawVersion = (pkg && pkg.version) ? String(pkg.version) : ConfigManager.getDefaultConfig().version || '0.0.0';
      const previousVersion = getMajorMinor(rawVersion);
      const key = `release-notes:${previousVersion}`;
      const stored = localStorage.getItem(key);

      if (!stored) {
        setIsReleaseNotesOpen(true);
      } else {
        if (stored === 'show') setIsReleaseNotesOpen(true);
      }
    } catch (e) {
      setIsReleaseNotesOpen(true);
    }
  }, [appConfig]);

  const closeReleaseNotes = (dontShow: boolean) => {
    const getMajorMinor = (v: string) => {
      const parts = (v || '').split('.');
      return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : v;
    };
    const rawVersion = (pkg && pkg.version) ? String(pkg.version) : ConfigManager.getDefaultConfig().version || '0.0.0';
    const previousVersion = getMajorMinor(rawVersion);
    const key = `release-notes:${previousVersion}`;
    try {
      localStorage.setItem(key, dontShow ? 'hidden' : 'show');
    } catch (e) { console.warn(e); }
    setDontShowReleaseNotes(dontShow);
    setIsReleaseNotesOpen(false);
  };

  const handleModelClick = (model: Model) => {
    if (isSelectionMode && (currentView === 'models' || currentView === 'collection-view')) {
      handleModelSelection(model.id);
      return;
    }
    setSelectedModel(model);
    setIsDrawerOpen(true);
  };

  const handleModelUpdate = (updatedModel: Model) => {
    const updatedModels = models.map(model =>
      model.id === updatedModel.id ? updatedModel : model
    );
    setModels(updatedModels);
    setSelectedModel(updatedModel);

    const updatedFilteredModels = filteredModels.map(model =>
      model.id === updatedModel.id ? updatedModel : model
    );
    setFilteredModels(updatedFilteredModels);
  };

  const handleBulkModelsUpdate = (updatedModels: Model[]) => {
    setModels(updatedModels);
    const updatedFilteredModels = filteredModels.map(filteredModel => {
      const updatedModel = updatedModels.find(model => model.id === filteredModel.id);
      return updatedModel || filteredModel;
    });
    setFilteredModels(updatedFilteredModels);
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    if (isSelectionMode) {
      setSelectedModelIds([]);
      setSelectionAnchorIndex(null);
    }
  };

  const handleModelSelection = (modelId: string, opts?: { shiftKey?: boolean; index?: number }) => {
    const currentIndex = typeof opts?.index === 'number' ? opts!.index as number : filteredModels.findIndex(m => m.id === modelId);

    if (opts?.shiftKey && selectionAnchorIndex !== null && currentIndex !== -1) {
      const start = Math.min(selectionAnchorIndex, currentIndex);
      const end = Math.max(selectionAnchorIndex, currentIndex);
      const rangeIds = filteredModels.slice(start, end + 1).map(m => m.id);
      setSelectedModelIds(prev => {
        const set = new Set(prev);
        const allSelected = rangeIds.every(id => set.has(id));
        if (allSelected) {
          rangeIds.forEach(id => set.delete(id));
        } else {
          rangeIds.forEach(id => set.add(id));
        }
        return Array.from(set);
      });
      return;
    }

    setSelectedModelIds(prev =>
      prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId]
    );
    if (currentIndex !== -1) setSelectionAnchorIndex(currentIndex);
  };

  const selectAllModels = () => {
    const allVisibleIds = filteredModels.map(model => model.id);
    setSelectedModelIds(allVisibleIds);
    setSelectionAnchorIndex(0);
  };

  const deselectAllModels = () => {
    setSelectedModelIds([]);
    setSelectionAnchorIndex(null);
  };

  const exitSelectionMode = () => {
    setSelectedModelIds([]);
    setIsSelectionMode(false);
    setSelectionAnchorIndex(null);
  };

  const getSelectedModels = (): Model[] => {
    return models.filter(model => selectedModelIds.includes(model.id));
  };

  const handleBulkEdit = () => {
    if (selectedModelIds.length === 0) {
      toast("No models selected", { description: "Please select models first before bulk editing" });
      return;
    }
    setIsBulkEditOpen(true);
  };

  const handleBulkDeleteClick = () => {
    if (selectedModelIds.length === 0) {
      toast("No models selected", { description: "Please select models first before deleting" });
      return;
    }
    setIncludeThreeMfFiles(false);
    setIsDeleteDialogOpen(true);
  };

  const handleBulkDelete = async () => {
    if (selectedModelIds.length === 0) return;
    setIsDeleteDialogOpen(false);

    try {
      const fileTypes = ['json'];
      if (includeThreeMfFiles) {
        fileTypes.push('3mf');
        fileTypes.push('stl');
      }

      toast("Deleting model files...", {
        description: `Removing files for ${selectedModelIds.length} models`
      });

      const deleteResponse = await fetch('/api/models/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelIds: selectedModelIds,
          fileTypes: fileTypes
        })
      });

      if (!deleteResponse.ok) throw new Error('Failed to delete model files');

      const deleteResult = await deleteResponse.json();

      if (deleteResult.success) {
        const successfullyDeletedIds = selectedModelIds.filter(modelId => {
          const modelDeleted = deleteResult.deleted?.some((item: any) =>
            item.modelId === modelId && fileTypes.includes(item.type)
          );
          return modelDeleted;
        });

        const updatedModels = models.filter(model => !successfullyDeletedIds.includes(model.id));
        setModels(updatedModels);

        const updatedFilteredModels = filteredModels.filter(model => !successfullyDeletedIds.includes(model.id));
        setFilteredModels(updatedFilteredModels);

        setSelectedModelIds([]);

        const successCount = successfullyDeletedIds.length;
        const errorCount = deleteResult.errors?.length || 0;

        if (successCount > 0) {
          toast(`Deleted ${successCount} models`);
        }

        if (errorCount > 0) {
          console.error('Deletion errors:', deleteResult.errors);
          toast(`${errorCount} models could not be deleted`);
        }
        try {
          await handleRefreshModels();
        } catch (err) { console.error(err); }
      } else {
        throw new Error(deleteResult.error || 'Unknown deletion error');
      }
    } catch (error) {
      console.error('Failed to delete models:', error);
      toast("Failed to delete models");
    }
  };

  const handleSingleModelDelete = async (model: Model) => {
    try {
      const fileTypes = ['json', '3mf', 'stl'];
      toast("Deleting model...", { description: model.name });

      const deleteResponse = await fetch('/api/models/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelIds: [model.id],
          fileTypes: fileTypes
        })
      });

      if (!deleteResponse.ok) throw new Error('Failed to delete');
      const result = await deleteResponse.json();

      if (result.success) {
        toast.success("Model deleted");
        setIsDrawerOpen(false); // Close the drawer
        setSelectedModel(null);
        await handleRefreshModels(); // Refresh grid
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error("Failed to delete model");
    }
  };

  const handleBulkUpdateModels = (updatedModelsData: Partial<Model> & { bulkTagChanges?: { add: string[]; remove: string[] } }) => {
    const updatedModels = models.map(model => {
      if (selectedModelIds.includes(model.id)) {
        let updatedModel = { ...model };
        Object.keys(updatedModelsData).forEach(key => {
          if (key !== 'bulkTagChanges' && updatedModelsData[key as keyof Model] !== undefined) {
            (updatedModel as any)[key] = updatedModelsData[key as keyof Model];
          }
        });

        if (updatedModelsData.bulkTagChanges) {
          const { add, remove } = updatedModelsData.bulkTagChanges;
          let newTags = [...(updatedModel.tags || [])];
          if (remove && remove.length > 0) {
            newTags = newTags.filter(tag => !remove.includes(tag));
          }
          if (add && add.length > 0) {
            add.forEach(tag => {
              if (!newTags.includes(tag)) newTags.push(tag);
            });
          }
          updatedModel.tags = newTags;
        }
        return updatedModel;
      }
      return model;
    });

    setModels(updatedModels);

    const updatedFilteredModels = filteredModels.map(model => {
      if (selectedModelIds.includes(model.id)) {
        const updatedModel = updatedModels.find(m => m.id === model.id);
        return updatedModel || model;
      }
      return model;
    });
    setFilteredModels(updatedFilteredModels);

    setSelectedModelIds([]);
    setIsSelectionMode(false);
    setIsBulkEditOpen(false);

    toast(`Updated ${selectedModelIds.length} models`);
  };

  const handleBulkSavedModels = (updatedModels: Model[]) => {
    if (!updatedModels || updatedModels.length === 0) return;
    const updatedMap = new Map(updatedModels.map(m => [m.id, m]));
    const mergedModels = models.map(m => updatedMap.has(m.id) ? { ...m, ...(updatedMap.get(m.id) as Model) } : m);
    setModels(mergedModels);
    const mergedFiltered = filteredModels.map(m => updatedMap.has(m.id) ? { ...m, ...(updatedMap.get(m.id) as Model) } : m);
    setFilteredModels(mergedFiltered);
    setSelectedModelIds([]);
    setIsSelectionMode(false);
    setIsBulkEditOpen(false);
  };

  const handleFilterChange = (filters: {
    search: string;
    category: string;
    printStatus: string;
    license: string;
    fileType: string;
    tags: string[];
    showHidden: boolean;
    showMissingImages: boolean;
    sortBy?: string;
  }) => {
    const incomingSort = (filters.sortBy || 'none') as SortKey;
    setCurrentSortBy(incomingSort);
    const incomingFileType = (filters.fileType || 'all').toLowerCase();
    const incomingCategory = (filters.category || 'all');
    if (
      currentView === 'settings' &&
      incomingCategory.toLowerCase() !== (lastCategoryFilter || 'all').toLowerCase()
    ) {
      setCurrentView('models');
    }

    const baseModels = (currentView === 'collection-view' && activeCollection)
      ? collectionBaseModels
      : models;

    if (currentView !== 'collection-view') {
      if (incomingFileType === 'collections') {
        setLastFilters({ ...filters });
        setFilteredModels([]);
        setLastCategoryFilter(incomingCategory);
        if (isSelectionMode) setSelectedModelIds([]);
        return;
      }
    }

    const filterState: FilterState = {
      search: filters.search,
      category: filters.category,
      printStatus: filters.printStatus,
      license: filters.license,
      fileType: filters.fileType,
      tags: filters.tags,
      showHidden: filters.showHidden,
      showMissingImages: filters.showMissingImages,
    };
    

    const filtered = applyFiltersToModels(baseModels, filterState);
    const sortKey = (filters.sortBy || 'none') as SortKey;
    const sorted = sortModels(filtered as any[], sortKey);
    setFilteredModels(sorted);
    setLastFilters({ ...filters });
    setSelectionAnchorIndex(null);
    setLastCategoryFilter(incomingCategory);

    if (isSelectionMode) {
      const validSelections = selectedModelIds.filter(id =>
        filtered.some(model => model.id === id)
      );
      setSelectedModelIds(validSelections);
    }
  };

  const handleRefreshModels = async () => {
    setIsRefreshing(true);
    try {
      toast("Reloading model metadata...", { description: "Refreshing from existing JSON files" });
      const response = await fetch('/api/models');
      if (!response.ok) throw new Error('Failed to fetch models');
      const updatedModels = await response.json() as Model[];

      setModels(updatedModels);
      if (currentView === 'collection-view' && activeCollection) {
        const setIds = new Set(activeCollection.modelIds || []);
        let base = updatedModels.filter(m => setIds.has(m.id));
        const filtersForCollection = {
          ...lastFilters,
          fileType: lastFilters.fileType?.toLowerCase() === 'collections' ? 'all' : lastFilters.fileType,
        } as any as FilterState;
        const filtered = applyFiltersToModels(base, filtersForCollection);
        const sorted = sortModels(filtered as any[], (lastFilters.sortBy as SortKey) || 'none');
        setFilteredModels(sorted);
      } else {
        if ((lastFilters.fileType || '').toLowerCase() === 'collections') {
          setFilteredModels([]);
        } else {
          const filtered = applyFiltersToModels(updatedModels, lastFilters as FilterState);
          const sorted = sortModels(filtered as any[], (lastFilters.sortBy as SortKey) || 'none');
          setFilteredModels(sorted);
        }
      }
      toast("Models reloaded successfully");
    } catch (error) {
      console.error('Failed to refresh models:', error);
      toast("Failed to reload models");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCategoriesUpdate = (updatedCategories: Category[]) => {
    setCategories(updatedCategories);
    if (appConfig) {
      const updatedConfig = { ...appConfig, categories: updatedCategories };
      setAppConfig(updatedConfig);
      if (updatedConfig.settings.autoSave) {
        try {
          ConfigManager.saveConfig(updatedConfig);
          fetch('/api/save-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedConfig)
          }).catch(err => console.warn(err));
        } catch (error) { console.error(error); }
      }
    }
  };

  const handleConfigUpdate = (updatedConfig: AppConfig) => {
    try {
      ConfigManager.saveConfig(updatedConfig);
      fetch('/api/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig)
      }).catch(err => console.warn(err));
      setAppConfig(updatedConfig);
      setCategories(updatedConfig.categories);
    } catch (error) { console.error(error); }
  };

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const handleSettingsClick = () => {
    setSettingsInitialTab(undefined);
    setCurrentView('settings');
    setIsDrawerOpen(false);
    setIsSelectionMode(false);
    setSelectedModelIds([]);
  };

  // Upload dialog state
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false); // Existing state
  const [importTargetCollectionId, setImportTargetCollectionId] = useState<string | undefined>(undefined); // NEW State
  const [importTargetFolder, setImportTargetFolder] = useState<string | undefined>(undefined);

  const handleOpenImport = (collectionId?: string) => {
    setImportTargetCollectionId(collectionId);

    // Smart Folder Inference:
    // If we are in a collection, check the first file in that collection.
    // Use its folder as the default for the new import.
    let inferredFolder: string | undefined = undefined;

    if (collectionId) {
      const col = collections.find(c => c.id === collectionId);
      if (col && col.modelIds && col.modelIds.length > 0) {
        // Find the first model to check its path
        const firstModelId = col.modelIds[0];
        const representativeModel = models.find(m => m.id === firstModelId);

        if (representativeModel && representativeModel.filePath) {
          // Grab the full directory path (everything before the last slash)
          // e.g. "3d prints/cars/porsche/file.json" -> "3d prints/cars/porsche"
          const lastSlash = Math.max(
            representativeModel.filePath.lastIndexOf('/'),
            representativeModel.filePath.lastIndexOf('\\')
          );
          
          if (lastSlash > 0) {
             inferredFolder = representativeModel.filePath.substring(0, lastSlash);
          } else {
             // File is likely at root or has no path structure; fallback to 'imported' logic or leave undefined
             inferredFolder = 'imported'; 
          }
        }
      }
    }

    setImportTargetFolder(inferredFolder);
    setIsImportOpen(true);
  };

  const openSettingsOnTab = (tab: string, action?: { type: 'hash-check' | 'generate'; fileType: '3mf' | 'stl' }) => {
    setSettingsInitialTab(tab);
    setCurrentView('settings');
    setIsDrawerOpen(false);
    setIsSelectionMode(false);
    setSelectedModelIds([]);
    if (action) setSettingsAction(action);
  };

  const handleBackToModels = () => {
    setCurrentView('models');
  };

  const openCollectionsList = () => {
    setCurrentView('collections');
    setIsDrawerOpen(false);
    setIsSelectionMode(false);
  };
  const openCollection = (col: Collection) => {
    setActiveCollection(col);
    setCurrentView('collection-view');
    setIsDrawerOpen(false);
    try {
      const setIds = new Set(col.modelIds || []);
      const base = models.filter(m => setIds.has(m.id));
      setFilteredModels(base);
    } catch { /* ignore */ }
    setSidebarResetKey(k => k + 1);
  };
  const refreshCollections = async () => {
    try {
      const r = await fetch('/api/collections');
      if (r.ok) {
        const data = await r.json();
        if (data && data.success && Array.isArray(data.collections)) {
          setCollections(data.collections);
          if (activeCollection) {
            const updatedActive = data.collections.find((c: any) => c.id === activeCollection.id);
            if (updatedActive) setActiveCollection(updatedActive);
          }
        }
      }
      try {
        const resp = await fetch('/api/models');
        if (resp.ok) {
          const updatedModels = await resp.json() as Model[];
          setModels(updatedModels);
          if (currentView === 'collection-view' && activeCollection) {
            const setIds = new Set(activeCollection.modelIds || []);
            let base = updatedModels.filter(m => setIds.has(m.id));
            const filtersForCollection = {
              ...lastFilters,
              fileType: lastFilters.fileType?.toLowerCase() === 'collections' ? 'all' : lastFilters.fileType,
              showHidden: true,
            } as any as FilterState;
            const filtered = applyFiltersToModels(base, filtersForCollection);
            const sorted = sortModels(filtered as any[], (lastFilters.sortBy as SortKey) || 'none');
            setFilteredModels(sorted);
          } else {
            if ((lastFilters.fileType || '').toLowerCase() === 'collections') {
              setFilteredModels([]);
            } else {
              const filtered = applyFiltersToModels(updatedModels, lastFilters as FilterState);
              const sorted = sortModels(filtered as any[], (lastFilters.sortBy as SortKey) || 'none');
              setFilteredModels(sorted);
            }
          }
        }
      } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }
  };
  useEffect(() => {
    const handler = (ev: Event) => {
      try {
        const anyEv: any = ev as any;
        const col = anyEv?.detail as Collection | undefined;
        if (col && Array.isArray(col.modelIds)) {
          setActiveCollection(col);
          setCurrentView('collection-view');
        }
      } catch { /* ignore */ }
      refreshCollections();
    };
    window.addEventListener('collection-created', handler as any);
    return () => window.removeEventListener('collection-created', handler as any);
  }, []);

  useEffect(() => {
    const handler = () => { refreshCollections(); };
    window.addEventListener('collection-updated', handler);
    return () => window.removeEventListener('collection-updated', handler);
  }, [activeCollection, lastFilters, currentView]);

  const handleDonationClick = () => {
    setIsDonationDialogOpen(true);
  };

  const getViewTitle = () => {
    switch (currentView) {
      case 'settings': return 'Settings';
      case 'demo': return 'UI Demo';
      case 'collections': return 'Collections';
      case 'collection-view': return activeCollection ? activeCollection.name : 'Collection';
      default: return 'Organize & Print';
    }
  };

  const globalTags = useMemo(() => {
    const set = new Set<string>();
    (models || []).forEach(m => (m.tags || []).forEach(t => { if (t) set.add(t); }));
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [models]);

  const collectionsForDisplay = useMemo(() => {
    if (!Array.isArray(collections) || collections.length === 0) {
      return [] as Collection[];
    }

    const filters = lastFilters;
    const fileType = (filters.fileType || 'all').toLowerCase();

    // If filtering for model files specifically, hide collections
    if (fileType === '3mf' || fileType === 'stl') {
      return [] as Collection[];
    }

    let filteredList = collections.slice();

    // 1. Search Term
    const searchTerm = (filters.search || '').trim().toLowerCase();
    if (searchTerm) {
      filteredList = filteredList.filter(col => {
        const nameMatch = (col.name || '').toLowerCase().includes(searchTerm);
        const descriptionMatch = (col.description || '').toLowerCase().includes(searchTerm);
        const tagsMatch = (col.tags || []).some(tag => tag.toLowerCase().includes(searchTerm));
        return nameMatch || descriptionMatch || tagsMatch;
      });
    }

    // 2. Category Filter
    const hasCategoryFilter = filters.category && filters.category !== 'all';
    if (hasCategoryFilter) {
      const targetCategory = (filters.category || '').toLowerCase();
      filteredList = filteredList.filter(col => (col.category || '').toLowerCase() === targetCategory);
    }

    // 3. Tag Filter
    const hasTagFilter = Array.isArray(filters.tags) && filters.tags.length > 0;
    if (hasTagFilter) {
      const targetTags = filters.tags.map(tag => tag.toLowerCase());
      filteredList = filteredList.filter(col => {
        const collectionTags = (col.tags || []).map(tag => tag.toLowerCase());
        return targetTags.every(tag => collectionTags.includes(tag));
      });
    }

    // [NEW LOGIC] Root-Only View
    // If no search/filters are active, only show Root collections (no parent).
    // If filters ARE active, show all matching collections (flat list) so deep items are found.
    const isFiltering = searchTerm !== '' || hasCategoryFilter || hasTagFilter;

    if (!isFiltering) {
      filteredList = filteredList.filter(c => !c.parentId);
    }

    return filteredList;
  }, [collections, lastFilters]);

  if (!appConfig) {
    return (
      <TagsProvider tags={globalTags}>
        <div className="flex items-center justify-center h-screen bg-background">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center w-16 h-16 bg-gradient-primary rounded-xl shadow-lg mx-auto">
              <img
                src="/images/favicon-32x32.png"
                alt="3D Model Muncher"
                className="animate-pulse"
              />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Loading 3D Model Muncher</h2>
              <p className="text-muted-foreground">Initializing configuration...</p>
            </div>
          </div>
        </div>
      </TagsProvider>
    );
  }

  return (
    <TagsProvider tags={globalTags}>
      <div className="flex h-screen bg-background">
        {/* Mobile Overlay - Only when sidebar is open AND not in settings */}
        {isSidebarOpen && currentView !== 'settings' && (
          <div
            className="fixed inset-0 bg-black/50 z-20 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar - Hide when in Settings view */}
        {currentView !== 'settings' && (
          <div className={`
        fixed lg:relative z-30 lg:z-0
        h-full bg-sidebar border-r border-sidebar-border shadow-xl
        transform transition-all duration-300 ease-in-out
        ${isSidebarOpen ? 'w-80 translate-x-0' : 'w-0 lg:w-12 -translate-x-full lg:translate-x-0'}
        overflow-hidden
      `}
            onClick={() => !isSidebarOpen && setIsSidebarOpen(true)}
          >
            <FilterSidebar
              key={sidebarResetKey}
              onFilterChange={handleFilterChange}
              onCategoryChosen={(label) => {
                const currentViewSafe = currentView as ViewType;
                if (currentViewSafe === 'settings') {
                  setCurrentView('models');
                }
                setLastCategoryFilter(label || 'all');
              }}
              isOpen={isSidebarOpen}
              onClose={() => setIsSidebarOpen(false)}
              onSettingsClick={handleSettingsClick}
              categories={categories}
              collections={collections}
              onOpenCollection={openCollection}
              // [NEW] Provide the navigation handler
              onBackToRoot={() => {
                setActiveCollection(null);
                setCurrentView('models');
                // Optionally clear selection mode if you want a clean slate
                setIsSelectionMode(false);
                setSelectedModelIds([]);
              }}
              models={(currentView === 'collection-view' && activeCollection)
                ? collectionBaseModels
                : models}
              initialFilters={{
                search: '',
                category: appConfig?.filters?.defaultCategory || 'all',
                printStatus: appConfig?.filters?.defaultPrintStatus || 'all',
                license: appConfig?.filters?.defaultLicense || 'all',
                fileType: 'all',
                tags: [],
                showHidden: currentView === 'collection-view',
                showMissingImages: false,
                sortBy: appConfig?.filters?.defaultSortBy || 'none',
              }}
            />
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 p-4 border-b bg-card shadow-sm shrink-0">
            <div className="flex items-center gap-3">
              {/* Hide sidebar toggle menu if in settings view */}
              {currentView !== 'settings' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleSidebar}
                  className="p-2 hover:bg-accent transition-colors"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              )}
              {/* Show title/logo if sidebar is closed OR we are in settings (because sidebar is hidden there) */}
              {(!isSidebarOpen || currentView === 'settings') && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-gradient-primary rounded-xl shadow-lg">
                    <img
                      src="/images/favicon-32x32.png"
                      alt="3D Model Muncher"
                    />
                  </div>
                  <div>
                    <h1 className="text-lg font-semibold text-foreground tracking-tight leading-none">
                      3D Model Muncher
                    </h1>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">
                      {getViewTitle()}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <ThemeToggle />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="p-2 hover:bg-accent transition-colors" title="Actions" aria-label="Actions">
                      <Box className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => { handleRefreshModels(); }} disabled={isRefreshing}>
                      <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} /> Refresh
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={openCollectionsList}>
                      <List className="h-4 w-4 mr-2" /> Collections
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openSettingsOnTab('integrity', { type: 'hash-check', fileType: '3mf' })}>
                      <FileCheck className="h-4 w-4 mr-2" /> 3MF Check
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openSettingsOnTab('integrity', { type: 'hash-check', fileType: 'stl' })}>
                      <FileCheck className="h-4 w-4 mr-2" /> STL Check
                    </DropdownMenuItem>
                    <Separator className="mt-2 mb-2" />
                    <DropdownMenuItem onClick={() => openSettingsOnTab('integrity', { type: 'generate', fileType: '3mf' })}>
                      <Files className="h-4 w-4 mr-2" /> 3MF Generate
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openSettingsOnTab('integrity', { type: 'generate', fileType: 'stl' })}>
                      <Files className="h-4 w-4 mr-2" /> STL Generate
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsUploadDialogOpen(true)}>
                      <Upload className="h-4 w-4 mr-2" /> Upload Files
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDonationClick}
                  className="p-2 hover:bg-accent transition-colors"
                  title="Support the project"
                >
                  <Heart className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 min-h-0">
            {isModelsLoading && (
              <div className="flex items-center gap-3 px-4 py-2 bg-yellow-50 border-b border-yellow-200 text-yellow-800">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <div className="text-sm">
                  Loading models — this may take a minute for large libraries. Please wait...
                </div>
              </div>
            )}
            {currentView === 'models' ? (
              <ModelGrid
                models={filteredModels}
                collections={sortCollections(collectionsForDisplay, currentSortBy)}
                allCollections={collections}
                sortBy={currentSortBy}
                onModelClick={handleModelClick}
                onOpenCollection={(id) => {
                  const col = collections.find(c => c.id === id);
                  if (col) {
                    setActiveCollection(col);
                    setCurrentView('collection-view');
                    try {
                      const setIds = new Set(col.modelIds || []);
                      const base = models.filter(m => setIds.has(m.id));
                      setFilteredModels(base);
                    } catch { /* ignore */ }
                    setSidebarResetKey(k => k + 1);
                  }
                }}
                onCollectionChanged={refreshCollections}
                isSelectionMode={isSelectionMode}
                selectedModelIds={selectedModelIds}
                onModelSelection={handleModelSelection}
                onToggleSelectionMode={toggleSelectionMode}
                onSelectAll={selectAllModels}
                onDeselectAll={deselectAllModels}
                onBulkEdit={handleBulkEdit}
                onBulkDelete={handleBulkDeleteClick}
                config={appConfig}
              />
            ) : currentView === 'settings' ? (
              <SettingsPage
                onBack={handleBackToModels}
                categories={categories}
                onCategoriesUpdate={handleCategoriesUpdate}
                config={appConfig}
                onConfigUpdate={handleConfigUpdate}
                models={models}
                onModelsUpdate={handleBulkModelsUpdate}
                onModelClick={handleModelClick}
                onDonationClick={handleDonationClick}
                initialTab={settingsInitialTab}
                settingsAction={settingsAction}
                onActionHandled={() => setSettingsAction(null)}
                onCollectionCreatedForBulkEdit={handleCollectionCreatedForBulkEdit}
              />
            ) : currentView === 'collections' ? (
              <div className="h-full flex flex-col">
                {/* ... header ... */}
                {/* Collections Header with Layout Controls */}
                <div className="p-4 lg:p-6 pb-0 flex justify-between items-center">
                    <h2 className="text-lg font-semibold">All Collections</h2>
                    <LayoutControls />
                 </div>

                <div className="p-4 lg:p-6">
                  {collections.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No collections yet...</div>
                  ) : (
                    // DYNAMIC VIEW FOR COLLECTIONS
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
                            <CollectionCard
                              key={c.id}
                              collection={c}
                              categories={categories}
                              onOpen={() => openCollection(c)}
                              onChanged={refreshCollections}
                              fallbackImage={fallback}
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <div className="space-y-3">
                         {sortCollections(collectionsForDisplay, currentSortBy).map(c => (
                            <CollectionListRow
                              key={c.id}
                              collection={c}
                              categories={categories}
                              onOpen={() => openCollection(c)}
                              onChanged={refreshCollections}
                            />
                         ))}
                      </div>
                    )
                  )}
                </div>
              </div>
            ) : currentView === 'collection-view' && activeCollection ? (
              <CollectionGrid
                name={activeCollection.name}
                modelIds={activeCollection.modelIds}
                models={filteredModels}
                collections={collections}
                onOpenCollection={openCollection}
                onImportClick={handleOpenImport}
                onBack={() => {
                  // 1. FILTER RESET: If filtering, clear filters but STAY in the collection.
                  if (hasActiveFilters) {
                    handleFilterChange({
                      search: '',
                      category: 'all',
                      printStatus: 'all',
                      license: 'all',
                      fileType: 'all',
                      tags: [],
                      showHidden: true, // Always show hidden items when inside a collection
                      showMissingImages: false,
                      sortBy: currentSortBy
                    });
                    setSidebarResetKey(k => k + 1); // Reset the sidebar UI (uncheck boxes)
                    return;
                  }
  
                  // 2. HIERARCHY NAV: Go up one level
                  if (activeCollection?.parentId) {
                     const parent = collections.find(c => c.id === activeCollection.parentId);
                     if (parent) {
                       setActiveCollection(parent);
                       return;
                     }
                  }
                  
                  // 3. EXIT NAV: Go Home
                  setActiveCollection(null);
                  setCurrentView('models');
                  setSidebarResetKey(k => k + 1);
                  setIsSelectionMode(false);
                  setSelectedModelIds([]);
                }}
                onModelClick={handleModelClick}
                config={appConfig}
                activeCollection={activeCollection}
                isFiltering={hasActiveFilters}
                isSelectionMode={isSelectionMode}
                selectedModelIds={selectedModelIds}
                onModelSelection={handleModelSelection}
                onToggleSelectionMode={toggleSelectionMode}
                onSelectAll={selectAllModels}
                onDeselectAll={deselectAllModels}
                onBulkEdit={handleBulkEdit}
                onBulkDelete={handleBulkDeleteClick}
                onCollectionChanged={refreshCollections}
              />
            ) : (
              <DemoPage onBack={handleBackToModels} />
            )}
          </div>
        </div>

        {/* Model Details Drawer */}
        {(((currentView === 'models' || currentView === 'collection-view') && !isSelectionMode) || currentView === 'settings') && (
          <ModelDetailsDrawer
            model={selectedModel}
            isOpen={isDrawerOpen}
            onClose={() => setIsDrawerOpen(false)}
            onModelUpdate={handleModelUpdate}
            onDelete={handleSingleModelDelete}
            defaultModelView={appConfig?.settings.defaultModelView || 'images'}
            defaultModelColor={appConfig?.settings?.defaultModelColor}
            categories={categories}
          />
        )}

        {/* Bulk Edit Drawer */}
        {(currentView === 'models' || currentView === 'collection-view') && (
          <BulkEditDrawer
            models={getSelectedModels()}
            isOpen={isBulkEditOpen}
            onClose={() => setIsBulkEditOpen(false)}
            onBulkUpdate={handleBulkUpdateModels}
            onRefresh={handleRefreshModels}
            onBulkSaved={handleBulkSavedModels}
            onModelUpdate={handleModelUpdate}
            onClearSelections={exitSelectionMode}
            categories={categories}
            modelDirectory={appConfig?.settings?.modelDirectory || './models'}
            collectionsList={collections}
            pendingBulkCollectionId={pendingBulkCollectionId}
            onBulkEditComplete={() => setPendingBulkCollectionId(null)}

          />
        )}

        {/* [NEW] Thingiverse Import Dialog */}
        <ThingiverseImportDialog
          isOpen={isImportOpen}
          onClose={() => {
            setIsImportOpen(false);
            setImportTargetCollectionId(undefined); // Reset
            setImportTargetFolder(undefined);       // Reset
          }}
          defaultCollectionId={importTargetCollectionId}
          defaultFolder={importTargetFolder}          // Pass the inferred folder
          onImportComplete={() => {
            handleRefreshModels();
            refreshCollections();
          }}
        />

        {/* Dialogs */}
        <DonationDialog
          isOpen={isDonationDialogOpen}
          onClose={() => setIsDonationDialogOpen(false)}
        />

        <AlertDialog open={isReleaseNotesOpen} onOpenChange={(open) => { if (!open) closeReleaseNotes(dontShowReleaseNotes); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>What's new in this version</AlertDialogTitle>
              <AlertDialogDescription>
                Thanks for updating! Here are a few notable changes in the latest release:
              </AlertDialogDescription>

              <div className="mt-2 text-sm">
                <h3 className="text-lg font-semibold">v0.16.0 - The Features & Style Update</h3>
                <ul className="list-disc pl-5 list-outside mb-4 space-y-2 mt-2">
                  <li><strong>🎨 Dynamic Theme Engine</strong> - Pick any primary color in Settings, and the app now mathematically generates a perfect, accessible Dark and Light theme to match.</li>
                  <li><strong>🚀 Docker Architecture Upgrade</strong> - Migrated from Alpine to Debian Slim. This fixes the persistent 'Context Lost' WebGL crashes and enables native support for complex 3MF texture parsing.</li>
                  <li><strong>🛑 Thumbnail Cancellation</strong> - Added a 'Stop' button to the thumbnail generator. You can now safely abort long-running rendering jobs without restarting the server.</li>
                  <li><strong>📂 Nested Collections Editor</strong> - Manage your library organization directly from the 'All Models' view with the new nested collection editor.</li>
                  <li><strong>✨ UI Polish</strong> - Light mode has been remastered with softer backgrounds and improved contrast for better readability.</li>
                </ul>
              </div>

              <div className="space-y-3 my-4 mb-4 mt-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="dont-show-release-notes"
                    checked={dontShowReleaseNotes}
                    onCheckedChange={(v) => setDontShowReleaseNotes(Boolean(v))}
                  />
                  <label
                    htmlFor="dont-show-release-notes"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Do not show these notes again for this version
                  </label>
                </div>
              </div>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <div className="flex-1">
                <a
                  href="https://github.com/robsturgill/3d-model-muncher/blob/main/CHANGELOG.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  View full changelog on GitHub
                </a>
              </div>
              <AlertDialogAction onClick={() => { closeReleaseNotes(dontShowReleaseNotes); }}>Close</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Models</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {selectedModelIds.length} model{selectedModelIds.length !== 1 ? 's' : ''}?
                <br /><br />
                <strong>This action cannot be undone.</strong>
              </AlertDialogDescription>
              <div className="space-y-3 my-4 mb-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-3mf"
                    checked={includeThreeMfFiles}
                    onCheckedChange={(v) => setIncludeThreeMfFiles(Boolean(v))}
                  />
                  <label
                    htmlFor="include-3mf"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Include .3mf and .stl files (3D model files) when deleting
                  </label>
                </div>
              </div>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {includeThreeMfFiles ? 'Delete All Files' : 'Delete Metadata Only'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Upload Dialog */}
        <ModelUploadDialog
          isOpen={isUploadDialogOpen}
          onClose={() => setIsUploadDialogOpen(false)}
          onUploaded={() => { handleRefreshModels(); }}
        />
      </div>
    </TagsProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <LayoutSettingsProvider>
      <AppContent />
      <Toaster />
      </LayoutSettingsProvider>
    </ThemeProvider>
  );
}