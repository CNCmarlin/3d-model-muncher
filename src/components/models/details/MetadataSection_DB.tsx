import { DurationInput_DB } from "@/components/common/DurationInput_DB";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Model } from "@/types/model_db";
import { DollarSign } from "lucide-react";

interface MetadataSectionProps {
    isEditing: boolean;
    canHavePrintSettings: boolean;
    editedModel: Model | null;
    setEditedModel: (model: Model | null) => void;
    categories: any[];
    isKnownLicense: (l: string) => boolean;
    LICENSES: readonly any[];
    onLocalUpdate: (updates: Partial<Model>) => void;
}

export const MetadataSection_DB = ({
    isEditing,
    editedModel,
    categories,
    isKnownLicense,
    LICENSES,
    onLocalUpdate
}: MetadataSectionProps) => {
    if (!isEditing || !editedModel) return null;

    return (
        <div className="space-y-6 pb-10">
            {/* 0. General Area (Moved from Print Settings) */}
            <div className="space-y-4">
                <h3 className="font-black text-sm uppercase tracking-[0.2em] text-muted-foreground/50">GENERAL</h3>

                {/* Model Name Input */}
                <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Model Name</Label>
                    <Input
                        value={editedModel.name || ""}
                        onChange={(e) => onLocalUpdate({ name: e.target.value })}
                        className="font-bold text-sm bg-primary/5 focus:bg-background border-primary/20 transition-all"
                        placeholder="Model Name"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Category</Label>
                        <Select
                            value={editedModel.category || ""}
                            onValueChange={(val) => onLocalUpdate({ category: val })}
                        >
                            <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="Select Category" />
                            </SelectTrigger>
                            <SelectContent>
                                {categories.map((c) => (
                                    <SelectItem key={c.id || c.label || c.name} value={c.label || c.name}>{c.label || c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">License</Label>
                        <Select
                            value={isKnownLicense(editedModel.license || "") ? editedModel.license || "" : "Other"}
                            onValueChange={(val) => onLocalUpdate({ license: val })}
                        >
                            <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="License Type" />
                            </SelectTrigger>
                            <SelectContent>
                                {LICENSES.map((l: any) => (
                                    <SelectItem key={l} value={l}>{l}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Designer</Label>
                        <Input
                            value={(editedModel as any).designer || ""}
                            onChange={(e) => onLocalUpdate({ designer: e.target.value || null } as any)}
                            className="h-9 text-xs font-bold"
                            placeholder="Designer name"
                        />
                    </div>
                </div>
            </div>

            <Separator />

            {/* 1. Print Settings Header & Info */}
            <div className="space-y-4">
                <h3 className="font-black text-sm uppercase tracking-[0.2em] text-muted-foreground/50">PRINT SETTINGS (EDIT)</h3>

                {/* Printer Input — flat Prisma column */}
                <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Printer</Label>
                    <Input
                        value={editedModel.printer || ""}
                        onChange={(e) => onLocalUpdate({ printer: e.target.value } as any)}
                        className="text-xs font-bold h-8"
                        placeholder="Default Printer"
                    />
                </div>
            </div>

            <Separator />

            {/* 2. Primary Stats Grid - 2x2 with Time/Filament and Size/Price */}
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    {/* Print Time */}
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Print Time</Label>
                        <DurationInput_DB
                            seconds={editedModel.printTime || 0}
                            onChange={(seconds) => onLocalUpdate({ printTime: seconds })}
                        />
                    </div>

                    {/* Filament Usage */}
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Filament (g)</Label>
                        <Input
                            type="text"
                            value={editedModel.filamentUsage || ""}
                            onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9.]/g, '');
                                onLocalUpdate({ filamentUsage: val === '' ? 0 : Number(val) });
                            }}
                            className="h-9 font-bold tabular-nums"
                            placeholder="e.g. 45"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* File Size (read-only, determined by actual file) */}
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">File Size</Label>
                        <Input
                            value={editedModel.fileSize || "—"}
                            disabled
                            className="h-9 text-xs disabled:opacity-60"
                            placeholder="e.g. 1.2 MB"
                        />
                    </div>

                    {/* Price */}
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-primary/40">Price ($)</Label>
                        <div className="relative">
                            <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary/40" />
                            <Input
                                type="number"
                                step="0.01"
                                value={editedModel.price || 0}
                                onChange={(e) => onLocalUpdate({ price: parseFloat(e.target.value) || 0 })}
                                className="h-9 pl-8 font-bold text-primary border-primary/20"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <Separator />

            {/* 3. Detailed Slicer Settings — flat Prisma columns */}
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    {/* Material */}
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Material</Label>
                        <Input
                            value={editedModel.material || ""}
                            onChange={(e) => onLocalUpdate({ material: e.target.value } as any)}
                            className="h-8 text-xs font-bold uppercase"
                            placeholder="PLA"
                        />
                    </div>

                    {/* Layer Height */}
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Layer Height (mm)</Label>
                        <Input
                            value={editedModel.layerHeight || ""}
                            onChange={(e) => onLocalUpdate({ layerHeight: e.target.value } as any)}
                            className="h-8 text-xs font-bold tabular-nums"
                            placeholder="0.2"
                        />
                    </div>

                    {/* Infill */}
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Infill (%)</Label>
                        <Input
                            value={editedModel.infill || ""}
                            onChange={(e) => onLocalUpdate({ infill: e.target.value } as any)}
                            className="h-8 text-xs font-bold tabular-nums"
                            placeholder="15%"
                        />
                    </div>

                    {/* Nozzle */}
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Nozzle (mm)</Label>
                        <Input
                            value={editedModel.nozzle || ""}
                            onChange={(e) => onLocalUpdate({ nozzle: e.target.value } as any)}
                            className="h-8 text-xs font-bold tabular-nums"
                            placeholder="0.4"
                        />
                    </div>
                </div>
            </div>

            <Separator />

            {/* 4. Toggles */}
            <div className="space-y-6 pt-4">
                <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="flex items-center space-x-3 bg-muted/20 p-3 rounded-lg border border-transparent hover:border-border transition-all">
                        <Switch
                            id="edit-isPrinted"
                            checked={editedModel.isPrinted || false}
                            onCheckedChange={(checked) => onLocalUpdate({ isPrinted: checked })}
                        />
                        <Label htmlFor="edit-isPrinted" className="text-xs font-bold uppercase tracking-tight">Mark Printed</Label>
                    </div>

                    <div className="flex items-center space-x-3 bg-muted/20 p-3 rounded-lg border border-transparent hover:border-border transition-all">
                        <Switch
                            id="edit-isFavorite"
                            checked={editedModel.isFavorite || false}
                            onCheckedChange={(checked) => onLocalUpdate({ isFavorite: checked })}
                        />
                        <Label htmlFor="edit-isFavorite" className="text-xs font-bold uppercase tracking-tight">Favorite</Label>
                    </div>
                </div>
            </div>
        </div>
    );
};