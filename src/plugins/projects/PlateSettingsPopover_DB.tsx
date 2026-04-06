import { Plus, Save, Settings2, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useConfig } from '@/context/AppConfigContext';
import { useProjectMutations } from '@/hooks/useProjects_db';
import { BuildPlate } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
    plate: BuildPlate;
    projectId?: string;
}

export function PlateSettingsPopover_DB({ plate }: Props) {
    const { updateBuildPlate } = useProjectMutations();
    const { appConfig, updateConfig } = useConfig();

    // Safely fallback to an empty array if undefined
    const presets = appConfig?.settings?.buildPlatePresets || [];

    const [isOpen, setIsOpen] = useState(false);
    const [name, setName] = useState(plate.name);
    const [width, setWidth] = useState(plate.width?.toString() || '230');
    const [height, setHeight] = useState(plate.height?.toString() || '230');
    const [preset, setPreset] = useState<string>('');

    // For creating new presets
    const [newPresetName, setNewPresetName] = useState("");

    // Sync state when plate changes
    useEffect(() => {
        if (!isOpen) {
            setName(plate.name);
            setWidth(plate.width?.toString() || '230');
            setHeight(plate.height?.toString() || '230');

            const match = presets.find((p: any) => p.width === plate.width && p.height === plate.height);
            setPreset(match ? match.name : 'Custom');
        }
    }, [isOpen, plate, presets]);

    const handlePresetChange = (val: string) => {
        setPreset(val);
        const match = presets.find((p: any) => p.name === val);
        if (match && val !== 'Custom') {
            setWidth(match.width.toString());
            setHeight(match.height.toString());
        }
    };

    const handleSave = () => {
        const finalWidth = preset !== 'Custom' ? (presets.find((p: any) => p.name === preset)?.width || parseFloat(width)) : parseFloat(width);
        const finalHeight = preset !== 'Custom' ? (presets.find((p: any) => p.name === preset)?.height || parseFloat(height)) : parseFloat(height);

        updateBuildPlate.mutate({
            plateId: plate.id,
            data: {
                name,
                width: finalWidth || plate.width,
                height: finalHeight || plate.height,
                customName: preset !== 'Custom' ? preset : null
            }
        });
        setIsOpen(false);
    };

    const handleSaveAsPreset = () => {
        if (!newPresetName.trim() || !appConfig) return;
        const w = parseFloat(width);
        const h = parseFloat(height);

        if (isNaN(w) || isNaN(h)) return; // Don't save invalid sizes

        // Add to config
        const newPresets = [...presets, { name: newPresetName.trim(), width: w, height: h }];
        updateConfig({
            ...appConfig,
            settings: {
                ...appConfig.settings,
                buildPlatePresets: newPresets
            }
        });

        setPreset(newPresetName.trim());
        setNewPresetName("");
    };

    const handleDeletePreset = (e: React.MouseEvent, presetNameToDelete: string) => {
        e.stopPropagation(); // prevent select dropdown from closing weirdly
        if (!appConfig || presetNameToDelete === 'Custom') return;

        if (confirm(`Delete preset "${presetNameToDelete}"?`)) {
            const newPresets = presets.filter((p: any) => p.name !== presetNameToDelete);
            updateConfig({
                ...appConfig,
                settings: {
                    ...appConfig.settings,
                    buildPlatePresets: newPresets
                }
            });
            if (preset === presetNameToDelete) {
                setPreset('Custom');
            }
        }
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Plate Settings">
                    <Settings2 className="h-4 w-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
                <div className="grid gap-4">
                    <div className="space-y-2">
                        <h4 className="font-medium leading-none">Build Plate Settings</h4>
                        <p className="text-sm text-muted-foreground">Update name and dimensions for the 3D grid.</p>
                    </div>

                    <div className="grid gap-2">
                        <div className="grid grid-cols-3 items-center gap-4">
                            <Label htmlFor="name">Name</Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="col-span-2 h-8"
                            />
                        </div>

                        <div className="grid flex-col gap-2">
                            <Label>Size Preset</Label>
                            <Select value={preset} onValueChange={handlePresetChange}>
                                <SelectTrigger className="h-8">
                                    <SelectValue placeholder="Select preset" />
                                </SelectTrigger>
                                <SelectContent>
                                    {presets.map((p: any) => (
                                        <div key={p.name} className="flex flex-row items-center w-full justify-between pr-1 group">
                                            <SelectItem value={p.name} className="flex-1 cursor-pointer">
                                                {p.name} <span className="text-muted-foreground text-xs ml-1">({p.width}x{p.height})</span>
                                            </SelectItem>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:text-destructive z-10 shrink-0 mx-1"
                                                onClick={(e) => handleDeletePreset(e, p.name)}
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    ))}
                                    <SelectItem value="Custom">Custom Size...</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {preset === 'Custom' && (
                            <div className="border bg-muted/20 p-3 rounded-md space-y-3 mt-2">
                                <div className="flex items-center gap-2">
                                    <Label className="w-8 shrink-0">Size</Label>
                                    <Input
                                        value={width}
                                        onChange={(e) => setWidth(e.target.value)}
                                        className="h-8 w-full"
                                        placeholder="X"
                                        type="number"
                                    />
                                    <span className="text-muted-foreground text-xs font-mono">x</span>
                                    <Input
                                        value={height}
                                        onChange={(e) => setHeight(e.target.value)}
                                        className="h-8 w-full"
                                        placeholder="Y"
                                        type="number"
                                    />
                                    <span className="text-muted-foreground text-xs font-mono">mm</span>
                                </div>

                                <div className="flex items-center gap-2 pt-2 border-t">
                                    <Input
                                        value={newPresetName}
                                        onChange={e => setNewPresetName(e.target.value)}
                                        placeholder="Preset Name..."
                                        className="h-8 text-xs flex-1"
                                    />
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="h-8 text-xs shrink-0"
                                        onClick={handleSaveAsPreset}
                                        disabled={!newPresetName.trim()}
                                    >
                                        <Plus className="w-3 h-3 mr-1" /> Save
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    <Button onClick={handleSave} className="w-full gap-2 mt-2">
                        <Save className="h-4 w-4" /> Save to Plate
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

