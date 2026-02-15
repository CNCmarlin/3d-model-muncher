import { LastRunLabel } from '@/components/common/LastRunLabel';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useConfig } from '@/context/ConfigContext';
import { useBackups } from '@/hooks/settings/useBackups';
import { useSettingsConfig } from '@/hooks/settings/useSettingsConfig';
import { Model } from '@/types/model';
import { Archive, Download, FileText, HardDrive, RefreshCw, RotateCcw, Save, Settings, Upload } from 'lucide-react';
import { useRef } from 'react';

type BackupSettingsProps = ReturnType<typeof useBackups> & {
    models: Model[];
    // Config Props
    configSettings?: ReturnType<typeof useSettingsConfig>;
};

export function BackupSettings({
    isCreatingBackup,
    isRestoring,
    backupHistory,
    restoreStrategy,
    setRestoreStrategy,
    collectionsRestoreStrategy,
    setCollectionsRestoreStrategy,
    backupFileInputRef,
    handleCreateBackup,
    handleRestoreFromFile,
    handleBackupFileRestore,
    models,
    configSettings
}: BackupSettingsProps) {
    const configFileInputRef = useRef<HTMLInputElement>(null);
    const { appConfig } = useConfig();

    return (
        <div className="space-y-6">
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

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Archive className="h-5 w-5 text-primary" />
                        Backup & Restore
                    </CardTitle>
                    <CardDescription>
                        Create rolling backups of your model metadata and restore from previous backups.
                        Backups include all *-munchie.json files with model metadata, tags, and settings, plus your collections.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Backup Section */}
                    <div className="space-y-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div className="space-y-1">
                                <h3 className="font-medium">Create Backup</h3>
                                <p className="text-sm text-muted-foreground">
                                    Backup all model metadata files to a compressed archive
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
                                    {isCreatingBackup ? 'Creating...' : 'Create Backup'}
                                </Button>
                                {appConfig?.lastRunTimestamps?.createBackup && (
                                    <LastRunLabel
                                        timestamp={appConfig.lastRunTimestamps.createBackup}
                                        className="text-[10px]"
                                    />
                                )}
                            </div>
                        </div>

                        {/* Backup Statistics */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Card>
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-primary" />
                                        <div>
                                            <p className="text-lg font-semibold">{models.length}</p>
                                            <p className="text-xs text-muted-foreground">JSON Files</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2">
                                        <HardDrive className="h-4 w-4 text-primary" />
                                        <div>
                                            <p className="text-lg font-semibold">
                                                {backupHistory.length > 0
                                                    ? `${(backupHistory[0]?.size / 1024).toFixed(1)}KB`
                                                    : '0KB'
                                                }
                                            </p>
                                            <p className="text-xs text-muted-foreground">Last Backup Size</p>
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
                                Restore model metadata from a previous backup file. Choose your restore strategy carefully.
                            </p>
                        </div>

                        {/* Restore Strategy Selection */}
                        <div className="space-y-3">
                            <Label>Restore Strategy</Label>
                            <Select
                                value={restoreStrategy}
                                onValueChange={(value: 'hash-match' | 'path-match' | 'force') => setRestoreStrategy(value)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="hash-match">
                                        <div className="font-medium">Hash Match <span className="text-xs text-muted-foreground sm:hidden">(Recommended)</span></div>
                                        <div className="text-xs text-muted-foreground hidden sm:block">
                                            Match files by content hash, fallback to path if needed
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="path-match">
                                        <div className="font-medium">Path Match</div>
                                        <div className="text-xs text-muted-foreground hidden sm:block">
                                            Only restore files that currently exist at their original paths
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="force">
                                        <div className="font-medium">Force Restore</div>
                                        <div className="text-xs text-muted-foreground hidden sm:block">
                                            Restore all files to original paths, create directories if needed
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Strategy explanations - mobile friendly */}
                            <div className="text-xs text-muted-foreground p-3 bg-muted/50 rounded-lg break-words overflow-x-hidden">
                                {restoreStrategy === 'hash-match' && (
                                    <div>
                                        <strong>Hash Match:</strong>
                                        <span className="block mt-1">
                                            Compares 3MF file hashes from backup with current files, then restores metadata to the matching munchie.json. Falls back to path matching if no hash match found.
                                        </span>
                                        <span className="block mt-1 text-primary font-semibold">Recommended for most users.</span>
                                    </div>
                                )}
                                {restoreStrategy === 'path-match' && (
                                    <div>
                                        <strong>Path Match:</strong>
                                        <span className="block mt-1">
                                            Only restores files that currently exist at their original backup locations. Does not create new files.
                                        </span>
                                        <span className="block mt-1 text-primary font-semibold">Use to update existing metadata only.</span>
                                    </div>
                                )}
                                {restoreStrategy === 'force' && (
                                    <div>
                                        <strong>Force Restore:</strong>
                                        <span className="block mt-1">
                                            Creates files at their original paths regardless of current state. Can overwrite existing files.
                                        </span>
                                        <span className="block mt-1 text-destructive font-semibold">Use to recover deleted files.</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Collections Restore Strategy */}
                        <div className="space-y-3">
                            <Label>Collections Restore</Label>
                            <Select
                                value={collectionsRestoreStrategy}
                                onValueChange={(value: 'merge' | 'replace') => setCollectionsRestoreStrategy(value)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="merge">
                                        <div className="font-medium">Merge <span className="text-xs text-muted-foreground sm:hidden">(Default)</span></div>
                                        <div className="text-xs text-muted-foreground hidden sm:block">
                                            Combine backup collections with existing ones by ID; backup wins on conflict
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="replace">
                                        <div className="font-medium">Replace</div>
                                        <div className="text-xs text-muted-foreground hidden sm:block">
                                            Overwrite existing collections with those from the backup
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <div className="text-xs text-muted-foreground p-3 bg-muted/50 rounded-lg">
                                {collectionsRestoreStrategy === 'merge' ? (
                                    <>
                                        <strong>Merge:</strong> Backup collections are merged with existing ones by ID. Existing collections not in the backup are kept.
                                    </>
                                ) : (
                                    <>
                                        <strong>Replace:</strong> Existing collections are replaced entirely by the backup collections.
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <Button
                                onClick={handleRestoreFromFile}
                                disabled={isRestoring}
                                variant="outline"
                                className="gap-2"
                            >
                                {isRestoring ? (
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                    <RotateCcw className="h-4 w-4" />
                                )}
                                {isRestoring ? 'Restoring...' : 'Restore from File'}
                            </Button>
                            {/* Hidden Input for file selection */}
                            <input
                                type="file"
                                ref={backupFileInputRef}
                                onChange={handleBackupFileRestore}
                                accept=".json,.gz"
                                className="hidden"
                            />
                        </div>

                        <div className="text-xs text-muted-foreground">
                            <strong>Supported formats:</strong> .gz (compressed backup), .json (plain backup)
                            <br />
                            <strong>Note:</strong> Restores model metadata files and collections. Actual 3MF/STL models are not included in backups.
                        </div>
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
                                                        {new Date(backup.timestamp).toLocaleString()} • {(backup.size / 1024).toFixed(1)}KB
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
