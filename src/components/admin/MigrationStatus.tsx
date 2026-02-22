import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Database, FileText, Folder, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface MigrationStats {
    models: number;
    files: number; // Unique Files
    totalFileRecords?: number; // Raw DB records including duplicates
    collections: number;
}

interface MigrationError {
    file: string;
    error: string;
    id?: string;
}

export const MigrationStatus = () => {
    const [dbStats, setDbStats] = useState<MigrationStats | null>(null);
    const [legacyStats, setLegacyStats] = useState<any | null>(null);
    const [loading, setLoading] = useState(false);
    const [wiping, setWiping] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dryRunResults, setDryRunResults] = useState<any | null>(null);

    // Drill Down State
    const [selectedDeltaKey, setSelectedDeltaKey] = useState<string | null>(null);

    const fetchStats = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/migration-status');
            if (!res.ok) throw new Error('Failed to fetch stats');
            const data = await res.json();
            if (data.success) {
                setDbStats(data.db);
                setLegacyStats(data.legacy);
            } else {
                throw new Error(data.error || 'Unknown error');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleWipeAndScan = async (isDryRun: boolean) => {
        setWiping(true);
        setDryRunResults(null);
        try {
            const res = await fetch(`/api/system/wipe-and-scan?dryRun=${isDryRun}`, { method: 'POST' });
            if (!res.ok) throw new Error('Operation failed');
            const data = await res.json();

            if (data.success) {
                if (isDryRun) {
                    setDryRunResults(data.stats);
                    toast.info(`Simulation Complete. Review the report below.`);
                } else {
                    toast.success(`Wipe & Scan Complete! Found ${data.stats.models.created} models.`);
                    fetchStats(); // Refresh stats
                    setDryRunResults(null);
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

    // Helper to get drill down data
    const getDrillDownData = () => {
        if (!selectedDeltaKey || !dryRunResults?.deltas) return [];
        return dryRunResults.deltas[selectedDeltaKey] || [];
    };

    useEffect(() => {
        fetchStats();
    }, []);

    const StatusRow = ({ label, legacy, db, dryRun, icon, subtext }: { label: string, legacy: number, db: number, dryRun?: number | null, icon: any, subtext?: string }) => {
        const isMatch = legacy === db;
        const hasDryRun = dryRun !== undefined && dryRun !== null;

        return (
            <div className="flex items-center justify-between p-4 border rounded-lg bg-card text-card-foreground shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-muted rounded-full">
                        {icon}
                    </div>
                    <div>
                        <p className="font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">
                            {hasDryRun ? "Legacy → Dry Run → DB" : "Legacy vs DB"}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    {/* Legacy */}
                    <div className="text-right">
                        <div className="text-2xl font-bold text-muted-foreground">{legacy}</div>
                        <div className="text-xs text-muted-foreground">Legacy</div>
                    </div>

                    {/* Dry Run (Conditional) */}
                    {hasDryRun && (
                        <div className="text-right text-blue-500">
                            <div className="text-2xl font-bold">{dryRun}</div>
                            <div className="text-xs text-muted-foreground">Dry Run</div>
                        </div>
                    )}

                    {/* Database */}
                    <div className={`text-right ${!isMatch && !hasDryRun ? 'text-amber-500' : 'text-primary'}`}>
                        <div className="text-2xl font-bold">{db}</div>
                        <div className="text-xs text-muted-foreground">Database</div>
                    </div>
                </div>

                {subtext && <div className="text-xs text-muted-foreground w-full mt-2 border-t pt-2">{subtext}</div>}
            </div>
        );
    };

    if (loading) return <div className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Database Migration</h2>
                    <p className="text-muted-foreground">
                        Manage synchronization between Legacy JSON files and the new Database.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={fetchStats} disabled={loading}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh Stats
                    </Button>
                </div>
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">

                <StatusRow
                    label="Models"
                    icon={<FileText className="h-5 w-5" />}
                    legacy={legacyStats?.models || 0}
                    db={dbStats?.models || 0}
                    dryRun={
                        (dryRunResults?.actions?.models?.created || 0) +
                        (dryRunResults?.actions?.models?.updated || 0) +
                        (dryRunResults?.actions?.models?.skipped || 0)
                    }
                />
                <StatusRow
                    label="Collections"
                    icon={<Folder className="h-5 w-5" />}
                    legacy={legacyStats?.collections || 0}
                    db={dbStats?.collections || 0}
                    dryRun={
                        (dryRunResults?.actions?.collections?.created || 0) +
                        (dryRunResults?.actions?.collections?.updated || 0) +
                        (dryRunResults?.actions?.collections?.skipped || 0)
                    }
                />
                <StatusRow
                    label="Files & Assets"
                    icon={<Database className="h-5 w-5" />}
                    legacy={legacyStats?.totalFileRecords || legacyStats?.files || 0}
                    db={dbStats?.totalFileRecords || dbStats?.files || 0}
                    subtext="Total file records tracked in database"
                    dryRun={
                        (dryRunResults?.actions?.files?.created || 0) +
                        (dryRunResults?.actions?.files?.updated || 0) +
                        (dryRunResults?.actions?.files?.skipped || 0)
                    }
                />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Migration Operations</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col gap-4 sm:flex-row">
                        <Button
                            onClick={() => handleWipeAndScan(true)}
                            disabled={wiping}
                            className="w-full sm:w-auto"
                        >
                            {wiping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Simulate Migration (Dry Run)
                        </Button>

                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" disabled={wiping} className="w-full sm:w-auto">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Wipe & Full Import
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will delete all current data in the database (Models, Collections, Tags) and re-import everything from the file system labels.
                                        <br /><br />
                                        This action cannot be undone.
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

                    {dryRunResults && (
                        <div className="mt-6 border rounded-lg p-4 bg-muted/50">
                            <h3 className="font-semibold mb-2">Simulation Results</h3>
                            <div className="text-sm space-y-2">
                                <p>This is what would happen if you ran the migration now:</p>
                                <ul className="list-disc list-inside space-y-1 ml-2">
                                    <li>Create <strong>{dryRunResults.actions?.models.created}</strong> new models</li>
                                    <li>Update <strong>{dryRunResults.actions?.models.updated}</strong> existing models</li>
                                    <li>Create <strong>{dryRunResults.actions?.collections.created}</strong> collections</li>
                                </ul>
                            </div>

                            <div className="mt-4 flex justify-end">
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                            <RefreshCw className="mr-2 h-4 w-4" />
                                            Execute Migration Plan
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Ready to migrate?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will wipe the current database and import the data exactly as shown in the Dry Run report.
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

                            <div className="mt-4 pt-4 border-t">
                                <h4 className="font-semibold mb-2">Detailed Report</h4>

                                <div className="space-y-4">
                                    {/* Summary Stats */}
                                    <div className="grid grid-cols-3 gap-4 border-b pb-4">
                                        <div>
                                            <p className="font-semibold text-lg">{dryRunResults.summary?.totalModels ?? dryRunResults.models.created}</p>
                                            <p className="text-muted-foreground text-xs uppercase tracking-wide">Total Models</p>
                                        </div>
                                        <div>
                                            <p className="font-semibold text-lg">{dryRunResults.summary?.totalCollections ?? dryRunResults.collections.created}</p>
                                            <p className="text-muted-foreground text-xs uppercase tracking-wide">Collections</p>
                                        </div>
                                        <div>
                                            <p className="font-semibold text-lg">{dryRunResults.summary?.totalFiles ?? dryRunResults.files?.created ?? 0}</p>
                                            <p className="text-muted-foreground text-xs uppercase tracking-wide">Attachments Found</p>
                                        </div>
                                    </div>

                                    {/* Data Field Parity Comparison */}
                                    {dryRunResults.summary?.legacy && (
                                        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded border">
                                            <h4 className="font-semibold mb-3 flex items-center text-slate-700 dark:text-slate-300">
                                                ⚖️ Data Field Parity (Source vs Target)
                                            </h4>
                                            <div className="overflow-hidden bg-white dark:bg-slate-950 rounded border">
                                                <table className="w-full text-left text-sm">
                                                    <thead className="bg-slate-100 dark:bg-slate-900 text-slate-500">
                                                        <tr>
                                                            <th className="p-2 font-medium">Field Schema</th>
                                                            <th className="p-2 font-medium text-right">Legacy (JSON)</th>
                                                            <th className="p-2 font-medium text-right text-blue-600">Dry Run</th>
                                                            <th className="p-2 font-medium text-right">DB (Current)</th>
                                                            <th className="p-2 font-medium text-right">Proj. Delta</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y">
                                                        {[
                                                            { label: 'Project Roots', key: 'projectRoots' },
                                                            { label: 'Project Parts', key: 'projectParts' },
                                                            { label: 'Has Description', key: 'withDescription' },
                                                            { label: 'Has Tags', key: 'withTags' },
                                                            { label: 'Has Print Time', key: 'withPrintTime' },
                                                            { label: 'Has Filament Data', key: 'withFilament' },
                                                            { label: 'Marked Hidden', key: 'hidden' },
                                                            { label: 'Marked Favorite', key: 'favorites' },
                                                        ].map((row) => {
                                                            const legacy = Number(dryRunResults.summary.legacy[row.key] || 0);
                                                            const dryRun = Number(dryRunResults.summary.dryRun?.[row.key] || 0);
                                                            const current = Number(dryRunResults.summary.current?.[row.key] || 0);

                                                            // Delta is Dry Run (Projected) - Legacy (Source)
                                                            const delta = dryRun - legacy;
                                                            const hasDelta = delta !== 0;
                                                            const isNegative = delta < 0;

                                                            return (
                                                                <tr key={row.key} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                                                                    <td className="p-2 font-medium">{row.label}</td>
                                                                    <td className="p-2 text-right font-mono text-slate-600 dark:text-slate-400">{legacy}</td>
                                                                    <td className="p-2 text-right font-mono text-blue-600 dark:text-blue-400 font-bold">{dryRun}</td>
                                                                    <td className="p-2 text-right font-mono text-slate-600 dark:text-slate-400">{current}</td>
                                                                    <td className="p-2 text-right">
                                                                        {hasDelta ? (
                                                                            <button
                                                                                onClick={() => setSelectedDeltaKey(row.key)}
                                                                                className={`font-mono font-bold hover:underline cursor-pointer ${isNegative ? 'text-red-500' : 'text-emerald-500'}`}
                                                                            >
                                                                                {delta > 0 ? '+' : ''}{delta}
                                                                            </button>
                                                                        ) : (
                                                                            <span className="text-slate-300 dark:text-slate-700 font-mono">-</span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* CRITICAL ERRORS */}
                                    {dryRunResults.critical && dryRunResults.critical.length > 0 && (
                                        <div className="bg-red-100 dark:bg-red-900/20 p-3 rounded border border-red-200">
                                            <p className="font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center">
                                                🚨 Critical Issues ({dryRunResults.critical.length})
                                            </p>
                                            <ul className="text-sm text-red-600 dark:text-red-300 list-disc list-inside max-h-60 overflow-y-auto">
                                                {dryRunResults.critical.map((err: any, i: number) => (
                                                    <li key={i}>
                                                        <strong>{err.file}:</strong> {err.message}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* WARNINGS */}
                                    {dryRunResults.warnings && dryRunResults.warnings.length > 0 && (
                                        <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded border border-amber-200">
                                            <p className="font-semibold text-amber-700 dark:text-amber-400 mb-2">
                                                ⚠️ Warnings ({dryRunResults.warnings.length})
                                            </p>
                                            <ul className="text-sm text-amber-600 dark:text-amber-300 list-disc list-inside max-h-40 overflow-y-auto">
                                                {dryRunResults.warnings.map((err: any, i: number) => (
                                                    <li key={i}>
                                                        <strong>{err.file}:</strong> {err.message}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* TRANSFORMATIONS */}
                                    {dryRunResults.transformations && dryRunResults.transformations.length > 0 && (
                                        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded border border-blue-200">
                                            <p className="font-semibold text-blue-700 dark:text-blue-400 mb-2">
                                                ℹ️ Transformations & Fixes ({dryRunResults.transformations.length})
                                            </p>
                                            <ul className="text-sm text-blue-600 dark:text-blue-300 list-disc list-inside max-h-40 overflow-y-auto">
                                                {dryRunResults.transformations.slice(0, 50).map((t: any, i: number) => (
                                                    <li key={i}>
                                                        <strong>{t.file}:</strong> {t.message}
                                                    </li>
                                                ))}
                                                {dryRunResults.transformations.length > 50 && (
                                                    <li className="italic">...and {dryRunResults.transformations.length - 50} more.</li>
                                                )}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Sheet open={!!selectedDeltaKey} onOpenChange={(open) => !open && setSelectedDeltaKey(null)}>
                <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>Data Discrepancy Details</SheetTitle>
                        <SheetDescription>
                            Showing items contributing to the delta for <strong>{selectedDeltaKey}</strong>.
                        </SheetDescription>
                    </SheetHeader>
                    <div className="mt-6 space-y-4">
                        {getDrillDownData().length === 0 ? (
                            <p className="text-sm text-muted-foreground italic">No specific items recorded for this delta.</p>
                        ) : (
                            <div className="border rounded-md divide-y">
                                {getDrillDownData().map((item: any, idx: number) => (
                                    <div key={idx} className="p-3 text-sm">
                                        <div className="font-medium text-slate-800 dark:text-slate-200">{item.name}</div>
                                        <div className="grid grid-cols-2 mt-1 gap-2 text-xs">
                                            <div className="text-slate-500">
                                                legacy: <span className={item.legacy ? "text-emerald-600 font-mono" : "text-red-500 font-mono"}>{String(item.legacy)}</span>
                                            </div>
                                            <div className="text-slate-500">
                                                new: <span className={item.dest ? "text-emerald-600 font-mono" : "text-red-500 font-mono"}>{String(item.dest)}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {getDrillDownData().length >= 100 && (
                            <p className="text-xs text-muted-foreground text-center pt-2">
                                List limited to first 100 items for performance.
                            </p>
                        )}
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
};
