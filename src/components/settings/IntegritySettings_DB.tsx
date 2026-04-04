/**
 * IntegritySettings_DB — DB-first version
 * Shows: File hash check (verifies physical files exist & match DB records) + duplicate detection/removal
 * Removed: Generate munchie JSON, Heal Library, Revert (all munchie-specific, no DB equivalent)
 */
import { ImageWithFallback_DB } from '@/components/common/ImageWithFallback_DB';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useIntegrityCheck_db } from '@/hooks/settings/useIntegrityCheck_db';
import { Model } from '@/types/model_db';
import { getDisplayPath_db } from '@/utils/clientUtils_db';
import { resolveModelThumbnail } from "@/utils/thumbnailUtils_db";
import { AlertTriangle, Box, Check, ChevronDown, Cpu, FileCheck, Files, FolderSync, Ghost, HardDrive, Hash, HeartPulse, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

type IntegritySettingsProps = ReturnType<typeof useIntegrityCheck_db> & {
    models: Model[];
    onModelClick?: (model: Model) => void;
};

const ModelThumbnail = ({ name, model }: { name: string; model?: any }) => {
    const src = model ? resolveModelThumbnail(model) : '';
    if (src) {
        return (
            <ImageWithFallback_DB
                src={src}
                alt={name}
                className="w-8 h-8 object-cover rounded border"
            />
        );
    }
    return (
        <div className="w-8 h-8 flex items-center justify-center bg-muted rounded border">
            <Box className="h-4 w-4 text-muted-foreground" />
        </div>
    );
};

export function IntegritySettings_DB({
    hashCheckResult,
    isHashChecking,
    isRehashing,
    hashCheckProgress,
    corruptedModels,
    handleRunHashCheck,
    handleRemoveDuplicates,
    handleRehash,
    selectedFileTypes,
    setSelectedFileTypes,
    models,
    onModelClick,
}: IntegritySettingsProps) {
    const [openDuplicateGroupHash, setOpenDuplicateGroupHash] = useState<string | null>(null);

    // ── Library Resync State (self-contained) ──
    type ResyncResult = {
        stats: { totalDiskFiles: number; totalDbFiles: number; totalModels: number; orphanCount: number; sourceOrphanCount: number; ghostCount: number; modelGhostCount: number };
        orphans: { path: string; size: number; ext: string; sizeFormatted: string }[];
        sourceOrphans: { path: string; size: number; ext: string; sizeFormatted: string }[];
        ghosts: { id: string; modelId: string; filePath: string; filename: string }[];
        modelGhosts: { id: string; name: string; filePath: string }[];
    };
    type HealDetail = { model: string; additions: string[]; deletions: string[]; modifications: string[] };
    type HealReport = {
        dryRun: boolean;
        embedded: { processed: number; extracted: number; alreadyDone: number; noEmbed: number; errors: { model?: string; error: string }[] };
        gallery: { processed: number; added: number; errors: { model?: string; error: string }[] };
        stale: { processed: number; removed: number; errors: { imageId?: string; error: string }[] };
        details: HealDetail[];
    };
    const [healReport, setHealReport] = useState<HealReport | null>(null);
    const [isHealDialogOpen, setIsHealDialogOpen] = useState(false);

    const healTotalChanges = healReport
        ? healReport.embedded.extracted + healReport.gallery.added + healReport.stale.removed
        : 0;

    // ── Library Resync State (self-contained) ──
    const CACHE_KEY = 'resync_scan_cache';
    const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

    const [resyncResult, setResyncResult] = useState<ResyncResult | null>(null);
    const [isResyncing, setIsResyncing] = useState(false);
    const [resyncError, setResyncError] = useState<string | null>(null);
    const [expandedSection, setExpandedSection] = useState<string | null>(null);
    const [lastScannedAt, setLastScannedAt] = useState<Date | null>(null);

    // ── Load cached scan result on mount ──
    useEffect(() => {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return;
            const cached = JSON.parse(raw) as {
                timestamp: string;
                resyncResult: ResyncResult;
                healReport: HealReport | null;
            };
            const age = Date.now() - new Date(cached.timestamp).getTime();
            if (age > CACHE_MAX_AGE_MS) {
                localStorage.removeItem(CACHE_KEY);
                return;
            }
            setResyncResult(cached.resyncResult);
            setHealReport(cached.healReport);
            setLastScannedAt(new Date(cached.timestamp));
        } catch {
            // Ignore corrupt cache
            localStorage.removeItem(CACHE_KEY);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Batch Apply State
    const [includeOrphans, setIncludeOrphans] = useState(true);
    const [includeSourceOrphans, setIncludeSourceOrphans] = useState(true);
    const [includeGhosts, setIncludeGhosts] = useState(true);
    const [includeModelGhosts, setIncludeModelGhosts] = useState(false); // Default to false for safety
    const [includeHeal, setIncludeHeal] = useState(true);
    const [isBatchApplying, setIsBatchApplying] = useState(false);

    const handleBatchApply = useCallback(async () => {
        setIsBatchApplying(true);
        try {
            const payload = {
                purgeGhostIds: includeGhosts ? (resyncResult?.ghosts.map(g => g.id) || []) : [],
                purgeModelGhostIds: includeModelGhosts ? (resyncResult?.modelGhosts.map(m => m.id) || []) : [],
                linkOrphanPaths: includeOrphans ? (resyncResult?.orphans.map(o => o.path) || []) : [],
                linkSourceOrphanPaths: includeSourceOrphans ? (resyncResult?.sourceOrphans.map(o => o.path) || []) : [],
                applyHeal: includeHeal && healTotalChanges > 0
            };

            const resp = await fetch('/api/admin/resync-apply-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await resp.json();
            if (!data.success) throw new Error(data.error || 'Batch apply failed');

            // Re-run the scan to get fresh numbers
            await handleResync();
        } catch (err: any) {
            setResyncError(err.message || 'Batch apply failed');
        } finally {
            setIsBatchApplying(false);
        }
    }, [resyncResult, includeOrphans, includeSourceOrphans, includeGhosts, includeModelGhosts, includeHeal, healTotalChanges]);

    const handleResync = useCallback(async () => {
        setIsResyncing(true);
        setResyncError(null);
        setResyncResult(null);
        setHealReport(null);
        setLastScannedAt(null);
        // Clear stale cache before a fresh scan
        localStorage.removeItem(CACHE_KEY);
        try {
            // Step 1: Filesystem resync
            const resp = await fetch('/api/admin/library-resync', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
            const data = await resp.json();
            if (!data.success) throw new Error(data.error || 'Resync failed');
            setResyncResult(data);

            // Step 2: DB heal (dry-run preview)
            let healData: { success: boolean; report?: HealReport } | null = null;
            try {
                const healResp = await fetch('/api/admin/db-heal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dryRun: true }),
                });
                healData = await healResp.json();
                if (healData?.success && healData.report) setHealReport(healData.report);
            } catch {
                // Non-fatal — resync result is still valid
            }

            // ── Persist to localStorage so results survive page refresh ──
            const scannedAt = new Date();
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    timestamp: scannedAt.toISOString(),
                    resyncResult: data,
                    healReport: healData?.success ? healData.report ?? null : null,
                }));
            } catch {
                // localStorage may be full — non-fatal
            }
            setLastScannedAt(scannedAt);
        } catch (err: any) {
            setResyncError(err.message || 'Unknown error');
        } finally {
            setIsResyncing(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toggleSection = (key: string) => setExpandedSection(prev => prev === key ? null : key);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5" />
                    Library Health
                </CardTitle>
                <CardDescription>
                    Verify file integrity, detect duplicates, and cross-reference the database against the filesystem.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

                {/* ═══════ SECTION 1: Hash Check + Duplicates ═══════ */}
                <div className="space-y-3">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                        <FileCheck className="h-4 w-4" />
                        File Integrity Check
                    </h3>
                    <div>
                        <Label className="text-sm font-medium">File Types to Check</Label>
                        <div className="flex gap-4 mt-2">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="file-type-3mf"
                                    checked={selectedFileTypes["3mf"]}
                                    onCheckedChange={(checked) =>
                                        setSelectedFileTypes(prev => ({ ...prev, "3mf": Boolean(checked) }))
                                    }
                                />
                                <Label htmlFor="file-type-3mf" className="cursor-pointer">3MF</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="file-type-stl"
                                    checked={selectedFileTypes["stl"]}
                                    onCheckedChange={(checked) =>
                                        setSelectedFileTypes(prev => ({ ...prev, "stl": Boolean(checked) }))
                                    }
                                />
                                <Label htmlFor="file-type-stl" className="cursor-pointer">STL</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="file-type-obj"
                                    checked={(selectedFileTypes as any)["obj"] ?? false}
                                    onCheckedChange={(checked) =>
                                        setSelectedFileTypes(prev => ({ ...prev, "obj": Boolean(checked) }))
                                    }
                                />
                                <Label htmlFor="file-type-obj" className="cursor-pointer">OBJ</Label>
                            </div>
                        </div>
                    </div>

                    <Button
                        onClick={() => handleRunHashCheck()}
                        disabled={isHashChecking || (!selectedFileTypes["3mf"] && !selectedFileTypes["stl"] && !(selectedFileTypes as any)["obj"])}
                        variant="outline"
                        className="gap-2"
                    >
                        {isHashChecking
                            ? <RefreshCw className="h-4 w-4 animate-spin" />
                            : <FileCheck className="h-4 w-4" />
                        }
                        {isHashChecking ? 'Checking…' : 'Run Hash Check'}
                    </Button>
                </div>

                {/* Progress bar */}
                {isHashChecking && (
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span>Progress</span>
                            <span>{Math.round(hashCheckProgress)}%</span>
                        </div>
                        <Progress value={hashCheckProgress} className="w-full" />
                    </div>
                )}

                {/* Summary stats */}
                {hashCheckResult && (
                    <div className="flex flex-wrap gap-4 items-center">
                        <div className="flex items-center gap-2">
                            <FileCheck className="h-4 w-4 text-green-600" />
                            <span className="text-sm">{hashCheckResult.verified} verified</span>
                        </div>
                        {(hashCheckResult as any).unhashed > 0 && (
                            <div className="flex items-center gap-2">
                                <Hash className="h-4 w-4 text-amber-500" />
                                <span className="text-sm text-amber-600">{(hashCheckResult as any).unhashed} unhashed</span>
                            </div>
                        )}
                        {hashCheckResult.corrupted > 0 && (
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-red-600" />
                                <span className="text-sm text-red-600">{hashCheckResult.corrupted} issues</span>
                            </div>
                        )}
                        {hashCheckResult.duplicateGroups?.length > 0 && (
                            <div className="flex items-center gap-2">
                                <Files className="h-4 w-4 text-blue-600" />
                                <span className="text-sm">{hashCheckResult.duplicateGroups.length} duplicate groups</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Rehash button — shown when unhashed files exist */}
                {hashCheckResult && ((hashCheckResult as any).unhashed > 0 || hashCheckResult.corrupted > 0) && (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={isRehashing}
                                className="gap-2"
                            >
                                {isRehashing
                                    ? <RefreshCw className="h-4 w-4 animate-spin" />
                                    : <Hash className="h-4 w-4" />
                                }
                                {isRehashing ? 'Rehashing…' : `Rehash All (${((hashCheckResult as any).unhashed || 0) + hashCheckResult.corrupted})`}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Compute / update file hashes?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will read every primary model file from disk, compute its SHA-256 hash, and store it in the database.
                                    Files with mismatched hashes will be updated to match the current file on disk.
                                    <strong className="block mt-1">This may take a few minutes for large libraries.</strong>
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleRehash}>
                                    Rehash All Files
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}

                {/* Missing / mismatched files */}
                {hashCheckResult?.corruptedFiles && hashCheckResult.corruptedFiles.length > 0 && (
                    <div className="space-y-4">
                        <h3 className="font-medium text-red-600">Files Requiring Attention</h3>
                        <div className="space-y-2">
                            {hashCheckResult.corruptedFiles.map((file, idx) => {
                                const modelData = corruptedModels[file.filePath];
                                const fallbackModel = models.find(m => {
                                    const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
                                    return norm(m.modelUrl ?? '') === norm(file.filePath) ||
                                        norm(m.modelUrl ?? '') === `/models/${norm(file.filePath)}`;
                                });
                                const model = modelData || fallbackModel;
                                return (
                                    <Alert key={`corrupt-${idx}`} variant="destructive">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertTitle className="truncate">
                                            {model ? getDisplayPath_db(model as any) : file.filePath.replace(/^[/\\]?models[/\\]?/, '')}
                                        </AlertTitle>
                                        <AlertDescription>
                                            {file.error || (file.actualHash && file.expectedHash && file.actualHash !== file.expectedHash
                                                ? 'Hash mismatch — file may have changed on disk. Update the DB record to resolve.'
                                                : 'File missing or unreadable')}
                                        </AlertDescription>
                                    </Alert>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Duplicate groups */}
                {hashCheckResult?.duplicateGroups && hashCheckResult.duplicateGroups.length > 0 && (
                    <div className="space-y-4">
                        <h3 className="font-medium">Duplicate Files</h3>
                        <p className="text-sm text-muted-foreground">
                            These files have identical content hashes. Keep one and delete the rest.
                        </p>
                        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                            {hashCheckResult.duplicateGroups.map((group: any, idx: number) => (
                                <div
                                    key={`dup-${idx}`}
                                    className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800"
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2 gap-2">
                                        <span className="text-sm text-blue-600 dark:text-blue-400">
                                            {group.models.length} copies · {group.totalSize}
                                        </span>
                                        <Dialog
                                            open={openDuplicateGroupHash === group.hash}
                                            onOpenChange={(open: boolean) => setOpenDuplicateGroupHash(open ? group.hash : null)}
                                        >
                                            <DialogTrigger asChild>
                                                <Button variant="outline" size="sm" className="gap-2">
                                                    <Trash2 className="h-4 w-4" />
                                                    Remove Duplicates
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="w-full max-w-2xl">
                                                <DialogHeader>
                                                    <DialogTitle>Remove Duplicate Files</DialogTitle>
                                                    <DialogDescription>
                                                        Click <strong>Keep This</strong> next to the file you want to keep. All other copies will be removed from the database.
                                                        <strong className="text-destructive block mt-1">This action cannot be undone.</strong>
                                                    </DialogDescription>
                                                </DialogHeader>
                                                <ScrollArea className="max-h-[50vh]">
                                                    <div className="space-y-2 p-1">
                                                        {group.models.map((model: Model) => (
                                                            <div
                                                                key={`dup-dialog-${group.hash}-${model.id}`}
                                                                className="flex items-center gap-2 p-2 bg-muted rounded-md"
                                                            >
                                                                <ModelThumbnail model={model} name={model.name} />
                                                                <span
                                                                    className="text-sm flex-1 min-w-0 break-all"
                                                                    title={getDisplayPath_db(model as any)}
                                                                >
                                                                    {getDisplayPath_db(model as any)}
                                                                </span>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="shrink-0 border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                                                                    onClick={async () => {
                                                                        const success = await handleRemoveDuplicates(group, model.id);
                                                                        if (success) setOpenDuplicateGroupHash(null);
                                                                    }}
                                                                >
                                                                    Keep This
                                                                </Button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ScrollArea>
                                                <DialogFooter>
                                                    <Button variant="ghost" onClick={() => setOpenDuplicateGroupHash(null)}>
                                                        Cancel
                                                    </Button>
                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                    </div>

                                    {/* Quick list of paths */}
                                    <div className="space-y-1">
                                        {group.models.map((model: Model) => (
                                            <div
                                                key={`dup-list-${group.hash}-${model.id}`}
                                                className="flex items-center justify-between"
                                            >
                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                    <ModelThumbnail model={model} name={model.name} />
                                                    <span className="text-sm truncate">{getDisplayPath_db(model as any)}</span>
                                                </div>
                                                <Button variant="ghost" size="sm" onClick={() => onModelClick?.(model)}>
                                                    View
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty state after a clean hash check */}
                {hashCheckResult &&
                    (!hashCheckResult.corruptedFiles || hashCheckResult.corruptedFiles.length === 0) &&
                    (!hashCheckResult.duplicateGroups || hashCheckResult.duplicateGroups.length === 0) && (
                        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
                            <ShieldCheck className="h-8 w-8 text-green-500 opacity-60" />
                            <p className="text-sm">All files verified. No issues found.</p>
                        </div>
                    )
                }

                {/* ═══════ SECTION 2: Library Resync & Heal ═══════ */}
                <Separator />

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium flex items-center gap-2">
                            <FolderSync className="h-4 w-4" />
                            DB ↔ Filesystem Resync
                        </h3>
                        <Button onClick={handleResync} disabled={isResyncing || isBatchApplying} variant="outline" size="sm" className="gap-2">
                            {isResyncing
                                ? <RefreshCw className="h-4 w-4 animate-spin" />
                                : <FolderSync className="h-4 w-4" />
                            }
                            {isResyncing ? 'Scanning…' : 'Run Resync Scan'}
                        </Button>
                    </div>
                    {lastScannedAt && !isResyncing && (
                        <p className="text-xs text-muted-foreground">
                            Last scanned: {lastScannedAt.toLocaleDateString()} at {lastScannedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {' · '}
                            <button
                                onClick={() => {
                                    localStorage.removeItem(CACHE_KEY);
                                    setResyncResult(null);
                                    setHealReport(null);
                                    setLastScannedAt(null);
                                }}
                                className="underline underline-offset-2 hover:text-foreground transition-colors"
                            >
                                Clear
                            </button>
                        </p>
                    )}

                    {resyncError && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{resyncError}</AlertDescription>
                        </Alert>
                    )}

                    {resyncResult && (
                        <>
                            {/* Stats badges */}
                            <div className="flex flex-wrap gap-3">
                                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-sm">
                                    <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span>{resyncResult.stats.totalDiskFiles} files on disk</span>
                                </div>
                                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-sm">
                                    <Box className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span>{resyncResult.stats.totalDbFiles} DB file records</span>
                                </div>
                                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-sm">
                                    <Files className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span>{resyncResult.stats.totalModels} models</span>
                                </div>
                            </div>

                            {/* All clean */}
                            {resyncResult.stats.orphanCount === 0 && resyncResult.stats.sourceOrphanCount === 0 && resyncResult.stats.ghostCount === 0 && resyncResult.stats.modelGhostCount === 0 && healTotalChanges === 0 && (
                                <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
                                    <ShieldCheck className="h-8 w-8 text-green-500 opacity-60" />
                                    <p className="text-sm">Database and filesystem are in sync. No healing needed.</p>
                                </div>
                            )}

                            {/* ── Library Heal Available ── */}
                            {healTotalChanges > 0 && healReport && (
                                <div className="rounded-lg border overflow-hidden mt-2 bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <HeartPulse className="h-4 w-4 text-green-600 dark:text-green-500" />
                                                <span className="font-medium text-sm text-green-800 dark:text-green-400">Gallery & Thumbnails Repair Available</span>
                                            </div>
                                            <div className="text-xs text-muted-foreground flex items-center gap-3">
                                                {healReport.embedded.extracted > 0 && <span>• {healReport.embedded.extracted} thumbnails</span>}
                                                {healReport.gallery.added > 0 && <span>• {healReport.gallery.added} untracked images</span>}
                                                {healReport.stale.removed > 0 && <span>• {healReport.stale.removed} stale links</span>}
                                            </div>
                                        </div>
                                        <Dialog open={isHealDialogOpen} onOpenChange={setIsHealDialogOpen}>
                                            <DialogTrigger asChild>
                                                <Button size="sm" variant="outline" className="gap-2 border-green-200 hover:bg-green-100 dark:border-green-800 dark:hover:bg-green-900">
                                                    <HeartPulse className="h-3.5 w-3.5" />
                                                    Review & Apply
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0 overflow-hidden">
                                                <div className="p-6 pb-0">
                                                    <DialogHeader>
                                                        <DialogTitle className="flex items-center gap-2">
                                                            <HeartPulse className="h-5 w-5 text-primary" />
                                                            Gallery & Thumbnails Repair Preview
                                                        </DialogTitle>
                                                        <DialogDescription>
                                                            {healTotalChanges} change{healTotalChanges !== 1 ? 's' : ''} proposed. Review before applying.
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                </div>
                                                <div className="flex-1 min-h-0 px-6 my-4">
                                                    <div className="h-full border rounded-md bg-muted/20 overflow-hidden">
                                                        <ScrollArea className="h-full w-full">
                                                            <div className="p-4 space-y-4">
                                                                {healReport.details.map((item: HealDetail, idx: number) => (
                                                                    <div key={idx} className="space-y-1 pb-3 border-b last:border-0 border-border/50">
                                                                        <h4 className="font-semibold text-sm flex items-center gap-2">
                                                                            <Box className="h-3.5 w-3.5 text-primary/70" />
                                                                            {item.model}
                                                                        </h4>
                                                                        <div className="ml-5 space-y-1">
                                                                            {item.additions.map((add: string, i: number) => (
                                                                                <div key={i} className="text-xs flex items-start gap-2 text-green-600">
                                                                                    <Plus className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                                                                    <span>{add}</span>
                                                                                </div>
                                                                            ))}
                                                                            {item.deletions.map((del: string, i: number) => (
                                                                                <div key={i} className="text-xs flex items-start gap-2 text-destructive">
                                                                                    <Trash2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                                                                    <span>{del}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </ScrollArea>
                                                    </div>
                                                </div>
                                                <div className="p-6 pt-0">
                                                    <DialogFooter className="flex flex-col sm:flex-row items-center gap-3">
                                                        <Button variant="ghost" onClick={() => setIsHealDialogOpen(false)} className="flex-1 sm:flex-none">
                                                            Cancel
                                                        </Button>
                                                        <Button
                                                            onClick={() => {
                                                                setIncludeHeal(true);
                                                                handleBatchApply();
                                                            }}
                                                            disabled={isBatchApplying}
                                                            className="gap-2 flex-1 sm:flex-none"
                                                        >
                                                            <Check className="h-4 w-4" />
                                                            Apply {healTotalChanges} Change{healTotalChanges !== 1 ? 's' : ''}
                                                        </Button>
                                                    </DialogFooter>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                </div>
                            )}

                            {/* ── Orphaned Files ── */}
                            {resyncResult.orphans.length > 0 && (
                                <div className="rounded-lg border overflow-hidden">
                                    <button
                                        onClick={() => toggleSection('orphans')}
                                        className="flex items-center justify-between w-full p-4 hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <HardDrive className="h-4 w-4 text-amber-500 shrink-0" />
                                            <span className="font-medium text-sm shrink-0">Orphaned Files</span>
                                            <span className="text-xs text-muted-foreground truncate">({resyncResult.orphans.length} on disk, no DB record)</span>
                                        </div>
                                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${expandedSection === 'orphans' ? 'rotate-180' : ''}`} />
                                    </button>
                                    {expandedSection === 'orphans' && (
                                        <div className="border-t">
                                            <div className="flex items-center justify-between px-4 pt-3 pb-2">
                                                <p className="text-xs text-muted-foreground">
                                                    These files exist on disk but have no database record. They may be non-primary model formats (.step, .obj, .gcode) or manually added files.
                                                </p>
                                            </div>
                                            <div className="h-[300px]">
                                                <ScrollArea className="h-full">
                                                    <div className="px-4 pb-4 space-y-1">
                                                        {resyncResult.orphans.map((f, i) => (
                                                            <div key={`orphan-${i}`} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/30 text-sm overflow-hidden">
                                                                <span className="truncate flex-1 min-w-0 font-mono text-xs text-foreground/70">{f.path}</span>
                                                                <span className="text-xs text-muted-foreground shrink-0">{f.sizeFormatted}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ScrollArea>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Source File Orphans ── */}
                            {resyncResult.sourceOrphans.length > 0 && (
                                <div className="rounded-lg border overflow-hidden mt-4">
                                    <button
                                        onClick={() => toggleSection('sourceOrphans')}
                                        className="flex items-center justify-between w-full p-4 hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Cpu className="h-4 w-4 text-purple-500 shrink-0" />
                                            <span className="font-medium text-sm shrink-0">Source File Orphans</span>
                                            <span className="text-xs text-muted-foreground truncate">({resyncResult.sourceOrphans.length} CAD/project files)</span>
                                        </div>
                                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${expandedSection === 'sourceOrphans' ? 'rotate-180' : ''}`} />
                                    </button>
                                    {expandedSection === 'sourceOrphans' && (
                                        <div className="border-t">
                                            <div className="flex items-center justify-between px-4 pt-3 pb-2">
                                                <p className="text-xs text-muted-foreground">
                                                    These are CAD or project files (.f3d, .step, .blend) found on disk. Link them to add them to the Source Files tab.
                                                </p>
                                            </div>
                                            <div className="h-[300px]">
                                                <ScrollArea className="h-full">
                                                    <div className="px-4 pb-4 space-y-1">
                                                        {resyncResult.sourceOrphans.map((f, i) => (
                                                            <div key={`source-orphan-${i}`} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/30 text-sm overflow-hidden">
                                                                <span className="truncate flex-1 min-w-0 font-mono text-xs text-foreground/70">{f.path}</span>
                                                                <span className="text-xs text-muted-foreground shrink-0">{f.sizeFormatted}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ScrollArea>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Ghost File Records ── */}
                            {resyncResult.ghosts.length > 0 && (
                                <div className="rounded-lg border overflow-hidden">
                                    <button
                                        onClick={() => toggleSection('ghosts')}
                                        className="flex items-center justify-between w-full p-4 hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Ghost className="h-4 w-4 text-red-500 shrink-0" />
                                            <span className="font-medium text-sm shrink-0">Ghost File Records</span>
                                            <span className="text-xs text-muted-foreground truncate">({resyncResult.ghosts.length} DB records, no file on disk)</span>
                                        </div>
                                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${expandedSection === 'ghosts' ? 'rotate-180' : ''}`} />
                                    </button>
                                    {expandedSection === 'ghosts' && (
                                        <div className="border-t">
                                            <div className="flex items-center justify-between px-4 pt-3 pb-2">
                                                <p className="text-xs text-muted-foreground">
                                                    These ModelFile records point to files that no longer exist on disk.
                                                </p>
                                            </div>
                                            <div className="h-[300px]">
                                                <ScrollArea className="h-full">
                                                    <div className="px-4 pb-4 space-y-1">
                                                        {resyncResult.ghosts.map((g, i) => (
                                                            <div key={`ghost-${i}`} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/30 text-sm overflow-hidden">
                                                                <span className="truncate flex-1 min-w-0 font-mono text-xs text-foreground/70">{g.filePath}</span>
                                                                <span className="text-xs text-muted-foreground shrink-0">{g.filename}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ScrollArea>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Model Path Ghosts ── */}
                            {resyncResult.modelGhosts.length > 0 && (
                                <div className="rounded-lg border overflow-hidden">
                                    <button
                                        onClick={() => toggleSection('modelGhosts')}
                                        className="flex items-center justify-between w-full p-4 hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
                                            <span className="font-medium text-sm shrink-0">Model Path Ghosts</span>
                                            <span className="text-xs text-muted-foreground truncate">({resyncResult.modelGhosts.length} models → missing files)</span>
                                        </div>
                                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${expandedSection === 'modelGhosts' ? 'rotate-180' : ''}`} />
                                    </button>
                                    {expandedSection === 'modelGhosts' && (
                                        <div className="border-t">
                                            <div className="flex items-center justify-between px-4 pt-3 pb-2">
                                                <p className="text-xs text-muted-foreground">
                                                    These Model records have a filePath pointing to a non-existent file.
                                                </p>
                                            </div>
                                            <div className="h-[300px]">
                                                <ScrollArea className="h-full">
                                                    <div className="px-4 pb-4 space-y-1">
                                                        {resyncResult.modelGhosts.map((m, i) => (
                                                            <div key={`mg-${i}`} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/30 text-sm overflow-hidden">
                                                                <Box className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                                <span className="font-medium truncate min-w-0 text-xs">{m.name}</span>
                                                                <span className="text-xs text-muted-foreground font-mono truncate shrink-0 max-w-[180px]" title={m.filePath}>{m.filePath}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ScrollArea>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Batch Apply Bottom Bar ── */}
                            {(resyncResult.orphans.length > 0 || resyncResult.sourceOrphans.length > 0 || resyncResult.ghosts.length > 0 || resyncResult.modelGhosts.length > 0) && (
                                <div className="mt-6 p-5 border rounded-lg bg-muted/40 shadow-sm flex flex-col gap-5">
                                    <div>
                                        <h4 className="font-medium flex items-center gap-2">
                                            <FolderSync className="h-4 w-4 text-primary" />
                                            Apply Selected Resolutions
                                        </h4>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            Select which groups of issues you want to resolve. Missing paths will be purged, and unlinked files will be tracked.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {resyncResult.orphans.length > 0 && (
                                            <div className="flex items-center space-x-2 bg-background p-3 rounded-md border">
                                                <Checkbox
                                                    id="include-orphans"
                                                    checked={includeOrphans}
                                                    onCheckedChange={(checked) => setIncludeOrphans(Boolean(checked))}
                                                />
                                                <Label htmlFor="include-orphans" className="text-sm cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis">
                                                    Link {resyncResult.orphans.length} Orphan Files
                                                </Label>
                                            </div>
                                        )}
                                        {resyncResult.sourceOrphans.length > 0 && (
                                            <div className="flex items-center space-x-2 bg-background p-3 rounded-md border">
                                                <Checkbox
                                                    id="include-source"
                                                    checked={includeSourceOrphans}
                                                    onCheckedChange={(checked) => setIncludeSourceOrphans(Boolean(checked))}
                                                />
                                                <Label htmlFor="include-source" className="text-sm cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis">
                                                    Link {resyncResult.sourceOrphans.length} Source Files
                                                </Label>
                                            </div>
                                        )}
                                        {resyncResult.ghosts.length > 0 && (
                                            <div className="flex items-center space-x-2 bg-background p-3 rounded-md border">
                                                <Checkbox
                                                    id="include-ghosts"
                                                    checked={includeGhosts}
                                                    onCheckedChange={(checked) => setIncludeGhosts(Boolean(checked))}
                                                />
                                                <Label htmlFor="include-ghosts" className="text-sm cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis">
                                                    Purge {resyncResult.ghosts.length} File Ghosts
                                                </Label>
                                            </div>
                                        )}
                                        {resyncResult.modelGhosts.length > 0 && (
                                            <div className="flex items-center space-x-2 bg-red-50 dark:bg-red-950/30 p-3 rounded-md border border-red-200 dark:border-red-900/50">
                                                <Checkbox
                                                    id="include-model-ghosts"
                                                    checked={includeModelGhosts}
                                                    onCheckedChange={(checked) => setIncludeModelGhosts(Boolean(checked))}
                                                />
                                                <Label htmlFor="include-model-ghosts" className="text-sm cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis font-medium text-red-700 dark:text-red-400">
                                                    Purge {resyncResult.modelGhosts.length} Model Ghosts
                                                </Label>
                                            </div>
                                        )}
                                        {healTotalChanges > 0 && (
                                            <div className="flex items-center space-x-2 bg-green-50 dark:bg-green-950/30 p-3 rounded-md border border-green-200 dark:border-green-900/50">
                                                <Checkbox
                                                    id="include-heal"
                                                    checked={includeHeal}
                                                    onCheckedChange={(checked) => setIncludeHeal(Boolean(checked))}
                                                />
                                                <Label htmlFor="include-heal" className="text-sm cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis text-green-700 dark:text-green-400">
                                                    Gallery & Thumbnails Repair ({healTotalChanges})
                                                </Label>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-end pt-2 border-t mt-2">
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button
                                                    size="lg"
                                                    disabled={isBatchApplying || isResyncing || (!includeOrphans && !includeSourceOrphans && !includeGhosts && !includeModelGhosts && !includeHeal)}
                                                    className="w-full sm:w-auto font-semibold shadow-sm"
                                                >
                                                    {isBatchApplying ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                                                    {isBatchApplying ? 'Applying Selected Fixes...' : 'Apply Selected Fixes'}
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Apply Selected Fixes?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This will execute the selected actions simultaneously:
                                                        <ul className="list-disc pl-5 mt-2 space-y-1 mb-2">
                                                            {includeOrphans && resyncResult.orphans.length > 0 && <li>Link {resyncResult.orphans.length} Orphaned Files</li>}
                                                            {includeSourceOrphans && resyncResult.sourceOrphans.length > 0 && <li>Link {resyncResult.sourceOrphans.length} Source Files</li>}
                                                            {includeGhosts && resyncResult.ghosts.length > 0 && <li>Purge {resyncResult.ghosts.length} Ghost File Records</li>}
                                                            {includeModelGhosts && resyncResult.modelGhosts.length > 0 && <li className="text-destructive font-medium">Purge {resyncResult.modelGhosts.length} Model Path Ghosts</li>}
                                                            {includeHeal && healTotalChanges > 0 && <li>Apply {healTotalChanges} Gallery & Thumbnail repairs</li>}
                                                        </ul>
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={handleBatchApply} className="bg-primary text-primary-foreground hover:bg-primary/90">
                                                        Apply Fixes
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
