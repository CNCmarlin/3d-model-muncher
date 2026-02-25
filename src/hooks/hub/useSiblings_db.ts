import { Collection } from '@/types/collection_db';
import { Model } from '@/types/model_db';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

export function useSiblings_db(model: Model | null, collections: Collection[], models: Model[]) {
    // DB-first: fetch all models via React Query (not raw fetch) to leverage caching
    const { data: allModelsForSiblings = [] } = useQuery<Model[]>({
        queryKey: ['models', {}],
        queryFn: async () => {
            const res = await fetch('/api/models');
            const data = await res.json();
            return Array.isArray(data) ? data : (data.models ?? []);
        },
        enabled: !!model,
        staleTime: 60 * 1000, // 1 minute
    });

    const siblings = useMemo(() => {
        if (!model || !collections.length) return [];

        const parentCollections = collections.filter(c => c.modelIds?.includes(model.id));
        if (parentCollections.length === 0) return [];

        const siblingIds = new Set<string>();
        parentCollections.forEach(c => {
            c.modelIds.forEach(id => { if (id !== model.id) siblingIds.add(id); });
        });

        const source = allModelsForSiblings.length > 0 ? allModelsForSiblings : models;
        return source.filter(m => siblingIds.has(m.id));
    }, [model, collections, models, allModelsForSiblings]);

    return { siblings };
}
