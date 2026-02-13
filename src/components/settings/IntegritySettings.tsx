import { useConfig } from '@/context/ConfigContext';
import { useIntegrityCheck } from '@/hooks/settings/useIntegrityCheck';
import { Model } from '@/types/model';
import { getDisplayPath } from '@/utils/clientUtils';
import { resolveModelThumbnail } from '@/utils/thumbnailUtils';
import { Activity, AlertTriangle, BarChart3, Box, Check, Clock, FileCheck, Files, FolderPlus, HeartPulse, Plus, RefreshCw, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ImageWithFallback } from '@/components/ImageWithFallback';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from "@/components/ui/separator";

type IntegritySettingsProps = ReturnType<typeof useIntegrityCheck> & {
    models: Model[];
    onModelClick?: (model: Model) => void;
};

// Local component for thumbnails
const ModelThumbnail = ({ thumbnail, name, model }: { thumbnail?: string | null; name: string; model?: any }) => {
    const src = model ? resolveModelThumbnail(model) : (thumbnail || '');

    if (src) {
        return (
            <ImageWithFallback
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
    )
};

export function IntegritySettings({
    hashCheckResult,
    isHashChecking,
    hashCheckProgress,
    corruptedModels,
    // duplicateGroups, // unused
    // setDuplicateGroups, // unused
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
    // setGenerateResult, // unused
    thumbnailStrategy,
    setThumbnailStrategy,
    handleRunHashCheck,
    handleGenerateModelJson,
    handleRunHealPreview,
    handleConfirmHeal,
    handleRevert,
    handleRemoveDuplicates,
    handleRegenerate,
    // checkBackups, // unused
    selectedFileTypes,
    setSelectedFileTypes,
    models,
    onModelClick
}: IntegritySettingsProps) {
    const [openDuplicateGroupHash, setOpenDuplicateGroupHash] = useState<string | null>(null);
    const { appConfig } = useConfig();
    const useDatabaseBackend = appConfig?.settings?.useDatabaseBackend ?? false;

    return (
        <Card>
            <CardHeader>
                <CardTitle>File Integrity Check</CardTitle>
                <CardDescription>
                    Verify model files and manage metadata
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex flex-col items-start gap-4">
                    <div className="flex-1 space-y-4">
                        <div>
                            <h3 className="font-medium">File Verification</h3>
                            <p className="text-sm text-muted-foreground">
                                Check for duplicates and verify model metadata
                            </p>
                            <div className="mt-2">
                                <Label className="text-sm font-medium">File Types</Label>
                                <div className="flex gap-4 mt-2">
                                    <div className="flex items-center space-x-2">
                                        <Checkbox
                                            id="file-type-3mf"
                                            checked={selectedFileTypes["3mf"]}
                                            onCheckedChange={(checked) => setSelectedFileTypes(prev => ({ ...prev, "3mf": Boolean(checked) }))}
                                        />
                                        <Label htmlFor="file-type-3mf" className="cursor-pointer">3MF</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Checkbox
                                            id="file-type-stl"
                                            checked={selectedFileTypes["stl"]}
                                            onCheckedChange={(checked) => setSelectedFileTypes(prev => ({ ...prev, "stl": Boolean(checked) }))}
                                        />
                                        <Label htmlFor="file-type-stl" className="cursor-pointer">STL</Label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Database Mode Warning */}
                        {useDatabaseBackend && (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Heal Function Disabled</AlertTitle>
                                <AlertDescription>
                                    The legacy heal function is disabled in database mode to prevent data corruption.
                                    All data integrity is managed through the database backend.
                                </AlertDescription>
                            </Alert>
                        )}

                        <div className="flex flex-wrap gap-2">
                            <Button
                                onClick={() => handleRunHashCheck()}
                                disabled={isHashChecking || isHealing || (!selectedFileTypes["3mf"] && !selectedFileTypes["stl"])}
                                className="gap-2"
                            >
                                {isHashChecking ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
                                {isHashChecking ? 'Checking...' : 'Run Check'}
                            </Button>

                            <Button
                                onClick={() => handleGenerateModelJson()}
                                disabled={isGeneratingJson || isHealing || (!selectedFileTypes["3mf"] && !selectedFileTypes["stl"])}
                                className="gap-2"
                                variant="secondary"
                            >
                                {isGeneratingJson ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Files className="h-4 w-4" />}
                                {isGeneratingJson ? 'Generating...' : 'Generate'}
                            </Button>

                            <Button
                                onClick={() => handleRunHealPreview()}
                                disabled={useDatabaseBackend || isHealing || isPreviewingHeal || isHashChecking || isReverting}
                                className="gap-2"
                                variant="outline"
                            >
                                {isPreviewingHeal ? <RefreshCw className="h-4 w-4 animate-spin" /> : <HeartPulse className="h-4 w-4" />}
                                {isPreviewingHeal ? 'Analyzing...' : 'Heal Library'}
                            </Button>

                            {/* --- CONDITIONAL REVERT BUTTON --- */}
                            {canRevert && (
                                <Button
                                    onClick={handleRevert}
                                    disabled={isHealing || isPreviewingHeal || isReverting}
                                    className="gap-2 text-orange-600 border-orange-200 hover:bg-orange-50"
                                    variant="outline"
                                    title="Restore from .bak files"
                                >
                                    {isReverting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                                    {isReverting ? 'Reverting...' : 'Undo Last Heal'}
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* --- HEAL RESULTS DISPLAY --- */}
                    {healResult && (
                        <div className="flex flex-wrap gap-4 mt-3 w-full border-t pt-4">
                            <div className="flex items-center gap-2">
                                <Activity className="h-4 w-4 text-blue-600" />
                                <span className="text-sm">{healResult.processed} models scanned</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <HeartPulse className="h-4 w-4 text-green-600" />
                                <span className="text-sm font-bold text-green-600">{healResult.healed} issues repaired</span>
                            </div>
                            {healResult.errors.length > 0 && (
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4 text-red-600" />
                                    <span className="text-sm text-red-600">{healResult.errors.length} errors encountered</span>
                                </div>
                            )}
                        </div>
                    )}

                    {(hashCheckResult || generateResult) && (
                        <div className="flex flex-wrap gap-4 mt-3 w-full">
                            {hashCheckResult && (
                                <>
                                    <div key="verified-count" className="flex items-center gap-2">
                                        <FileCheck className="h-4 w-4 text-green-600" />
                                        <span className="text-sm">{hashCheckResult.verified} verified</span>
                                    </div>
                                    {hashCheckResult.corrupted > 0 && (
                                        <div key="corrupted-count" className="flex items-center gap-2">
                                            <AlertTriangle className="h-4 w-4 text-red-600" />
                                            <span className="text-sm">{hashCheckResult.corrupted} issues</span>
                                        </div>
                                    )}
                                    {hashCheckResult.duplicateGroups.length > 0 && (
                                        <div key="duplicates-count" className="flex items-center gap-2">
                                            <Files className="h-4 w-4 text-blue-600" />
                                            <span className="text-sm">{hashCheckResult.duplicateGroups.length} duplicates</span>
                                        </div>
                                    )}
                                    {(hashCheckResult.skipped || 0) > 0 && (
                                        <div key="skipped-count" className="flex items-center gap-2">
                                            <Clock className="h-4 w-4 text-gray-600" />
                                            <span className="text-sm">{hashCheckResult.skipped} skipped</span>
                                        </div>
                                    )}
                                </>
                            )}
                            {generateResult && (() => {
                                // Compute once
                                const processedNum = typeof generateResult.processed === 'number'
                                    ? generateResult.processed
                                    : (generateResult.generated || 0) + (generateResult.verified || 0);
                                const skippedNum = generateResult.skipped || 0;
                                const totalSeen = processedNum + skippedNum;

                                // Prefer explicit `generated`; otherwise treat `processed` as generated for display
                                const hasExplicitGenerated = typeof generateResult.generated === 'number';
                                const showAsGenerated = hasExplicitGenerated || (typeof generateResult.generated === 'undefined' && processedNum > 0);

                                // Show separate 'generated' only when it differs from processed
                                const showGeneratedSeparate = hasExplicitGenerated && (generateResult.generated !== processedNum);

                                return (
                                    <>
                                        {totalSeen > 0 && (
                                            <div key="gen-total-status" className="flex items-center gap-2">
                                                <BarChart3 className="h-4 w-4 text-primary" />
                                                <span className="text-sm">{totalSeen} total</span>
                                            </div>
                                        )}

                                        {processedNum > 0 && (
                                            <div key="gen-processed-status" className="flex items-center gap-2">
                                                <FileCheck className={`h-4 w-4 ${showAsGenerated ? 'text-green-600' : 'text-blue-600'}`} />
                                                <span className="text-sm">{processedNum} {showAsGenerated ? 'generated' : 'processed'}</span>
                                            </div>
                                        )}

                                        {(skippedNum > 0) && (
                                            <div key="gen-skipped-count" className="flex items-center gap-2">
                                                <Clock className="h-4 w-4 text-gray-600" />
                                                <span className="text-sm">{skippedNum} skipped</span>
                                            </div>
                                        )}

                                        {showGeneratedSeparate && (
                                            <div key="gen-generated-count" className="flex items-center gap-2">
                                                <Activity className="h-4 w-4 text-green-600" />
                                                <span className="text-sm text-green-600">{generateResult.generated || 0} generated</span>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </div>

                {isHashChecking && (
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span>Progress</span>
                            <span>{Math.round(hashCheckProgress)}%</span>
                        </div>
                        <Progress value={hashCheckProgress} className="w-full" />
                    </div>
                )}

                {hashCheckResult && hashCheckResult.corruptedFiles && hashCheckResult.corruptedFiles.length > 0 && (
                    <div className="space-y-4">
                        <Separator />
                        <div>
                            <h3 className="font-medium mb-2 text-red-600">Files Requiring Attention</h3>
                            <div className="space-y-2">
                                {hashCheckResult.corruptedFiles.map((file, idx) => {
                                    const modelData = corruptedModels[file.filePath];
                                    // Better fallback logic - try multiple ways to find the model
                                    const fallbackModel = models.find(m => {
                                        // Try exact match first (normalize slashes and case for comparison)
                                        const normalizedFileP = file.filePath.replace(/\\/g, '/').toLowerCase();
                                        const normalizedModelUrl = m.modelUrl?.replace(/\\/g, '/').toLowerCase();
                                        if (normalizedModelUrl === normalizedFileP) return true;
                                        // Try with /models/ prefix
                                        if (normalizedModelUrl === `/models/${normalizedFileP}`) return true;
                                        // Try without /models/ prefix from file path
                                        const withoutModelsPrefix = normalizedFileP.replace(/^[/\\]?models[/\\]?/, '');
                                        if (normalizedModelUrl === withoutModelsPrefix || normalizedModelUrl === `/models/${withoutModelsPrefix}`) return true;
                                        return false;
                                    });

                                    const model = modelData || fallbackModel;

                                    return (
                                        <div key={`corrupt-${idx}-${file.filePath.replace(/[^a-zA-Z0-9]/g, '-')}`}
                                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium text-red-900 dark:text-red-100 truncate">
                                                    {model ? getDisplayPath(model) : file.filePath.replace(/^[/\\]?models[/\\]?/, '')}
                                                </p>
                                                <p className="text-sm text-red-600 dark:text-red-400">
                                                    {file.error || (file.actualHash && file.expectedHash && file.actualHash !== file.expectedHash
                                                        ? 'Hash mismatch: model file may have been updated and saved. Regenerate munchie.json to update metadata.'
                                                        : 'Missing metadata or hash mismatch')}
                                                </p>
                                            </div>
                                            {file.actualHash && file.expectedHash && file.expectedHash !== 'UNKNOWN' && file.actualHash !== file.expectedHash && (
                                                <div className="mt-3 sm:mt-0 ml-0 sm:ml-4 shrink-0">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleRegenerate(model || { id: `regen-${(file.filePath || 'unknown').replace(/[^a-zA-Z0-9]/g, '-')}`, filePath: file.filePath } as any)}
                                                    >
                                                        Regenerate
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {hashCheckResult && hashCheckResult.duplicateGroups && hashCheckResult.duplicateGroups.length > 0 && (
                    <div className="space-y-4">
                        <Separator />
                        <div>
                            <h3 className="font-medium mb-2">Duplicate Files</h3>
                            <div className="space-y-2">
                                {hashCheckResult.duplicateGroups.map((group: any, idx: number) => (
                                    <div
                                        key={`dup-${idx}`}
                                        className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800"
                                    >
                                        <div key={`header-${group.hash}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2 gap-2">
                                            <span className="text-sm text-blue-600 dark:text-blue-400">
                                                {group.models.length} copies - {group.totalSize} total
                                            </span>
                                            <Dialog open={openDuplicateGroupHash === group.hash} onOpenChange={(open: boolean) => setOpenDuplicateGroupHash(open ? group.hash : null)}>
                                                <DialogTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="gap-2"
                                                        onClick={() => setOpenDuplicateGroupHash(group.hash)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                        Remove Duplicates
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent className="w-full max-w-[72rem]">
                                                    <DialogHeader>
                                                        <DialogTitle>Remove Duplicate Files</DialogTitle>
                                                        <DialogDescription>
                                                            Choose which file to keep. All other copies will be deleted. <br /><strong className="text-destructive">This action cannot be undone.</strong>
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                    {/* Wrap list in an overflow-x-auto container so very long paths don't push the buttons out of view */}
                                                    <div className="space-y-2 min-w-0">
                                                        <ScrollArea className="w-full max-h-[60vh]">
                                                            <div className="w-max min-w-full">
                                                                {group.models.map((model: Model) => (
                                                                    <div key={`dup-dialog-${group.hash}-${model.id}-${model.name}`} className="flex items-center justify-between p-2 bg-muted rounded-md gap-2 mb-2">
                                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                            <ModelThumbnail model={model} name={model.name} />
                                                                            <div className="ml-2 text-sm pr-4 min-w-0 w-full">
                                                                                <div className="overflow-x-auto whitespace-nowrap">
                                                                                    <span className="select-all">{getDisplayPath(model)}</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex-shrink-0 ml-4">
                                                                            <Button
                                                                                variant="destructive"
                                                                                size="sm"
                                                                                onClick={async () => {
                                                                                    const success = await handleRemoveDuplicates(group, model.id);
                                                                                    if (success) {
                                                                                        // Close the dialog for this group
                                                                                        setOpenDuplicateGroupHash(null);
                                                                                    }
                                                                                }}
                                                                            >
                                                                                Keep This
                                                                            </Button>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </ScrollArea>
                                                    </div>
                                                </DialogContent>
                                            </Dialog>
                                        </div>
                                        <div key={`models-${group.hash}`} className="space-y-2">
                                            {group.models.map((model: Model) => (
                                                <div key={`dup-list-${group.hash}-${model.id}-${model.name}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        <ModelThumbnail model={model} name={model.name} />
                                                        <span className="text-sm truncate">{getDisplayPath(model)}</span>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onModelClick?.(model)}
                                                    >
                                                        View
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>

            {/* --- HEAL PREVIEW REPORT DIALOG --- */}
            <Dialog open={isHealDialogOpen} onOpenChange={setIsHealDialogOpen}>
                <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0 overflow-hidden">
                    <div className="p-6 pb-0">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <ShieldCheck className="h-5 w-5 text-primary" />
                                Library Heal Preview
                            </DialogTitle>
                            <DialogDescription>
                                The following changes are proposed based on strict naming rules and physical folder structure.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex items-center justify-between p-3 mt-4 bg-muted/40 rounded-lg border">
                            <div className="space-y-1">
                                <h4 className="text-sm font-medium">Thumbnail Strategy</h4>
                                <p className="text-xs text-muted-foreground">
                                    Preferred thumbnail when both Embedded and Generated exist.
                                </p>
                            </div>
                            <Select
                                value={thumbnailStrategy}
                                onValueChange={(val: 'prefer-embedded' | 'prefer-generated') => {
                                    setThumbnailStrategy(val);
                                    handleRunHealPreview(val);
                                }}
                            >
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Select strategy" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="prefer-embedded">Prefer Embedded</SelectItem>
                                    <SelectItem value="prefer-generated">Prefer Generated</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 px-6 my-4">
                        <div className="h-full border rounded-md bg-muted/20 overflow-hidden">
                            <ScrollArea className="h-full w-full">
                                <div className="p-4 space-y-6">
                                    {healPreviewReport?.details?.map((item: any, idx: number) => (
                                        <div key={idx} className="space-y-2 pb-4 border-b last:border-0 border-border/50">
                                            <h4 className="font-semibold text-sm flex items-center gap-2 sticky top-0 bg-transparent backdrop-blur-sm py-1">
                                                <Box className="h-3.5 w-3.5 text-primary/70" />
                                                {item.model}
                                            </h4>

                                            {item.originalFilePath && (
                                                <div className="ml-5 text-xs text-muted-foreground mb-2 flex items-center gap-2">
                                                    <span className="font-medium shrink-0">Current Path:</span>
                                                    <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] break-all font-mono">
                                                        {item.originalFilePath}
                                                    </code>
                                                </div>
                                            )}

                                            <div className="ml-5 space-y-1.5">
                                                {item.collectionSync && (
                                                    <div className="text-xs flex items-start gap-2 text-blue-600 font-medium bg-blue-500/10 p-1.5 rounded border border-blue-500/20">
                                                        <FolderPlus className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                                        <span>Sync: {item.collectionSync}</span>
                                                    </div>
                                                )}

                                                {item.additions.map((add: string, i: number) => (
                                                    <div key={i} className="text-xs flex items-start gap-2 text-green-600">
                                                        <Plus className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                                        <span>Link match: <code className="bg-green-500/10 px-1 rounded">{add}</code></span>
                                                    </div>
                                                ))}

                                                {item.deletions.map((del: string, i: number) => (
                                                    <div key={i} className="text-xs flex items-start gap-2 text-destructive font-medium">
                                                        <Trash2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                                        <span>Unlink pollution: <code className="bg-destructive/10 px-1 rounded">{del}</code></span>
                                                    </div>
                                                ))}

                                                {item.modifications?.map((mod: string, i: number) => (
                                                    <div key={i} className="text-xs flex items-start gap-2 text-amber-600 font-medium">
                                                        <RotateCcw className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                                        <span><code className="bg-amber-500/10 px-1 rounded">{mod}</code></span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}

                                    {(!healPreviewReport?.details || healPreviewReport.details.length === 0) && (
                                        <div className="text-center py-20 text-muted-foreground italic flex flex-col items-center gap-2">
                                            <ShieldCheck className="h-8 w-8 opacity-20" />
                                            No issues detected. Your library is healthy!
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </div>
                    </div>

                    <div className="p-6 pt-0">
                        <DialogFooter className="flex flex-col sm:flex-row items-center gap-3">
                            <div className="flex-1 text-xs text-muted-foreground italic text-center sm:text-left">
                                {(healPreviewReport?.details?.reduce((acc: number, item: any) => acc + (item.additions?.length || 0) + (item.deletions?.length || 0), 0) || 0)} modifications proposed across {healPreviewReport?.processed || 0} items.
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto">
                                <Button variant="ghost" onClick={() => setIsHealDialogOpen(false)} className="flex-1 sm:flex-none">
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleConfirmHeal}
                                    disabled={isHealing || !healPreviewReport?.details?.length}
                                    className="gap-2 flex-1 sm:flex-none"
                                >
                                    <Check className="h-4 w-4" />
                                    Apply Changes
                                </Button>
                            </div>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
