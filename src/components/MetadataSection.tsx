import React from 'react';
import { DollarSign } from 'lucide-react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Model } from "../types/model";
import { Category } from "../types/category";

interface MetadataSectionProps {
    isEditing: boolean;
    isStlModel: boolean;
    editedModel: Model | null; // Use actual Model type
    setEditedModel: React.Dispatch<React.SetStateAction<Model | null>>;
    categories: Category[]; // Use actual Category type
    isKnownLicense: (license: string) => boolean;
    LICENSES: readonly string[];
    onLocalUpdate?: (updates: Partial<Model>) => void;
}

export const MetadataSection = ({
    isEditing,
    isStlModel,
    editedModel,
    setEditedModel,
    categories,
    isKnownLicense,
    LICENSES,
    onLocalUpdate,
}: MetadataSectionProps) => {
    if (!isEditing) return null;

    // Helper to trigger parent updates
    const triggerLocalUpdate = (updates: Partial<Model>) => {
        if (onLocalUpdate) {
            onLocalUpdate(updates);
        }
    };

    return (
        <div className="grid gap-6">
            {/* Print settings (editable only for STL models) */}
            {isStlModel && (
                <div className="grid gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-material">Material</Label>
                            <Input
                                id="edit-material"
                                value={(editedModel as any)?.printSettings?.material || ''}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setEditedModel(prev => {
                                        if (!prev) return prev;
                                        const ps = { ...(prev.printSettings || {}), material: val } as any;
                                        return { ...prev, printSettings: ps } as Model;
                                    });
                                    triggerLocalUpdate({ printSettings: { ...(editedModel?.printSettings || {}), material: val } as any });
                                }}
                                placeholder="e.g. PLA, PETG"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-printer">Printer</Label>
                            <Input
                                id="edit-printer"
                                value={(editedModel as any)?.printSettings?.printer || ''}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setEditedModel(prev => {
                                        if (!prev) return prev;
                                        const ps = { ...(prev.printSettings || {}), printer: val } as any;
                                        return { ...prev, printSettings: ps } as Model;
                                    });
                                    triggerLocalUpdate({ printSettings: { ...(editedModel?.printSettings || {}), printer: val } as any });
                                }}
                                placeholder="e.g. Bambu P1S"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-layer-height">Layer height (mm)</Label>
                            <Input
                                id="edit-layer-height"
                                value={(editedModel as any)?.printSettings?.layerHeight || ''}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setEditedModel(prev => {
                                        if (!prev) return prev;
                                        const ps = { ...(prev.printSettings || {}), layerHeight: val } as any;
                                        return { ...prev, printSettings: ps } as Model;
                                    });
                                    triggerLocalUpdate({ printSettings: { ...(editedModel?.printSettings || {}), layerHeight: val } as any });
                                }}
                                placeholder="e.g. 0.2"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-infill">Infill (%)</Label>
                            <Input
                                id="edit-infill"
                                value={(editedModel as any)?.printSettings?.infill || ''}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setEditedModel(prev => {
                                        if (!prev) return prev;
                                        const ps = { ...(prev.printSettings || {}), infill: val } as any;
                                        return { ...prev, printSettings: ps } as Model;
                                    });
                                    triggerLocalUpdate({ printSettings: { ...(editedModel?.printSettings || {}), infill: val } as any });
                                }}
                                placeholder="e.g. 20%"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-nozzle">Nozzle (mm)</Label>
                            <Input
                                id="edit-nozzle"
                                value={(editedModel as any)?.printSettings?.nozzle || ''}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setEditedModel(prev => {
                                        if (!prev) return prev;
                                        const ps = { ...(prev.printSettings || {}), nozzle: val } as any;
                                        return { ...prev, printSettings: ps } as Model;
                                    });
                                    triggerLocalUpdate({ printSettings: { ...(editedModel?.printSettings || {}), nozzle: val } as any });
                                }}
                                placeholder="e.g. 0.4"
                            />
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="edit-name">Model Name</Label>
                    <Input
                        id="edit-name"
                        value={editedModel?.name || ""}
                        onChange={(e) => {
                            const val = e.target.value;
                            setEditedModel(prev => prev ? { ...prev, name: val } : null);
                            triggerLocalUpdate({ name: val });
                        }}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="edit-category">Category</Label>
                    <Select
                        value={editedModel?.category || ""}
                        onValueChange={(value: string) => {
                            setEditedModel(prev => prev ? { ...prev, category: value } : null);
                            triggerLocalUpdate({ category: value });
                        }}
                    >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {categories.map((category) => (
                                <SelectItem key={category.id} value={category.label}>{category.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="edit-designer">Designer</Label>
                    <Input
                        id="edit-designer"
                        value={(editedModel as any)?.designer ?? ""}
                        onChange={(e) => {
                            const val = e.target.value;
                            setEditedModel(prev => prev ? ({ ...prev, designer: val } as any) : null);
                            triggerLocalUpdate({ designer: val } as any);
                        }}
                        placeholder="Designer name"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="edit-license">License</Label>
                    <Select
                        value={editedModel?.license || ""}
                        onValueChange={(value: string) => {
                            setEditedModel(prev => prev ? { ...prev, license: value } : null);
                            triggerLocalUpdate({ license: value });
                        }}
                    >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {editedModel?.license && !isKnownLicense(editedModel.license) && (
                                <SelectItem value={editedModel.license} disabled>
                                    {editedModel.license} (unknown)
                                </SelectItem>
                            )}
                            {LICENSES.map((lic) => (
                                <SelectItem key={lic} value={lic}>{lic}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="edit-price">Selling Price</Label>
                    <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            id="edit-price"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={editedModel?.price ?? ""}
                            onChange={(e) => {
                                const val = e.target.value === "" ? 0 : parseFloat(e.target.value);
                                setEditedModel(prev => prev ? { ...prev, price: val } : null);
                                triggerLocalUpdate({ price: val });
                            }}
                            className="pl-9"
                        />
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center space-x-3">
                    <Switch
                        id="edit-printed"
                        checked={editedModel?.isPrinted || false}
                        onCheckedChange={(checked: boolean) => {
                            setEditedModel(prev => prev ? { ...prev, isPrinted: checked } : null);
                            triggerLocalUpdate({ isPrinted: checked });
                        }}
                    />
                    <Label htmlFor="edit-printed">Mark as printed</Label>
                </div>

                <div className="flex items-center space-x-3">
                    <Switch
                        id="edit-hidden"
                        checked={editedModel?.hidden || false}
                        onCheckedChange={(checked: boolean) => {
                            setEditedModel(prev => prev ? { ...prev, hidden: checked } : null);
                            triggerLocalUpdate({ hidden: checked });
                        }}
                    />
                    <Label htmlFor="edit-hidden">Hide model from view</Label>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
                <div className="space-y-2">
                    <Label htmlFor="edit-print-time">Print Time</Label>
                    <Input
                        id="edit-print-time"
                        placeholder="e.g. 1h 30m"
                        value={editedModel?.printTime || ""}
                        onChange={(e) => {
                            const val = e.target.value;
                            setEditedModel(prev => prev ? { ...prev, printTime: val } : null);
                            triggerLocalUpdate({ printTime: val });
                        }}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="edit-filament">Filament</Label>
                    <Input
                        id="edit-filament"
                        placeholder="e.g. 12g PLA"
                        value={editedModel?.filamentUsed || ""}
                        onChange={(e) => {
                            const val = e.target.value;
                            setEditedModel(prev => prev ? { ...prev, filamentUsed: val } : null);
                            triggerLocalUpdate({ filamentUsed: val });
                        }}
                    />
                </div>
            </div>
        </div>
    );
};