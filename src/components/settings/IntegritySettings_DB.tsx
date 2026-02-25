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
import { AlertTriangle, Box, ChevronDown, FileCheck, Files, FolderSync, Ghost, HardDrive, Hash, Link2, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';

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
    unhashedCount,
    models,
    onModelClick,
}: IntegritySettingsProps) {
    const [openDuplicateGroupHash, setOpenDuplicateGroupHash] = useState<string | null>(null);

    // ── Library Resync State (self-contained) ──
    type ResyncResult = {
        stats: { totalDiskFiles: number; totalDbFiles: number; totalModels: number; orphanCount: number; ghostCount: number; modelGhostCount: number };
        orphans: { path: string; size: number; ext: string; sizeFormatted: string }[];
        ghosts: { id: string; modelId: string; filePath: string; filename: string }[];
        modelGhosts: { id: string; name: string; filePath: string }[];
    };
    const [resyncResult, setResyncResult] = useState<ResyncResult | null>(null);
    const [isResyncing, setIsResyncing] = useState(false);
    const [resyncError, setResyncError] = useState<string | null>(null);
    const [expandedSection, setExpandedSection] = useState<string | null>(null);
    const [isPurging, setIsPurging] = useState(false);

    const handleResync = useCallback(async () => {
        setIsResyncing(true);
        setResyncError(null);
        setResyncResult(null);
        try {
            const resp = await fetch('/api/admin/library-resync', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
            const data = await resp.json();
            if (!data.success) throw new Error(data.error || 'Resync failed');
            setResyncResult(data);
        } catch (err: any) {
            setResyncError(err.message || 'Unknown error');
        } finally {
            setIsResyncing(false);
        }
    }, []);

    const handlePurgeGhosts = useCallback(async () => {
        if (!resyncResult?.ghosts.length) return;
        setIsPurging(true);
        try {
            const ids = resyncResult.ghosts.map(g => g.id);
            const resp = await fetch('/api/admin/resync-purge-ghosts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids }),
            });
            const data = await resp.json();
            if (!data.success) throw new Error(data.error);
            // Re-run scan to refresh results
            await handleResync();
        } catch (err: any) {
            setResyncError(err.message || 'Purge failed');
        } finally {
            setIsPurging(false);
        }
    }, [resyncResult, handleResync]);

    const handlePurgeModelGhosts = useCallback(async () => {
        if (!resyncResult?.modelGhosts.length) return;
        setIsPurging(true);
        try {
            const ids = resyncResult.modelGhosts.map(m => m.id);
            const resp = await fetch('/api/admin/resync-purge-model-ghosts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids }),
            });
            const data = await resp.json();
            if (!data.success) throw new Error(data.error);
            // Re-run scan to refresh results
            await handleResync();
        } catch (err: any) {
            setResyncError(err.message || 'Purge failed');
        } finally {
            setIsPurging(false);
        }
    }, [resyncResult, handleResync]);

    const handleLinkOrphans = useCallback(async () => {
        if (!resyncResult?.orphans.length) return;
        setIsPurging(true);
        try {
            const paths = resyncResult.orphans.map(o => o.path);
            const resp = await fetch('/api/admin/resync-link-orphans', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paths }),
            });
            const data = await resp.json();
            if (!data.success) throw new Error(data.error);
            // Re-run scan to refresh results (linked files won't show as orphans anymore)
            await handleResync();
        } catch (err: any) {
            setResyncError(err.message || 'Link failed');
        } finally {
            setIsPurging(false);
        }
    }, [resyncResult, handleResync]);

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
                        </div>
                    </div>

                    <Button
                        onClick={() => handleRunHashCheck()}
                        disabled={isHashChecking || (!selectedFileTypes["3mf"] && !selectedFileTypes["stl"])}
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
                        <div className="space-y-2">
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
                                                        Choose which file to keep. All other copies will be removed from the database.
                                                        <strong className="text-destructive block mt-1">This action cannot be undone.</strong>
                                                    </DialogDescription>
                                                </DialogHeader>
                                                <ScrollArea className="max-h-[50vh]">
                                                    <div className="space-y-2 p-1">
                                                        {group.models.map((model: Model) => (
                                                            <div
                                                                key={`dup-dialog-${group.hash}-${model.id}`}
                                                                className="flex items-center justify-between p-2 bg-muted rounded-md gap-2"
                                                            >
                                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                    <ModelThumbnail model={model} name={model.name} />
                                                                    <span className="text-sm truncate">{getDisplayPath_db(model as any)}</span>
                                                                </div>
                                                                <Button
                                                                    variant="destructive"
                                                                    size="sm"
                                                                    className="shrink-0"
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

                {/* ═══════ SECTION 2: Library Resync ═══════ */}
                <Separator />

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium flex items-center gap-2">
                            <FolderSync className="h-4 w-4" />
                            DB ↔ Filesystem Resync
                        </h3>
                        <Button onClick={handleResync} disabled={isResyncing || isPurging} variant="outline" size="sm" className="gap-2">
                            {isResyncing
                                ? <RefreshCw className="h-4 w-4 animate-spin" />
                                : <FolderSync className="h-4 w-4" />
                            }
                            {isResyncing ? 'Scanning…' : 'Run Resync Scan'}
                        </Button>
                    </div>

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
                            {resyncResult.stats.orphanCount === 0 && resyncResult.stats.ghostCount === 0 && resyncResult.stats.modelGhostCount === 0 && (
                                <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
                                    <ShieldCheck className="h-8 w-8 text-green-500 opacity-60" />
                                    <p className="text-sm">Database and filesystem are in sync.</p>
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
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="outline" size="sm" disabled={isPurging} className="gap-1.5 shrink-0">
                                                            <Link2 className="h-3.5 w-3.5" />
                                                            Link All ({resyncResult.orphans.length})
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Link {resyncResult.orphans.length} orphaned files?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This will match each orphaned file to the model in its directory and add it as a Related File.
                                                                Files in directories without a matching model will be skipped.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={handleLinkOrphans}>
                                                                Link to Related Files
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
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
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="destructive" size="sm" disabled={isPurging} className="gap-1.5 shrink-0">
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                            Purge All ({resyncResult.ghosts.length})
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Purge {resyncResult.ghosts.length} ghost file records?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This will permanently delete {resyncResult.ghosts.length} ModelFile database records
                                                                that point to files no longer on disk. The models themselves will not be deleted.
                                                                <strong className="text-destructive block mt-1">This action cannot be undone.</strong>
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={handlePurgeGhosts} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                                Purge Ghost Records
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
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
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="destructive" size="sm" disabled={isPurging} className="gap-1.5 shrink-0">
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                            Purge All ({resyncResult.modelGhosts.length})
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Purge {resyncResult.modelGhosts.length} ghost models?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This will permanently delete {resyncResult.modelGhosts.length} Model records and all
                                                                associated data (tags, images, related files). Only models whose filePath points to
                                                                a missing file will be deleted.
                                                                <strong className="text-destructive block mt-1">This action cannot be undone.</strong>
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={handlePurgeModelGhosts} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                                Purge Ghost Models
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
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
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
