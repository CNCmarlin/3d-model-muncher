import { useState } from 'react';
import { Model } from '@/types/model';

export interface UseSelectionModeProps {
    filteredModels: Model[];
    isSelectionMode: boolean;
    setIsSelectionMode: (v: boolean) => void;
    selectedModelIds: string[];
    setSelectedModelIds: (ids: string[] | ((prev: string[]) => string[])) => void;
}

export function useSelectionMode({
    filteredModels,
    isSelectionMode,
    setIsSelectionMode,
    selectedModelIds,
    setSelectedModelIds
}: UseSelectionModeProps) {
    const [selectionAnchorIndex, setSelectionAnchorIndex] = useState<number | null>(null);

    const toggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode);
        if (isSelectionMode) {
            setSelectedModelIds([]);
            setSelectionAnchorIndex(null);
        }
    };

    const handleModelSelection = (modelId: string, opts?: { shiftKey?: boolean; index?: number }) => {
        console.log('[useSelectionMode] handleModelSelection:', modelId, opts);
        const currentIndex = typeof opts?.index === 'number'
            ? opts!.index as number
            : filteredModels.findIndex(m => m.id === modelId);

        if (opts?.shiftKey && selectionAnchorIndex !== null && currentIndex !== -1) {
            // ... (existing logic)
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
                const newVal = Array.from(set);
                console.log('[useSelectionMode] Range selection update:', newVal);
                return newVal;
            });
            return;
        }

        setSelectedModelIds(prev => {
            const newVal = prev.includes(modelId)
                ? prev.filter(id => id !== modelId)
                : [...prev, modelId];
            console.log('[useSelectionMode] Single selection update:', newVal, 'Previous:', prev);
            return newVal;
        });
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

    const getSelectedModels = (allModels: Model[]): Model[] => {
        return allModels.filter(model => selectedModelIds.includes(model.id));
    };

    return {
        isSelectionMode,
        setIsSelectionMode,
        selectedModelIds,
        setSelectedModelIds,
        toggleSelectionMode,
        handleModelSelection,
        selectAllModels,
        deselectAllModels,
        exitSelectionMode,
        getSelectedModels
    };
}
