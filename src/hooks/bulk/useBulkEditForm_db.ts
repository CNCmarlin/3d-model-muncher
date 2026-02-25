import { License } from '@/constants/licenses';
import { Model } from '@/types/model_db';
import { useCallback, useEffect, useState } from 'react';

export interface BulkEditState_DB {
    category?: string;
    license?: License | string;
    designer?: string;
    isPrinted?: boolean;
    hidden?: boolean;
    tags?: {
        add: string[];
        remove: string[];
    };
    notes?: string;
    description?: string;
    source?: string;
    price?: number;
    printTime?: string;
    filamentUsed?: string;
    // STL-only print settings
    printSettings?: {
        layerHeight?: string;
        infill?: string;
        nozzle?: string;
        printer?: string;
        material?: string;
    };
    // Related files
    relatedPrimary?: string;
    relatedHideOthers?: boolean;
    relatedIncluded?: string[];
    relatedClearAll?: boolean;
    collectionId?: string | null;
    collectionAction?: 'add' | 'remove' | 'none';
}

export interface FieldSelection {
    category: boolean;
    license: boolean;
    designer: boolean;
    isPrinted: boolean;
    hidden: boolean;
    tags: boolean;
    notes: boolean;
    description: boolean;
    source: boolean;
    price: boolean;
    printTime: boolean;
    filamentUsed: boolean;
    printSettings: boolean;
    generateImages: boolean;
    regenerateMunchie: boolean;
    relatedFiles: boolean;
    collection: boolean;
}

interface UseBulkEditFormProps {
    models: Model[];
    selectedTargetIds: string[]; // WE NEED THIS NOW TO APPLY EDITS
    isOpen: boolean;
    pendingBulkCollectionId: string | null;
}

export function useBulkEditForm_db({ models, selectedTargetIds, isOpen }: UseBulkEditFormProps) {
    // MAIN STATE: Map of modelId -> Pending Edits
    const [stagedEdits, setStagedEdits] = useState<Record<string, BulkEditState_DB>>({});

    // UI STATE: Which fields are currently "active" in the operations panel
    const [fieldSelection, setFieldSelection] = useState<FieldSelection>({
        category: false,
        license: false,
        designer: false,
        isPrinted: false,
        hidden: false,
        tags: false,
        notes: false,
        description: false,
        source: false,
        price: false,
        printTime: false,
        filamentUsed: false,
        printSettings: false,
        generateImages: false,
        regenerateMunchie: false,
        relatedFiles: false,
        collection: false,
    });

    // Generate a stable unique key for a model
    const uniqueKeyForModel = useCallback((m: Model) => {
        if (!m) return "";
        if (m.modelUrl) return m.modelUrl;
        if (m.filePath) return m.filePath;
        return `${m.id}::${m.name}`;
    }, []);

    const isStlModel = useCallback((m: Model): boolean => {
        const p = (m.filePath || '').toLowerCase();
        const u = (m.modelUrl || '').toLowerCase();
        return p.endsWith('.stl') || p.endsWith('-stl-munchie.json') || u.endsWith('.stl');
    }, []);

    const hasAnyStlSelected = selectedTargetIds.some(id => {
        const m = models.find(x => x.id === id);
        return m && isStlModel(m);
    });

    // Reset state when opening/closing
    useEffect(() => {
        if (isOpen) {
            // Initialize stagedEdits ONLY if empty? 
            // Actually, we want persistence during a session, but reset on close.
            // For now, let's assume parent controls lifecycle.
        } else {
            setStagedEdits({});
            setFieldSelection({
                category: false, license: false, designer: false, isPrinted: false, hidden: false,
                tags: false, notes: false, description: false, source: false, price: false, printTime: false,
                filamentUsed: false, printSettings: false, generateImages: false, regenerateMunchie: false,
                relatedFiles: false, collection: false,
            });
        }
    }, [isOpen]);

    // Helper to update staged edits for ALL currently selected targets
    const updateStaged = (key: keyof BulkEditState_DB, value: any) => {
        setStagedEdits(prev => {
            const next = { ...prev };
            selectedTargetIds.forEach(id => {
                const current = next[id] || {};
                next[id] = { ...current, [key]: value };
            });
            return next;
        });
    };

    // Helper to remove a field from staged edits for ALL currently selected targets
    const removeStaged = (key: keyof BulkEditState_DB) => {
        setStagedEdits(prev => {
            const next = { ...prev };
            selectedTargetIds.forEach(id => {
                if (next[id]) {
                    const clone = { ...next[id] };
                    delete clone[key];
                    next[id] = clone;
                }
            });
            return next;
        });
    };

    const handleFieldToggle = (field: keyof FieldSelection) => {
        setFieldSelection(prev => ({ ...prev, [field]: !prev[field] }));

        // If turning OFF, remove the edit from all currently selected models
        // NOTE: This might be debatable. Should untoggling remove the edit? 
        // In "Batch" mode, yes, because the panel represents the "current action".
        if (fieldSelection[field]) {
            // Mapping fieldSelection keys to BulkEditState keys is mostly 1:1 but slightly tricky
            const stateKey = field as keyof BulkEditState_DB; // Works for most
            if (field !== 'regenerateMunchie' && field !== 'generateImages') {
                removeStaged(stateKey);
            }
        }
    };

    // -- SETTERS --
    // These update the 'stagedEdits' for the current selection
    const methods = {
        setCategory: (val: string) => updateStaged('category', val),
        setLicense: (val: string) => updateStaged('license', val),
        setDesigner: (val: string) => updateStaged('designer', val),
        setPrintStatus: (val: boolean) => updateStaged('isPrinted', val),
        setHidden: (val: boolean) => updateStaged('hidden', val),
        setNotes: (val: string) => updateStaged('notes', val),
        setDescription: (val: string) => updateStaged('description', val),
        setSource: (val: string) => updateStaged('source', val),
        setPrice: (val: string) => updateStaged('price', val ? parseFloat(val) : undefined),
        setPrintTime: (val: string) => updateStaged('printTime', val),
        setFilament: (val: string) => updateStaged('filamentUsed', val),
        setCollectionId: (val: string) => updateStaged('collectionId', val),
        setCollectionAction: (val: 'add' | 'remove' | 'none') => updateStaged('collectionAction', val),

        // Complex Setters
        setTagsAdd: (addedTags: string[]) => {
            setStagedEdits(prev => {
                const next = { ...prev };
                selectedTargetIds.forEach(id => {
                    const current = next[id] || {};
                    // Merge with existing tag edits? Or replacement?
                    // User expects "Add these tags".
                    next[id] = {
                        ...current,
                        tags: {
                            add: addedTags,
                            remove: current.tags?.remove || [] // Keep removals
                        }
                    };
                });
                return next;
            });
        },

        toggleTagRemoval: (tag: string) => {
            setStagedEdits(prev => {
                const next = { ...prev };
                selectedTargetIds.forEach(id => {
                    const current = next[id] || {};
                    const currentRemove = current.tags?.remove || [];
                    const isRemoving = currentRemove.includes(tag);

                    next[id] = {
                        ...current,
                        tags: {
                            add: current.tags?.add || [],
                            remove: isRemoving ? currentRemove.filter(t => t !== tag) : [...currentRemove, tag]
                        }
                    };
                });
                return next;
            });
        },

        setTags: (tags: { add: string[], remove: string[] }) => {
            setStagedEdits(prev => {
                const next = { ...prev };
                selectedTargetIds.forEach(id => {
                    const current = next[id] || {};
                    next[id] = {
                        ...current,
                        tags
                    };
                });
                return next;
            });
        },

        setPrintSettings: (key: string, value: string) => {
            setStagedEdits(prev => {
                const next = { ...prev };
                selectedTargetIds.forEach(id => {
                    const current = next[id] || {};
                    const currentSettings = current.printSettings || {};
                    next[id] = {
                        ...current,
                        printSettings: { ...currentSettings, [key]: value }
                    };
                });
                return next;
            });
        },

        setPrintMaterial: (val: string) => methods.setPrintSettings('material', val),


        // Related files (Complex logic usually, simplified here for bulk)
        setRelatedPrimary: (val: string) => updateStaged('relatedPrimary', val),
        setRelatedHideOthers: (val: boolean) => updateStaged('relatedHideOthers', val),
        setRelatedClearAll: (val: boolean) => updateStaged('relatedClearAll', val),
        toggleRelatedInclude: (id: string) => {
            setStagedEdits(prev => {
                const next = { ...prev };
                selectedTargetIds.forEach(targetId => {
                    const current = next[targetId] || {};
                    const included = current.relatedIncluded || [];
                    next[targetId] = {
                        ...current,
                        relatedIncluded: included.includes(id)
                            ? included.filter(x => x !== id)
                            : [...included, id]
                    };
                });
                return next;
            });
        },

        // Remove specific edit constraint
        removeEdit: (ids: string[], field: keyof BulkEditState_DB, value?: any) => {
            setStagedEdits(prev => {
                const next = { ...prev };
                ids.forEach(id => {
                    const current = next[id];
                    if (!current) return;

                    const clone = { ...current };

                    // Special handling for tags
                    if (field === 'tags' && value) {
                        const { tag, action } = value as { tag: string, action: 'add' | 'remove' };
                        const currentTags = clone.tags || { add: [], remove: [] };
                        if (action === 'add') {
                            clone.tags = {
                                ...currentTags,
                                add: currentTags.add?.filter(t => t !== tag) || []
                            };
                        } else {
                            clone.tags = {
                                ...currentTags,
                                remove: currentTags.remove?.filter(t => t !== tag) || []
                            };
                        }
                        // Cleanup empty tag object if needed? 
                        if (clone.tags.add?.length === 0 && clone.tags.remove?.length === 0) {
                            delete clone.tags;
                        }
                    } else if (field === 'printSettings' && value) {
                        const keyToRemove = value as string;
                        if (clone.printSettings) {
                            const newSettings = { ...clone.printSettings };
                            delete (newSettings as any)[keyToRemove];
                            if (Object.keys(newSettings).length === 0) {
                                delete clone.printSettings;
                            } else {
                                clone.printSettings = newSettings;
                            }
                        }
                    } else if (field === 'printSettings' && !value) {
                        // Remove all if no key specified
                        delete clone.printSettings;
                    } else {
                        // Simple field removal
                        delete clone[field];
                    }

                    // Cleanup if model has no edits left?
                    if (Object.keys(clone).length === 0) {
                        delete next[id];
                    } else {
                        next[id] = clone;
                    }
                });
                return next;
            });
        }
    };

    // -- COMMON VALUES --
    // We need to show "Mixed" or a value in the form inputs.
    // Logic: Look at Staged Edits for selection. If not staged, look at Original Model.
    // If all selection matches, return value. Else undefined.
    const getCommonValues = () => {
        if (selectedTargetIds.length === 0) return {};

        // Helper to get effective value for a model (staged > original)
        const getEffectiveValue = (id: string, field: keyof BulkEditState_DB) => {
            if (stagedEdits[id] && stagedEdits[id][field] !== undefined) {
                return stagedEdits[id][field];
            }
            const model = models.find(m => m.id === id);
            return model ? (model as any)[field] : undefined;
        };

        const firstId = selectedTargetIds[0];
        const common: any = {};

        const checkField = (field: keyof BulkEditState_DB) => {
            const firstVal = getEffectiveValue(firstId, field);
            const allMatch = selectedTargetIds.every(id => getEffectiveValue(id, field) === firstVal);
            if (allMatch) common[field] = firstVal;
        };

        checkField('category');
        checkField('license');
        checkField('designer');
        checkField('isPrinted');
        checkField('hidden');
        checkField('description');
        checkField('printSettings'); // TODO: Deep check might be needed

        return common;
    };

    // Helper to get the "Effective State" for the Operations Panel to bind to.
    // If multiple selected with different values -> return empty/undefined (Mixed).
    // If single selected -> return its specific state.
    const editState = getCommonValues() as BulkEditState_DB;

    const getAllTags = () => {
        const allTags = new Set<string>();
        models.forEach((model) => {
            if (model.tags && Array.isArray(model.tags)) {
                model.tags.forEach((tag: any) => {
                    const tagName = typeof tag === 'string' ? tag : tag?.name;
                    if (tagName) allTags.add(tagName);
                });
            }
        });
        return Array.from(allTags).sort();
    };

    return {
        stagedEdits,
        setStagedEdits,
        editState, // Computed "View" of the state for the UI inputs
        relatedIncludedIds: editState.relatedIncluded,
        fieldSelection,
        setFieldSelection,
        handleFieldToggle,
        uniqueKeyForModel,
        isStlModel,
        hasAnyStlSelected,
        commonValues: getCommonValues(),
        allTags: getAllTags(),
        ...methods
    };
}
export type UseBulkEditFormResult = ReturnType<typeof useBulkEditForm_db>;
