import { useConfig } from '@/context/ConfigContext';
import { CorruptedFile, DuplicateGroup, HashCheckResult, Model } from "@/types/model";
import { removeDuplicates } from "@/utils/clientUtils";
import { createStandardModelIdentity } from "@/utils/modelFactory";
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface UseIntegrityCheckProps {
    models: Model[];
    onModelsUpdate: (models: Model[]) => void;
    setSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error') => void;
    setStatusMessage: (msg: string) => void;
}

export function useIntegrityCheck({
    models,
    onModelsUpdate,
    setSaveStatus,
    setStatusMessage
}: UseIntegrityCheckProps) {
    const { updateRunTimestamp } = useConfig();
    // State
    const [selectedFileTypes, setSelectedFileTypes] = useState<{ "3mf": boolean; "stl": boolean }>({ "3mf": true, "stl": true });
    const [hashCheckResult, setHashCheckResult] = useState<HashCheckResult | null>(null);
    const [isHashChecking, setIsHashChecking] = useState(false);
    const [hashCheckProgress, setHashCheckProgress] = useState(0);
    const [corruptedModels, setCorruptedModels] = useState<Record<string, Model>>({});
    const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);

    // Healing State
    const [isHealing, setIsHealing] = useState(false);
    const [healResult, setHealResult] = useState<{
        processed: number;
        healed: number;
        errors: any[];
    } | null>(null);
    const [isPreviewingHeal, setIsPreviewingHeal] = useState(false);
    const [healPreviewReport, setHealPreviewReport] = useState<any>(null);
    const [isHealDialogOpen, setIsHealDialogOpen] = useState(false);
    const [canRevert, setCanRevert] = useState(false);
    const [isReverting, setIsReverting] = useState(false);

    // Generation State
    const [isGeneratingJson, setIsGeneratingJson] = useState(false);
    const [generateResult, setGenerateResult] = useState<{ skipped?: number; generated?: number; verified?: number; processed?: number } | null>(null);

    // Function to check if we can show the revert button
    const checkBackups = async () => {
        try {
            const res = await fetch('/api/admin/library-check-backups');
            const data = await res.json();
            setCanRevert(data.hasBackups);
        } catch (err) { console.error(err); }
    };

    // Initial check
    useEffect(() => {
        checkBackups();
    }, []);

    // Load corrupted model data when hash check results change
    useEffect(() => {
        if (!hashCheckResult?.corruptedFiles) return;

        const loadCorruptedModels = async () => {
            const newModels: Record<string, Model> = {};

            for (const file of hashCheckResult.corruptedFiles) {
                try {
                    // Extract directory and filename, removing any leading /models or models/
                    const normalizedPath = file.filePath.replace(/^[/\\]?models[/\\]/, '');
                    const pathParts = normalizedPath.split(/[/\\]/);
                    const fileName = pathParts.pop() || '';
                    const directory = pathParts.join('/');

                    // Convert .3mf to -munchie.json or .stl to -stl-munchie.json if needed
                    const lowerFileName = fileName.toLowerCase();
                    const munchieFileName = fileName.endsWith('-munchie.json') || fileName.endsWith('-stl-munchie.json')
                        ? fileName
                        : lowerFileName.endsWith('.stl')
                            ? fileName.replace(/\.stl$/i, '-stl-munchie.json')
                            : lowerFileName.endsWith('.3mf')
                                ? fileName.replace(/\.3mf$/i, '-munchie.json')
                                : null; // Skip files that aren't model files

                    if (!munchieFileName) continue;

                    const fullPath = directory
                        ? `models/${directory}/${munchieFileName}`
                        : `models/${munchieFileName}`;

                    const response = await fetch(`/api/load-model?filePath=${encodeURIComponent(fullPath)}`);
                    if (response.ok) {
                        const modelData = await response.json();
                        if (modelData && typeof modelData === 'object') {
                            newModels[file.filePath] = modelData;
                        }
                    }
                } catch (error) {
                    console.error('Failed to load model data:', error);
                }
            }

            setCorruptedModels(newModels);
        };

        loadCorruptedModels();
    }, [hashCheckResult?.corruptedFiles]);

    // Handlers
    const handleRunHashCheck = async (fileType?: "3mf" | "stl") => {
        const fileTypesToProcess: Array<"3mf" | "stl"> = fileType
            ? [fileType]
            : [...(selectedFileTypes["3mf"] ? ["3mf" as const] : []), ...(selectedFileTypes["stl"] ? ["stl" as const] : [])];

        if (fileTypesToProcess.length === 0) return;

        if (generateResult) setGenerateResult(null);
        setDuplicateGroups([]);
        setHashCheckResult(null);
        setIsHashChecking(true);
        setHashCheckProgress(0);

        try {
            let allVerified = 0;
            let allCorrupted = 0;
            const allCorruptedFiles: CorruptedFile[] = [];
            const allDuplicateGroups: DuplicateGroup[] = [];
            const allHashToModels: Record<string, Model[]> = {};
            const allUpdatedModels: Model[] = [];
            const usedIds = new Set<string>();

            for (const effectiveFileType of fileTypesToProcess) {
                const fileTypeText = effectiveFileType === "3mf" ? ".3mf" : ".stl";
                setStatusMessage(`Rescanning ${fileTypeText} files and comparing hashes...`);

                const resp = await fetch('/api/hash-check', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fileType: effectiveFileType })
                });

                const data = await resp.json();
                if (!data.success) throw new Error(data.error || `Hash check failed for ${fileTypeText}`);

                for (const r of data.results) {
                    const fullModel = models.find(m => {
                        if (m.name === r.baseName) return true;
                        const normalizedModelUrl = m.modelUrl?.replace(/\\/g, '/').toLowerCase() || '';
                        const file3mf = r.threeMF ? r.threeMF.replace(/\\/g, '/').toLowerCase() : null;
                        const fileStl = r.stl ? r.stl.replace(/\\/g, '/').toLowerCase() : null;
                        if (file3mf && normalizedModelUrl.endsWith(file3mf)) return true;
                        if (fileStl && normalizedModelUrl.endsWith(fileStl)) return true;
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

                    const mergedModel = createStandardModelIdentity({
                        ...fullModel,
                        id: uniqueId,
                        name: fullModel?.name || r.baseName.split(/[/\\]/).pop()?.replace(/\.(3mf|stl)$/i, '') || r.baseName,
                        modelUrl: r.threeMF ? `/models/${r.threeMF}` : r.stl ? `/models/${r.stl}` : '',
                        hash: r.hash,
                        ...(r.status ? { status: r.status } : {})
                    } as any);

                    if (r.status === 'ok') {
                        allVerified++;
                    } else {
                        allCorrupted++;
                        const displayPath = r.threeMF ? `/models/${r.threeMF}` : r.stl ? `/models/${r.stl}` : '';
                        allCorruptedFiles.push({
                            model: mergedModel,
                            filePath: displayPath,
                            error: r.details || 'Unknown error',
                            actualHash: r.hash || 'UNKNOWN',
                            expectedHash: r.storedHash || 'UNKNOWN'
                        });
                    }

                    if (r.hash) {
                        if (!allHashToModels[r.hash]) allHashToModels[r.hash] = [];
                        allHashToModels[r.hash].push(mergedModel);
                    }
                    allUpdatedModels.push(mergedModel);
                }
            }

            for (const hash in allHashToModels) {
                if (allHashToModels[hash].length > 1) {
                    allDuplicateGroups.push({ hash, models: allHashToModels[hash], totalSize: '0' });
                }
            }

            setDuplicateGroups(allDuplicateGroups);
            setHashCheckResult({
                verified: allVerified,
                corrupted: allCorrupted,
                duplicateGroups: allDuplicateGroups,
                corruptedFiles: allCorruptedFiles,
                corruptedFileDetails: allCorruptedFiles,
                lastCheck: new Date().toISOString()
            });

            onModelsUpdate(allUpdatedModels);
            setSaveStatus('saved');
            setStatusMessage('Hash check complete.');
            updateRunTimestamp('checkHashes');

        } catch (error) {
            setSaveStatus('error');
            setStatusMessage('Model scan failed');
            console.error(error);
        } finally {
            setIsHashChecking(false);
            setHashCheckProgress(0);
        }
    };

    const handleGenerateModelJson = async (fileType?: "3mf" | "stl") => {
        const fileTypesToProcess: Array<"3mf" | "stl"> = fileType
            ? [fileType]
            : [...(selectedFileTypes["3mf"] ? ["3mf" as const] : []), ...(selectedFileTypes["stl"] ? ["stl" as const] : [])];

        if (fileTypesToProcess.length === 0) return;

        if (hashCheckResult) setHashCheckResult(null);
        setIsGeneratingJson(true);
        setGenerateResult(null);

        try {
            let totalProcessed = 0;
            let totalSkipped = 0;
            let totalGenerated = 0;
            let totalVerified = 0;

            for (const effectiveFileType of fileTypesToProcess) {
                const fileTypeText = effectiveFileType === "3mf" ? ".3mf" : ".stl";
                setStatusMessage(`Generating JSON for all ${fileTypeText} files...`);

                const resp = await fetch('/api/models/scan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fileType: effectiveFileType })
                });

                if (!resp.ok) {
                    const errBody = await resp.text().catch(() => '');
                    throw new Error(`Scan failed for ${fileTypeText}: ${resp.status} ${errBody}`);
                }

                const data = await resp.json().catch(() => ({} as any));
                if (!data || (data.success === false)) {
                    throw new Error(data?.error || `Scan failed for ${fileTypeText}`);
                }

                totalProcessed += typeof data.processed === 'number' ? data.processed : 0;
                totalSkipped += typeof data.skipped === 'number' ? data.skipped : 0;
                totalGenerated += typeof data.generated === 'number' ? data.generated : 0;
                totalVerified += typeof data.verified === 'number' ? data.verified : 0;
            }

            setGenerateResult({
                processed: totalProcessed > 0 ? totalProcessed : undefined,
                skipped: totalSkipped > 0 ? totalSkipped : undefined,
                generated: totalGenerated > 0 ? totalGenerated : undefined,
                verified: totalVerified > 0 ? totalVerified : undefined,
            });

            setSaveStatus('saved');
            setStatusMessage('Generation complete.');
            updateRunTimestamp('generateHashes');
            setTimeout(() => { setSaveStatus('idle'); setStatusMessage(''); }, 3000);
        } catch (error) {
            setSaveStatus('error');
            setStatusMessage('Failed to generate model JSON files.');
            console.error('Model JSON generation error:', error);
        } finally {
            setIsGeneratingJson(false);
        }
    };

    // Thumbnail Strategy
    const [thumbnailStrategy, setThumbnailStrategy] = useState<'prefer-embedded' | 'prefer-generated'>('prefer-embedded');

    const handleRunHealPreview = async (strategyOverride?: 'prefer-embedded' | 'prefer-generated') => {
        const effectiveStrategy = strategyOverride || thumbnailStrategy;
        setIsPreviewingHeal(true);
        setHealPreviewReport(null);
        try {
            const response = await fetch('/api/admin/library-heal-preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ thumbnailStrategy: effectiveStrategy })
            });
            const data = await response.json();
            if (data.success) {
                setHealPreviewReport(data.previewResults);
                setIsHealDialogOpen(true);
            } else {
                toast.error(data.error || "Failed to generate preview");
            }
        } catch (error) {
            toast.error("Failed to connect to server");
        } finally {
            setIsPreviewingHeal(false);
        }
    };

    const handleConfirmHeal = async () => {
        setIsHealing(true);
        setIsHealDialogOpen(false);
        try {
            const response = await fetch('/api/admin/library-heal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dryRun: false,
                    thumbnailStrategy
                })
            });
            const data = await response.json();
            if (data.success) {
                setHealResult(data.results);
                toast.success(data.message);
                checkBackups();
                window.location.reload();
            } else {
                toast.error(data.error || "Heal operation failed");
            }
        } catch (error) {
            toast.error("Critical failure during heal execution");
        } finally {
            setIsHealing(false);
        }
    };

    // ... (rest of functions) ...
    const handleRevert = async () => {
        if (!window.confirm("Are you sure? This will restore all models to their state before the last Heal operation.")) return;

        setIsReverting(true);
        try {
            const res = await fetch('/api/admin/library-revert', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                toast.success(data.message);
                setHealResult(null);
                checkBackups();
                alert(`Reverted ${data.results.restored} models.`);
            }
        } catch (err) {
            toast.error("Revert failed.");
        } finally {
            setIsReverting(false);
        }
    };

    const handleRemoveDuplicates = async (group: DuplicateGroup, keepModelId: string): Promise<boolean> => {
        const modelsToRemove = group.models.filter(model => model.id !== keepModelId);
        const filesToDelete: string[] = [];
        modelsToRemove.forEach(model => {
            if (model.modelUrl) {
                const modelFile = model.modelUrl.replace(/^\/models\//, '');
                filesToDelete.push(modelFile);
                if (modelFile.toLowerCase().endsWith('.3mf')) {
                    const base = modelFile.replace(/\.3mf$/i, '');
                    filesToDelete.push(base + '-munchie.json');
                } else if (modelFile.toLowerCase().endsWith('.stl')) {
                    const base = modelFile.replace(/\.stl$/i, '');
                    filesToDelete.push(base + '-stl-munchie.json');
                }
            }
        });
        if (filesToDelete.length === 0) {
            setSaveStatus('error');
            setStatusMessage('No files to delete.');
            return false;
        }
        setSaveStatus('saving');
        setStatusMessage('Deleting duplicate files...');
        try {
            const resp = await fetch('/api/delete-models', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: filesToDelete })
            });
            const data = await resp.json();
            if (!data.success) {
                setSaveStatus('error');
                setStatusMessage('Failed to delete some files: ' + (data.errors?.map((e: { file: string }) => e.file).join(', ') || 'Unknown error'));
                return false;
            }
            const updatedModels = removeDuplicates(models, group, keepModelId);
            onModelsUpdate(updatedModels);
            const updatedGroups = duplicateGroups.filter(g => g.hash !== group.hash);
            setDuplicateGroups(updatedGroups);
            setHashCheckResult(prev => prev ? { ...prev, duplicateGroups: updatedGroups } : prev);
            const removedCount = group.models.length - 1;
            setSaveStatus('saved');
            setStatusMessage(`Removed ${removedCount} duplicate file${removedCount > 1 ? 's' : ''}`);
            setTimeout(() => {
                setSaveStatus('idle');
                setStatusMessage('');
            }, 3000);
            return true;
        } catch (error) {
            setSaveStatus('error');
            setStatusMessage('Failed to delete files.');
            console.error('Delete files error:', error);
            return false;
        }
    };

    const handleRegenerate = async (model: any) => {
        if (!model) {
            toast.error('Cannot regenerate: missing model information');
            return;
        }

        const hasId = typeof model.id === 'string' && model.id.trim().length > 0;
        const hasFilePath = typeof model.filePath === 'string' && model.filePath.trim().length > 0;

        if (!hasId && !hasFilePath) {
            toast.error('Cannot regenerate: missing model id or filePath');
            return;
        }

        try {
            setSaveStatus('saving');
            setStatusMessage('Regenerating munchie.json...');

            const body: any = {};
            if (hasId) body.modelIds = [model.id];
            else {
                let rel = model.filePath.replace(/^\/?models\//, '').replace(/\\/g, '/');
                body.filePaths = [rel];
            }

            const resp = await fetch('/api/regenerate-munchie-files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await resp.json().catch(() => ({} as any));

            if (!resp.ok || data.success === false) {
                const errMsg = data && data.error ? data.error : (Array.isArray(data.errors) ? data.errors.map((e: any) => e.error || JSON.stringify(e)).join('; ') : 'Regeneration failed');
                throw new Error(errMsg);
            }

            if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
                const msgs = data.errors.map((e: any) => e.error || JSON.stringify(e)).join('; ');
                toast.error(`Regeneration completed with errors: ${msgs}`);
            } else {
                toast.success('Regenerated munchie data');
            }

            const firstSelectedType = selectedFileTypes["3mf"] ? "3mf" : "stl";
            handleRunHashCheck(firstSelectedType);
        } catch (e: any) {
            console.error('Regenerate error:', e);
            toast.error(e?.message || 'Failed to regenerate munchie file');
        } finally {
            setSaveStatus('idle');
            setStatusMessage('');
        }
    };

    return {
        // State
        hashCheckResult,
        setHashCheckResult,
        isHashChecking,
        hashCheckProgress,
        corruptedModels,
        duplicateGroups,
        setDuplicateGroups,
        isHealing,
        healResult,
        isPreviewingHeal,
        healPreviewReport,
        isHealDialogOpen,
        setIsHealDialogOpen,
        canRevert,
        isReverting,
        isGeneratingJson,
        generateResult,
        setGenerateResult,
        thumbnailStrategy,
        setThumbnailStrategy,

        // Actions
        handleRunHashCheck,
        handleGenerateModelJson,
        handleRunHealPreview,
        handleConfirmHeal,
        handleRevert,
        handleRemoveDuplicates,
        handleRegenerate,
        checkBackups,
        selectedFileTypes,
        setSelectedFileTypes
    };
}
