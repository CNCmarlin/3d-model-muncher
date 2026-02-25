/**
 * AppContent_Legacy — Legacy JSON sidecar mode top-level UI component.
 *
 * Calls ONLY legacy hooks and renders ONLY legacy view components.
 * No DB imports, no ternaries, no `as any` casts for mode bridging.
 *
 * Counterpart: AppContent_DB.tsx (database mode).
 */

import { useEffect, useMemo, useState } from "react";

// ── Legacy Components ──────────────────────────────────────────────────────────
import { FilterSidebar } from "@/components/layout/FilterSidebar";
import { PrinterStatusHub } from "@/components/layout/PrinterStatusHub";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { SettingsPage } from "@/components/management/SettingsPage";
import { ModelHubView } from "@/components/models/ModelHubView";
import { GlobalDialogs } from "@/components/shared/GlobalDialogs";
import { BulkEditView } from "@/components/views/BulkEditView";
import { CollectionView } from "@/components/views/CollectionView";
import { CollectionsView } from "@/components/views/CollectionsView";
import { ModelsView } from "@/components/views/ModelsView";

// ── Admin / Shared (mode-agnostic) ─────────────────────────────────────────────
import { MigrationStatus } from "@/components/admin/MigrationStatus";
import { DemoPage } from "@/components/management/DemoPage";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OnboardingPage } from "@/pages/Onboarding/OnboardingPage_DB";

// ── Context ────────────────────────────────────────────────────────────────────
import { useConfig } from "@/context/AppConfigContext";
import { useNavigation } from "@/context/NavigationContext";

// ── Legacy Hooks (queries) ─────────────────────────────────────────────────────
import { useCollections } from "@/hooks/queries/useCollections";
import { useModels } from "@/hooks/queries/useModels";
import { useModelsByIds } from "@/hooks/queries/useModelsByIds";

// ── Legacy Hooks (app-level) ───────────────────────────────────────────────────
import { useFilteredModels } from "@/hooks/useFilteredModels";
import { useGlobalDialogs } from "@/hooks/useGlobalDialogs";
import { useModelActions } from "@/hooks/useModelActions";
import { useSelectionMode } from "@/hooks/useSelectionMode";

// ── Types ──────────────────────────────────────────────────────────────────────
import type { Collection } from "@/types/collection";
import type { Model } from "@/types/model";
import type { SortKey } from "@/utils/sortUtils";

// ── Icons ──────────────────────────────────────────────────────────────────────
import { Box, FileCheck, Files, Heart, List, RefreshCw, Sidebar, Upload } from "lucide-react";
import { toast } from "sonner";

const EMPTY_MODELS: Model[] = [];
const EMPTY_COLLECTIONS: Collection[] = [];

export default function AppContent_Legacy() {
    // ── Config ─────────────────────────────────────────────────────────────────
    const {
        appConfig,
        categories,
        isConfigLoading,
        updateConfig,
        updateCategories,
        isReleaseNotesOpen,
        closeReleaseNotes,
        dontShowReleaseNotes,
        setDontShowReleaseNotes,
    } = useConfig();

    // ── Navigation ─────────────────────────────────────────────────────────────
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
        getViewTitle: navGetViewTitle,
    } = useNavigation();

    const [selectedModel, setSelectedModel] = useState<Model | null>(null);

    // ── Onboarding Redirect ────────────────────────────────────────────────────
    useEffect(() => {
        if (appConfig && !isConfigLoading) {
            const isCompleted = appConfig.settings?.onboardingCompleted;
            if (!isCompleted && currentView !== "onboarding") {
                setCurrentView("onboarding");
            }
        }
    }, [appConfig, isConfigLoading, currentView, setCurrentView]);

    // ── React Query Data Fetching (Legacy) ─────────────────────────────────────
    const {
        data: models = EMPTY_MODELS,
        isLoading: isModelsLoading,
        isFetching: isRefreshing,
        refetch: refetchModels,
    } = useModels({});

    const {
        data: collections = EMPTY_COLLECTIONS,
        refetch: refetchCollections,
    } = useCollections();

    // Helper — refetch wrappers
    const setModels = (_newModels: Model[]) => {
        refetchModels();
    };

    const refreshModels = async (_isInitial?: boolean): Promise<Model[] | null> => {
        const result = await refetchModels();
        return result.data || null;
    };

    const refreshCollections = async (): Promise<void> => {
        await refetchCollections();
    };

    // ── Selection State (Lifted) ───────────────────────────────────────────────
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);

    // ── Filtered Models (Legacy) ───────────────────────────────────────────────
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
        handleRefreshModels,
    } = useFilteredModels({
        models,
        collections,
        refreshModels,
        isSelectionMode,
        setIsSelectionMode,
        selectedModelIds,
        setSelectedModelIds,
    });

    // ── Bulk Edit Fetch ────────────────────────────────────────────────────────
    useModelsByIds(selectedModelIds, {
        enabled: currentView === "bulk-edit" && selectedModelIds.length > 0,
    });

    // ── Selection Hook (Legacy) ────────────────────────────────────────────────
    const {
        toggleSelectionMode,
        handleModelSelection,
        selectAllModels,
        deselectAllModels,
        getSelectedModels,
    } = useSelectionMode({
        isSelectionMode,
        setIsSelectionMode,
        selectedModelIds,
        setSelectedModelIds,
        filteredModels,
    });

    // ── Model Actions (Legacy) ─────────────────────────────────────────────────
    const modelActions = useModelActions({
        models,
        setModels,
        filteredModels,
        setFilteredModels,
        selectedModelIds,
        setSelectedModelIds,
        setIsSelectionMode,
        onCloseBulkEdit: () => navHandleBack(),
        refreshModels: handleRefreshModels,
        setSelectedModel,
    });

    const [sidebarResetKey, setSidebarResetKey] = useState(0);

    // ── Bulk Collection Helper ─────────────────────────────────────────────────
    const [pendingBulkCollectionId, setPendingBulkCollectionId] = useState<string | null>(null);

    const handleCollectionCreatedForBulkEdit = (collectionId: string) => {
        setPendingBulkCollectionId(collectionId);
        setCurrentView("bulk-edit");
        if (!isSelectionMode) {
            setIsSelectionMode(true);
        }
    };

    useEffect(() => {
        if (pendingBulkCollectionId && isSelectionMode) {
            setCurrentView("bulk-edit");
        }
    }, [pendingBulkCollectionId, isSelectionMode, setCurrentView]);

    // ── Initial Data Load ──────────────────────────────────────────────────────
    useEffect(() => {
        async function initData() {
            if (isConfigLoading) return;
            try {
                const loadedModels = await refreshModels(true);
                if (!loadedModels) return;
                await refreshCollections();

                const defaults = appConfig?.filters || {
                    defaultCategory: "all",
                    defaultPrintStatus: "all",
                    defaultLicense: "all",
                };

                const initialFilterState = {
                    search: "",
                    category: defaults.defaultCategory,
                    printStatus: defaults.defaultPrintStatus,
                    license: defaults.defaultLicense,
                    fileType: "all",
                    tags: [] as string[],
                    showHidden: false,
                    showMissingImages: false,
                    sortBy: defaults.defaultSortBy || "none",
                };

                setLastFilters(initialFilterState);
                if (initialFilterState.sortBy)
                    setCurrentSortBy(initialFilterState.sortBy as SortKey);
            } catch (error) {
                console.error("Failed to init data", error);
            }
        }
        initData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConfigLoading]);

    // ── Handlers ───────────────────────────────────────────────────────────────
    const handleModelClick = (model: Model) => {
        if (isSelectionMode && (currentView === "models" || currentView === "collection-view")) {
            handleModelSelection(model.id);
            return;
        }
        setSelectedModel(model);
        setCurrentView("model-hero");
    };

    const handleBulkEdit = () => {
        if (selectedModelIds.length === 0) {
            toast("No models selected", { description: "Please select models first before bulk editing" });
            return;
        }
        setCurrentView("bulk-edit");
    };

    const handleBulkDeleteClick = () => {
        if (selectedModelIds.length === 0) {
            toast("No models selected", { description: "Please select models first before deleting" });
            return;
        }
        dialogs.openDelete(selectedModelIds);
    };

    const handleSingleModelDelete = async (model: Model) => {
        dialogs.openDelete([model.id]);
        setSelectedModel(null);
    };

    const handleSettingsClick = () => {
        navOpenSettings("general");
        setIsSelectionMode(false);
        setSelectedModelIds([]);
    };

    // ── Global Dialogs (Legacy) ────────────────────────────────────────────────
    const dialogs = useGlobalDialogs({
        collections,
        models,
        refreshModels: handleRefreshModels,
        refreshCollections,
        selectedModelIds,
        setSelectedModelIds,
        deleteModels: modelActions.performDelete,
        appConfig,
        updateConfig,
    });

    const handleCollectionUpload = (collection?: Collection | any) => {
        const actualCollection =
            collection && typeof collection === "object" && "id" in collection
                ? collection
                : activeCollection;
        dialogs.openUpload(actualCollection);
    };

    const handleOpenImport = (collectionId?: string) => {
        dialogs.openImport(collectionId);
    };

    // ── Collection Events ──────────────────────────────────────────────────────
    useEffect(() => {
        const handler = (ev: Event) => {
            try {
                const anyEv = ev as any;
                const col = anyEv?.detail as Collection | undefined;
                if (col && Array.isArray(col.modelIds)) {
                    setActiveCollection(col);
                    setCurrentView("collection-view");
                }
            } catch {
                /* ignore */
            }
            refreshCollections();
        };
        window.addEventListener("collection-created", handler as any);
        return () => window.removeEventListener("collection-created", handler as any);
    }, []);

    useEffect(() => {
        const handler = () => {
            refreshCollections();
        };
        window.addEventListener("collection-updated", handler);
        return () => window.removeEventListener("collection-updated", handler);
    }, [activeCollection, lastFilters, currentView]);

    const handleDonationClick = () => {
        dialogs.openDonation();
    };

    // ── Collections for Display ────────────────────────────────────────────────
    const collectionsForDisplay = useMemo(() => {
        if (!Array.isArray(collections) || collections.length === 0) {
            return [] as Collection[];
        }

        const filters = lastFilters;
        const fileType = (filters.fileType || "all").toLowerCase();

        if (fileType === "3mf" || fileType === "stl") {
            return [] as Collection[];
        }

        let filteredList = collections.slice();

        const searchTerm = (filters.search || "").trim().toLowerCase();
        if (searchTerm) {
            filteredList = filteredList.filter((col) => {
                const nameMatch = (col.name || "").toLowerCase().includes(searchTerm);
                const descriptionMatch = (col.description || "").toLowerCase().includes(searchTerm);
                const tagsMatch = (col.tags || []).some((tag: string) =>
                    tag.toLowerCase().includes(searchTerm)
                );
                return nameMatch || descriptionMatch || tagsMatch;
            });
        }

        const hasCategoryFilter = filters.category && filters.category !== "all";
        if (hasCategoryFilter) {
            const targetCategory = (filters.category || "").toLowerCase();
            filteredList = filteredList.filter(
                (col) => (col.category || "").toLowerCase() === targetCategory
            );
        }

        const hasTagFilter = Array.isArray(filters.tags) && filters.tags.length > 0;
        if (hasTagFilter) {
            const targetTags = filters.tags.map((tag) => tag.toLowerCase());
            filteredList = filteredList.filter((col) => {
                const collectionTags = (col.tags || []).map((tag: string) => tag.toLowerCase());
                return targetTags.every((tag) => collectionTags.includes(tag));
            });
        }

        const isFiltering = searchTerm !== "" || hasCategoryFilter || hasTagFilter;
        if (!isFiltering) {
            filteredList = filteredList.filter((c) => !c.parentId);
        }

        return filteredList;
    }, [collections, lastFilters]);

    // ── Sidebar Layout ─────────────────────────────────────────────────────────
    useEffect(() => {
        const handleResize = () => {
            const isLargeScreen = window.innerWidth >= 1280;
            setIsSidebarOpen(isLargeScreen);
        };
        window.addEventListener("resize", handleResize);
        handleResize();
        return () => window.removeEventListener("resize", handleResize);
    }, [setIsSidebarOpen]);

    // ── Loading Guard ──────────────────────────────────────────────────────────
    if (!appConfig) {
        return (
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
        );
    }

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className="flex h-screen bg-background overflow-hidden">
            {/* Mobile Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 xl:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            {currentView !== "onboarding" && (
                <aside
                    className={`fixed xl:relative z-50 xl:z-0 h-full bg-sidebar border-r border-sidebar-border shadow-xl transition-all duration-300 ease-in-out flex flex-col ${isSidebarOpen ? "w-80" : "w-12"
                        } visible opacity-100 translate-x-0`}
                >
                    <FilterSidebar
                        key={sidebarResetKey}
                        isOpen={isSidebarOpen}
                        onFilterChange={handleFilterChange}
                        onCategoryChosen={(label) => {
                            if (currentView === "settings") setCurrentView("models");
                            setLastCategoryFilter(label || "all");
                        }}
                        onClose={() => setIsSidebarOpen(false)}
                        onSettingsClick={handleSettingsClick}
                        categories={categories}
                        collections={collections}
                        onOpenCollection={navOpenCollection}
                        onBackToRoot={() => {
                            setActiveCollection(null);
                            setCurrentView("models");
                        }}
                        models={
                            currentView === "collection-view" && activeCollection
                                ? collectionBaseModels
                                : models
                        }
                        currentFilters={lastFilters}
                        initialFilters={{
                            search: "",
                            category: appConfig?.filters?.defaultCategory || "all",
                            printStatus: appConfig?.filters?.defaultPrintStatus || "all",
                            license: appConfig?.filters?.defaultLicense || "all",
                            fileType: "all",
                            tags: [],
                            showHidden: currentView === "collection-view",
                            showMissingImages: false,
                            sortBy: appConfig?.filters?.defaultSortBy || "none",
                        }}
                    />
                </aside>
            )}

            {/* Main Content */}
            <div
                className={`flex-1 flex flex-col min-w-0 overflow-hidden ${currentView !== "onboarding" ? "pl-12 xl:pl-0" : ""
                    }`}
            >
                <header className="flex items-center justify-between gap-2 p-4 border-b bg-card shadow-sm shrink-0">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={toggleSidebar}
                            className="p-2 hover:bg-accent transition-colors"
                        >
                            <Sidebar
                                className={`h-4 w-4 transition-transform duration-300 ${!isSidebarOpen ? "rotate-180" : ""
                                    }`}
                            />
                        </Button>
                        {(!isSidebarOpen || currentView === "settings") && (
                            <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center w-10 h-10 bg-gradient-primary rounded-xl shadow-lg">
                                    <img src="/images/favicon-32x32.png" alt="3D Model Muncher" />
                                </div>
                                <div>
                                    <h1 className="text-lg font-semibold text-foreground tracking-tight leading-none">
                                        {appConfig?.settings?.libraryName || "3D Model Muncher"}
                                    </h1>
                                    <p className="text-xs text-muted-foreground mt-1 font-medium">
                                        {navGetViewTitle()}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 flex justify-center min-w-0 px-2">
                        {appConfig && <PrinterStatusHub config={appConfig} />}
                    </div>

                    <div className="flex items-center gap-2">
                        <ThemeToggle />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="p-2 hover:bg-accent transition-colors"
                                    title="Actions"
                                    aria-label="Actions"
                                >
                                    <Box className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuItem
                                    onClick={() => handleRefreshModels()}
                                    disabled={isRefreshing}
                                >
                                    <RefreshCw
                                        className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
                                    />{" "}
                                    Refresh
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={navOpenCollections}>
                                    <List className="h-4 w-4 mr-2" /> Collections
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() =>
                                        navOpenSettings("integrity", { type: "hash-check", fileType: "3mf" })
                                    }
                                >
                                    <FileCheck className="h-4 w-4 mr-2" /> 3MF Check
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() =>
                                        navOpenSettings("integrity", { type: "generate", fileType: "3mf" })
                                    }
                                >
                                    <Files className="h-4 w-4 mr-2" /> 3MF Generate
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => dialogs.openUpload(activeCollection)}>
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
                </header>

                <main className="flex-1 min-h-0 relative">
                    {isModelsLoading && (
                        <div className="flex items-center gap-3 px-4 py-2 bg-yellow-50 border-b border-yellow-200 text-yellow-800">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            <div className="text-sm">Loading models...</div>
                        </div>
                    )}

                    {currentView === "models" ? (
                        <ModelsView
                            filteredModels={filteredModels}
                            collectionsForDisplay={collectionsForDisplay}
                            allCollections={collections}
                            sortBy={(currentSortBy || "none") as SortKey}
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
                    ) : currentView === "settings" ? (
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
                    ) : currentView === "collections" ? (
                        <CollectionsView
                            collections={collections}
                            collectionsForDisplay={collectionsForDisplay}
                            currentSortBy={currentSortBy}
                            models={models}
                            categories={categories}
                            onOpenCollection={navOpenCollection}
                            onRefresh={refreshCollections}
                        />
                    ) : currentView === "collection-view" && activeCollection ? (
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
                                        search: "",
                                        category: "all",
                                        printStatus: "all",
                                        license: "all",
                                        fileType: "all",
                                        tags: [],
                                        showHidden: true,
                                        showMissingImages: false,
                                        sortBy: currentSortBy,
                                    });
                                    setSidebarResetKey((k) => k + 1);
                                    return;
                                }
                                if (activeCollection?.parentId) {
                                    const parent = collections.find((c) => c.id === activeCollection.parentId);
                                    if (parent) {
                                        setActiveCollection(parent);
                                        return;
                                    }
                                }
                                setActiveCollection(null);
                                setCurrentView("models");
                                setSidebarResetKey((k) => k + 1);
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
                    ) : currentView === "model-hero" && selectedModel ? (
                        <ModelHubView
                            model={selectedModel}
                            models={models}
                            categories={categories}
                            collections={collections}
                            defaultModelView={appConfig?.settings?.defaultModelView ?? "images"}
                            defaultModelColor={appConfig?.settings?.defaultModelColor}
                            isSidebarOpen={isSidebarOpen}
                            onClose={() => {
                                setSelectedModel(null);
                                setCurrentView(activeCollection ? "collection-view" : "models");
                            }}
                            onModelUpdate={modelActions.handleModelUpdate}
                            onDelete={handleSingleModelDelete}
                            onOpenCollection={navOpenCollection}
                            onFilterChange={handleFilterChange}
                            onSettingsClick={handleSettingsClick}
                            onSelectModel={handleModelClick}
                        />
                    ) : currentView === "bulk-edit" ? (
                        <BulkEditView
                            models={getSelectedModels(models)}
                            onClose={navHandleBack}
                            onRemoveFromSelection={(id) =>
                                setSelectedModelIds((prev) => prev.filter((mid) => mid !== id))
                            }
                            onClearSelections={() => {
                                deselectAllModels();
                                if (isSelectionMode) toggleSelectionMode();
                            }}
                            categories={categories}
                            collectionsList={collections}
                            pendingBulkCollectionId={pendingBulkCollectionId}
                        />
                    ) : currentView === "admin-migration" ? (
                        <div className="container mx-auto p-4 overflow-y-auto h-full">
                            <Button
                                variant="ghost"
                                onClick={() => setCurrentView("settings")}
                                className="mb-4"
                            >
                                &larr; Back to Settings
                            </Button>
                            <MigrationStatus />
                        </div>
                    ) : currentView === "onboarding" ? (
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
    );
}
