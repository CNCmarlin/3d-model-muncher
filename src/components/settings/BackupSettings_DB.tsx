import { LastRunLabel } from '@/components/common/LastRunLabel';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useBackups_db } from '@/hooks/settings/useBackups_db';
import { useSettingsConfig_db } from '@/hooks/settings/useSettingsConfig_db';
import { Model_db as Model } from '@/types/model_db';
import { AlertTriangle, Archive, BellOff, Database, Download, RefreshCw, RotateCcw, Save, Settings, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';

type BackupSettingsProps = ReturnType<typeof useBackups_db> & {
    models: Model[];
    configSettings?: ReturnType<typeof useSettingsConfig_db>;
};

export function BackupSettings_DB({
    isCreatingBackup,
    isRestoring,
    backupHistory,
    restoreResult,
    restoreStrategy,
    setRestoreStrategy,
    backupFileInputRef,
    handleCreateBackup,
    handleRestoreFromFile,
    handleBackupFileRestore,
    models,
    configSettings
}: BackupSettingsProps) {
    const configFileInputRef = useRef<HTMLInputElement>(null);
    const [staleWarningDismissed, setStaleWarningDismissed] = useState(false);

    const STALE_BACKUP_DAYS = 30;
    const NEVER_REMIND_KEY = 'backup_stale_never_remind';
    const neverRemind = typeof localStorage !== 'undefined'
        ? localStorage.getItem(NEVER_REMIND_KEY) === 'true'
        : false;

    // Use the most recent entry from backupHistory (persisted in localStorage by the hook)
    const lastBackupTs = backupHistory[0]?.timestamp ?? null;
    const daysSinceBackup = lastBackupTs
        ? Math.floor((Date.now() - new Date(lastBackupTs).getTime()) / (1000 * 60 * 60 * 24))
        : null;
    const showStaleWarning = !staleWarningDismissed && !neverRemind
        && (daysSinceBackup === null || daysSinceBackup >= STALE_BACKUP_DAYS);

    return (
        <div className="space-y-6">
            {/* Configuration Section */}
            {configSettings && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Settings className="h-5 w-5 text-primary" />
                            Configuration
                        </CardTitle>
                        <CardDescription>
                            Import, export, and reset your application configuration settings.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Button onClick={configSettings.handleExportConfig} className="gap-2">
                                <Download className="h-4 w-4" />
                                Export Config
                            </Button>
                            <Button onClick={() => configFileInputRef.current?.click()} variant="outline" className="gap-2">
                                <Upload className="h-4 w-4" />
                                Import Config
                            </Button>
                            <input
                                type="file"
                                ref={configFileInputRef}
                                onChange={configSettings.handleImportConfig}
                                accept=".json"
                                className="hidden"
                            />
                            <Button onClick={configSettings.handleResetConfig} variant="destructive" className="gap-2">
                                <RefreshCw className="h-4 w-4" />
                                Reset to Defaults
                            </Button>
                        </div>
                        <Separator />
                        <div className="space-y-4">
                            <h3 className="font-medium">Manual Save</h3>
                            <div className="flex items-center justify-between gap-4">
                                <p className="text-sm text-muted-foreground">
                                    Save your current configuration manually. This is useful when auto-save is disabled.
                                </p>
                                <Button onClick={() => configSettings.handleSaveConfig()} className="gap-2 shrink-0">
                                    <Save className="h-4 w-4" />
                                    Save Config
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Database Backup & Restore */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Archive className="h-5 w-5 text-primary" />
                        Database Backup &amp; Restore
                    </CardTitle>
                    <CardDescription>
                        Export and restore your entire model database — includes all models, collections, tags, and metadata.
                        Model files (.3mf / .stl) are not included; only database records.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">

                    {/* Stale Backup Warning */}
                    {showStaleWarning && (
                        <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm">
                                    {daysSinceBackup === null
                                        ? 'No backup has ever been created'
                                        : `Your last backup was ${daysSinceBackup} days ago`}
                                </p>
                                <p className="text-xs mt-0.5 opacity-80">
                                    We recommend backing up your database at least once a month.
                                </p>
                            </div>
                            <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs gap-1 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20"
                                    onClick={() => {
                                        localStorage.setItem(NEVER_REMIND_KEY, 'true');
                                        setStaleWarningDismissed(true);
                                    }}
                                >
                                    <BellOff className="h-3 w-3" />
                                    Don't remind me
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20"
                                    onClick={() => setStaleWarningDismissed(true)}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Create Backup */}
                    <div className="space-y-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div className="space-y-1">
                                <h3 className="font-medium">Create Backup</h3>
                                <p className="text-sm text-muted-foreground">
                                    Downloads a JSON snapshot of the entire database (models, collections, tags).
                                </p>
                            </div>
                            <div className="flex flex-col items-center gap-1 md:ml-4">
                                <Button
                                    onClick={handleCreateBackup}
                                    disabled={isCreatingBackup}
                                    className="gap-2"
                                >
                                    {isCreatingBackup ? (
                                        <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Archive className="h-4 w-4" />
                                    )}
                                    {isCreatingBackup ? 'Exporting...' : 'Create Backup'}
                                </Button>
                                {backupHistory.length > 0 && (
                                    <LastRunLabel
                                        timestamp={backupHistory[0].timestamp}
                                        className="text-[10px]"
                                    />
                                )}
                            </div>
                        </div>

                        {/* DB Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Card>
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2">
                                        <Database className="h-4 w-4 text-primary" />
                                        <div>
                                            <p className="text-lg font-semibold">{models.length}</p>
                                            <p className="text-xs text-muted-foreground">DB Models</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2">
                                        <Archive className="h-4 w-4 text-primary" />
                                        <div>
                                            {backupHistory.length > 0 ? (
                                                <>
                                                    <p className="text-sm font-semibold">
                                                        {new Date(backupHistory[0].timestamp).toLocaleDateString()}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Last backup · {(backupHistory[0].size / 1024).toFixed(1)} KB
                                                    </p>
                                                </>
                                            ) : (
                                                <>
                                                    <p className="text-lg font-semibold text-muted-foreground">Never</p>
                                                    <p className="text-xs text-muted-foreground">No backup created yet</p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>

                    <Separator />

                    {/* Restore Section */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <h3 className="font-medium">Restore from Backup</h3>
                            <p className="text-sm text-muted-foreground">
                                Restore database records from a <code>.json</code> backup file created by Model Muncher.
                            </p>
                        </div>

                        {/* Strategy Selection */}
                        <div className="space-y-3">
                            <Label>Restore Strategy</Label>
                            <Select
                                value={restoreStrategy}
                                onValueChange={(v: 'merge' | 'replace') => setRestoreStrategy(v)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="merge">
                                        <div className="font-medium">Merge <span className="text-xs text-muted-foreground">(Recommended)</span></div>
                                        <div className="text-xs text-muted-foreground hidden sm:block">
                                            Upsert records by ID — existing records not in the backup are kept
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="replace">
                                        <div className="font-medium text-destructive">Replace (Destructive)</div>
                                        <div className="text-xs text-muted-foreground hidden sm:block">
                                            Delete all existing records, then restore from backup
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Strategy Description */}
                            <div className={`text-xs p-3 rounded-lg break-words ${restoreStrategy === 'replace' ? 'bg-destructive/10 text-destructive' : 'bg-muted/50 text-muted-foreground'}`}>
                                {restoreStrategy === 'merge' ? (
                                    <>
                                        <strong>Merge:</strong> Each record from the backup is upserted by its database ID.
                                        Any models or collections not present in the backup file are left untouched.
                                        <span className="block mt-1 font-semibold text-primary">Safe for most recoveries.</span>
                                    </>
                                ) : (
                                    <div className="flex gap-2">
                                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                        <div>
                                            <strong>Replace:</strong> All existing models and collections will be <em>permanently deleted</em> before
                                            restoring the backup. This cannot be undone.
                                            <span className="block mt-1 font-semibold">Only use to fully revert to a previous state.</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <Button
                                onClick={handleRestoreFromFile}
                                disabled={isRestoring}
                                variant={restoreStrategy === 'replace' ? 'destructive' : 'outline'}
                                className="gap-2"
                            >
                                {isRestoring ? (
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                    <RotateCcw className="h-4 w-4" />
                                )}
                                {isRestoring ? 'Restoring...' : 'Restore from File'}
                            </Button>
                            <input
                                type="file"
                                ref={backupFileInputRef}
                                onChange={handleBackupFileRestore}
                                accept=".json"
                                className="hidden"
                            />
                        </div>

                        <p className="text-xs text-muted-foreground">
                            <strong>Supported format:</strong> .json (Model Muncher DB backup)
                        </p>

                        {/* Restore Result Panel */}
                        {restoreResult && (
                            <div className={`p-3 rounded-lg text-sm space-y-1 ${restoreResult.errors.length > 0
                                ? 'bg-amber-500/10 border border-amber-500/30'
                                : 'bg-green-500/10 border border-green-500/30'
                                }`}>
                                <p className="font-semibold">{restoreResult.summary}</p>
                                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground mt-1">
                                    <div>
                                        <p className="font-medium text-foreground">{restoreResult.restoredModels}</p>
                                        <p>Models restored</p>
                                    </div>
                                    <div>
                                        <p className="font-medium text-foreground">{restoreResult.restoredCollections}</p>
                                        <p>Collections restored</p>
                                    </div>
                                    <div>
                                        <p className="font-medium text-foreground">{restoreResult.skipped}</p>
                                        <p>Skipped / errors</p>
                                    </div>
                                </div>
                                {restoreResult.errors.length > 0 && (
                                    <details className="text-xs mt-2">
                                        <summary className="cursor-pointer text-amber-600 font-medium">
                                            {restoreResult.errors.length} error{restoreResult.errors.length > 1 ? 's' : ''} — click to expand
                                        </summary>
                                        <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                            {restoreResult.errors.map((e, i) => (
                                                <li key={i}>[{e.type}] {e.id}: {e.error}</li>
                                            ))}
                                        </ul>
                                    </details>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Backup History */}
                    {backupHistory.length > 0 && (
                        <>
                            <Separator />
                            <div className="space-y-3">
                                <h3 className="font-medium">Recent Backups</h3>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {backupHistory.map((backup, index) => (
                                        <div
                                            key={index}
                                            className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Archive className="h-4 w-4 text-muted-foreground" />
                                                <div>
                                                    <p className="font-medium text-sm">{backup.name}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {new Date(backup.timestamp).toLocaleString()} • {(backup.size / 1024).toFixed(1)} KB
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
