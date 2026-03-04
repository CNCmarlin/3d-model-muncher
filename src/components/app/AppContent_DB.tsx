/**
 * AppContent_DB — Database-mode top-level UI component.
 *
 * Calls ONLY _db / _DB hooks and renders ONLY _DB view components.
 * No legacy imports, no ternaries, no `as any` casts for mode bridging.
 *
 * Counterpart: AppContent_Legacy.tsx (legacy JSON sidecar mode).
 */

import { useEffect, useMemo, useState } from "react";

// ── DB Components ──────────────────────────────────────────────────────────────
import { FilterSidebar_DB } from "@/components/layout/FilterSidebar_DB";
import { PrinterStatusHub_DB } from "@/components/layout/PrinterStatusHub_DB";
import { ThemeToggle_DB } from "@/components/layout/ThemeToggle_DB";
import { SettingsPage_DB } from "@/components/management/SettingsPage_DB";
import { ModelHubView_DB } from "@/components/models/ModelHubView_DB";
import { ProjectsList_DB } from "@/components/projects/ProjectsList_DB";
import { ProjectWorkspace_DB } from "@/components/projects/ProjectWorkspace_DB";
import { GlobalDialogs_DB } from "@/components/shared/GlobalDialogs_DB";
import { BulkEditView_DB } from "@/components/views/BulkEditView_DB";
import { CollectionsView_DB } from "@/components/views/CollectionsView_DB";
import { CollectionView_DB } from "@/components/views/CollectionView_DB";
import { ModelsView_DB } from "@/components/views/ModelsView_DB";

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

// ── DB Hooks (queries) ─────────────────────────────────────────────────────────
import { useCollections_db } from "@/hooks/queries/useCollections_db";
import { useModels_db } from "@/hooks/queries/useModels_db";
import { useModelsByIds_db } from "@/hooks/queries/useModelsByIds_db";

// ── DB Hooks (app-level) ───────────────────────────────────────────────────────
import { useFilteredModels_db } from "@/hooks/useFilteredModels_db";
import { useGlobalDialogs_db } from "@/hooks/useGlobalDialogs_db";
import { useModelActions_db } from "@/hooks/useModelActions_db";
import { useSelectionMode_db } from "@/hooks/useSelectionMode_db";

// ── Types ──────────────────────────────────────────────────────────────────────
import type { Collection } from "@/types/collection_db";
import type { Model } from "@/types/model_db";
import { hasModelsDeep } from "@/utils/collectionUtils_db";
import type { SortKey } from "@/utils/sortUtils_db";

// ── Icons ──────────────────────────────────────────────────────────────────────
import { Box, FileCheck, Files, Heart, List, RefreshCw, Sidebar, Upload } from "lucide-react";
import { toast } from "sonner";

const EMPTY_MODELS: Model[] = [];
const EMPTY_COLLECTIONS: Collection[] = [];

export default function AppContent_DB() {
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
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

    // ── Onboarding Redirect ────────────────────────────────────────────────────
    useEffect(() => {
        if (appConfig && !isConfigLoading) {
            const isCompleted = appConfig.settings?.onboardingCompleted;
            if (!isCompleted && currentView !== "onboarding") {
                setCurrentView("onboarding");
            }
        }
    }, [appConfig, isConfigLoading, currentView, setCurrentView]);

    // ── React Query Data Fetching (DB) ─────────────────────────────────────────
    const {
        data: models = EMPTY_MODELS,
        isLoading: isModelsLoading,
        isFetching: isRefreshing,
        refetch: refetchModels,
    } = useModels_db();

    const {
        data: collections = EMPTY_COLLECTIONS,
        refetch: refetchCollections,
    } = useCollections_db();

    // Helper — refetch wrapper
    const refreshModels = async (): Promise<Model[] | null> => {
        const result = await refetchModels();
        return result.data || null;
    };

    const refreshCollections = async (): Promise<void> => {
        await refetchCollections();
    };

    // ── Selection State (Lifted) ───────────────────────────────────────────────
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);

    // ── Filtered Models (DB) ───────────────────────────────────────────────────
    const {
        filteredModels,
        setFilteredModels,
        lastFilters,
        setLastFilters,
        currentSortBy,
        setCurrentSortBy,
        setLastCategoryFilter,
        hasActiveFilters,
        handleFilterChange,
        handleRefreshModels,
    } = useFilteredModels_db({
        models,
        collections: collections as any,
        refreshModels: refreshModels as any,
        isSelectionMode,
        setIsSelectionMode,
        selectedModelIds,
        setSelectedModelIds,
    });

    // ── Bulk Edit Fetch (DB) ───────────────────────────────────────────────────
    const { data: bulkModels } = useModelsByIds_db(selectedModelIds, {
        enabled: currentView === "bulk-edit" && selectedModelIds.length > 0,
    });

    // ── Selection Hook (DB) ────────────────────────────────────────────────────
    const {
        toggleSelectionMode,
        handleModelSelection,
        selectAllModels,
        deselectAllModels,
    } = useSelectionMode_db({
        isSelectionMode,
        setIsSelectionMode,
        selectedModelIds,
        setSelectedModelIds,
        filteredModels,
    });

    // ── Model Actions (DB) ─────────────────────────────────────────────────────
    const modelActions = useModelActions_db({
        models: models as any,
        setModels: () => {
            // DB mode: React Query cache handles optimistic updates
        },
        filteredModels: filteredModels as any,
        setFilteredModels: setFilteredModels as any,
        selectedModelIds,
        setSelectedModelIds,
        setIsSelectionMode,
        onCloseBulkEdit: () => navHandleBack(),
        refreshModels: handleRefreshModels,
        setSelectedModel: setSelectedModel as any,
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
                await refreshModels();
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

    // ── Global Dialogs (DB) ────────────────────────────────────────────────────
    const dialogs = useGlobalDialogs_db({
        collections: collections as any,
        models: models as any,
        refreshModels: handleRefreshModels as any,
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
        dialogs.openUpload(actualCollection as any);
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
                if (col && Array.isArray((col as any).modelIds)) {
                    setActiveCollection(col as any);
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

        // ── Dynamic Collection Mode Logic ──
        if (!isFiltering) {
            const mode = appConfig?.settings?.collectionMode || 'strict';

            if (mode === 'smart') {
                // Flattened: Elevate ANY folder that contains models directly, EXCEPT Manual collections which stay hierarchical
                filteredList = filteredList.filter(c =>
                    c.type === 'Manual' ? !c.parentId : (Array.isArray(c.modelIds) && c.modelIds.length > 0)
                );
            }
            else if (mode === 'top-level') {
                // Top-Level: Show only roots (strict hierarchy, no empty filtering)
                filteredList = filteredList.filter(c => !c.parentId);
            }
            else if (mode === 'strict' || !mode) {
                // Default Strict: Show roots that have models SOMEWHERE deeply nested (Manual collections always show)
                filteredList = filteredList.filter(c => {
                    if (c.parentId) return false;
                    if (c.type === 'Manual') return true;
                    return hasModelsDeep(c.id, collections);
                });
            }
            else if (mode === 'raw') {
                // Raw: Show exactly all roots, ignoring emptiness.
                filteredList = filteredList.filter(c => !c.parentId);
            }
            else if (mode === 'manual') {
                // Manual: Custom Collections only (ignore Auto-Imported)
                filteredList = filteredList.filter(c => c.category !== 'Auto-Imported' && !c.parentId);
            }
        }

        return filteredList;
    }, [collections, lastFilters, appConfig?.settings?.collectionMode]);

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
                    <FilterSidebar_DB
                        key={sidebarResetKey}
                        isOpen={isSidebarOpen}
                        onFilterChange={handleFilterChange}
                        onCategoryChosen={(label) => {
                            if (currentView === "settings") setCurrentView("models");
                            setLastCategoryFilter(label || "all");
                        }}
                        onClose={() => setIsSidebarOpen(false)}
                        onSettingsClick={handleSettingsClick}
                        onProjectsClick={() => setCurrentView('projects')}
                        categories={categories}
                        collections={collections as any}
                        onOpenCollection={navOpenCollection}
                        onBackToRoot={() => {
                            setActiveCollection(null);
                            setCurrentView("models");
                        }}
                        models={[]}
                        currentFilters={lastFilters as any}
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
                        libraryName={appConfig?.settings?.libraryName}
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
                        {appConfig && <PrinterStatusHub_DB config={appConfig} />}
                    </div>

                    <div className="flex items-center gap-2">
                        <ThemeToggle_DB />
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
                                <DropdownMenuItem onClick={() => dialogs.openUpload(activeCollection as any)}>
                                    <Upload className="h-4 w-4 mr-2" /> Upload Files
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setCurrentView('projects')}>
                                    <Box className="h-4 w-4 mr-2" /> Projects
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
                        <ModelsView_DB
                            filteredModels={filteredModels}
                            collectionsForDisplay={hasActiveFilters ? [] : collectionsForDisplay}
                            allCollections={collections}
                            sortBy={currentSortBy as any}
                            onModelClick={handleModelClick as any}
                            onRefresh={handleRefreshModels}
                            isSelectionMode={isSelectionMode}
                            selectedModelIds={selectedModelIds}
                            onModelSelection={handleModelSelection}
                            onToggleSelectionMode={toggleSelectionMode}
                            onSelectAll={selectAllModels}
                            onDeselectAll={deselectAllModels}
                            onBulkEdit={() => {
                                if (selectedModelIds.length > 0) {
                                    setCurrentView("bulk-edit");
                                }
                            }}
                            onBulkDelete={handleBulkDeleteClick}
                        />
                    ) : currentView === "projects" ? (
                        <ProjectsList_DB onOpenProject={(id) => {
                            setSelectedProjectId(id);
                            setCurrentView("project-workspace");
                        }} />
                    ) : currentView === "project-workspace" && selectedProjectId ? (
                        <ProjectWorkspace_DB
                            projectId={selectedProjectId}
                            onBack={() => setCurrentView("projects")}
                        />
                    ) : currentView === "settings" ? (
                        <SettingsPage_DB
                            onBack={navHandleBack}
                            categories={categories}
                            onCategoriesUpdate={updateCategories}
                            config={appConfig}
                            onConfigUpdate={updateConfig}
                            models={models as any}
                            onModelsUpdate={() => handleRefreshModels()}
                            onModelClick={handleModelClick as any}
                            onDonationClick={handleDonationClick}
                            initialTab={settingsInitialTab}
                            settingsAction={settingsAction}
                            onActionHandled={() => setSettingsAction(null)}
                            onCollectionCreatedForBulkEdit={handleCollectionCreatedForBulkEdit}
                        />
                    ) : currentView === "collections" ? (
                        <CollectionsView_DB
                            collections={collections}
                            collectionsForDisplay={collectionsForDisplay as any}
                            currentSortBy={(currentSortBy || "name") as SortKey}
                            models={models as any}
                            categories={categories}
                            onOpenCollection={navOpenCollection as any}
                            onRefresh={refreshCollections}
                        />
                    ) : currentView === "collection-view" && activeCollection ? (
                        <CollectionView_DB
                            activeCollection={activeCollection as any}
                            filteredModels={filteredModels}
                            collections={collections}
                            onOpenCollection={navOpenCollection as any}
                            onImportClick={handleOpenImport}
                            onUploadClick={handleCollectionUpload}
                            config={appConfig}
                            onBack={() => {
                                if ((activeCollection as any)?.parentId) {
                                    const parent = collections.find(
                                        (c) => c.id === (activeCollection as any).parentId
                                    );
                                    if (parent) {
                                        setActiveCollection(parent as any);
                                        return;
                                    }
                                }
                                setActiveCollection(null);
                                setCurrentView("models");
                                setSidebarResetKey((k) => k + 1);
                                setIsSelectionMode(false);
                                setSelectedModelIds([]);
                            }}
                            onModelClick={handleModelClick as any}
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
                        <ModelHubView_DB
                            model={selectedModel as any}
                            models={models as any}
                            categories={categories}
                            collections={collections}
                            defaultModelView={appConfig?.settings?.defaultModelView ?? "images"}
                            defaultModelColor={appConfig?.settings?.defaultModelColor}
                            onClose={() => {
                                setSelectedModel(null);
                                setCurrentView(activeCollection ? "collection-view" : "models");
                            }}
                            onModelUpdate={modelActions.handleModelUpdate as any}
                            onDelete={handleSingleModelDelete as any}
                            onOpenCollection={navOpenCollection as any}
                            isSidebarOpen={isSidebarOpen}
                            onFilterChange={handleFilterChange}
                            onSettingsClick={handleSettingsClick}
                            onSelectModel={handleModelClick as any}
                        />
                    ) : currentView === "bulk-edit" ? (
                        <BulkEditView_DB
                            models={(bulkModels || []) as any}
                            onClose={navHandleBack}
                            onRemoveFromSelection={(id: string) =>
                                setSelectedModelIds((prev) => prev.filter((mid) => mid !== id))
                            }
                            onClearSelections={() => {
                                deselectAllModels();
                                if (isSelectionMode) toggleSelectionMode();
                            }}
                            categories={categories}
                            collectionsList={collections}
                            pendingBulkCollectionId={null}
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

            <GlobalDialogs_DB
                {...dialogs.dialogProps}
                isReleaseNotesOpen={isReleaseNotesOpen}
                dontShowReleaseNotes={dontShowReleaseNotes}
                setDontShowReleaseNotes={setDontShowReleaseNotes}
                closeReleaseNotes={closeReleaseNotes}
            />
        </div>
    );
}
