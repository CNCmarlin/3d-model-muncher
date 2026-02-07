import { License } from '@/constants/licenses';
import { Model } from '@/types/model';
import { useCallback, useEffect, useState } from 'react';

export interface BulkEditState {
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
    source?: string;
    price?: number;
    printTime?: string;
    filamentUsed?: string;
    // STL-only print settings (bulk updates apply only to STL models)
    printSettings?: {
        layerHeight?: string;
        infill?: string;
        nozzle?: string;
        printer?: string;
    };
    // Related files: which model id is primary, whether to hide others, and which ids are included
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
    isOpen: boolean;
    pendingBulkCollectionId: string | null;
}

export function useBulkEditForm({ models, isOpen, pendingBulkCollectionId }: UseBulkEditFormProps) {
    const [editState, setEditState] = useState<BulkEditState>({});
    const [fieldSelection, setFieldSelection] = useState<FieldSelection>({
        category: false,
        license: false,
        designer: false,
        isPrinted: false,
        hidden: false,
        tags: false,
        notes: false,
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

    // Track which of the selected models are included in the related-files group
    const [relatedIncludedIds, setRelatedIncludedIds] = useState<string[]>([]);

    // Generate a stable unique key for a model
    const uniqueKeyForModel = useCallback((m: Model) => {
        if (!m) return "";
        if (m.modelUrl) return m.modelUrl;
        if (m.filePath) return m.filePath;
        return `${m.id}::${m.name}`;
    }, []);

    // Determine if the given model is STL-based
    const isStlModel = useCallback((m: Model): boolean => {
        const p = (m.filePath || '').toLowerCase();
        const u = (m.modelUrl || '').toLowerCase();
        return p.endsWith('.stl') || p.endsWith('-stl-munchie.json') || u.endsWith('.stl');
    }, []);

    const hasAnyStlSelected = Array.isArray(models) && models.some(isStlModel);

    // Reset state when models change or drawer opens
    useEffect(() => {
        if (isOpen) {
            setEditState({
                tags: { add: [], remove: [] },
                relatedIncluded: models.map((m) => uniqueKeyForModel(m)),
                relatedPrimary: models.length > 0 ? uniqueKeyForModel(models[0]) : undefined,
                relatedHideOthers: false,
                relatedClearAll: false,
                collectionId: pendingBulkCollectionId,
                collectionAction: pendingBulkCollectionId ? 'add' : 'none',
            });
            setFieldSelection({
                category: false,
                license: false,
                designer: false,
                isPrinted: false,
                hidden: false,
                tags: false,
                notes: false,
                source: false,
                price: false,
                printTime: false,
                filamentUsed: false,
                printSettings: false,
                generateImages: false,
                regenerateMunchie: false,
                relatedFiles: false,
                collection: !!pendingBulkCollectionId,
            });
            setRelatedIncludedIds(models.map((m) => uniqueKeyForModel(m)));
        }
    }, [isOpen, models, pendingBulkCollectionId, uniqueKeyForModel]);

    // If selection changes such that no STL models are present, auto-uncheck the field
    useEffect(() => {
        if (!isOpen) return;
        if (!hasAnyStlSelected && fieldSelection.printSettings) {
            setFieldSelection(prev => ({ ...prev, printSettings: false }));
            setEditState(prev => ({ ...prev, printSettings: undefined }));
        }
    }, [hasAnyStlSelected, isOpen, fieldSelection.printSettings]);

    const handleFieldToggle = (field: keyof FieldSelection) => {
        setFieldSelection((prev) => ({
            ...prev,
            [field]: !prev[field],
        }));

        // Clear the field value if unchecked (except for regenerateMunchie/generateImages which are actions)
        if (fieldSelection[field] && field !== 'regenerateMunchie' && field !== 'generateImages') {
            setEditState((prev) => {
                const newState = { ...prev };
                // We need to be careful with optional properties, but in JS delete works on any key
                delete (newState as any)[field];
                return newState;
            });
        }
    };

    const methods = {
        setCategory: (val: string) => setEditState(prev => ({ ...prev, category: val })),
        setLicense: (val: string) => setEditState(prev => ({ ...prev, license: val })),
        setDesigner: (val: string) => setEditState(prev => ({ ...prev, designer: val })),
        setPrintStatus: (val: boolean) => setEditState(prev => ({ ...prev, isPrinted: val })),
        setHidden: (val: boolean) => setEditState(prev => ({ ...prev, hidden: val })),
        setNotes: (val: string) => setEditState(prev => ({ ...prev, notes: val })),
        setSource: (val: string) => setEditState(prev => ({ ...prev, source: val })),
        setPrice: (val: string) => setEditState(prev => ({ ...prev, price: val ? parseFloat(val) : undefined })),
        setPrintTime: (val: string) => setEditState(prev => ({ ...prev, printTime: val })),
        setFilament: (val: string) => setEditState(prev => ({ ...prev, filamentUsed: val })),
        setCollectionId: (val: string) => setEditState(prev => ({ ...prev, collectionId: val })),
        setCollectionAction: (val: 'add' | 'remove' | 'none') => setEditState(prev => ({ ...prev, collectionAction: val })),
        setRelatedPrimary: (val: string) => setEditState(prev => ({ ...prev, relatedPrimary: val })),
        setRelatedHideOthers: (val: boolean) => setEditState(prev => ({ ...prev, relatedHideOthers: val })),
        setRelatedClearAll: (val: boolean) => setEditState(prev => ({ ...prev, relatedClearAll: val })),

        // Complex state setters
        toggleRelatedInclude: (key: string) => {
            const current = new Set(editState.relatedIncluded || relatedIncludedIds || []);
            if (current.has(key)) current.delete(key);
            else current.add(key);
            const arr = Array.from(current);
            setEditState(prev => ({ ...prev, relatedIncluded: arr }));
            setRelatedIncludedIds(arr);
        },

        toggleTagRemoval: (tag: string) => {
            setEditState((prev) => {
                const currentRemove = prev.tags?.remove || [];
                const isRemoving = currentRemove.includes(tag);
                return {
                    ...prev,
                    tags: {
                        add: prev.tags?.add || [],
                        remove: isRemoving
                            ? currentRemove.filter((t) => t !== tag)
                            : [...currentRemove, tag],
                    },
                };
            });
        },

        setTagsAdd: (cleaned: string[]) => {
            setEditState(prev => ({
                ...prev,
                tags: {
                    add: cleaned,
                    remove: (prev.tags?.remove || []).filter(r => !cleaned.some(t => t.toLowerCase() === r.toLowerCase())),
                },
            }));
        },

        setPrintSettings: (key: keyof NonNullable<BulkEditState['printSettings']>, value: string) => {
            setEditState(prev => ({
                ...prev,
                printSettings: { ...(prev.printSettings || {}), [key]: value }
            }));
        }
    };

    // Helper to compute common values
    const getCommonValues = () => {
        if (models.length === 0) return {};
        const first = models[0];
        const common: any = {};

        const checkField = (field: keyof Model) => {
            if (models.every(m => m[field] === first[field])) {
                common[field] = first[field];
            }
        };

        checkField('category');
        checkField('license');
        checkField('isPrinted');
        checkField('hidden');
        checkField('printTime');
        checkField('designer');
        checkField('filamentUsed');
        return common;
    };

    const getAllTags = () => {
        const allTags = new Set<string>();
        models.forEach((model) => {
            (model.tags || []).forEach((tag) => allTags.add(tag));
        });
        return Array.from(allTags).sort();
    };

    return {
        editState,
        setEditState,
        fieldSelection,
        setFieldSelection,
        relatedIncludedIds,
        handleFieldToggle,
        uniqueKeyForModel,
        isStlModel,
        hasAnyStlSelected,
        commonValues: getCommonValues(),
        allTags: getAllTags(),
        ...methods
    };
}
