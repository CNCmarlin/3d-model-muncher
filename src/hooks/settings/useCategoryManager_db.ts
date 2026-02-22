import { Category } from "@/types/category";
import { AppConfig } from "@/types/config";
import { Model } from "@/types/model";
import { useMemo, useState } from 'react';

interface UseCategoryManagerProps {
    categories: Category[]; // Initial categories
    models: Model[];
    onModelsUpdate: (models: Model[]) => void;
    onCategoriesUpdate: (categories: Category[]) => void;
    localConfig: AppConfig;
    handleSaveConfig: (config: AppConfig) => Promise<void>;
    setSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error') => void;
    setStatusMessage: (msg: string) => void;
}

// Helper utility
export const normalizeIconName = (input?: string) => {
    if (!input) return 'Folder';
    const cleaned = input.trim().replace(/\.(svg|js|tsx?)$/i, '').replace(/[^a-z0-9-_ ]/gi, '');
    if (!cleaned) return 'Folder';
    const parts = cleaned.split(/[-_\s]+/).filter(Boolean);
    const pascal = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    return pascal;
};

export function useCategoryManager_db({
    categories,
    models,
    onModelsUpdate,
    onCategoriesUpdate,
    localConfig,
    handleSaveConfig,
    setSaveStatus,
    setStatusMessage
}: UseCategoryManagerProps) {
    const [localCategories, setLocalCategories] = useState<Category[]>(categories || []);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

    // Dialog & Edit State
    const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
    const [isCategoryRenameDialogOpen, setIsCategoryRenameDialogOpen] = useState(false);
    const [renameCategoryValue, setRenameCategoryValue] = useState('');
    const [renameCategoryIcon, setRenameCategoryIcon] = useState('Folder');

    const [isAddCategoryDialogOpen, setIsAddCategoryDialogOpen] = useState(false);
    const [newCategoryLabel, setNewCategoryLabel] = useState('');
    const [newCategoryIcon, setNewCategoryIcon] = useState('Folder');

    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [pendingDeleteCount, setPendingDeleteCount] = useState(0);

    // --- Drag & Drop ---
    const handleDragStart = (index: number) => {
        setDraggedIndex(index);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;

        const newCategories = [...localCategories];
        const draggedItem = newCategories[draggedIndex];
        newCategories.splice(draggedIndex, 1);
        newCategories.splice(index, 0, draggedItem);

        setLocalCategories(newCategories);
        setDraggedIndex(index);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
    };

    const handleSaveCategories = () => {
        onCategoriesUpdate(localCategories);
        const updatedConfig = { ...localConfig, categories: localCategories };
        handleSaveConfig(updatedConfig);
    };

    // --- Add Category ---
    const handleConfirmAddCategory = async () => {
        const label = newCategoryLabel.trim();
        if (!label) return;

        setSaveStatus('saving');
        setStatusMessage(`Adding category "${label}"...`);

        let baseId = label.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '_');
        let uniqueId = baseId;
        let counter = 1;
        while (localCategories.some(c => c.id === uniqueId)) {
            uniqueId = `${baseId}-${counter}`;
            counter++;
        }

        if (localCategories.some(c => c.label.toLowerCase() === label.toLowerCase())) {
            setSaveStatus('error');
            setStatusMessage(`A category with the label "${label}" already exists.`);
            setTimeout(() => { setSaveStatus('idle'); setStatusMessage(''); }, 3000);
            return;
        }

        const normalizedIcon = normalizeIconName(newCategoryIcon || 'Folder');
        const newCat: Category = { id: uniqueId, label, icon: normalizedIcon } as Category;
        const updatedCategories = [...localCategories, newCat];
        const updatedConfig: AppConfig = { ...localConfig, categories: updatedCategories };

        try {
            await handleSaveConfig(updatedConfig);
            setLocalCategories(updatedCategories);
            onCategoriesUpdate(updatedCategories);

            setSaveStatus('saved');
            setStatusMessage(`Category "${label}" added`);
            setIsAddCategoryDialogOpen(false);
            setNewCategoryLabel('');
            setNewCategoryIcon('Folder');
        } catch (error) {
            console.error('Failed to add category:', error);
            setSaveStatus('error');
            setStatusMessage('Failed to add category');
            setTimeout(() => { setSaveStatus('idle'); setStatusMessage(''); }, 2500);
        }

        setTimeout(() => { setSaveStatus('idle'); setStatusMessage(''); }, 2500);
    };

    // --- Rename Category ---
    const startRenameCategory = (category: Category) => {
        setSelectedCategory(category);
        setRenameCategoryValue(category.label);
        setRenameCategoryIcon(category.icon || 'Folder');
        setIsCategoryRenameDialogOpen(true);
    };

    const handleRenameCategory = async (oldCategoryId: string, newCategoryId: string, newCategoryLabel: string) => {
        if (!newCategoryId.trim() || !newCategoryLabel.trim()) return;

        const newIdTrimmed = newCategoryId.trim();
        const newLabelTrimmed = newCategoryLabel.trim();

        const conflicting = localCategories.find(c => (c.id === newIdTrimmed || c.label.toLowerCase() === newLabelTrimmed.toLowerCase()) && c.id !== oldCategoryId);
        if (conflicting) {
            setSaveStatus('error');
            setStatusMessage(`A category with the same ${conflicting.id === newIdTrimmed ? 'id' : 'label'} already exists.`);
            setTimeout(() => { setSaveStatus('idle'); setStatusMessage(''); }, 3000);
            return;
        }

        setSaveStatus('saving');
        setStatusMessage(`Renaming category "${oldCategoryId}" to "${newIdTrimmed}"...`);

        const oldCategory = localCategories.find(cat => cat.id === oldCategoryId);
        const oldCategoryLabel = oldCategory?.label || oldCategoryId;

        const normalizedNewIcon = normalizeIconName(renameCategoryIcon);
        const updatedCategories = localCategories.map(cat =>
            cat.id === oldCategoryId
                ? { ...cat, id: newIdTrimmed, label: newLabelTrimmed, icon: normalizedNewIcon }
                : cat
        );

        const updatedModels = models.map(model => ({
            ...model,
            category: model.category === oldCategoryLabel ? newLabelTrimmed : model.category
        }));

        let saveErrors = 0;
        for (const model of updatedModels) {
            const originalModel = models.find(m => m.id === model.id);
            if (originalModel && originalModel.category === oldCategoryLabel) {
                try {
                    let filePath;
                    if (model.modelUrl) {
                        const threeMfPath = model.modelUrl.replace(/^\/models\//, '');
                        filePath = threeMfPath.replace(/\.3mf$/i, '-munchie.json');
                    } else if (model.filePath) {
                        filePath = model.filePath.replace(/\.3mf$/i, '-munchie.json');
                    } else {
                        saveErrors++;
                        continue;
                    }

                    const requestData = {
                        filePath,
                        id: model.id,
                        category: model.category
                    };

                    const response = await fetch('/api/save-model', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestData)
                    });
                    const result = await response.json();
                    if (!result.success) saveErrors++;
                } catch (error) {
                    saveErrors++;
                }
            }
        }

        setLocalCategories(updatedCategories);
        onCategoriesUpdate(updatedCategories);
        onModelsUpdate(updatedModels);
        setIsCategoryRenameDialogOpen(false);
        setRenameCategoryValue('');
        setSelectedCategory(null);

        // Don't forget to save the config update with new category definitions!
        const updatedConfig = { ...localConfig, categories: updatedCategories };
        await handleSaveConfig(updatedConfig);

        if (saveErrors === 0) {
            setSaveStatus('saved');
            setStatusMessage(`Category "${oldCategoryLabel}" renamed`);
        } else {
            setSaveStatus('error');
            setStatusMessage(`Category renamed but ${saveErrors} file(s) failed to save`);
        }
        setTimeout(() => { setSaveStatus('idle'); setStatusMessage(''); }, 3000);
    };

    // --- Delete Category ---
    const openDeleteConfirm = (categoryId: string) => {
        const cat = localCategories.find(c => c.id === categoryId);
        if (!cat) return;
        const count = models.reduce((acc, m) => acc + (m.category === cat.label ? 1 : 0), 0);
        setPendingDeleteCount(count);
        setSelectedCategory(cat); // Reuse selectedCategory to store which one we are deleting
        setIsDeleteConfirmOpen(true);
    };

    const handleDeleteCategory = async (categoryId: string) => {
        const cat = localCategories.find(c => c.id === categoryId);
        if (!cat) return;

        setSaveStatus('saving');
        setStatusMessage(`Deleting category "${cat.label}"...`);

        const updatedCategories = localCategories.filter(c => c.id !== categoryId);
        const updatedModels = models.map(m => ({ ...m, category: m.category === cat.label ? 'Uncategorized' : m.category }));

        let saveErrors = 0;
        for (const model of updatedModels) {
            const original = models.find(x => x.id === model.id);
            if (!original) continue;
            if (original.category !== model.category) {
                try {
                    let filePath;
                    if (model.modelUrl) {
                        const threeMfPath = model.modelUrl.replace(/^\/models\//, '');
                        filePath = threeMfPath.replace(/\.3mf$/i, '-munchie.json');
                    } else if (model.filePath) {
                        filePath = model.filePath.replace(/\.3mf$/i, '-munchie.json');
                    }
                    if (!filePath) {
                        saveErrors++;
                        continue;
                    }

                    const requestData = { filePath, id: model.id, category: model.category };
                    await fetch('/api/save-model', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestData)
                    });
                } catch (err) {
                    saveErrors++;
                }
            }
        }

        setLocalCategories(updatedCategories);
        const updatedConfig = { ...localConfig, categories: updatedCategories };
        try {
            await handleSaveConfig(updatedConfig);
        } catch (err) { }

        onCategoriesUpdate(updatedCategories);
        onModelsUpdate(updatedModels);
        setIsDeleteConfirmOpen(false); // Close the dialog
        setSelectedCategory(null);

        if (saveErrors === 0) {
            setSaveStatus('saved');
            setStatusMessage(`Category "${cat.label}" deleted`);
        } else {
            setSaveStatus('error');
            setStatusMessage(`Category deleted but ${saveErrors} save(s) failed`);
        }
        setTimeout(() => { setSaveStatus('idle'); setStatusMessage(''); }, 3000);
    };

    const handleAddUnmappedCategory = async (label: string) => {
        const newId = label.trim().toLowerCase().replace(/\s+/g, '_');
        const normalizedIcon = normalizeIconName('Folder');
        const newCat: Category = { id: newId, label: label.trim(), icon: normalizedIcon } as Category;

        const exists = localCategories.find(c => c.label.toLowerCase() === newCat.label.toLowerCase() || c.id === newCat.id);
        if (exists) {
            setStatusMessage(`Category "${label}" already exists`);
            setTimeout(() => setStatusMessage(''), 2500);
            return;
        }

        const updatedCategories = [...localCategories, newCat];
        setLocalCategories(updatedCategories);
        const updatedConfig: AppConfig = { ...localConfig, categories: updatedCategories };

        try {
            await handleSaveConfig(updatedConfig);
            onCategoriesUpdate(updatedCategories);
            setSaveStatus('saved');
            setStatusMessage(`Added category "${label}"`);
        } catch (error) {
            console.error('Failed to add category from unmapped list', error);
            setSaveStatus('error');
            setStatusMessage('Failed to add category');
        }
        setTimeout(() => { setSaveStatus('idle'); setStatusMessage(''); }, 2500);
    };

    // Calculate unmapped categories
    const unmappedCategories = useMemo(() => {
        const configuredLabels = new Set((localCategories || []).map(c => c.label.toLowerCase()));
        const counts: Record<string, number> = {};
        models.forEach(m => {
            const raw = (m.category ?? '').toString().trim();
            if (!raw) return;
            // If the model's category (by label) isn't in configured categories, count it as unmapped
            if (!configuredLabels.has(raw.toLowerCase())) {
                counts[raw] = (counts[raw] || 0) + 1;
            }
        });
        return Object.keys(counts).map(label => ({ label, count: counts[label] })).sort((a, b) => b.count - a.count);
    }, [models, localCategories]);

    return {
        // State
        localCategories,
        setLocalCategories,
        draggedIndex,
        selectedCategory,
        setSelectedCategory,
        isCategoryRenameDialogOpen,
        setIsCategoryRenameDialogOpen,
        renameCategoryValue,
        setRenameCategoryValue,
        renameCategoryIcon,
        setRenameCategoryIcon,
        isAddCategoryDialogOpen,
        setIsAddCategoryDialogOpen,
        newCategoryLabel,
        setNewCategoryLabel,
        newCategoryIcon,
        setNewCategoryIcon,
        isDeleteConfirmOpen,
        setIsDeleteConfirmOpen,
        pendingDeleteCount,
        unmappedCategories,

        // Actions
        handleDragStart,
        handleDragOver,
        handleDragEnd,
        handleSaveCategories,
        handleConfirmAddCategory,
        startRenameCategory,
        handleRenameCategory,
        openDeleteConfirm,
        handleDeleteCategory,
        handleAddUnmappedCategory
    };
}
