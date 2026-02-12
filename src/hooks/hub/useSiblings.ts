import { useEffect, useMemo, useState } from 'react';
import { Collection } from '../../types/collection';
import { Model } from '../../types/model';

export function useSiblings(model: Model | null, collections: Collection[], models: Model[]) {
    const [allModelsForSiblings, setAllModelsForSiblings] = useState<Model[]>([]);

    useEffect(() => {
        if (!model) return;

        fetch('/api/models')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setAllModelsForSiblings(data);
            })
            .catch(err => console.warn("Failed to load models for siblings", err));
    }, [model?.id]);

    const siblings = useMemo(() => {
        if (!model || !collections.length) {
            console.log('[useSiblings] Early return:', { hasModel: !!model, collectionsCount: collections.length });
            return [];
        }

        // DEBUG: Show collections structure
        console.log('[useSiblings] Collections array:', collections.length);
        console.log('[useSiblings] First collection sample:', collections[0]);
        console.log('[useSiblings] Looking for model.id:', model.id);

        const parentCollections = collections.filter(c => c.modelIds?.includes(model.id));
        console.log('[useSiblings] Model:', model.id, 'Parent collections:', parentCollections.length);

        if (parentCollections.length === 0) return [];

        const siblingIds = new Set<string>();
        parentCollections.forEach(c => {
            c.modelIds.forEach(id => { if (id !== model.id) siblingIds.add(id); });
        });

        console.log('[useSiblings] Sibling IDs found:', siblingIds.size);

        // Use the fetched list if available, otherwise fall back to prop list
        const source = allModelsForSiblings.length > 0 ? allModelsForSiblings : models;
        console.log('[useSiblings] Using source:', allModelsForSiblings.length > 0 ? 'fetched' : 'prop', 'count:', source.length);

        const result = source.filter(m => siblingIds.has(m.id));
        console.log('[useSiblings] Final siblings count:', result.length);
        if (result.length > 0) {
            console.log('[useSiblings] First sibling sample:', {
                id: result[0].id,
                name: result[0].name,
                thumbnail: result[0].thumbnail
            });
        }
        return result;
    }, [model, collections, models, allModelsForSiblings]);

    return { siblings };
}
