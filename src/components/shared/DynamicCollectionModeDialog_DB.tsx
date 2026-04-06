import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useConfig } from "@/context/AppConfigContext";
import { AlignLeft, FolderTree, Layers, Package } from "lucide-react";

interface DynamicCollectionModeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function DynamicCollectionModeDialog_DB({ open, onOpenChange }: DynamicCollectionModeDialogProps) {
    const { appConfig, updateConfig } = useConfig();
    const mode = appConfig?.settings?.collectionMode || 'strict';

    const handleModeChange = async (newMode: string) => {
        if (!appConfig) return;
        await updateConfig({
            ...appConfig,
            settings: {
                ...appConfig.settings,
                collectionMode: newMode as any
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Dynamic Collection Mode</DialogTitle>
                    <DialogDescription>
                        Choose how your folders and collections are structured and displayed instantly within the app.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    <RadioGroup value={mode} onValueChange={handleModeChange} className="grid gap-3">

                        {/* Option 1: Strict Mirroring */}
                        <div className={`flex items-start space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${mode === 'strict' ? 'bg-accent/50 border-primary' : 'hover:bg-accent/20'}`} onClick={() => handleModeChange('strict')}>
                            <RadioGroupItem value="strict" id="strict" className="mt-1" />
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <FolderTree className="h-4 w-4 text-blue-500" />
                                    <Label htmlFor="strict" className="cursor-pointer font-medium text-base">Strict Mirroring (Nested) - Default</Label>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Recreates your exact folder hierarchy. Empty branch folders are hidden to keep navigation clean.
                                </p>
                                <div className="text-xs bg-muted p-2 rounded text-foreground/80 mt-2 font-mono">
                                    3D Prints/Cars/SportsCar/file.stl <span className="text-muted-foreground">→</span> <br />
                                    Collection: <strong>"3D Prints"</strong> → <strong>"Cars"</strong> → <strong>"SportsCar"</strong>
                                </div>
                            </div>
                        </div>

                        {/* Option 2: Smart Grouping */}
                        <div className={`flex items-start space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${mode === 'smart' ? 'bg-accent/50 border-primary' : 'hover:bg-accent/20'}`} onClick={() => handleModeChange('smart')}>
                            <RadioGroupItem value="smart" id="smart" className="mt-1" />
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <AlignLeft className="h-4 w-4 text-orange-500" />
                                    <Label htmlFor="smart" className="cursor-pointer font-medium text-base">Smart Grouping (Flattened)</Label>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Ignores intermediate folders. Elevates any folder that <strong>directly contains</strong> models to the top level.
                                </p>
                                <div className="text-xs bg-muted p-2 rounded text-foreground/80 mt-2 font-mono">
                                    3D Prints/Cars/SportsCar/file.stl <span className="text-muted-foreground">→</span> Collection: <strong>"SportsCar"</strong>
                                </div>
                            </div>
                        </div>

                        {/* Option 3: Top-Level */}
                        <div className={`flex items-start space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${mode === 'top-level' ? 'bg-accent/50 border-primary' : 'hover:bg-accent/20'}`} onClick={() => handleModeChange('top-level')}>
                            <RadioGroupItem value="top-level" id="top-level" className="mt-1" />
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Package className="h-4 w-4 text-purple-500" />
                                    <Label htmlFor="top-level" className="cursor-pointer font-medium text-base">Top-Level Aggregation</Label>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Creates one collection per top-level folder, aggregating <strong>everything</strong> inside it recursively.
                                </p>
                                <div className="text-xs bg-muted p-2 rounded text-foreground/80 mt-2 font-mono">
                                    3D Prints/Cars/SportsCar/file.stl <span className="text-muted-foreground">→</span> Collection: <strong>"3D Prints"</strong>
                                </div>
                            </div>
                        </div>

                        {/* Option 4: Manual */}
                        <div className={`flex items-start space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${mode === 'manual' ? 'bg-accent/50 border-primary' : 'hover:bg-accent/20'}`} onClick={() => handleModeChange('manual')}>
                            <RadioGroupItem value="manual" id="manual" className="mt-1" />
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Layers className="h-4 w-4 text-zinc-500" />
                                    <Label htmlFor="manual" className="cursor-pointer font-medium text-base">Manual (Custom Collections Only)</Label>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Hides all auto-imported filesystem folders. Displays only the custom collections you have manually created.
                                </p>
                            </div>
                        </div>

                        {/* Option 5: Raw Filesystem */}
                        <div className={`flex items-start space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${mode === 'raw' ? 'bg-accent/50 border-primary' : 'hover:bg-accent/20'}`} onClick={() => handleModeChange('raw')}>
                            <RadioGroupItem value="raw" id="raw" className="mt-1" />
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Layers className="h-4 w-4 text-slate-500" />
                                    <Label htmlFor="raw" className="cursor-pointer font-medium text-base">Raw Filesystem Override</Label>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    The true raw mapping. Shows every single tracked folder exactly as it is on the physical disk, even if it is completely empty.
                                </p>
                            </div>
                        </div>

                    </RadioGroup>
                </div>

                <DialogFooter>
                    <Button onClick={() => onOpenChange(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
