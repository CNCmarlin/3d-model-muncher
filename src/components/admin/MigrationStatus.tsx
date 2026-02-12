import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, FileText, Folder, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

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
    const [error, setError] = useState<string | null>(null);
    const [validationErrors, setValidationErrors] = useState<MigrationError[]>([]);

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
                setValidationErrors(data.errors || []);
            } else {
                throw new Error(data.error || 'Unknown error');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    const StatusRow = ({ label, legacy, db, icon, subtext }: { label: string, legacy: number, db: number, icon: any, subtext?: string }) => {
        const isMatch = legacy === db;

        return (
            <div className="flex items-center justify-between p-4 border rounded-lg bg-card text-card-foreground shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-muted rounded-full">
                        {icon}
                    </div>
                    <div>
                        <p className="font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">Legacy vs DB (Unique)</p>
                    </div>
                </div>

                <div className="flex items-center gap-8">
                    <div className="text-right">
                        <div className="text-2xl font-bold text-muted-foreground">{legacy}</div>
                        <div className="text-xs text-muted-foreground">Filesystem</div>
                    </div>

                    <div className="font-mono text-muted-foreground">→</div>

                    <div className="text-right">
                        <div className={`text-2xl font-bold ${isMatch ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            {db}
                        </div>
                        <div className="text-xs text-muted-foreground">Database {subtext && <span className="opacity-70">({subtext})</span>}</div>
                    </div>

                    <div className="w-8 flex justify-center">
                        {isMatch ? (
                            <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                        ) : (
                            <div className="text-amber-500 font-bold">!</div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">System Integrity</h2>
                    <p className="text-muted-foreground">Strict parity check (Legacy Filesystem vs Sqlite DB).</p>
                </div>
                <Button onClick={fetchStats} disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Verify Integrity
                </Button>
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <div className="grid gap-4">
                <StatusRow
                    label="Models"
                    legacy={legacyStats?.models ?? 0}
                    db={dbStats?.models ?? 0}
                    icon={<Database className="h-5 w-5" />}
                />
                <StatusRow
                    label="Collections"
                    legacy={legacyStats?.collections ?? 0}
                    db={dbStats?.collections ?? 0}
                    icon={<Folder className="h-5 w-5" />}
                />
                <StatusRow
                    label="Unique Files"
                    legacy={legacyStats?.files ?? 0}
                    db={dbStats?.files ?? 0}
                    subtext={dbStats && dbStats.totalFileRecords !== undefined && dbStats.totalFileRecords > (dbStats.files || 0) ? `+${(dbStats.totalFileRecords || 0) - (dbStats.files || 0)} dupes` : undefined}
                    icon={<FileText className="h-5 w-5" />}
                />
            </div>

            {validationErrors.length > 0 ? (
                <Card className="border-red-200 bg-red-50 dark:bg-red-900/10">
                    <CardHeader>
                        <CardTitle className="text-red-600 dark:text-red-400">Migration Issues ({validationErrors.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="max-h-[300px] overflow-y-auto space-y-2">
                            {validationErrors.map((err, idx) => (
                                <div key={idx} className="p-3 bg-white dark:bg-slate-950 rounded border text-sm">
                                    <div className="font-semibold">{err.file}</div>
                                    <div className="text-red-500">{err.error}</div>
                                    {err.id && <div className="text-xs text-muted-foreground mt-1">Folder: {err.id}</div>}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <Card className="bg-green-50/50 dark:bg-green-900/10 border-green-200/50">
                    <CardHeader className="py-4">
                        <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                            <div className="h-2 w-2 rounded-full bg-green-500" />
                            <span className="font-semibold">Zero Migration Errors Detected</span>
                        </div>
                    </CardHeader>
                </Card>
            )}
        </div>
    );
};
