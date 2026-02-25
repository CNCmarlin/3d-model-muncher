import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Info, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

// --- Types ---



interface FieldStats {
    withTags: number;
    withDescription: number;
    withPrintTime: number;
    withFilament: number;
    hidden: number;
    favorites: number;
    projectRoots: number;
    projectParts: number;
    // Batch 1
    withCategory: number;
    withModelUrl: number;
    withPrice: number;
    // Batch 2
    withPrintSettings: number;
    withFileSize: number;
    // Batch 3
    withGcode: number;
    // Batch 4
    withFilesIdentity: number;
    // Batch 5
    withGallery: number;
    withThumbnails: number;
}

interface DeltaEntry {
    name: string;
    id: string;
    legacy: boolean;
    dest: boolean;
}

interface RolledUpTransformation {
    message: string;
    count: number;
    examples: string[];
}

interface FieldBatches {
    [batchKey: string]: string[];
}

interface DryRunStats {
    summary: {
        totalModels: number;
        totalCollections: number;
        totalFiles: number;
        legacy: FieldStats;
        dryRun: FieldStats;
        current: FieldStats;
    };
    deltas: Record<keyof FieldStats, DeltaEntry[]>;
    actions: {
        models: { created: number; updated: number; skipped: number };
        collections: { created: number; updated: number; skipped: number };
        files: { created: number; skipped: number };
    };
    critical: Array<{ file: string; message: string; error?: string }>;
    warnings: Array<{ file: string; message: string }>;
    transformations: RolledUpTransformation[];
    meta?: {
        fieldBatches: FieldBatches;
    };
}

interface CachedDryRun {
    ts: number;
    stats: DryRunStats;
}

const CACHE_KEY = 'lastDryRunResult';

// --- Utilities ---

const BATCH_LABELS: Record<string, string> = {
    core: 'Core Fields',
    batch1: '🆕 Promoted Fields (Batch 1)',
    batch2: '🆕 Promoted Fields (Batch 2)',
    batch3: '🆕 Promoted Fields (Batch 3)',
    batch4: '🆕 Promoted Fields (Batch 4)',
    batch5: '🆕 Promoted Fields (Batch 5)',
};

const FIELD_LABELS: Record<string, string> = {
    withTags: 'With Tags',
    withDescription: 'With Description',
    withPrintTime: 'With Print Time',
    withFilament: 'With Filament Data',
    hidden: 'Marked Hidden',
    favorites: 'Marked Favorite',
    projectRoots: 'Project Roots',
    projectParts: 'Project Parts',
    // Batch 1
    withCategory: 'With Category',
    withModelUrl: 'With Model URL',
    withPrice: 'With Price',
    // Batch 2
    withPrintSettings: 'With Print Settings',
    withFileSize: 'With File Size',
    // Batch 3
    withGcode: 'With G-code Analysis',
    // Batch 4
    withFilesIdentity: 'With Source/Notes/Links',
    // Batch 5
    withGallery: 'With Gallery Images',
    withThumbnails: 'With File Thumbnails',
};

function getPercentColor(pct: number): string {
    if (pct >= 100) return 'text-emerald-500';
    if (pct >= 50) return 'text-amber-400';
    return 'text-red-500';
}

function relativeTime(ts: number): string {
    const diffMs = Date.now() - ts;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
}

function isDBEmpty(current: FieldStats): boolean {
    return Object.values(current).every((v) => v === 0);
}

// --- Sub-components ---

interface StatCardProps {
    title: string;
    borderColor: string;
    stats: FieldStats;
    totalModels: number;
    fieldBatches: FieldBatches;
}

function StatCard({ title, borderColor, stats, totalModels, fieldBatches }: StatCardProps) {
    return (
        <Card className={`border-2 ${borderColor}`}>
            <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold">{title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pb-4">
                {Object.entries(fieldBatches).map(([batchKey, fields]) => (
                    <div key={batchKey}>
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                            {BATCH_LABELS[batchKey] ?? batchKey}
                        </div>
                        <div className="space-y-1">
                            {fields.map((key) => {
                                const count = (stats as any)[key] ?? 0;
                                const pct = totalModels > 0 ? Math.round((count / totalModels) * 100) : 0;
                                return (
                                    <div key={key} className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">{FIELD_LABELS[key] ?? key}</span>
                                        <div className="flex items-center gap-2 font-mono">
                                            <span className="font-semibold">{count}</span>
                                            <span className={`text-xs w-10 text-right ${getPercentColor(pct)}`}>{pct}%</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}

// --- Main Component ---

export const MigrationStatus_DB = () => {

    const [wiping, setWiping] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dryRunResults, setDryRunResults] = useState<DryRunStats | null>(null);
    const [cacheTs, setCacheTs] = useState<number | null>(null);
    const [selectedDeltaKey, setSelectedDeltaKey] = useState<keyof FieldStats | null>(null);

    // --- localStorage persistence ---
    useEffect(() => {
        try {
            console.log("📂 [MigrationStatus] Checking localStorage for cached dry run...");
            const raw = localStorage.getItem(CACHE_KEY);
            if (raw) {
                const cached: CachedDryRun = JSON.parse(raw);
                console.log("✅ [MigrationStatus] Found cached result from:", new Date(cached.ts).toLocaleString());
                setDryRunResults(cached.stats);
                setCacheTs(cached.ts);
            } else {
                console.log("ℹ️ [MigrationStatus] No cached dry run found.");
            }
        } catch (e) {
            console.error("❌ [MigrationStatus] Failed to load dry run cache:", e);
        }
    }, []);

    const saveDryRunToCache = (stats: DryRunStats) => {
        try {
            console.log("💾 [MigrationStatus] Saving fresh dry run results to cache...");
            const payload: CachedDryRun = { ts: Date.now(), stats };
            localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
            setCacheTs(payload.ts);
        } catch (e) {
            console.error("❌ [MigrationStatus] Failed to save cache:", e);
        }
    };

    const clearDryRunCache = () => {
        try {
            console.log("🧹 [MigrationStatus] Clearing dry run cache...");
            localStorage.removeItem(CACHE_KEY);
            setCacheTs(null);
        } catch (e) {
            console.error("❌ [MigrationStatus] Failed to clear cache:", e);
        }
    };

    const handleWipeAndScan = async (isDryRun: boolean) => {
        setWiping(true);
        if (!isDryRun) {
            setDryRunResults(null);
            clearDryRunCache();
        }
        try {
            const res = await fetch(`/api/system/wipe-and-scan?dryRun=${isDryRun}`, { method: 'POST' });
            if (!res.ok) throw new Error('Operation failed');
            const data = await res.json();

            if (data.success) {
                if (isDryRun) {
                    setDryRunResults(data.stats);
                    saveDryRunToCache(data.stats);
                    setCacheTs(null); // freshly fetched, not from cache
                    toast.info('Simulation complete. Review the report below.');
                }
            } else {
                throw new Error(data.error || 'Unknown error');
            }
        } catch (err: any) {
            toast.error(err.message);
            setError(err.message);
        } finally {
            setWiping(false);
        }
    };



    const getDrillDownData = (): DeltaEntry[] => {
        if (!selectedDeltaKey || !dryRunResults?.deltas) return [];
        return dryRunResults.deltas[selectedDeltaKey] ?? [];
    };
    const drillDownData = getDrillDownData();

    // Derive field batches — prefer backend meta, fall back to hardcoded defaults
    const fieldBatches: FieldBatches = dryRunResults?.meta?.fieldBatches ?? {
        core: ['withTags', 'withDescription', 'withPrintTime', 'withFilament', 'hidden', 'favorites', 'projectRoots', 'projectParts'],
        batch1: ['withCategory', 'withModelUrl', 'withPrice'],
        batch2: ['withPrintSettings', 'withFileSize'],
        batch3: ['withGcode'],
        batch4: ['withFilesIdentity'],
        batch5: ['withGallery', 'withThumbnails'],
    };


    const renderComparisonTable = (
        tableTitle: string,
        description: string,
        leftLabel: string,
        leftStats: FieldStats,
        rightLabel: string,
        rightStats: FieldStats,
        deltaLabel: string,
        /** positive delta = gain, negative = loss */
        deltaIsLoss: (delta: number) => boolean,
        enableDrillDown: boolean,
    ) => (
        <Card>
            <CardHeader>
                <CardTitle>{tableTitle}</CardTitle>
                <p className="text-sm text-muted-foreground">{description}</p>
            </CardHeader>
            <CardContent className="p-0">
                <div className="overflow-x-auto rounded-b-lg">
                    <table className="w-full text-sm">
                        <thead className="bg-muted text-muted-foreground">
                            <tr>
                                <th className="p-3 text-left font-medium">Field</th>
                                <th className="p-3 text-right font-medium">{leftLabel}</th>
                                <th className="p-3 text-right font-medium text-blue-400">{rightLabel}</th>
                                <th className="p-3 text-right font-medium">{deltaLabel}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {Object.entries(fieldBatches).map(([batchKey, fields]) => (
                                <>
                                    <tr key={`batch-header-${batchKey}`}>
                                        <td colSpan={4} className="bg-muted/60 px-3 py-1.5">
                                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                {BATCH_LABELS[batchKey] ?? batchKey}
                                            </span>
                                        </td>
                                    </tr>
                                    {fields.map((key) => {
                                        const l = (leftStats as any)[key] ?? 0;
                                        const r = (rightStats as any)[key] ?? 0;
                                        const delta = r - l;
                                        const hasDelta = delta !== 0;
                                        const isLoss = deltaIsLoss(delta);
                                        const isBatch1 = batchKey === 'batch1';

                                        return (
                                            <tr key={key} className={`hover:bg-muted/40 transition-colors ${isBatch1 ? 'bg-blue-950/10' : ''}`}>
                                                <td className="p-2 font-medium">{FIELD_LABELS[key] ?? key}</td>
                                                <td className="p-2 text-right font-mono text-muted-foreground">{l}</td>
                                                <td className="p-2 text-right font-mono text-blue-400 font-bold">{r}</td>
                                                <td className="p-2 text-right">
                                                    {hasDelta ? (
                                                        enableDrillDown ? (
                                                            <button
                                                                onClick={() => setSelectedDeltaKey(key as keyof FieldStats)}
                                                                className={`font-mono font-bold hover:underline cursor-pointer ${isLoss ? 'text-red-500' : 'text-emerald-500'}`}
                                                            >
                                                                {delta > 0 ? '+' : ''}{delta}
                                                            </button>
                                                        ) : (
                                                            <span className={`font-mono font-bold ${isLoss ? 'text-red-500' : 'text-emerald-500'}`}>
                                                                {delta > 0 ? '+' : ''}{delta}
                                                            </span>
                                                        )
                                                    ) : (
                                                        <span className="text-muted-foreground/40 font-mono">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </>
                            ))}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Database Migration</h2>
                    <p className="text-muted-foreground">Synchronize Legacy JSON files with the new Database.</p>
                </div>
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}



            {/* Action Buttons */}
            <Card>
                <CardHeader>
                    <CardTitle>Migration Operations</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <Button onClick={() => handleWipeAndScan(true)} disabled={wiping} className="w-full sm:w-auto">
                            {wiping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Run Dry Run
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" disabled={wiping} className="w-full sm:w-auto">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Execute Full Migration
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will delete all current data in the database (Models, Collections, Tags) and re-import everything from the file system.
                                        <br /><br />
                                        This action <strong>cannot be undone.</strong>
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleWipeAndScan(false)}>
                                        Yes, Wipe & Import
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </CardContent>
            </Card>

            {/* Dry Run report */}
            {dryRunResults && (
                <div className="space-y-6">
                    {/* Cache Banner */}
                    {cacheTs && (
                        <Alert className="border-blue-800 bg-blue-950/30 text-blue-300">
                            <Info className="h-4 w-4" />
                            <AlertTitle className="text-blue-300">Showing cached dry run from {relativeTime(cacheTs)}</AlertTitle>
                            <AlertDescription className="text-blue-400">
                                Click <strong>Run Dry Run</strong> to refresh with current data.
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="flex items-center gap-3">
                        <h3 className="text-xl font-bold tracking-tight">Dry Run Report</h3>
                        <Badge variant="secondary">Simulation Only</Badge>
                    </div>

                    {/* Summary Counts */}
                    <div className="grid gap-4 md:grid-cols-3">
                        {[
                            {
                                value: dryRunResults.summary?.totalModels ?? 0,
                                label: 'Total Models',
                                sub: `+${dryRunResults.actions.models.created} create · ${dryRunResults.actions.models.updated} update · ${dryRunResults.actions.models.skipped} skip`,
                            },
                            {
                                value: dryRunResults.summary?.totalCollections ?? 0,
                                label: 'Collections',
                                sub: `+${dryRunResults.actions.collections.created} create`,
                            },
                            {
                                value: dryRunResults.actions.files.created,
                                label: 'File Records',
                                sub: `${dryRunResults.actions.files.skipped} skipped`,
                            },
                        ].map(({ value, label, sub }) => (
                            <div key={label} className="border rounded-lg p-4 bg-card text-center">
                                <div className="text-3xl font-bold">{value}</div>
                                <div className="text-sm text-muted-foreground mt-1">{label}</div>
                                <div className="text-xs text-muted-foreground mt-1">{sub}</div>
                            </div>
                        ))}
                    </div>

                    {/* Summary Cards: Legacy / Dry Run / Current DB */}
                    {dryRunResults.summary?.legacy && (
                        <div className="grid gap-4 lg:grid-cols-3">
                            <StatCard
                                title="📂 Legacy (Source)"
                                borderColor="border-slate-600"
                                stats={dryRunResults.summary.legacy}
                                totalModels={dryRunResults.summary.totalModels}
                                fieldBatches={fieldBatches}
                            />
                            <StatCard
                                title="🔮 Dry Run (Projected)"
                                borderColor="border-blue-500"
                                stats={dryRunResults.summary.dryRun}
                                totalModels={dryRunResults.summary.totalModels}
                                fieldBatches={fieldBatches}
                            />
                            <StatCard
                                title="🗄️ Current DB"
                                borderColor="border-violet-500"
                                stats={dryRunResults.summary.current}
                                totalModels={dryRunResults.summary.totalModels}
                                fieldBatches={fieldBatches}
                            />
                        </div>
                    )}

                    {/* ② Empty DB Banner */}
                    {dryRunResults.summary?.current && isDBEmpty(dryRunResults.summary.current) && (

                        <Alert className="border-sky-800 bg-sky-950/30">
                            <Info className="h-4 w-4 text-sky-400" />
                            <AlertTitle className="text-sky-300">Current DB appears empty</AlertTitle>
                            <AlertDescription className="text-sky-400">
                                The <strong>Current DB</strong> column shows all zeros because no migration has been run yet. Run <strong>Execute Full Migration</strong> to populate it.
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* ① Table A — Migration Fidelity: Legacy → Dry Run */}
                    {dryRunResults.summary?.legacy && renderComparisonTable(
                        '⚖️ Migration Fidelity',
                        'Compares what exists in the Legacy JSON files vs what will be written to the DB. Negative deltas mean data loss.',
                        'Legacy',
                        dryRunResults.summary.legacy,
                        'Dry Run',
                        dryRunResults.summary.dryRun,
                        'Data Loss?',
                        (delta) => delta < 0,
                        true,
                    )}

                    {/* ① Table B — DB Parity: Dry Run → Current DB */}
                    {dryRunResults.summary?.current && renderComparisonTable(
                        '🗄️ DB Parity',
                        'Compares the projected dry run values against what is currently in the DB. Negative deltas mean the DB is behind.',
                        'Dry Run',
                        dryRunResults.summary.dryRun,
                        'Current DB',
                        dryRunResults.summary.current,
                        'DB Behind?',
                        (delta) => delta > 0,
                        false,
                    )}

                    {/* Issues Panel */}
                    {(dryRunResults.critical.length > 0 || dryRunResults.warnings.length > 0 || dryRunResults.transformations.length > 0) && (
                        <Card>
                            <CardHeader><CardTitle>Issues</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                {dryRunResults.critical.length > 0 && (
                                    <div className="bg-red-950/30 border border-red-800 p-3 rounded-lg">
                                        <p className="font-semibold text-red-400 mb-2">🚨 Critical ({dryRunResults.critical.length})</p>
                                        <ul className="text-sm text-red-300 list-disc list-inside space-y-1 max-h-48 overflow-y-auto">
                                            {dryRunResults.critical.map((err, i) => (
                                                <li key={i}><strong>{err.file}:</strong> {err.message}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {dryRunResults.warnings.length > 0 && (
                                    <div className="bg-amber-950/30 border border-amber-700 p-3 rounded-lg">
                                        <p className="font-semibold text-amber-400 mb-2">⚠️ Warnings ({dryRunResults.warnings.length})</p>
                                        <ul className="text-sm text-amber-300 list-disc list-inside space-y-1 max-h-40 overflow-y-auto">
                                            {dryRunResults.warnings.map((w, i) => (
                                                <li key={i}><strong>{w.file}:</strong> {w.message}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {/* ⑤ Rolled-up transformations */}
                                {dryRunResults.transformations.length > 0 && (
                                    <div className="bg-blue-950/30 border border-blue-800 p-3 rounded-lg">
                                        <p className="font-semibold text-blue-400 mb-2">
                                            ℹ️ Transformations ({dryRunResults.transformations.reduce((acc, t) => acc + (t.count ?? 1), 0)} models)
                                        </p>
                                        <ul className="text-sm text-blue-300 space-y-1.5 max-h-48 overflow-y-auto">
                                            {dryRunResults.transformations.map((t, i) => (
                                                <li key={i} className="flex items-start gap-2">
                                                    <span className="font-mono bg-blue-900/40 text-blue-300 rounded px-1.5 py-0.5 text-xs shrink-0">
                                                        ×{t.count ?? 1}
                                                    </span>
                                                    <span>
                                                        {t.message}
                                                        {t.examples && t.examples.length > 0 && (
                                                            <span className="text-blue-400/70 ml-1">
                                                                (e.g. {t.examples.join(', ')}{t.count > t.examples.length ? '…' : ''})
                                                            </span>
                                                        )}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Execute post-dry-run */}
                    <div className="flex justify-end">
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Execute Migration Plan
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Execute Migration?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will wipe the current database and import data exactly as shown in the Dry Run report.
                                        <br /><br />
                                        <strong>{dryRunResults.summary?.totalModels}</strong> models will be imported.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={() => handleWipeAndScan(false)}
                                        className="bg-emerald-600 hover:bg-emerald-700"
                                    >
                                        Yes, Execute Migration
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>
            )}

            {/* Delta Drill-Down Sheet */}
            <Sheet open={!!selectedDeltaKey} onOpenChange={(open) => !open && setSelectedDeltaKey(null)}>
                <SheetContent className="w-[420px] sm:w-[560px] overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>Delta Drill-Down</SheetTitle>
                        <SheetDescription>
                            Models contributing to the <strong>Migration Fidelity</strong> delta for <strong>{FIELD_LABELS[selectedDeltaKey ?? ''] ?? selectedDeltaKey}</strong>.
                            {drillDownData.length >= 50 && (
                                <span className="ml-1 text-amber-400">(Showing first 50)</span>
                            )}
                        </SheetDescription>
                    </SheetHeader>
                    <div className="mt-6 space-y-2">
                        {drillDownData.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic">No specific items recorded for this delta.</p>
                        ) : (
                            <div className="border rounded-md divide-y">
                                {drillDownData.slice(0, 50).map((item, idx) => (
                                    <div key={idx} className="p-3 text-sm">
                                        <div className="font-medium">{item.name}</div>
                                        <div className="text-xs text-muted-foreground mt-1 font-mono">{item.id}</div>
                                        <div className="grid grid-cols-2 mt-2 gap-2 text-xs">
                                            <div>legacy: <span className={item.legacy ? 'text-emerald-500' : 'text-red-500'}>{String(item.legacy)}</span></div>
                                            <div>→ new: <span className={item.dest ? 'text-emerald-500' : 'text-red-500'}>{String(item.dest)}</span></div>
                                        </div>
                                    </div>
                                ))}
                                {drillDownData.length > 50 && (
                                    <div className="p-3 text-xs text-center text-muted-foreground italic">
                                        …and {drillDownData.length - 50} more items
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
};
