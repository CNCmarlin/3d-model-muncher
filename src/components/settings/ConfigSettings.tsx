import { useSettingsConfig } from '@/hooks/settings/useSettingsConfig';
import { Download, RefreshCw, Save, Upload } from 'lucide-react';
import { useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type ConfigSettingsProps = ReturnType<typeof useSettingsConfig>;

export function ConfigSettings({
    handleExportConfig,
    handleImportConfig,
    handleResetConfig,
    handleSaveConfig
}: ConfigSettingsProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Configuration Management</CardTitle>
                <CardDescription>
                    Import, export, and reset your configuration settings.
                    Your settings are stored in your browser's local storage, not in the default-config.json file.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Button onClick={handleExportConfig} className="gap-2">
                        <Download className="h-4 w-4" />
                        Export Config
                    </Button>

                    <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="gap-2">
                        <Upload className="h-4 w-4" />
                        Import Config
                    </Button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImportConfig}
                        accept=".json"
                        className="hidden"
                    />

                    <Button onClick={handleResetConfig} variant="destructive" className="gap-2">
                        <RefreshCw className="h-4 w-4" />
                        Reset to Defaults
                    </Button>
                </div>

                <Separator />

                <div className="space-y-4">
                    <h3 className="font-medium">Manual Save</h3>
                    <p className="text-sm text-muted-foreground">
                        Save your current configuration manually. This is useful when auto-save is disabled.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                        <Button onClick={() => handleSaveConfig()} className="gap-2">
                            <Save className="h-4 w-4" />
                            Save Configuration
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
