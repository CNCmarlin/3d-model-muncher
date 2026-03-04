import { Model } from '@/types/model_db';
import { useEffect, useState } from 'react';

export function useRelatedFiles_db(model: Model | null, isEditing: boolean) {
    // Track whether a related file has an associated munchie JSON we can view
    const [availableRelatedMunchie, setAvailableRelatedMunchie] = useState<Record<number, boolean>>({});

    // Probe for munchie JSON existence for related files when in view mode
    useEffect(() => {
        if (isEditing) return;
        const rel = model?.related_files || [];
        if (!Array.isArray(rel) || rel.length === 0) return;

        let cancelled = false;
        (async () => {
            const map: Record<number, boolean> = {};
            await Promise.all(rel.map(async (p: string, idx: number) => {
                try {
                    // LEGACY FILE LOOKUP (Commented out per user request)
                    /*
                    const candidate = deriveMunchieCandidate(p);
                    if (!candidate) {
                        map[idx] = false;
                        return;
                    }
                    const url = `/models/${candidate}`;
                    const resp = await fetch(url, { method: 'HEAD', cache: 'no-store' });
                    map[idx] = resp.ok;
                    */

                    // DB-FIRST COMPONENT LOOKUP
                    // Skip checking non-models (gcode, pdfs, etc)
                    const ext = p.split('.').pop()?.toLowerCase() || '';
                    if (!['stl', '3mf', 'obj', 'step'].includes(ext)) {
                        map[idx] = false;
                        return;
                    }

                    // Query the new Database API to see if this model exists based on primary file path
                    // Note: modelUrl in DB is typically prefixed with `/models/` but the UI paths might not be.
                    const searchPath = p.startsWith('/models/') ? p : `/models/${p}`;

                    const resp = await fetch(`/api/models?modelUrl=${encodeURIComponent(searchPath)}`, { cache: 'no-store' });

                    if (resp.ok) {
                        const parsed = await resp.json();
                        // Support both raw array from legacy and paginated {data: []} from new schema
                        const targetModel = Array.isArray(parsed) ? parsed[0] : parsed?.data?.[0];
                        map[idx] = !!targetModel; // True if we found a DB record
                    } else {
                        map[idx] = false;
                    }
                } catch (e) {
                    map[idx] = false;
                }
            }));
            if (!cancelled) setAvailableRelatedMunchie(map);
        })();
        return () => { cancelled = true; };
    }, [isEditing, model?.related_files]);

    return { availableRelatedMunchie };
}
