import { useEffect, useMemo, useState } from 'react';
import { Collection } from '../../types/collection';
import { Model } from '../../types/model';

export function useSiblings(model: Model | null, collections: Collection[], models: Model[]) {
    const [allModelsForSiblings, setAllModelsForSiblings] = useState<Model[]>([]);

    useEffect(() => {
        if (!model || allModelsForSiblings.length > 0) return;

        // If 'models' prop is passed and populated, use it instead of fetching?
        // Original code fetched /api/models even if 'models' was passed?
        // Let's check original. It fetched if allModelsForSiblings was empty.
        // But ModelHubView receives 'models' as a prop.
        // If models prop has everything, we might not need to fetch. 
        // But 'models' prop might be filtered view?

        fetch('/api/models')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setAllModelsForSiblings(data);
            })
            .catch(err => console.warn("Failed to load models for siblings", err));
    }, [model?.id]);

    const siblings = useMemo(() => {
        if (!model || !collections.length) return [];
        const parentCollections = collections.filter(c => c.modelIds?.includes(model.id));
        if (parentCollections.length === 0) return [];

        const siblingIds = new Set<string>();
        parentCollections.forEach(c => {
            c.modelIds.forEach(id => { if (id !== model.id) siblingIds.add(id); });
        });

        // Use the fetched list if available, otherwise fall back to prop list
        const source = allModelsForSiblings.length > 0 ? allModelsForSiblings : models;
        return source.filter(m => siblingIds.has(m.id));
    }, [model, collections, models, allModelsForSiblings]);

    return { siblings };
}
