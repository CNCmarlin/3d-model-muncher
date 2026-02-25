import { Model } from '@/types/model_db';
import { useEffect, useState } from 'react';

export function useRelatedFiles_db(model: Model | null, isEditing: boolean) {
    // Track whether a related file has an associated munchie JSON we can view
    const [availableRelatedMunchie, setAvailableRelatedMunchie] = useState<Record<number, boolean>>({});

    // Helper to derive the munchie json path for a related file path
    const deriveMunchieCandidate = (raw: string) => {
        let candidate = raw || '';
        try {
            // G-code files (.gcode and .gcode.3mf) don't have munchie JSON files
            if (candidate.endsWith('.gcode') || candidate.endsWith('.gcode.3mf')) {
                return null;
            }

            if (candidate.endsWith('.3mf')) {
                candidate = candidate.replace(/\.3mf$/i, '-munchie.json');
            } else if (/\.stl$/i.test(candidate)) {
                candidate = candidate.replace(/\.stl$/i, '-stl-munchie.json');
            } else {
                // For any other file type, don't try to find a munchie file
                return null;
            }
            // strip leading /models/ if present
            if (candidate.startsWith('/models/')) candidate = candidate.replace(/^\/models\//, '');
            if (candidate.startsWith('models/')) candidate = candidate.replace(/^models\//, '');
        } catch (e) {
            // ignore and return as-is
            return null;
        }
        return candidate;
    };

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
                    const candidate = deriveMunchieCandidate(p);
                    // If no munchie candidate (e.g., .gcode files), mark as unavailable
                    if (!candidate) {
                        map[idx] = false;
                        return;
                    }
                    const url = `/models/${candidate}`;
                    // Try a HEAD first to minimize payload; fall back to GET if not allowed
                    const resp = await fetch(url, { method: 'HEAD', cache: 'no-store' });
                    map[idx] = resp.ok;
                } catch (e) {
                    try {
                        // Fallback to GET check
                        const candidate = deriveMunchieCandidate(p);
                        if (!candidate) {
                            map[idx] = false;
                            return;
                        }
                        const resp2 = await fetch(`/models/${candidate}`, { method: 'GET', cache: 'no-store' });
                        map[idx] = resp2.ok;
                    } catch (e2) {
                        map[idx] = false;
                    }
                }
            }));
            if (!cancelled) setAvailableRelatedMunchie(map);
        })();
        return () => { cancelled = true; };
    }, [isEditing, model?.related_files]);

    return { availableRelatedMunchie, deriveMunchieCandidate };
}
