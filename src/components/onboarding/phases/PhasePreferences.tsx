
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppConfig } from "@/types/config";
import { applyThemeColor } from "@/utils/themeUtils";
import { Check, Palette, Settings } from "lucide-react";
import { useState } from "react";

interface PhasePreferencesProps {
    config: AppConfig;
    onUpdateConfig: (newConfig: AppConfig) => void;
    onNext: () => void;
}

export function PhasePreferences({ config, onUpdateConfig }: PhasePreferencesProps) {
    // Local state for immediate feedback before saving
    const [primaryColor, setPrimaryColor] = useState(config.settings.primaryColor || "#7c3aed");
    const [defaultModelColor, setDefaultModelColor] = useState(config.settings.defaultModelColor || "#aaaaaa");

    // Helper to update settings
    const updateSetting = (key: keyof AppConfig['settings'], value: any) => {
        const updated = {
            ...config,
            settings: {
                ...config.settings,
                [key]: value
            }
        };
        onUpdateConfig(updated);
    };

    const handleThemeChange = (color: string) => {
        setPrimaryColor(color);
        applyThemeColor(color);
        updateSetting('primaryColor', color);
    };

    const handleModelColorChange = (color: string) => {
        setDefaultModelColor(color);
        updateSetting('defaultModelColor', color);
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Appearance Section */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Palette className="w-5 h-5 text-primary" />
                    Appearance
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 border rounded-xl bg-card">
                    {/* Theme Color */}
                    <div className="space-y-3">
                        <Label htmlFor="theme-color">Application Theme</Label>
                        <div className="flex items-center gap-3">
                            <div className="relative w-10 h-10 rounded-full overflow-hidden border border-border shadow-sm hover:scale-105 transition-transform">
                                <input
                                    type="color"
                                    id="theme-color"
                                    value={primaryColor}
                                    onChange={(e) => handleThemeChange(e.target.value)}
                                    className="absolute -top-2 -left-2 w-16 h-16 p-0 cursor-pointer border-0"
                                />
                            </div>
                            <span className="font-mono text-xs text-muted-foreground">{primaryColor.toUpperCase()}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Primary accent color for the sidebar, buttons, and active states.
                        </p>
                    </div>

                    {/* Default Model Color */}
                    <div className="space-y-3">
                        <Label htmlFor="model-color">Default Model Color</Label>
                        <div className="flex items-center gap-3">
                            <div className="relative w-10 h-10 rounded-full overflow-hidden border border-border shadow-sm hover:scale-105 transition-transform">
                                <input
                                    type="color"
                                    id="model-color"
                                    value={defaultModelColor}
                                    onChange={(e) => handleModelColorChange(e.target.value)}
                                    className="absolute -top-2 -left-2 w-16 h-16 p-0 cursor-pointer border-0"
                                />
                            </div>
                            <span className="font-mono text-xs text-muted-foreground">{defaultModelColor.toUpperCase()}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Color used by the 3D viewer when a model file has no color.
                        </p>
                    </div>
                </div>
            </div>

            {/* View Options Section */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Settings className="w-5 h-5 text-primary" />
                    View Options
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 border rounded-xl bg-card">
                    {/* Default View */}
                    <div className="space-y-2">
                        <Label>Default View</Label>
                        <Select
                            value={config.settings.defaultView || 'grid'}
                            onValueChange={(val) => updateSetting('defaultView', val)}
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
                        <Label>Grid Density</Label>
                        <Select
                            value={String(config.settings.defaultGridDensity || 4)}
                            onValueChange={(val) => updateSetting('defaultGridDensity', parseInt(val))}
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

                    {/* Default Model View */}
                    <div className="space-y-2">
                        <Label>Model Viewer</Label>
                        <Select
                            value={config.settings.defaultModelView || '3d'}
                            onValueChange={(val) => updateSetting('defaultModelView', val)}
                        >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="3d">Interactive 3D</SelectItem>
                                <SelectItem value="images">Image Carousel</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Model Card Fields */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold">Model Card Info</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 border rounded-xl bg-card">
                    <div className="space-y-2">
                        <Label>Primary Field</Label>
                        <Select
                            value={config.settings.modelCardPrimary || 'none'}
                            onValueChange={(val) => updateSetting('modelCardPrimary', val)}
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

                    <div className="space-y-2">
                        <Label>Secondary Field</Label>
                        <Select
                            value={config.settings.modelCardSecondary || 'none'}
                            onValueChange={(val) => updateSetting('modelCardSecondary', val)}
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

                    <div className="space-y-2">
                        <Label>Tertiary Field</Label>
                        <Select
                            value={config.settings.modelCardTertiary || 'none'}
                            onValueChange={(val) => updateSetting('modelCardTertiary', val)}
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
        </div>
    );
}

// Left Panel Content
export function PhasePreferencesInfo() {
    return (
        <div className="space-y-6">
            <div className="p-4 rounded-lg bg-background/50 border border-border shadow-sm opacity-60">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary" />
                    Connect
                </h3>
            </div>

            <div className="p-4 rounded-lg bg-background/50 border border-border shadow-sm">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs">2</span>
                    Personalize
                </h3>
                <p className="text-sm text-muted-foreground">
                    Make it yours. Adjust colors, layout density, and what information sits front-and-center on your model cards.
                </p>
            </div>

            <div className="p-4 rounded-lg bg-background/50 border border-border shadow-sm opacity-60">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs">3</span>
                    Secure & Visualize
                </h3>
            </div>
        </div>
    );
}
