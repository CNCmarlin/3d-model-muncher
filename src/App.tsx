import { DemoPage } from "@/components/management/DemoPage";
import { OnboardingPage } from "@/pages/Onboarding/OnboardingPage";
import { useEffect, useMemo, useState } from "react";

import { MigrationStatus } from "@/components/admin/MigrationStatus";
import { TagsProvider } from "@/components/common/TagsContext";
import { ThemeProvider } from "@/components/common/ThemeProvider";
import { FilterSidebar } from "@/components/layout/FilterSidebar";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { SettingsPage } from "@/components/management/SettingsPage";
import { ModelHubView } from "@/components/models/ModelHubView";
import { ModelHubView_DB } from "@/components/models/ModelHubView_DB";
import { BulkEditView } from "@/components/views/BulkEditView"; // NEW IMPORT
import { CollectionsView } from "@/components/views/CollectionsView";
import { CollectionView } from "@/components/views/CollectionView";
import { CollectionView_DB } from "@/components/views/CollectionView_DB";
import { ModelsView } from "@/components/views/ModelsView";
import { ModelsView_DB } from "@/components/views/ModelsView_DB";
import { ConfigProvider, useConfig } from "@/context/ConfigContext";
import { NavigationProvider, useNavigation } from "@/context/NavigationContext";
import { useCollections } from "@/hooks/queries/useCollections";
import { useModels } from "@/hooks/queries/useModels";
import { useModelsByIds } from "@/hooks/queries/useModelsByIds";
import { useFilteredModels } from "@/hooks/useFilteredModels";
import { useGlobalDialogs } from "@/hooks/useGlobalDialogs";
import { useModelActions } from "@/hooks/useModelActions";
import { useSelectionMode } from "@/hooks/useSelectionMode";
import { Model } from "@/types/model";
// Import package.json to read the last published version
import { LayoutSettingsProvider } from "@/components/layout/LayoutSettingsContext";
import { PrinterStatusHub } from "@/components/layout/PrinterStatusHub";
import { GlobalDialogs } from "@/components/shared/GlobalDialogs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/sonner";
import { SpoolmanProvider } from "@/context/SpoolmanContext";
import type { Collection } from "@/types/collection";
import { SortKey } from "@/utils/sortUtils";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { Box, FileCheck, Files, Heart, List, RefreshCw, Sidebar, Upload } from "lucide-react";
import { toast } from "sonner";


const EMPTY_MODELS: Model[] = [];
const EMPTY_COLLECTIONS: Collection[] = [];

function AppContent() {
  // Contexts
  const {
    appConfig,
    categories,
    isConfigLoading,
    updateConfig,
    updateCategories,
    isReleaseNotesOpen,
    closeReleaseNotes,
    dontShowReleaseNotes,
    setDontShowReleaseNotes
  } = useConfig();

  const useDatabaseBackend = appConfig?.settings?.useDatabaseBackend ?? false;

  const {
    currentView,
    activeCollection,
    isSidebarOpen,
    setCurrentView,
    setActiveCollection,
    toggleSidebar,
    handleBackToModels: navHandleBack,
    openCollectionsList: navOpenCollections,
    openCollection: navOpenCollection,
    openSettingsOnTab: navOpenSettings,
    settingsInitialTab,
    settingsAction,
    setSettingsAction,
    setIsSidebarOpen,
    getViewTitle: navGetViewTitle
  } = useNavigation();

  const [selectedModel, setSelectedModel] = useState<Model | null>(null);

  // Onboarding Redirect Logic
  useEffect(() => {
    if (appConfig && !isConfigLoading) {
      const isCompleted = appConfig.settings?.onboardingCompleted;
      if (!isCompleted && currentView !== 'onboarding') {
        // Only redirect if we haven't completed onboarding
        // console.log("Redirecting to onboarding...");
        setCurrentView('onboarding');
      }
    }
  }, [appConfig, isConfigLoading, currentView, setCurrentView]);

  // React Query Data Fetching (Database-First)
  // Legacy Hook: Only fetch if NOT using database backend (to avoid double fetch)
  const {
    data: models = EMPTY_MODELS,
    isLoading: isModelsLoading,
    isFetching: isRefreshing,
    refetch: refetchModels
  } = useModels({}, { enabled: !useDatabaseBackend });

  const {
    data: collections = EMPTY_COLLECTIONS,
    refetch: refetchCollections
  } = useCollections();

  // Helper to update models optimistically (for mutations later)
  const setModels = (_newModels: Model[]) => {
    // For legacy updates (like tag deletion), just trigger a refetch
    // This ensures the UI reflects the backend state
    refetchModels();
  };

  // Wrapper functions to match expected signatures
  const refreshModels = async (_isInitial?: boolean): Promise<Model[] | null> => {
    const result = await refetchModels();
    return result.data || null;
  };

  const refreshCollections = async (): Promise<void> => {
    await refetchCollections();
  };

  // Selection State (Lifted)
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);

  // 1. Filtered Models Hook (needs model data & selection setters)
  const {
    filteredModels,
    setFilteredModels,
    lastFilters,
    setLastFilters,
    currentSortBy,
    setCurrentSortBy,
    setLastCategoryFilter,
    hasActiveFilters,
    collectionBaseModels,
    handleFilterChange,
    handleRefreshModels
  } = useFilteredModels({
    models,
    collections,
    refreshModels,
    isSelectionMode,
    setIsSelectionMode,
    selectedModelIds,
    setSelectedModelIds
  });

  // DB-Mode Bulk Edit Data Fetching
  const { data: bulkModels } = useModelsByIds(selectedModelIds, {
    enabled: currentView === 'bulk-edit' && useDatabaseBackend && selectedModelIds.length > 0
  });

  // 2. Selection Hook (needs filtered models & lifted state)
  const {
    toggleSelectionMode,
    handleModelSelection,
    selectAllModels,
    deselectAllModels,
    getSelectedModels
  } = useSelectionMode({
    isSelectionMode,
    setIsSelectionMode,
    selectedModelIds,
    setSelectedModelIds,
    filteredModels
  });

  // 3. Actions Hook (CRUD logic)
  const modelActions = useModelActions({
    models,
    setModels,
    filteredModels,
    setFilteredModels,
    selectedModelIds,
    setSelectedModelIds,
    setIsSelectionMode,
    // When bulk edit closes (saved), we go back to models
    onCloseBulkEdit: () => navHandleBack(),
    refreshModels: handleRefreshModels,
    setSelectedModel
  });

  const [sidebarResetKey, setSidebarResetKey] = useState(0);

  // Restore Helper State
  const [pendingBulkCollectionId, setPendingBulkCollectionId] = useState<string | null>(null);

  const handleCollectionCreatedForBulkEdit = (collectionId: string) => {
    setPendingBulkCollectionId(collectionId);
    // Switch to models view so the BulkEditDrawer (and grid) can render
    setCurrentView('bulk-edit');

    // Ensure selection mode is on; the useEffect below will open the drawer
    if (!isSelectionMode) {
      setIsSelectionMode(true);
    }
  };

  // Watch for pending collection actions to auto-open the drawer
  useEffect(() => {
    if (pendingBulkCollectionId && isSelectionMode) {
      setCurrentView('bulk-edit');
    }
  }, [pendingBulkCollectionId, isSelectionMode, setCurrentView]);

  // Initial Data Loading (Models & Collections)
  useEffect(() => {
    async function initData() {
      if (isConfigLoading) return;

      try {
        // Load models
        const loadedModels = await refreshModels(true);
        if (!loadedModels) return;

        // Load collections (needed for sidebar filtering)
        await refreshCollections();

        // Initialize filters based on Config Defaults
        const defaults = appConfig?.filters || { defaultCategory: 'all', defaultPrintStatus: 'all', defaultLicense: 'all' };

        const initialFilterState = {
          search: '',
          category: defaults.defaultCategory,
          printStatus: defaults.defaultPrintStatus,
          license: defaults.defaultLicense,
          fileType: 'all',
          tags: [] as string[],
          showHidden: false,
          showMissingImages: false,
          sortBy: defaults.defaultSortBy || 'none',
        };

        // Initialize filters via the hook state
        setLastFilters(initialFilterState);
        if (initialFilterState.sortBy) setCurrentSortBy(initialFilterState.sortBy as any);

      } catch (error) {
        console.error("Failed to init data", error);
      }
    }

    initData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigLoading]);

  const handleModelClick = (model: Model) => {
    if (isSelectionMode && (currentView === 'models' || currentView === 'collection-view')) {
      handleModelSelection(model.id);
      return;
    }
    setSelectedModel(model);
    setCurrentView('model-hero'); // Switch view instead of just opening drawer
  };

  const handleBulkEdit = () => {
    console.log('[App] handleBulkEdit called. Selection:', selectedModelIds, 'Current view:', currentView, 'Models count:', models.length);
    if (selectedModelIds.length === 0) {
      toast("No models selected", { description: "Please select models first before bulk editing" });
      return;
    }
    setCurrentView('bulk-edit');
  };

  // performDelete moved to useModelActions

  const handleBulkDeleteClick = () => {
    if (selectedModelIds.length === 0) {
      toast("No models selected", { description: "Please select models first before deleting" });
      return;
    }
    dialogs.openDelete(selectedModelIds);
  };

  const handleSingleModelDelete = async (model: Model) => {
    dialogs.openDelete([model.id]);
    setSelectedModel(null); // Close the drawer
  };

  const handleSettingsClick = () => {
    navOpenSettings('general');
    setIsSelectionMode(false);
    setSelectedModelIds([]);
  };

  // --- Hook: Global Dialogs ---
  const dialogs = useGlobalDialogs({
    collections,
    models,
    refreshModels: handleRefreshModels,
    refreshCollections,
    selectedModelIds,
    setSelectedModelIds,
    deleteModels: modelActions.performDelete,
    appConfig,
    updateConfig
  });

  // --- Handlers that need the dialog hooks ---
  const handleCollectionUpload = (collection?: Collection | any) => {
    // If called as an event handler, first arg is an Event. We want to skip it.
    const actualCollection = (collection && typeof collection === 'object' && 'id' in collection)
      ? collection
      : activeCollection;

    dialogs.openUpload(actualCollection);
  };

  const handleOpenImport = (collectionId?: string) => {
    dialogs.openImport(collectionId);
  };

  // Navigation handlers replaced by context actions

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
    dialogs.openDonation();
  };

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
        const tagsMatch = (col.tags || []).some((tag: string) => tag.toLowerCase().includes(searchTerm));
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
        const collectionTags = (col.tags || []).map((tag: string) => tag.toLowerCase());
        return targetTags.every(tag => collectionTags.includes(tag));
      });
    }

    // Root-Only View
    const isFiltering = searchTerm !== '' || hasCategoryFilter || hasTagFilter;

    if (!isFiltering) {
      filteredList = filteredList.filter(c => !c.parentId);
    }

    return filteredList;
  }, [collections, lastFilters]);

  // Sidebar Layout Effect
  useEffect(() => {
    const handleResize = () => {
      const isLargeScreen = window.innerWidth >= 1280;
      if (!isLargeScreen) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [setIsSidebarOpen]);

  if (!appConfig) {
    return (
      <TagsProvider>
        <div className="flex items-center justify-center h-screen bg-background">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center w-16 h-16 bg-gradient-primary rounded-xl shadow-lg mx-auto">
              <img src="/images/favicon-32x32.png" alt="3D Model Muncher" className="animate-pulse" />
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
    <TagsProvider>
      <div className="flex h-screen bg-background overflow-hidden">
        {/* Mobile Overlay */}
        {isSidebarOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 xl:hidden" onClick={() => setIsSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        {currentView !== 'onboarding' && (
          <aside className={`fixed xl:relative z-50 xl:z-0 h-full bg-sidebar border-r border-sidebar-border shadow-xl transition-all duration-300 ease-in-out flex flex-col ${isSidebarOpen ? 'w-80' : 'w-12'} visible opacity-100 translate-x-0`}>
            <FilterSidebar
              key={sidebarResetKey}
              isOpen={isSidebarOpen}
              onFilterChange={handleFilterChange}
              onCategoryChosen={(label) => {
                if (currentView === 'settings') setCurrentView('models');
                setLastCategoryFilter(label || 'all');
              }}
              onClose={() => setIsSidebarOpen(false)}
              onSettingsClick={handleSettingsClick}
              categories={categories}
              collections={collections}
              onOpenCollection={navOpenCollection}
              onBackToRoot={() => {
                setActiveCollection(null);
                setCurrentView('models');
              }}
              models={(currentView === 'collection-view' && activeCollection) ? collectionBaseModels : models}
              currentFilters={lastFilters}
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
          </aside>
        )}

        {/* Main Content */}
        {/* Remove pl-12 (sidebar offset) if onboarding is active */}
        <div className={`flex-1 flex flex-col min-w-0 overflow-hidden ${currentView !== 'onboarding' ? 'pl-12 xl:pl-0' : ''}`}>
          <header className="flex items-center justify-between gap-2 p-4 border-b bg-card shadow-sm shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={toggleSidebar} className="p-2 hover:bg-accent transition-colors">
                <Sidebar className={`h-4 w-4 transition-transform duration-300 ${!isSidebarOpen ? 'rotate-180' : ''}`} />
              </Button>
              {(!isSidebarOpen || currentView === 'settings') && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-gradient-primary rounded-xl shadow-lg">
                    <img src="/images/favicon-32x32.png" alt="3D Model Muncher" />
                  </div>
                  <div>
                    <h1 className="text-lg font-semibold text-foreground tracking-tight leading-none">3D Model Muncher</h1>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">{navGetViewTitle()}</p>
                  </div>
                </div>
              )}
              {/* GLOBAL SELECTION INDICATOR REMOVED - Moved to SelectionModeControls */}
            </div>

            <div className="flex-1 flex justify-center min-w-0 px-2">
              {appConfig && <PrinterStatusHub config={appConfig} />}
            </div>

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
                  <DropdownMenuItem onClick={navOpenCollections}>
                    <List className="h-4 w-4 mr-2" /> Collections
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navOpenSettings('integrity', { type: 'hash-check', fileType: '3mf' })}>
                    <FileCheck className="h-4 w-4 mr-2" /> 3MF Check
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navOpenSettings('integrity', { type: 'generate', fileType: '3mf' })}>
                    <Files className="h-4 w-4 mr-2" /> 3MF Generate
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => dialogs.openUpload(activeCollection)}>
                    <Upload className="h-4 w-4 mr-2" /> Upload Files
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="ghost" size="sm" onClick={handleDonationClick} className="p-2 hover:bg-accent transition-colors" title="Support the project">
                <Heart className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <main className="flex-1 min-h-0 relative">
            {isModelsLoading && (
              <div className="flex items-center gap-3 px-4 py-2 bg-yellow-50 border-b border-yellow-200 text-yellow-800">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <div className="text-sm">Loading models...</div>
              </div>
            )}

            {currentView === 'models' ? (
              useDatabaseBackend ? (
                <ModelsView_DB
                  collectionsForDisplay={collectionsForDisplay}
                  allCollections={collections}
                  sortBy={currentSortBy}
                  onModelClick={handleModelClick}
                  onRefresh={handleRefreshModels}
                  isSelectionMode={isSelectionMode}
                  selectedModelIds={selectedModelIds}
                  onModelSelection={handleModelSelection}
                  onToggleSelectionMode={toggleSelectionMode}
                  onSelectAll={selectAllModels}
                  onDeselectAll={deselectAllModels}
                  onBulkEdit={() => {
                    if (selectedModelIds.length > 0) {
                      setCurrentView('bulk-edit');
                    }
                  }}
                  onBulkDelete={handleBulkDeleteClick}
                  currentFilters={lastFilters}
                />
              ) : (
                <ModelsView
                  filteredModels={filteredModels}
                  collectionsForDisplay={collectionsForDisplay}
                  allCollections={collections}
                  sortBy={(currentSortBy || 'none') as SortKey}
                  onModelClick={handleModelClick}
                  onRefresh={handleRefreshModels}
                  isSelectionMode={isSelectionMode}
                  selectedModelIds={selectedModelIds}
                  onModelSelection={handleModelSelection}
                  onToggleSelectionMode={toggleSelectionMode}
                  onSelectAll={selectAllModels}
                  onDeselectAll={deselectAllModels}
                  onBulkEdit={handleBulkEdit}
                  onBulkDelete={handleBulkDeleteClick}
                />
              )
            ) : currentView === 'settings' ? (
              <SettingsPage
                onBack={navHandleBack}
                categories={categories}
                onCategoriesUpdate={updateCategories}
                config={appConfig}
                onConfigUpdate={updateConfig}
                models={models}
                onModelsUpdate={() => handleRefreshModels()}
                onModelClick={handleModelClick}
                onDonationClick={handleDonationClick}
                initialTab={settingsInitialTab}
                settingsAction={settingsAction}
                onActionHandled={() => setSettingsAction(null)}
                onCollectionCreatedForBulkEdit={handleCollectionCreatedForBulkEdit}
              />
            ) : currentView === 'collections' ? (
              <CollectionsView
                collections={collections}
                collectionsForDisplay={collectionsForDisplay}
                currentSortBy={currentSortBy}
                models={models}
                categories={categories}
                onOpenCollection={navOpenCollection}
                onRefresh={refreshCollections}
              />
            ) : currentView === 'collection-view' && activeCollection ? (
              useDatabaseBackend ? (
                <CollectionView_DB
                  activeCollection={activeCollection}
                  collections={collections}
                  onOpenCollection={navOpenCollection}
                  onImportClick={handleOpenImport}
                  onUploadClick={handleCollectionUpload}
                  onBack={() => {
                    if (hasActiveFilters) {
                      handleFilterChange({
                        search: '', category: 'all', printStatus: 'all', license: 'all', fileType: 'all', tags: [], showHidden: true, showMissingImages: false, sortBy: currentSortBy
                      });
                      setSidebarResetKey(k => k + 1);
                      return;
                    }
                    if (activeCollection?.parentId) {
                      const parent = collections.find(c => c.id === activeCollection.parentId);
                      if (parent) { setActiveCollection(parent); return; }
                    }
                    setActiveCollection(null);
                    setCurrentView('models');
                    setSidebarResetKey(k => k + 1);
                    setIsSelectionMode(false);
                    setSelectedModelIds([]);
                  }}
                  onModelClick={handleModelClick}
                  isFiltering={hasActiveFilters}
                  isSelectionMode={isSelectionMode}
                  selectedModelIds={selectedModelIds}
                  onModelSelection={handleModelSelection}
                  onToggleSelectionMode={toggleSelectionMode}
                  onSelectAll={selectAllModels}
                  onDeselectAll={deselectAllModels}
                  onBulkEdit={handleBulkEdit}
                  onBulkDelete={handleBulkDeleteClick}
                  onRefresh={refreshCollections}
                  currentSortBy={(currentSortBy || 'none') as SortKey}
                />
              ) : (
                <CollectionView
                  activeCollection={activeCollection}
                  filteredModels={filteredModels}
                  collections={collections}
                  onOpenCollection={navOpenCollection}
                  onImportClick={handleOpenImport}
                  onUploadClick={handleCollectionUpload}
                  onBack={() => {
                    if (hasActiveFilters) {
                      handleFilterChange({
                        search: '', category: 'all', printStatus: 'all', license: 'all', fileType: 'all', tags: [], showHidden: true, showMissingImages: false, sortBy: currentSortBy
                      });
                      setSidebarResetKey(k => k + 1);
                      return;
                    }
                    if (activeCollection?.parentId) {
                      const parent = collections.find(c => c.id === activeCollection.parentId);
                      if (parent) { setActiveCollection(parent); return; }
                    }
                    setActiveCollection(null);
                    setCurrentView('models');
                    setSidebarResetKey(k => k + 1);
                    setIsSelectionMode(false);
                    setSelectedModelIds([]);
                  }}
                  onModelClick={handleModelClick}
                  config={appConfig}
                  isFiltering={hasActiveFilters}
                  isSelectionMode={isSelectionMode}
                  selectedModelIds={selectedModelIds}
                  onModelSelection={handleModelSelection}
                  onToggleSelectionMode={toggleSelectionMode}
                  onSelectAll={selectAllModels}
                  onDeselectAll={deselectAllModels}
                  onBulkEdit={handleBulkEdit}
                  onBulkDelete={handleBulkDeleteClick}
                  onRefresh={refreshCollections}
                />
              )
            ) : currentView === 'model-hero' && selectedModel ? (
              useDatabaseBackend ? (
                <ModelHubView_DB
                  model={selectedModel}
                  models={models}
                  categories={categories}
                  collections={collections}
                  defaultModelView={appConfig?.settings?.defaultModelView ?? 'images'}
                  defaultModelColor={appConfig?.settings?.defaultModelColor}
                  onClose={() => {
                    setSelectedModel(null);
                    setCurrentView(activeCollection ? 'collection-view' : 'models');
                  }}
                  onDelete={handleSingleModelDelete}
                  onOpenCollection={navOpenCollection}
                />
              ) : (
                <ModelHubView
                  model={selectedModel}
                  models={models}
                  categories={categories}
                  collections={collections}
                  defaultModelView={appConfig?.settings?.defaultModelView ?? 'images'}
                  defaultModelColor={appConfig?.settings?.defaultModelColor}
                  isSidebarOpen={isSidebarOpen}
                  onClose={() => {
                    setSelectedModel(null);
                    setCurrentView(activeCollection ? 'collection-view' : 'models');
                  }}
                  onModelUpdate={modelActions.handleModelUpdate}
                  onDelete={handleSingleModelDelete}
                  onOpenCollection={navOpenCollection}
                  onFilterChange={handleFilterChange}
                  onSettingsClick={handleSettingsClick}
                  onSelectModel={handleModelClick}
                />
              )
            ) : currentView === 'bulk-edit' ? (
              (() => {
                const bulkModelsToRender = useDatabaseBackend ? (bulkModels || []) : getSelectedModels(models);
                console.log('[App] Rendering BulkEditView', {
                  mode: useDatabaseBackend ? 'DB' : 'Legacy',
                  totalModels: models.length,
                  selectedIds: selectedModelIds.length,
                  renderedModels: bulkModelsToRender.length,
                  firstSelectedId: selectedModelIds[0],
                  firstModelId: models[0]?.id
                });
                return (
                  <BulkEditView
                    models={bulkModelsToRender}
                    onClose={navHandleBack}
                    onRemoveFromSelection={(id) => setSelectedModelIds(prev => prev.filter(mid => mid !== id))}
                    onClearSelections={() => {
                      deselectAllModels();
                      if (isSelectionMode) toggleSelectionMode();
                    }}
                    categories={categories}
                    collectionsList={collections}
                    pendingBulkCollectionId={pendingBulkCollectionId}
                  />
                );
              })()
            ) : currentView === 'admin-migration' ? (
              <div className="container mx-auto p-4 overflow-y-auto h-full">
                <Button variant="ghost" onClick={() => setCurrentView('settings')} className="mb-4">
                  &larr; Back to Settings
                </Button>
                <MigrationStatus />
              </div>
            ) : currentView === 'onboarding' ? (
              <OnboardingPage />
            ) : (
              <DemoPage onBack={navHandleBack} />
            )}
          </main>
        </div>

        <GlobalDialogs
          {...dialogs.dialogProps}
          isReleaseNotesOpen={isReleaseNotesOpen}
          dontShowReleaseNotes={dontShowReleaseNotes}
          setDontShowReleaseNotes={setDontShowReleaseNotes}
          closeReleaseNotes={closeReleaseNotes}
        />
      </div>
    </TagsProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <ConfigProvider>
        <NavigationProvider>
          <SpoolmanProvider>
            <LayoutSettingsProvider>
              <TooltipProvider delayDuration={0}>
                <AppContent />
                <Toaster />
              </TooltipProvider>
            </LayoutSettingsProvider>
          </SpoolmanProvider>
        </NavigationProvider>
      </ConfigProvider>
    </ThemeProvider>
  );
}
