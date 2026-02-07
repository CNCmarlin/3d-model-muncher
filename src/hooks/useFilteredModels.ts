import { useEffect, useMemo, useState } from "react";
import { useNavigation } from "../context/NavigationContext";
import { Collection } from "../types/collection";
import { Model } from "../types/model";
import { applyFiltersToModels, FilterState } from "../utils/filterUtils";
import { SortKey, sortModels } from "../utils/sortUtils";

interface UseFilteredModelsProps {
    models: Model[];
    collections: Collection[];
    refreshModels: (isInitial: boolean) => Promise<Model[] | null>;
    isSelectionMode: boolean;
    setIsSelectionMode: (v: boolean) => void;
    setSelectedModelIds: (ids: string[]) => void;
    selectedModelIds: string[];
    initialFilters?: Partial<FilterState>;
}

export function useFilteredModels({
    models,
    collections,
    refreshModels,
    isSelectionMode,
    setIsSelectionMode,
    setSelectedModelIds,
    selectedModelIds,
    initialFilters = {}
}: UseFilteredModelsProps) {

    const {
        currentView,
        setCurrentView,
        activeCollection,
        setActiveCollection
    } = useNavigation();

    // State
    const [filteredModels, setFilteredModels] = useState<Model[]>([]);
    const [lastFilters, setLastFilters] = useState<{
        search: string;
        category: string;
        printStatus: string;
        license: string;
        fileType: string;
        tags: string[];
        showHidden: boolean;
        showMissingImages: boolean;
        sortBy?: string
    }>({
        search: '',
        category: 'all',
        printStatus: 'all',
        license: 'all',
        fileType: 'all',
        tags: [],
        showHidden: false,
        showMissingImages: false,
        sortBy: 'none',
        ...initialFilters // Override defaults with props
    });

    const [currentSortBy, setCurrentSortBy] = useState<SortKey>((initialFilters.sortBy as SortKey) || 'none');
    const [lastCategoryFilter, setLastCategoryFilter] = useState<string>('all');

    const hasActiveFilters = useMemo(() => {
        return lastFilters.search.length > 0 ||
            lastFilters.tags.length > 0 ||
            lastFilters.category !== 'all' ||
            lastFilters.printStatus !== 'all' ||
            lastFilters.license !== 'all';
    }, [lastFilters]);

    // Recursively get all model IDs from a collection and its children
    const getRecursiveModelIds = (col: Collection, allCols: Collection[]): Set<string> => {
        const ids = new Set(col.modelIds || []);
        const children = allCols.filter(c => c.parentId === col.id);
        for (const child of children) {
            const childIds = getRecursiveModelIds(child, allCols);
            childIds.forEach(id => ids.add(id));
        }
        return ids;
    };

    const collectionBaseModels = useMemo(() => {
        if (activeCollection) {
            const idSet = getRecursiveModelIds(activeCollection, collections);
            return models.filter(m => idSet.has(m.id));
        }
        return models;
    }, [models, activeCollection, collections]);


    // [REFACTOR] Centralized Filtering Logic
    // Reacts to ANY change in dependencies (models, view, filters, sort)
    useEffect(() => {

        // Force Global Search view override logic
        if (lastFilters.search.trim().length > 0 && currentView === 'collection-view') {
            // This logic was in handleFilterChange, but we can't easily switch view inside an effect 
            // without causing loops if we're not careful.
            // Ideally, the View Switch happens in the Handler, and this effect just respects the current state.
        }

        const base = (currentView === 'collection-view' && activeCollection)
            ? collectionBaseModels
            : models;

        // "Collections" pseudo-type filter
        if ((lastFilters.fileType || '').toLowerCase() === 'collections' && currentView !== 'collection-view') {
            setFilteredModels([]);
            return;
        }

        // [PARITY FIX] Always show hidden items when viewing a specific collection
        // Legacy App.tsx bypassed filtering or forced showHidden=true
        const effectiveFilters = { ...lastFilters };
        if (currentView === 'collection-view' && activeCollection) {
            effectiveFilters.showHidden = true;
        }

        const filtered = applyFiltersToModels(base, effectiveFilters);
        const sorted = sortModels(filtered, currentSortBy);
        setFilteredModels(sorted);

        // Sync selections
        if (isSelectionMode) {
            // This can be annoying if it deselects things while typing, so be careful.
            // Keeping existing selection if valid.
            const validSelections = selectedModelIds.filter(id =>
                sorted.some(model => model.id === id)
            );
            // Only update if different to avoid loop
            if (validSelections.length !== selectedModelIds.length) {
                setSelectedModelIds(validSelections);
            }
        }

    }, [
        models,
        collectionBaseModels,
        activeCollection,
        currentView,
        lastFilters,
        currentSortBy,
        isSelectionMode,
        // We exclude selectedModelIds and setSelectedModelIds to prevent loops, 
        // as we only want to react to CONTENT changes, not selection changes themselves.
    ]);


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
        const incomingCategory = (filters.category || 'all');

        // View Switching Logic
        if (
            currentView === 'settings' &&
            incomingCategory.toLowerCase() !== (lastCategoryFilter || 'all').toLowerCase()
        ) {
            setCurrentView('models');
        }

        // Global Search Logic - Switching View
        if (filters.search.trim().length > 0 && currentView === 'collection-view') {
            setCurrentView('models');
            setActiveCollection(null);
            if (isSelectionMode) {
                setIsSelectionMode(false);
                setSelectedModelIds([]);
            }
        }

        // Auto-show hidden logic
        let newFilters = { ...filters };
        if (currentView !== 'collection-view') {
            const hasDataFilters =
                filters.search.length > 0 ||
                filters.tags.length > 0 ||
                filters.category !== 'all' ||
                filters.printStatus !== 'all' ||
                filters.license !== 'all' ||
                (filters.fileType !== 'all' && filters.fileType !== 'collections');

            const prevSig = JSON.stringify({
                s: lastFilters.search, t: lastFilters.tags, c: lastFilters.category,
                p: lastFilters.printStatus, l: lastFilters.license, f: lastFilters.fileType
            });
            const newSig = JSON.stringify({
                s: filters.search, t: filters.tags, c: filters.category,
                p: filters.printStatus, l: filters.license, f: filters.fileType
            });

            if (prevSig !== newSig) {
                if (hasDataFilters) {
                    newFilters.showHidden = true;
                } else {
                    newFilters.showHidden = false;
                }
            }
        }

        setLastFilters(newFilters);
        setLastCategoryFilter(incomingCategory);

        // WE DO NOT SET filteredModels HERE ANYMORE.
        // The useEffect above will detect the change in lastFilters and run.
    };

    const handleRefreshModels = async () => {
        await refreshModels(false);
        // No need to manually calc filteredModels, effect will pick up 'models' change
    };

    return {
        filteredModels,
        setFilteredModels,
        lastFilters,
        setLastFilters,
        currentSortBy,
        setCurrentSortBy,
        lastCategoryFilter,
        setLastCategoryFilter,
        hasActiveFilters,
        collectionBaseModels,
        handleFilterChange,
        handleRefreshModels
    };
}
