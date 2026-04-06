import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Save, Blocks, Cpu, Database, Boxes } from 'lucide-react';
import { CorePlugins } from '@/plugins/registry';
import { AppConfig } from '@/types/config';
import { toast } from 'sonner';

interface PluginsSettingsProps {
    config: AppConfig;
    onConfigChange: (updated: AppConfig) => void;
    onSave: (config: AppConfig) => void;
}

const PLUGIN_METADATA: Record<string, { title: string; description: string; icon: React.ReactNode }> = {
    'genai': {
        title: 'Generative AI',
        description: 'Enables automatic smart-tagging and metadata generation for your models.',
        icon: <Cpu className="w-6 h-6 text-primary" />
    },
    'spoolman': {
        title: 'Spoolman Integration',
        description: 'Advanced material management integration for estimating filament costs and weights.',
        icon: <Database className="w-6 h-6 text-primary" />
    },
    'projects': {
        title: 'Project Workspace',
        description: 'An interactive 3D canvas and workspace for organizing models into functional build plates and collections.',
        icon: <Boxes className="w-6 h-6 text-primary" />
    }
};

export const PluginsSettings_DB: React.FC<PluginsSettingsProps> = ({ config, onConfigChange, onSave }) => {

    const handleTogglePlugin = (id: string, enabled: boolean) => {
        const newPlugins = {
            ...(config.plugins || {}),
            [id]: enabled,
        };

        const newConfig = {
            ...config,
            plugins: newPlugins
        };

        onConfigChange(newConfig);
    };

    const handleSaveAll = () => {
        onSave(config);
        toast.success("Plugin settings saved successfully");
    };

    return (
        <div className="space-y-8 pb-8">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Blocks className="w-5 h-5 text-muted-foreground" />
                        <CardTitle>Plugin Manager</CardTitle>
                    </div>
                    <CardDescription>
                        Enable or disable core system features and integrations. Disabling a plugin will immediately unmount its UI components.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-0">
                    <div className="divide-y border rounded-lg overflow-hidden">
                        {CorePlugins.map((plugin) => {
                            const meta = PLUGIN_METADATA[plugin.id] || {
                                title: plugin.id,
                                description: `System plugin: ${plugin.id}`,
                                icon: <Blocks className="w-6 h-6 text-muted-foreground" />
                            };

                            // Default is enabled unless explicitly false
                            const isEnabled = config.plugins?.[plugin.id] !== false;

                            return (
                                <div key={plugin.id} className="flex items-start sm:items-center justify-between p-4 bg-card hover:bg-muted/30 transition-colors">
                                    <div className="flex items-start gap-4 pr-4">
                                        <div className="bg-background border rounded-lg p-2 shrink-0">
                                            {meta.icon}
                                        </div>
                                        <div className="flex flex-col gap-1 mt-0.5">
                                            <h4 className="text-sm font-semibold leading-none">{meta.title}</h4>
                                            <p className="text-sm text-muted-foreground leading-snug">
                                                {meta.description}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="shrink-0 mt-1 sm:mt-0 pl-2">
                                        <Switch
                                            checked={isEnabled}
                                            onCheckedChange={(checked) => handleTogglePlugin(plugin.id, checked)}
                                            aria-label={`Toggle ${meta.title}`}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end pt-4">
                <Button onClick={handleSaveAll} className="gap-2 w-full sm:w-auto">
                    <Save className="w-4 h-4" />
                    Save Plugin Settings
                </Button>
            </div>
        </div>
    );
};
