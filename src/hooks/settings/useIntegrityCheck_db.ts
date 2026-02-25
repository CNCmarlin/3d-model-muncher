import { CorruptedFile, DuplicateGroup, HashCheckResult } from "@/types/model";
import { Model_db as Model } from "@/types/model_db";
import { useEffect, useState } from 'react';

/**
 * DB-FIRST Integrity Check Hook
 * Handles: hash check (file existence + pathHash comparison), duplicate detection/removal
 * Removed: Generate JSON, Heal Library, Undo Last Heal, Regenerate (all munchie-specific)
 */

interface UseIntegrityCheckProps {
    models: Model[];
    onModelsUpdate: (models: Model[]) => void;
    setSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error') => void;
    setStatusMessage: (msg: string) => void;
}

export function useIntegrityCheck_db({
    models,
    onModelsUpdate,
    setSaveStatus,
    setStatusMessage
}: UseIntegrityCheckProps) {
    // Hash Check State
    const [selectedFileTypes, setSelectedFileTypes] = useState<{ "3mf": boolean; "stl": boolean }>({ "3mf": true, "stl": true });
    const [hashCheckResult, setHashCheckResult] = useState<HashCheckResult | null>(null);
    const [isHashChecking, setIsHashChecking] = useState(false);
    const [isRehashing, setIsRehashing] = useState(false);
    const [hashCheckProgress, setHashCheckProgress] = useState(0);
    const [corruptedModels, setCorruptedModels] = useState<Record<string, Model>>({});
    const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
    const [unhashedCount, setUnhashedCount] = useState(0);

    // Load corrupted model data from DB when hash check results change
    useEffect(() => {
        if (!hashCheckResult?.corruptedFiles) return;

        const loadCorruptedModels = async () => {
            const newModels: Record<string, Model> = {};

            for (const file of hashCheckResult.corruptedFiles) {
                // Try to find model in the already-loaded models list first
                const localMatch = (models as any[]).find((m: any) => {
                    const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
                    return norm(m.modelUrl ?? '') === norm(file.filePath) ||
                        norm(m.filePath ?? '') === norm(file.filePath);
                });

                if (localMatch) {
                    newModels[file.filePath] = localMatch;
                    continue;
                }

                // Fallback: fetch from DB API if not in local list
                try {
                    // Try to extract modelId from the corrupted file record if stored
                    const fileRecord = hashCheckResult.corruptedFiles.find(
                        (f: CorruptedFile) => f.filePath === file.filePath
                    ) as any;
                    if (fileRecord?.modelId) {
                        const resp = await fetch(`/api/models/${fileRecord.modelId}`);
                        if (resp.ok) {
                            const result = await resp.json();
                            if (result?.data) newModels[file.filePath] = result.data;
                        }
                    }
                } catch {
                    // Silently skip — UI will fall back to showing the raw path
                }
            }

            setCorruptedModels(newModels);
        };

        loadCorruptedModels();
    }, [hashCheckResult?.corruptedFiles]);

    // --- Run Hash Check ---
    const handleRunHashCheck = async (fileType?: "3mf" | "stl") => {
        const fileTypesToProcess: Array<"3mf" | "stl"> = fileType
            ? [fileType]
            : [...(selectedFileTypes["3mf"] ? ["3mf" as const] : []), ...(selectedFileTypes["stl"] ? ["stl" as const] : [])];

        if (fileTypesToProcess.length === 0) return;

        setDuplicateGroups([]);
        setHashCheckResult(null);
        setIsHashChecking(true);
        setHashCheckProgress(0);

        try {
            let allVerified = 0, allCorrupted = 0, allUnhashed = 0;
            const allCorruptedFiles: CorruptedFile[] = [];
            const allDuplicateGroups: DuplicateGroup[] = [];
            const allHashToModels: Record<string, Model[]> = {};
            const allUpdatedModels: Model[] = [];
            const usedIds = new Set<string>();

            for (const effectiveFileType of fileTypesToProcess) {
                const fileTypeText = effectiveFileType === "3mf" ? ".3mf" : ".stl";
                setStatusMessage(`Checking ${fileTypeText} files...`);

                const resp = await fetch('/api/hash-check', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fileType: effectiveFileType })
                });

                const data = await resp.json();
                if (!data.success) throw new Error(data.error || `Hash check failed for ${fileTypeText}`);

                for (const r of data.results) {
                    const fullModel = (models as any[]).find(m => {
                        if (r.modelId && m.id === r.modelId) return true;
                        if (m.name === r.baseName) return true;
                        const normUrl = (m.modelUrl ?? '').replace(/\\/g, '/').toLowerCase();
                        const file3mf = r.threeMF ? r.threeMF.replace(/\\/g, '/').toLowerCase() : null;
                        const fileStl = r.stl ? r.stl.replace(/\\/g, '/').toLowerCase() : null;
                        if (file3mf && normUrl.endsWith(file3mf)) return true;
                        if (fileStl && normUrl.endsWith(fileStl)) return true;
                        return false;
                    });

                    const filePath = r.threeMF || r.stl || r.baseName;
                    let baseId = fullModel?.id || `hash-${filePath.replace(/[^a-zA-Z0-9]/g, '-')}`;
                    let uniqueId = baseId;
                    let counter = 1;
                    while (usedIds.has(uniqueId)) {
                        uniqueId = `${baseId}-${counter}`;
                        counter++;
                    }
                    usedIds.add(uniqueId);

                    const mergedModel: any = {
                        ...(fullModel ?? {}),
                        id: uniqueId,
                        name: fullModel?.name ?? r.baseName.split(/[/\\]/).pop()?.replace(/\.(3mf|stl)$/i, '') ?? r.baseName,
                        modelUrl: r.threeMF ? `/models/${r.threeMF}` : r.stl ? `/models/${r.stl}` : '',
                        hash: r.hash,
                        ...(r.status ? { status: r.status } : {}),
                    };

                    if (r.status === 'ok') {
                        allVerified++;
                    } else if (r.status === 'no_hash') {
                        allUnhashed++;
                    } else {
                        allCorrupted++;
                        const displayPath = r.threeMF ? `/models/${r.threeMF}` : r.stl ? `/models/${r.stl}` : '';
                        allCorruptedFiles.push({
                            model: mergedModel,
                            filePath: displayPath,
                            error: r.details || 'Unknown error',
                            actualHash: r.hash || 'UNKNOWN',
                            expectedHash: r.storedHash || 'UNKNOWN'
                        } as any);
                    }

                    if (r.hash) {
                        if (!allHashToModels[r.hash]) allHashToModels[r.hash] = [];
                        allHashToModels[r.hash].push(mergedModel);
                    }
                    allUpdatedModels.push(mergedModel);
                }

                // Rough progress per file type
                setHashCheckProgress(prev => Math.min(100, prev + (100 / fileTypesToProcess.length)));
            }

            for (const hash in allHashToModels) {
                if (allHashToModels[hash].length > 1) {
                    allDuplicateGroups.push({ hash, models: allHashToModels[hash] as any, totalSize: '0' });
                }
            }

            setDuplicateGroups(allDuplicateGroups);
            setUnhashedCount(allUnhashed);
            setHashCheckResult({
                verified: allVerified,
                corrupted: allCorrupted,
                unhashed: allUnhashed,
                duplicateGroups: allDuplicateGroups,
                corruptedFiles: allCorruptedFiles,
                corruptedFileDetails: allCorruptedFiles,
                lastCheck: new Date().toISOString()
            } as any);

            onModelsUpdate(allUpdatedModels as any);
            setSaveStatus('saved');
            setStatusMessage('Hash check complete.');
        } catch (error) {
            setSaveStatus('error');
            setStatusMessage('Model scan failed');
            console.error(error);
        } finally {
            setIsHashChecking(false);
            setHashCheckProgress(0);
        }
    };

    // --- Remove Duplicates (DB-first) ---
    // Keeps one model, soft-deletes the others from the DB.
    const handleRemoveDuplicates = async (group: DuplicateGroup, keepModelId: string): Promise<boolean> => {
        const modelsToRemove = group.models.filter(model => model.id !== keepModelId);
        if (modelsToRemove.length === 0) return false;

        setSaveStatus('saving');
        setStatusMessage('Removing duplicate records from database...');

        try {
            const results = await Promise.allSettled(
                modelsToRemove.map(model =>
                    fetch(`/api/models/${model.id}`, { method: 'DELETE' })
                )
            );

            const failed = results.filter(r => r.status === 'rejected').length;
            if (failed > 0) {
                setSaveStatus('error');
                setStatusMessage(`Removed some duplicates but ${failed} failed`);
                return false;
            }

            // Update local state
            const updatedModels = (models as any[]).filter(m =>
                !modelsToRemove.some(r => r.id === m.id)
            );
            onModelsUpdate(updatedModels as Model[]);

            const updatedGroups = duplicateGroups.filter(g => g.hash !== group.hash);
            setDuplicateGroups(updatedGroups);
            setHashCheckResult(prev => prev ? { ...prev, duplicateGroups: updatedGroups } : prev);

            const removedCount = modelsToRemove.length;
            setSaveStatus('saved');
            setStatusMessage(`Removed ${removedCount} duplicate record${removedCount > 1 ? 's' : ''} from database`);
            setTimeout(() => { setSaveStatus('idle'); setStatusMessage(''); }, 3000);
            return true;
        } catch (error) {
            setSaveStatus('error');
            setStatusMessage('Failed to remove duplicates.');
            console.error('Remove duplicates error:', error);
            return false;
        }
    };

    // --- Rehash (compute + store sha256 for all primary files) ---
    const handleRehash = async () => {
        setIsRehashing(true);
        setSaveStatus('saving');
        setStatusMessage('Computing file hashes...');

        try {
            const resp = await fetch('/api/rehash', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileType: 'all' }),
            });
            const data = await resp.json();
            if (!data.success) throw new Error(data.error);

            setStatusMessage(`Rehash complete: ${data.updated} updated, ${data.skipped} unchanged, ${data.missing} missing`);
            setSaveStatus('saved');

            // Re-run hash check to refresh stats
            setTimeout(() => {
                handleRunHashCheck();
            }, 500);
        } catch (error: any) {
            setSaveStatus('error');
            setStatusMessage(error.message || 'Rehash failed');
        } finally {
            setIsRehashing(false);
        }
    };

    return {
        // State
        hashCheckResult,
        setHashCheckResult,
        isHashChecking,
        isRehashing,
        hashCheckProgress,
        corruptedModels,
        duplicateGroups,
        setDuplicateGroups,
        selectedFileTypes,
        setSelectedFileTypes,
        unhashedCount,

        // Actions
        handleRunHashCheck,
        handleRemoveDuplicates,
        handleRehash,
    };
}
