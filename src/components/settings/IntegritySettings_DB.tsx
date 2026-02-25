/**
 * IntegritySettings_DB — DB-first version
 * Shows: File hash check (verifies physical files exist & match DB records) + duplicate detection/removal
 * Removed: Generate munchie JSON, Heal Library, Revert (all munchie-specific, no DB equivalent)
 */
import { ImageWithFallback_DB } from '@/components/common/ImageWithFallback_DB';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { AlertTriangle, Box, ChevronDown, FileCheck, Files, FolderSync, Ghost, HardDrive, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
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
    hashCheckProgress,
    corruptedModels,
    handleRunHashCheck,
    handleRemoveDuplicates,
    selectedFileTypes,
    setSelectedFileTypes,
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

    const toggleSection = (key: string) => setExpandedSection(prev => prev === key ? null : key);

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5" />
                        File Integrity Check
                    </CardTitle>
                    <CardDescription>
                        Verify that physical model files exist on disk and detect duplicate files by content hash.
                        All metadata is managed by the database — no munchie files are written.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">

                    {/* File type selectors + Run Check button */}
                    <div className="space-y-3">
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
                            className="gap-2"
                        >
                            {isHashChecking
                                ? <RefreshCw className="h-4 w-4 animate-spin" />
                                : <FileCheck className="h-4 w-4" />
                            }
                            {isHashChecking ? 'Checking…' : 'Run Check'}
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
                        <div className="flex flex-wrap gap-4">
                            <div className="flex items-center gap-2">
                                <FileCheck className="h-4 w-4 text-green-600" />
                                <span className="text-sm">{hashCheckResult.verified} verified</span>
                            </div>
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

                    {/* Missing / mismatched files */}
                    {hashCheckResult?.corruptedFiles && hashCheckResult.corruptedFiles.length > 0 && (
                        <div className="space-y-4">
                            <Separator />
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
                            <Separator />
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

                    {/* Empty state after a clean check */}
                    {hashCheckResult &&
                        (!hashCheckResult.corruptedFiles || hashCheckResult.corruptedFiles.length === 0) &&
                        (!hashCheckResult.duplicateGroups || hashCheckResult.duplicateGroups.length === 0) && (
                            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-3">
                                <ShieldCheck className="h-10 w-10 text-green-500 opacity-60" />
                                <p className="text-sm">All files verified. No issues found.</p>
                            </div>
                        )
                    }
                </CardContent>
            </Card>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/*  LIBRARY RESYNC — DB ↔ Filesystem Cross-Reference             */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FolderSync className="h-5 w-5" />
                        Library Resync
                    </CardTitle>
                    <CardDescription>
                        Compare the Prisma database against the physical filesystem. Detects orphaned files
                        (on disk but missing from DB), ghost records (in DB but missing on disk), and model path mismatches.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <Button onClick={handleResync} disabled={isResyncing} className="gap-2">
                        {isResyncing
                            ? <RefreshCw className="h-4 w-4 animate-spin" />
                            : <FolderSync className="h-4 w-4" />
                        }
                        {isResyncing ? 'Scanning…' : 'Run Resync Scan'}
                    </Button>

                    {resyncError && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Scan Failed</AlertTitle>
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
                                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-3">
                                    <ShieldCheck className="h-10 w-10 text-green-500 opacity-60" />
                                    <p className="text-sm">Database and filesystem are in sync. No issues found.</p>
                                </div>
                            )}

                            {/* Orphaned Files */}
                            {resyncResult.orphans.length > 0 && (
                                <div className="rounded-lg border">
                                    <button
                                        onClick={() => toggleSection('orphans')}
                                        className="flex items-center justify-between w-full p-4 hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <HardDrive className="h-4 w-4 text-amber-500" />
                                            <span className="font-medium text-sm">Orphaned Files</span>
                                            <span className="text-xs text-muted-foreground">({resyncResult.orphans.length} files on disk with no DB record)</span>
                                        </div>
                                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedSection === 'orphans' ? 'rotate-180' : ''}`} />
                                    </button>
                                    {expandedSection === 'orphans' && (
                                        <ScrollArea className="max-h-[300px]">
                                            <div className="px-4 pb-4 space-y-1">
                                                {resyncResult.orphans.map((f, i) => (
                                                    <div key={`orphan-${i}`} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/30 text-sm font-mono">
                                                        <span className="truncate flex-1 text-foreground/70">{f.path}</span>
                                                        <span className="text-xs text-muted-foreground ml-2 shrink-0">{f.sizeFormatted}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                    )}
                                </div>
                            )}

                            {/* Ghost Records */}
                            {resyncResult.ghosts.length > 0 && (
                                <div className="rounded-lg border">
                                    <button
                                        onClick={() => toggleSection('ghosts')}
                                        className="flex items-center justify-between w-full p-4 hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Ghost className="h-4 w-4 text-red-500" />
                                            <span className="font-medium text-sm">Ghost File Records</span>
                                            <span className="text-xs text-muted-foreground">({resyncResult.ghosts.length} DB records with no file on disk)</span>
                                        </div>
                                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedSection === 'ghosts' ? 'rotate-180' : ''}`} />
                                    </button>
                                    {expandedSection === 'ghosts' && (
                                        <ScrollArea className="max-h-[300px]">
                                            <div className="px-4 pb-4 space-y-1">
                                                {resyncResult.ghosts.map((g, i) => (
                                                    <div key={`ghost-${i}`} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/30 text-sm">
                                                        <span className="truncate flex-1 font-mono text-foreground/70">{g.filePath}</span>
                                                        <span className="text-xs text-muted-foreground ml-2 shrink-0">{g.filename}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                    )}
                                </div>
                            )}

                            {/* Model Path Ghosts */}
                            {resyncResult.modelGhosts.length > 0 && (
                                <div className="rounded-lg border">
                                    <button
                                        onClick={() => toggleSection('modelGhosts')}
                                        className="flex items-center justify-between w-full p-4 hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <AlertTriangle className="h-4 w-4 text-orange-500" />
                                            <span className="font-medium text-sm">Model Path Ghosts</span>
                                            <span className="text-xs text-muted-foreground">({resyncResult.modelGhosts.length} models pointing to missing files)</span>
                                        </div>
                                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedSection === 'modelGhosts' ? 'rotate-180' : ''}`} />
                                    </button>
                                    {expandedSection === 'modelGhosts' && (
                                        <ScrollArea className="max-h-[300px]">
                                            <div className="px-4 pb-4 space-y-1">
                                                {resyncResult.modelGhosts.map((m, i) => (
                                                    <div key={`mg-${i}`} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/30 text-sm">
                                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                                            <Box className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                            <span className="font-medium truncate">{m.name}</span>
                                                        </div>
                                                        <span className="text-xs text-muted-foreground ml-2 font-mono truncate max-w-[200px]">{m.filePath}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
