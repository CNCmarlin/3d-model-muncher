import { GenerateThumbnailsDialog } from '@/components/modals/GenerateThumbnailsDialog';
import { LastRunLabel } from '@/components/shared/LastRunLabel';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { LICENSES } from '@/constants/licenses';
import { Category } from '@/types/category';
import { AppConfig } from '@/types/config';
import { Model } from '@/types/model';
import { ConfigManager } from '@/utils/configManager';
import { applyThemeColor } from '@/utils/themeUtils';
import { Box, Download, Edit2, Loader2, Save, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

type GeneralSettingsProps = {
    localConfig: AppConfig;
    setLocalConfig: (config: AppConfig) => void;
    handleSaveConfig: (config?: AppConfig) => Promise<void>;
    models: Model[];
    categories: Category[];
    onModelClick?: (model: Model) => void;
    onConfigUpdate?: (config: AppConfig) => void;
};

export function GeneralSettings({
    localConfig,
    setLocalConfig,
    handleSaveConfig,
    categories,
    onConfigUpdate
}: GeneralSettingsProps) {

    // --- Local State for UI ---
    const [unsavedPrimaryColor, setUnsavedPrimaryColor] = useState<string | null>(null);
    const [unsavedDefaultModelColor, setUnsavedDefaultModelColor] = useState<string | null>(null);
    const colorInputRef = useRef<HTMLInputElement>(null);
    const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);
    const [generationResults, setGenerationResults] = useState<{
        success: boolean;
        processed: number;
        skipped: number;
        errors: { id: string; error: string }[];
        aborted?: boolean;
    } | null>(null);
    const [showGenerateDialog, setShowGenerateDialog] = useState(false);

    // Purge thumbnails state
    const [isPurging, setIsPurging] = useState(false);
    const [purgePreview, setPurgePreview] = useState<{
        files: { path: string; name: string; size: number; hasOtherImages: boolean }[];
        totalCount: number;
        totalSize: number;
        withOtherImages: number;
        withoutOtherImages: number;
    } | null>(null);
    const [showPurgeDialog, setShowPurgeDialog] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [skipNoImages, setSkipNoImages] = useState(true); // default: protect models with no fallback

    // Model Directory State
    const [isEditingModelDir, setIsEditingModelDir] = useState(false);
    const [tempModelDir, setTempModelDir] = useState('');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

    // --- Helper Functions ---
    const handleConfigFieldChange = (field: string, value: any) => {
        const updatedConfig = { ...localConfig };

        // Handle nested fields
        if (field.includes('.')) {
            const [section, key] = field.split('.');
            if (section === 'settings') {
                updatedConfig.settings = { ...updatedConfig.settings, [key]: value };
            } else if (section === 'filters') {
                updatedConfig.filters = { ...updatedConfig.filters, [key]: value };
            }
        } else {
            (updatedConfig as any)[field] = value;
        }

        setLocalConfig(updatedConfig);

        if (updatedConfig.settings.autoSave) {
            handleSaveConfig(updatedConfig);
        }
    };

    const handleLoadServerConfig = async () => {
        try {
            const resp = await fetch('/api/load-config');
            if (!resp.ok) throw new Error('Failed to load config');
            const data = await resp.json();
            if (data.success && data.config) {
                setLocalConfig(data.config);
                onConfigUpdate?.(data.config);
                toast.success('Configuration loaded from server');
            } else {
                toast.error('Failed to load configuration');
            }
        } catch (error) {
            console.error('Load config error:', error);
            toast.error('Error loading configuration');
        }
    };

    const handleGenerateThumbnails = () => {
        setGenerationResults(null);
        setShowGenerateDialog(true);
    };

    const handleStartGeneration = async (options: { force: boolean; skipEmbedded: boolean }) => {
        setIsGeneratingThumbnails(true);
        setGenerationResults(null);
        // Toast is optional now since we have UI feedback, but good for persistence context
        // toast.info('Starting thumbnail generation...'); 

        try {
            const resp = await fetch('/api/generate-thumbnails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    force: options.force,
                    skipEmbedded: options.skipEmbedded
                })
            });
            const data = await resp.json();

            // Set results regardless of success/fail to show them in dialog
            setGenerationResults(data);

            if (data.success) {
                toast.success(`Thumbnail generation finished: ${data.processed} processed, ${data.skipped} skipped.`);
                // Save timestamp
                const updatedConfig = {
                    ...localConfig,
                    lastRunTimestamps: {
                        ...localConfig.lastRunTimestamps,
                        generateThumbnails: new Date().toISOString()
                    }
                };
                setLocalConfig(updatedConfig);
                handleSaveConfig(updatedConfig);
            } else {
                if (data.aborted) {
                    toast.info('Generation cancelled.');
                } else {
                    toast.error(`Generation failed: ${data.error}`);
                }
            }
        } catch (error: any) {
            console.error('Error starting thumbnail generation:', error);
            toast.error('Network error starting generation');
            setGenerationResults({
                success: false,
                processed: 0,
                skipped: 0,
                errors: [{ id: 'system', error: error.message || 'Unknown network error' }]
            });
        } finally {
            setIsGeneratingThumbnails(false);
        }
    };

    const handleCancelThumbnails = async () => {
        try {
            await fetch('/api/tools/cancel-thumbnails', { method: 'POST' });
            toast.info('Cancellation requested...');
            setIsGeneratingThumbnails(false);
        } catch (error) {
            console.error('Error cancelling:', error);
        }
    };

    const handlePurgePreview = async () => {
        setShowPurgeDialog(true);
        setIsScanning(true);
        setPurgePreview(null);
        try {
            const resp = await fetch('/api/admin/purge-thumbnails-preview', { method: 'POST' });
            const data = await resp.json();
            if (data.success) {
                setPurgePreview(data);
            } else {
                toast.error(`Preview failed: ${data.error}`);
                setShowPurgeDialog(false);
            }
        } catch (error) {
            console.error('Purge preview error:', error);
            toast.error('Failed to scan for thumbnails');
            setShowPurgeDialog(false);
        } finally {
            setIsScanning(false);
        }
    };

    const handlePurgeConfirm = async () => {
        setIsPurging(true);
        try {
            const resp = await fetch('/api/admin/purge-thumbnails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skipWithoutOtherImages: skipNoImages })
            });
            const data = await resp.json();
            if (data.success) {
                const skippedMsg = data.skipped > 0 ? ` (${data.skipped} skipped — no fallback images)` : '';
                toast.success(`Deleted ${data.deleted} thumbnails, cleaned ${data.munchiesCleaned} metadata files.${skippedMsg}`);
                // Save timestamp
                const updatedConfig = {
                    ...localConfig,
                    lastRunTimestamps: {
                        ...localConfig.lastRunTimestamps,
                        purgeThumbnails: new Date().toISOString()
                    }
                };
                setLocalConfig(updatedConfig);
                handleSaveConfig(updatedConfig);
            } else {
                toast.error(`Purge failed: ${data.error}`);
            }
        } catch (error) {
            console.error('Purge error:', error);
            toast.error('Failed to purge thumbnails');
        } finally {
            setIsPurging(false);
            setShowPurgeDialog(false);
            setPurgePreview(null);
        }
    };

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    return (
        <div className="space-y-6">
            {/* Application Settings (Theme, View, AutoSave) */}
            <Card>
                <CardHeader>
                    <CardTitle>Application Settings</CardTitle>
                    <CardDescription>Configure default behavior and preferences.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Theme */}
                        <div className="space-y-2">
                            <Label htmlFor="default-theme">Default Theme</Label>
                            <Select
                                value={localConfig.settings?.defaultTheme ?? 'system'}
                                onValueChange={(value) => handleConfigFieldChange('settings.defaultTheme', value)}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="light">Light</SelectItem>
                                    <SelectItem value="dark">Dark</SelectItem>
                                    <SelectItem value="system">System</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* View */}
                        <div className="space-y-2">
                            <Label htmlFor="default-view">Default View</Label>
                            <Select
                                value={localConfig.settings?.defaultView ?? 'grid'}
                                onValueChange={(value) => handleConfigFieldChange('settings.defaultView', value)}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="grid">Grid</SelectItem>
                                    <SelectItem value="list">List</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Grid Density */}
                        <div className="space-y-2">
                            <Label htmlFor="default-density">Default Grid Density</Label>
                            <Select
                                value={String(localConfig.settings?.defaultGridDensity ?? 4)}
                                onValueChange={(value) => handleConfigFieldChange('settings.defaultGridDensity', parseInt(value))}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">1 Column</SelectItem>
                                    <SelectItem value="2">2 Columns</SelectItem>
                                    <SelectItem value="3">3 Columns</SelectItem>
                                    <SelectItem value="4">4 Columns</SelectItem>
                                    <SelectItem value="5">5 Columns</SelectItem>
                                    <SelectItem value="6">6 Columns</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Model View */}
                        <div className="space-y-2">
                            <Label htmlFor="default-model-view">Default Model View</Label>
                            <Select
                                value={localConfig.settings?.defaultModelView ?? '3d'}
                                onValueChange={(value) => handleConfigFieldChange('settings.defaultModelView', value)}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="3d">Interactive 3D Viewer</SelectItem>
                                    <SelectItem value="images">Image Carousel</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Model Card Fields */}
                        <div className="md:col-span-2 space-y-2">
                            <Label>Model Card Fields</Label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-xs">Primary Field</Label>
                                    <Select
                                        value={localConfig.settings?.modelCardPrimary ?? 'none'}
                                        onValueChange={(value) => handleConfigFieldChange('settings.modelCardPrimary', value)}
                                    >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">None</SelectItem>
                                            <SelectItem value="printTime">Print Time</SelectItem>
                                            <SelectItem value="filamentUsed">Filament Used</SelectItem>
                                            <SelectItem value="fileSize">File Size</SelectItem>
                                            <SelectItem value="category">Category</SelectItem>
                                            <SelectItem value="designer">Designer</SelectItem>
                                            <SelectItem value="layerHeight">Layer Height</SelectItem>
                                            <SelectItem value="nozzle">Nozzle Size</SelectItem>
                                            <SelectItem value="price">Price</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs">Secondary Field</Label>
                                    <Select
                                        value={localConfig.settings?.modelCardSecondary ?? 'none'}
                                        onValueChange={(value) => handleConfigFieldChange('settings.modelCardSecondary', value)}
                                    >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">None</SelectItem>
                                            <SelectItem value="printTime">Print Time</SelectItem>
                                            <SelectItem value="filamentUsed">Filament Used</SelectItem>
                                            <SelectItem value="fileSize">File Size</SelectItem>
                                            <SelectItem value="category">Category</SelectItem>
                                            <SelectItem value="designer">Designer</SelectItem>
                                            <SelectItem value="layerHeight">Layer Height</SelectItem>
                                            <SelectItem value="nozzle">Nozzle Size</SelectItem>
                                            <SelectItem value="price">Price</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>

                        {/* Verbose Scan Logs Switch */}
                        <div className="flex items-center space-x-3 pt-2">
                            <Switch
                                checked={localConfig.settings?.verboseScanLogs ?? false}
                                onCheckedChange={(checked) => handleConfigFieldChange('settings.verboseScanLogs', checked)}
                                id="verbose-scan"
                            />
                            <div className="flex flex-col">
                                <Label htmlFor="verbose-scan">Verbose Scan Logs</Label>
                                <span className="text-xs text-muted-foreground">Show detailed output during library scans (useful for debugging)</span>
                            </div>
                        </div>

                        {/* AutoSave */}
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="auto-save">Auto Save</Label>
                                <p className="text-sm text-muted-foreground">Automatically save changes</p>
                            </div>
                            <Switch
                                id="auto-save"
                                checked={localConfig.settings?.autoSave ?? true}
                                onCheckedChange={(checked) => handleConfigFieldChange('settings.autoSave', checked)}
                            />
                        </div>

                        {/* Database Backend Toggle */}
                        <div className="flex items-center justify-between border-l-4 border-yellow-500 pl-4 bg-yellow-50 dark:bg-yellow-950/20 p-4 rounded-r-md">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="database-backend">Database Backend</Label>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${localConfig.settings?.useDatabaseBackend
                                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                        }`}>
                                        {localConfig.settings?.useDatabaseBackend ? 'Database Mode' : 'Legacy Mode'}
                                    </span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Use new Prisma database backend (Phase 3+)
                                </p>
                                <p className="text-xs text-yellow-700 dark:text-yellow-400 font-medium">
                                    ⚠️ Experimental - Requires server restart to take effect
                                </p>
                            </div>
                            <Switch
                                id="database-backend"
                                checked={localConfig.settings?.useDatabaseBackend ?? false}
                                onCheckedChange={(checked) => {
                                    handleConfigFieldChange('settings.useDatabaseBackend', checked);
                                    toast.info('Database mode updated. Restart server to apply changes.');
                                }}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Default Filters (Restored Verbatim + Card Wrapper) */}
            <Card>
                <CardHeader>
                    <CardTitle>Default Filters</CardTitle>
                    <CardDescription>Set default filter values when the app starts</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>Default Category</Label>
                            <Select
                                value={localConfig.filters?.defaultCategory ?? 'all'}
                                onValueChange={(value: string) => handleConfigFieldChange('filters.defaultCategory', value)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Categories</SelectItem>
                                    {(categories || []).map((category) => (
                                        <SelectItem key={category.id} value={category.id}>
                                            {category.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Default Print Status</Label>
                            <Select
                                value={localConfig.filters?.defaultPrintStatus ?? 'all'}
                                onValueChange={(value: string) => handleConfigFieldChange('filters.defaultPrintStatus', value)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="printed">Printed</SelectItem>
                                    <SelectItem value="not-printed">Not Printed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Default License</Label>
                            <Select
                                value={localConfig.filters?.defaultLicense ?? 'all'}
                                onValueChange={(value: string) => handleConfigFieldChange('filters.defaultLicense', value)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Licenses</SelectItem>
                                    {LICENSES.map((lic) => (
                                        <SelectItem key={lic} value={lic}>{lic}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Default Sort By</Label>
                            <Select
                                value={localConfig.filters?.defaultSortBy ?? 'none'}
                                onValueChange={(value: string) => handleConfigFieldChange('filters.defaultSortBy', value)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Default</SelectItem>
                                    <SelectItem value="modified_desc">Recently modified (newest)</SelectItem>
                                    <SelectItem value="modified_asc">Modified (oldest)</SelectItem>
                                    <SelectItem value="name_asc">Name A → Z</SelectItem>
                                    <SelectItem value="name_desc">Name Z → A</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Appearance & Viewer */}
            <Card>
                <CardHeader>
                    <CardTitle>Appearance & Viewer</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* 1. Default Model Color */}
                        <div className="flex flex-col">
                            <Label className="text-xs mb-2">Default Model Color</Label>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <div className="relative">
                                        <input
                                            ref={colorInputRef}
                                            type="color"
                                            value={unsavedDefaultModelColor ?? localConfig.settings?.defaultModelColor ?? '#aaaaaa'}
                                            onChange={(e: any) => setUnsavedDefaultModelColor(e.target.value)}
                                            title="Default model color"
                                            aria-label="Default model color picker"
                                            className="w-10 h-10 p-0 border-0 rounded-full overflow-hidden cursor-pointer"
                                        />
                                    </div>
                                    <div className="text-xs font-mono">{(unsavedDefaultModelColor || localConfig.settings?.defaultModelColor || '#aaaaaa').toUpperCase()}</div>
                                </div>

                                <div className="flex items-center space-x-2">
                                    <Button
                                        size="sm"
                                        onClick={() => {
                                            handleConfigFieldChange('settings.defaultModelColor', unsavedDefaultModelColor || '#aaaaaa');
                                            toast.success('Default model color saved');
                                        }}
                                        title="Save color"
                                    >
                                        Save
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            const defaultColor = ConfigManager.getDefaultConfig().settings.defaultModelColor || '#aaaaaa';
                                            setUnsavedDefaultModelColor(defaultColor);
                                        }}
                                        title="Reset color"
                                    >
                                        Reset
                                    </Button>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                                Color used by the 3D viewer when a model file has no color.
                            </p>
                        </div>

                        {/* 2. Application Theme Color */}
                        <div className="flex flex-col">
                            <Label className="text-xs mb-2">Application Theme</Label>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <div className="relative">
                                        <div className="w-10 h-10 rounded-full border border-border shadow-sm flex items-center justify-center overflow-hidden transition-transform hover:scale-105 relative">
                                            <input
                                                type="color"
                                                className="absolute -top-2 -left-2 w-16 h-16 p-0 cursor-pointer border-0"
                                                value={unsavedPrimaryColor ?? localConfig.settings?.primaryColor ?? "#7c3aed"}
                                                onChange={(e) => {
                                                    const newColor = e.target.value;
                                                    setUnsavedPrimaryColor(newColor);
                                                    applyThemeColor(newColor);
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div className="text-xs font-mono">{(unsavedPrimaryColor || localConfig.settings?.primaryColor || "#7c3aed").toUpperCase()}</div>
                                </div>

                                <div className="flex items-center space-x-2">
                                    <Button
                                        size="sm"
                                        onClick={() => {
                                            handleConfigFieldChange('settings.primaryColor', unsavedPrimaryColor || '#7c3aed');
                                            toast.success('Theme color saved');
                                        }}
                                        title="Save theme"
                                    >
                                        Save
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setUnsavedPrimaryColor(null);
                                            applyThemeColor(null);
                                            handleConfigFieldChange('settings.primaryColor', null);
                                        }}
                                        title="Reset to default purple"
                                    >
                                        Reset
                                    </Button>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                                Primary accent color for the sidebar, buttons, and active states.
                            </p>
                        </div>
                    </div>

                    {/* 3. Thumbnail Generation Section */}
                    <div className="pt-4 border-t mt-4">
                        <h4 className="text-sm font-medium mb-2">Thumbnail Generation</h4>
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Generate Missing Thumbnails</p>
                                <p className="text-xs text-muted-foreground">
                                    Create clean PNG snapshots for models that don't have them.
                                </p>
                                <LastRunLabel timestamp={localConfig.lastRunTimestamps?.generateThumbnails} />
                            </div>

                            {isGeneratingThumbnails ? (
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={handleCancelThumbnails}
                                    className="animate-pulse"
                                >
                                    <X className="mr-2 h-4 w-4" />
                                    Stop
                                </Button>
                            ) : (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleGenerateThumbnails}
                                >
                                    <Box className="mr-2 h-4 w-4" />
                                    Generate All
                                </Button>
                            )}
                        </div>

                        {/* Remove Generated Thumbnails */}
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border mt-2">
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Remove Generated Thumbnails</p>
                                <p className="text-xs text-muted-foreground">
                                    Find and delete all auto-generated thumbnail files (*.stl-thumb.png, *.3mf-thumb.png).
                                </p>
                                <LastRunLabel timestamp={localConfig.lastRunTimestamps?.purgeThumbnails} />
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handlePurgePreview}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Find & Delete
                            </Button>
                        </div>

                        {/* Purge Confirmation Dialog */}
                        {showPurgeDialog && (() => {
                            // Show scanning spinner while waiting for preview
                            if (isScanning || !purgePreview) {
                                return (
                                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                                        <div className="bg-background border rounded-lg shadow-lg max-w-lg w-full mx-4 p-6 space-y-4">
                                            <h3 className="text-lg font-semibold">Scanning Library...</h3>
                                            <div className="flex flex-col items-center justify-center py-8 gap-3">
                                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                                <p className="text-sm text-muted-foreground">Searching for generated thumbnails across your model library...</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            const filteredFiles = skipNoImages
                                ? purgePreview.files.filter(f => f.hasOtherImages)
                                : purgePreview.files;
                            const filteredSize = filteredFiles.reduce((sum, f) => sum + f.size, 0);
                            const deleteCount = filteredFiles.length;

                            return (
                                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                                    <div className="bg-background border rounded-lg shadow-lg max-w-lg w-full mx-4 p-6 space-y-4">
                                        <h3 className="text-lg font-semibold">Confirm Thumbnail Removal</h3>
                                        {purgePreview.totalCount === 0 ? (
                                            <>
                                                <p className="text-sm text-muted-foreground">No generated thumbnails found.</p>
                                                <div className="flex justify-end">
                                                    <Button variant="outline" onClick={() => setShowPurgeDialog(false)}>Close</Button>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                                                    <p className="text-sm font-medium text-destructive">
                                                        Found {purgePreview.totalCount} generated thumbnail{purgePreview.totalCount !== 1 ? 's' : ''} ({formatBytes(purgePreview.totalSize)}).
                                                    </p>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {purgePreview.withOtherImages} have embedded/extracted images • {purgePreview.withoutOtherImages} are the only image for their model.
                                                    </p>
                                                </div>

                                                {/* Skip checkbox */}
                                                <label className="flex items-center gap-2 p-2 rounded border bg-muted/30 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={skipNoImages}
                                                        onChange={(e) => setSkipNoImages(e.target.checked)}
                                                        className="w-4 h-4 rounded"
                                                    />
                                                    <div>
                                                        <p className="text-sm font-medium">Skip models with no other images</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            Protects {purgePreview.withoutOtherImages} model{purgePreview.withoutOtherImages !== 1 ? 's' : ''} that would lose their only image.
                                                        </p>
                                                    </div>
                                                </label>

                                                <div className="max-h-48 overflow-y-auto border rounded p-2 text-xs font-mono space-y-0.5">
                                                    {purgePreview.files.map((f, i) => {
                                                        const willSkip = skipNoImages && !f.hasOtherImages;
                                                        return (
                                                            <div key={i} className={`flex justify-between items-center ${willSkip ? 'opacity-40 line-through' : 'text-muted-foreground'}`}>
                                                                <span className="truncate mr-2">{f.path}</span>
                                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                                    {!f.hasOtherImages && (
                                                                        <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400">
                                                                            only image
                                                                        </span>
                                                                    )}
                                                                    <span>{formatBytes(f.size)}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                <div className="flex justify-between items-center">
                                                    <p className="text-xs text-muted-foreground">
                                                        Will delete: {deleteCount} file{deleteCount !== 1 ? 's' : ''} ({formatBytes(filteredSize)})
                                                    </p>
                                                    <div className="flex gap-2">
                                                        <Button variant="outline" onClick={() => setShowPurgeDialog(false)} disabled={isPurging}>
                                                            Cancel
                                                        </Button>
                                                        <Button variant="destructive" onClick={handlePurgeConfirm} disabled={isPurging || deleteCount === 0}>
                                                            {isPurging ? 'Deleting...' : `Delete ${deleteCount} Files`}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </CardContent>
            </Card>

            {/* G-Code Settings */}
            <Card>
                <CardHeader>
                    <CardTitle>G-Code Processing</CardTitle>
                    <CardDescription>
                        Control how G-code files are handled after analysis.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {/* Storage behavior radio group */}
                        <div className="space-y-2">
                            <Label>G-code Storage Behavior</Label>
                            <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="radio"
                                        id="gcode-parse-only"
                                        name="gcode-storage"
                                        value="parse-only"
                                        checked={localConfig.settings?.gcodeStorageBehavior === 'parse-only'}
                                        onChange={(e) => {
                                            if (e.target.checked) handleConfigFieldChange('settings.gcodeStorageBehavior', 'parse-only');
                                        }}
                                        className="w-4 h-4"
                                    />
                                    <Label htmlFor="gcode-parse-only" className="font-normal cursor-pointer">
                                        Analyze & Delete (Save Space)
                                    </Label>

                                    <input
                                        type="radio"
                                        id="gcode-save-link"
                                        name="gcode-storage"
                                        value="save-and-link"
                                        checked={!localConfig.settings?.gcodeStorageBehavior || localConfig.settings?.gcodeStorageBehavior === 'save-and-link'}
                                        onChange={(e) => {
                                            if (e.target.checked) handleConfigFieldChange('settings.gcodeStorageBehavior', 'save-and-link');
                                        }}
                                        className="w-4 h-4 ml-4"
                                    />
                                    <Label htmlFor="gcode-save-link" className="font-normal cursor-pointer">
                                        Save file and add to related files
                                    </Label>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Choose whether to save G-code files alongside models or just extract the metadata
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Model Directory */}
            {/* ... other cards ... */}

            <GenerateThumbnailsDialog
                isOpen={showGenerateDialog}
                onClose={() => setShowGenerateDialog(false)}
                onStart={handleStartGeneration}
                onStop={handleCancelThumbnails}
                isGenerating={isGeneratingThumbnails}
                results={generationResults}
            />

            <Card>
                <CardHeader>
                    <CardTitle>Library Location</CardTitle>
                    <CardDescription>
                        The physical directory where your 3D models are stored.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="model-dir">Model Directory</Label>
                                <div className="flex gap-2 items-center">
                                    <Input
                                        id="model-dir"
                                        className="flex-1"
                                        value={isEditingModelDir ? tempModelDir : (localConfig.settings?.modelDirectory ?? './models')}
                                        readOnly={!isEditingModelDir}
                                        placeholder="./models"
                                        onChange={(e: any) => { if (isEditingModelDir) setTempModelDir(e.target.value); }}
                                    />
                                    {!isEditingModelDir ? (
                                        <Button
                                            onClick={() => {
                                                setTempModelDir(localConfig.settings.modelDirectory || './models');
                                                setIsEditingModelDir(true);
                                            }}
                                            title="Edit model directory"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </Button>
                                    ) : (
                                        <div className="flex gap-2">
                                            <Button
                                                disabled={saveStatus === 'saving'}
                                                onClick={async () => {
                                                    try {
                                                        setSaveStatus('saving');
                                                        const newConfig = { ...localConfig, settings: { ...localConfig.settings, modelDirectory: tempModelDir } } as AppConfig;
                                                        const resp = await fetch('/api/save-config', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify(newConfig)
                                                        });
                                                        if (!resp.ok) {
                                                            const txt = await resp.text().catch(() => '');
                                                            throw new Error(`Save failed: ${resp.status} ${txt}`);
                                                        }
                                                        const body = await resp.json().catch(() => null);
                                                        if (!body || body.success === false) throw new Error(body?.error || 'Unknown error');

                                                        // Update local config with server-supplied final config when available
                                                        const updated = body.config || newConfig;
                                                        setLocalConfig(updated);
                                                        onConfigUpdate?.(updated);
                                                        setSaveStatus('saved');
                                                        toast.success('Model directory saved. The server will serve files from the new location.');
                                                        setIsEditingModelDir(false);
                                                        setTempModelDir('');
                                                    } catch (err: any) {
                                                        console.error('Failed to save model directory:', err);
                                                        setSaveStatus('error');
                                                        toast.error('Failed to save model directory: ' + (err?.message || ''));
                                                    } finally {
                                                        setTimeout(() => setSaveStatus('idle'), 2500);
                                                    }
                                                }}
                                            >
                                                {saveStatus === 'saving' ? (
                                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                                ) : (
                                                    <Save className="w-4 h-4" />
                                                )}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                onClick={() => {
                                                    setIsEditingModelDir(false);
                                                    setTempModelDir('');
                                                }}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="col-span-1 md:col-span-2 text-sm text-muted-foreground">
                                <p>
                                    Server reads model files from this directory. Enter an absolute path (e.g. <code>C:\\models</code>) or a path relative to the app (e.g. <code>./models</code>). Make sure the server process can write to the folder (network shares or external drives may need extra permissions).
                                    <br></br>(Unraid & Docker handle mappings differently and should use the default <code>./models</code>).
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Apply Server Config */}
            <Card>
                <CardHeader>
                    <CardTitle>Server Configuration</CardTitle>
                    <CardDescription>
                        Load the authoritative configuration from the server's <code>data/config.json</code>. This will clear local UI overrides.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-3">
                        <Button variant="outline" onClick={handleLoadServerConfig} className="gap-2">
                            <Download className="h-4 w-4" />
                            Load Configuration
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
