import { useQuery } from '@tanstack/react-query';
import { Box, ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useProjectMutations } from '../../hooks/useProjects_db';
import { BuildPlate, BuildPlateItem, Project, ProjectItem } from '../../types/project';
import { dbAdapter } from '../../utils/dbAdapter';
import { resolveModelThumbnail } from '../../utils/thumbnailUtils_db';
import { ImageWithFallback } from '../common/ImageWithFallback';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { ScrollArea, ScrollBar } from '../ui/scroll-area';
import { InteractiveBuildPlate_DB } from './InteractiveBuildPlate_DB';
import { PlateSettingsPopover_DB } from './PlateSettingsPopover_DB';
import { ProjectModelSelector_DB } from './ProjectModelSelector_DB';

// --- COMPONENT ---
export function ProjectWorkspace_DB({ project, onBack }: { project: Project, onBack: () => void }) {

    // Queries
    const { data: platesData, isLoading: platesLoading } = useQuery<BuildPlate[]>({
        queryKey: ['buildPlates', project.id],
        queryFn: () => dbAdapter.getBuildPlatesByProject(project.id)
    });
    const plates: BuildPlate[] = platesData || [];

    const { createBuildPlate, assignToPlate, unassignFromPlate, stageItems, deleteBuildPlate } = useProjectMutations();

    // State
    const [activePlateId, setActivePlateId] = useState<string | null>(null);
    const [isNewPlateOpen, setIsNewPlateOpen] = useState(false);
    const [newPlateName, setNewPlateName] = useState("");
    const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);

    // Dock State
    const [dockMode, setDockMode] = useState<'plates' | 'models'>('plates');
    const [dockExpanded, setDockExpanded] = useState(false);

    // --- Derived State ---
    const items = project?.items || [];
    const activePlate = plates.find((p: BuildPlate) => p.id === activePlateId) || null;

    // Auto-select first plate if none selected
    React.useEffect(() => {
        if (!activePlateId && plates.length > 0) {
            setActivePlateId(plates[0].id);
        } else if (activePlateId && !plates.some((p: BuildPlate) => p.id === activePlateId)) {
            // If active plate was deleted or no longer exists, clear selection or select first
            setActivePlateId(plates.length > 0 ? plates[0].id : null);
        }
    }, [plates, activePlateId]);

    // Items that still have unassigned quantity
    const unassignedItems = useMemo(() => {
        if (!items) return [];
        return items.filter((i: ProjectItem) => (i.quantityDesired || 0) > (i.quantityAssigned || 0));
    }, [items]);


    if (platesLoading) return <div className="p-8 text-center animate-pulse">Loading Workspace...</div>;
    if (!project) return <div className="p-8 text-center">Project not found</div>;

    // --- Handlers ---

    // Drag Start: attach the ProjectItem ID
    const handleDragStart = (e: React.DragEvent, projectItemId: string) => {
        e.dataTransfer.setData("application/json", JSON.stringify({ projectItemId, source: 'warehouse' }));
        e.dataTransfer.effectAllowed = 'copy';
    };

    // Drag Over: allow dropping only on valid plates
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); // Necessary to allow native drop
        e.dataTransfer.dropEffect = 'copy';
    };

    // Drop onto Active Plate
    const handleDropOnPlate = async (e: React.DragEvent, targetPlateId: string) => {
        e.preventDefault();
        try {
            const data = JSON.parse(e.dataTransfer.getData("application/json"));
            if (data.source === 'warehouse' && data.projectItemId) {
                if (!activePlate) return;

                let sum = 0;
                activePlate.items?.forEach((item: any) => {
                    sum += item.projectItem?.model?.fileSize || 0;
                });
                return sum;
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleCreatePlate = async () => {
        if (!newPlateName.trim()) return;
        await createBuildPlate.mutateAsync({ projectId: project.id, name: newPlateName });
        setNewPlateName("");
        setIsNewPlateOpen(false);
    };

    const handleAddModels = async (modelIds: string[]) => {
        if (!modelIds.length) return;
        await stageItems.mutateAsync({ projectId: project.id, modelIds });
    };

    // Calculate Active Plate size for performance mitigation
    const activePlateTotalBytes = activePlate?.items?.reduce((sum, item) => {
        const primaryFile = item.projectItem?.model?.files?.find((f: any) => f.isPrimary) || item.projectItem?.model?.files?.[0];
        const size = primaryFile?.size || 0;
        return sum + (Number(size) * item.quantity);
    }, 0) || 0;

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const activePlateMbSize = activePlateTotalBytes / (1024 * 1024);

    return (
        <div className="flex flex-col lg:flex-row flex-1 w-full h-full overflow-y-auto bg-background">

            {/* MAIN CONTENT (Zone A) */}
            <div className="flex-1 flex flex-col min-w-0 min-h-[700px]">

                {/* Header */}
                <div className="p-4 border-b flex justify-between items-center bg-card shadow-sm z-10 shrink-0 relative">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="sm" onClick={onBack} className="h-8 px-2 pl-1.5 -ml-2 text-muted-foreground hover:text-foreground">
                            ← Back
                        </Button>
                        <div className="h-4 w-px bg-border" />
                        <div>
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                {activePlate ? (
                                    <>
                                        <Badge variant="outline" className="bg-background">Active</Badge>
                                        {activePlate.name}
                                        <PlateSettingsPopover_DB plate={activePlate} />
                                    </>
                                ) : (
                                    <>
                                        {project.name}
                                        <Badge variant="secondary" className="text-xs ml-2 font-normal">{project.status}</Badge>
                                    </>
                                )}
                            </h2>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Right Side Header Controls */}
                        {activePlate ? (
                            <>
                                {/* Performance Mitagation Filesize Area */}
                                {(() => {
                                    let badgeColor = "bg-muted text-muted-foreground";
                                    let warningTooltip = "Total active loaded file size";

                                    if (activePlateMbSize > 250) {
                                        badgeColor = "bg-destructive text-destructive-foreground animate-pulse";
                                        warningTooltip = "Critically high loaded data! High risk of browser crash when loading the 3D grid.";
                                    } else if (activePlateMbSize > 100) {
                                        badgeColor = "bg-yellow-500 text-yellow-950";
                                        warningTooltip = "High loaded data! Loading the 3D grid might freeze the browser temporarily.";
                                    } else if (activePlateMbSize > 0) {
                                        badgeColor = "bg-blue-500 text-white";
                                    }

                                    return activePlateTotalBytes > 0 ? (
                                        <Badge className={`shadow - sm cursor - help transition - colors ${badgeColor} `} title={warningTooltip}>
                                            {formatBytes(activePlateTotalBytes)}
                                        </Badge>
                                    ) : null;
                                })()}
                                <div className="h-4 w-px bg-border mx-1" />
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => {
                                    if (confirm("Delete this plate? Items will return to warehouse.")) {
                                        deleteBuildPlate.mutate({ plateId: activePlate.id, projectId: project.id });
                                        setActivePlateId(null);
                                    }
                                }}>
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </>
                        ) : (
                            <Button size="sm" onClick={() => { setIsNewPlateOpen(true); setDockMode('plates'); setDockExpanded(true); }} className="gap-2">
                                <Plus className="w-4 h-4" /> New Plate
                            </Button>
                        )}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col bg-muted/10 relative overflow-hidden">
                    {/* Background Layer: 3D Workspace or Empty State */}
                    <div className="absolute inset-0 z-0">
                        {activePlate ? (
                            <div
                                className="w-full h-full pointer-events-auto"
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDropOnPlate(e, activePlate.id)}
                            >
                                <InteractiveBuildPlate_DB plate={activePlate} />
                            </div>
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground flex-col">
                                <Box className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                                <h3 className="text-lg font-semibold mb-2">No Plate Selected</h3>
                                <p className="text-muted-foreground text-sm max-w-sm text-center">
                                    Select a plate from the dock below to view its 3D layout, or create a new one to start organizing your printed parts.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Foreground Layer: The Interactive Dock */}
                    <div
                        className={`absolute bottom - 0 left - 0 right - 0 bg - background / 95 backdrop - blur - md border - t shadow - [0_ - 10px_40px_rgba(0, 0, 0, 0.1)] transition - all duration - 300 ease -in -out z - 10 flex flex - col ${dockExpanded ? 'h-[66%]' : 'h-[240px]'} `}
                    >
                        {/* Dock Header & Controls */}
                        <div className="flex justify-between items-center p-3 border-b bg-card/50 shrink-0">
                            <div className="flex bg-muted/50 p-1 rounded-lg">
                                <Button
                                    variant={dockMode === 'plates' ? 'default' : 'ghost'}
                                    size="sm"
                                    onClick={() => setDockMode('plates')}
                                    className="h-7 text-xs px-3"
                                >
                                    <Box className="w-3.5 h-3.5 mr-2" /> All Plates
                                </Button>
                                <Button
                                    variant={dockMode === 'models' ? 'default' : 'ghost'}
                                    size="sm"
                                    onClick={() => setDockMode('models')}
                                    className="h-7 text-xs px-3"
                                    disabled={!activePlate}
                                >
                                    <GripVertical className="w-3.5 h-3.5 mr-2" /> Models on Plate
                                </Button>
                            </div>

                            <div className="flex items-center gap-2">
                                {dockMode === 'plates' && (
                                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setIsNewPlateOpen(true)}>
                                        <Plus className="w-3 h-3" /> New Plate
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDockExpanded(!dockExpanded)}
                                    className="h-7 w-7 p-0"
                                >
                                    {dockExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                                </Button>
                            </div>
                        </div>

                        {/* Dock Content Area */}
                        <div className="flex-1 overflow-hidden relative">
                            {/* PLATES MODE */}
                            {dockMode === 'plates' && (
                                <ScrollArea className="h-full w-full">
                                    {dockExpanded ? (
                                        // Expanded Grid View
                                        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
                                            {plates.map((p: BuildPlate) => (
                                                <div
                                                    key={p.id}
                                                    onClick={() => { setActivePlateId(p.id); setDockMode('models'); setDockExpanded(false); }}
                                                    className={`bg - card border - 2 cursor - pointer transition - all rounded - xl flex flex - col group overflow - hidden ${activePlate?.id === p.id ? 'border-primary shadow-md ring-2 ring-primary/20' : 'border-border hover:border-primary/50'} `}
                                                >
                                                    <div className="p-3 border-b flex justify-between items-center bg-muted/10 group-hover:bg-primary/5 transition-colors">
                                                        <span className="font-bold text-sm truncate pr-2 group-hover:text-primary transition-colors">{p.name}</span>
                                                        <Badge variant="outline" className="text-[10px] h-5">{p.items?.reduce((acc: number, i: any) => acc + i.quantity, 0) || 0} items</Badge>
                                                    </div>
                                                    <div className="h-24 p-2 bg-muted/30 flex gap-1 overflow-hidden flex-wrap content-start">
                                                        {p.items?.slice(0, 8).map((i: any) => i.projectItem?.model && (
                                                            <div key={i.id} className="h-10 w-10 rounded shadow-sm border bg-background overflow-hidden shrink-0">
                                                                <ImageWithFallback src={resolveModelThumbnail(i.projectItem.model)} className="h-full w-full object-cover" />
                                                            </div>
                                                        ))}
                                                        {(p.items?.length || 0) > 8 && (
                                                            <div className="h-10 w-10 rounded border border-dashed border-primary/30 text-primary/70 bg-primary/5 flex items-center justify-center text-xs font-bold shrink-0">
                                                                +{p.items!.length - 8}
                                                            </div>
                                                        )}
                                                        {!p.items?.length && (
                                                            <div className="w-full h-full flex items-center justify-center text-muted-foreground/40 text-xs italic">
                                                                Empty
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            <div
                                                onClick={() => setIsNewPlateOpen(true)}
                                                className="border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/30 cursor-pointer transition-all rounded-xl flex flex-col items-center justify-center p-4 text-muted-foreground min-h-[140px]"
                                            >
                                                <Plus className="w-6 h-6 mb-2 opacity-50" />
                                                <span className="font-medium text-sm">Create New Plate</span>
                                            </div>
                                        </div>
                                    ) : (
                                        // Collapsed Horizontal View
                                        <div className="flex gap-4 p-4 pb-4 h-full w-max min-w-full">
                                            {plates.map((p: BuildPlate) => (
                                                <div
                                                    key={p.id}
                                                    onClick={() => { setActivePlateId(p.id); setDockMode('models'); }}
                                                    className={`shrink - 0 w - 64 rounded - xl border - 2 transition - all cursor - pointer flex flex - col ${activePlate?.id === p.id ? 'border-primary ring-2 ring-primary/20 shadow-md' : 'border-border hover:border-primary/50 hover:bg-muted/50'} `}
                                                >
                                                    <div className="p-3 border-b bg-card rounded-t-xl flex justify-between items-center">
                                                        <span className="font-semibold text-sm truncate pr-2">{p.name}</span>
                                                        <Badge variant="outline" className="text-[10px] h-5">{p.items?.reduce((acc: number, i: any) => acc + i.quantity, 0) || 0} items</Badge>
                                                    </div>
                                                    <div className="flex-1 p-2 bg-muted/20 rounded-b-xl flex gap-1 overflow-hidden"
                                                        onDragOver={handleDragOver}
                                                        onDrop={(e) => handleDropOnPlate(e, p.id)}
                                                    >
                                                        {p.items?.slice(0, 4).map((i: any) => i.projectItem?.model && (
                                                            <div key={i.id} className="h-12 w-12 rounded border bg-background overflow-hidden shrink-0">
                                                                <ImageWithFallback src={resolveModelThumbnail(i.projectItem.model)} className="h-full w-full object-cover" />
                                                            </div>
                                                        ))}
                                                        {(p.items?.length || 0) > 4 && (
                                                            <div className="h-12 w-12 rounded border bg-background flex items-center justify-center text-xs font-bold text-muted-foreground">
                                                                +{p.items!.length - 4}
                                                            </div>
                                                        )}
                                                        {!p.items?.length && (
                                                            <div className="w-full h-12 flex items-center justify-center text-muted-foreground/40 text-xs italic">Empty</div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            <div
                                                onClick={() => setIsNewPlateOpen(true)}
                                                className="shrink-0 w-48 border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/30 cursor-pointer transition-all rounded-xl flex flex-col items-center justify-center p-4 text-muted-foreground"
                                            >
                                                <Plus className="w-6 h-6 mb-2 opacity-50" />
                                                <span className="font-medium text-sm">New Plate</span>
                                            </div>
                                        </div>
                                    )}
                                    {!dockExpanded && <ScrollBar orientation="horizontal" />}
                                </ScrollArea>
                            )}

                            {/* MODELS MODE */}
                            {dockMode === 'models' && activePlate && (
                                <ScrollArea className="h-full w-full bg-muted/10">
                                    <div
                                        className={`p - 4 gap - 4 pb - 20 min - h - full ${!activePlate.items?.length ? 'flex items-center justify-center border-2 border-dashed border-primary/20 m-4 rounded-xl bg-muted/30' : ''} ${dockExpanded ? 'grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8' : 'flex w-max min-w-full'} `}
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDropOnPlate(e, activePlate.id)}
                                    >
                                        {activePlate.items?.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center text-muted-foreground pointer-events-none p-8">
                                                <GripVertical className="w-8 h-8 text-muted-foreground/30 mb-3" />
                                                <p className="font-medium">Empty Build Plate</p>
                                                <p className="text-sm">Drag parts from the warehouse here</p>
                                            </div>
                                        ) : (
                                            activePlate.items?.map((plateItem: BuildPlateItem) => {
                                                const m = plateItem.projectItem?.model;
                                                if (!m) return null;
                                                return (
                                                    <div
                                                        key={plateItem.id}
                                                        className={`relative group bg - background border rounded - lg overflow - hidden shadow - sm shrink - 0 ${dockExpanded ? 'w-full' : 'w-32'} `}
                                                    >
                                                        <div className="aspect-square relative">
                                                            <ImageWithFallback src={resolveModelThumbnail(m)} className="object-cover w-full h-full" />
                                                            {plateItem.quantity > 1 && (
                                                                <Badge className="absolute top-1 left-1 bg-black/70 text-white">x{plateItem.quantity}</Badge>
                                                            )}
                                                            <Button
                                                                size="icon"
                                                                variant="destructive"
                                                                className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                onClick={() => unassignFromPlate.mutate({ plateItemId: plateItem.id, projectId: project.id })}
                                                            >
                                                                <Trash2 className="w-3 h-3" />
                                                            </Button>
                                                        </div>
                                                        <div className="p-2 bg-card">
                                                            <p className="text-xs truncate font-medium" title={m.name}>{m.name}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                    {!dockExpanded && <ScrollBar orientation="horizontal" />}
                                </ScrollArea>
                            )}

                            {dockMode === 'models' && !activePlate && (
                                <div className="flex w-full h-full items-center justify-center text-muted-foreground">
                                    No plate selected. Switch to All Plates to select a plate.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* BOTTOM: HORIZONTAL PLATE LIST (REMOVED - Replaced by Gallery View) */}

            </div>

            {/* ZONE B: WAREHOUSE SIDEBAR */}
            <div className="w-full lg:w-80 bg-card border-t lg:border-t-0 lg:border-l flex flex-col min-h-[500px] shrink-0 shadow-xl z-20">
                <div className="p-4 border-b bg-muted/10 shrink-0">
                    <h3 className="font-semibold flex justify-between items-center">
                        Warehouse
                        <Badge variant="secondary">{unassignedItems.reduce((acc: number, i: any) => acc + (i.quantityDesired - i.quantityAssigned), 0)} unassigned</Badge>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">Drag parts from here onto plates.</p>
                </div>

                <div className="p-2 border-b shrink-0">
                    <Button variant="outline" size="sm" className="w-full text-xs items-center gap-2" onClick={() => setIsModelSelectorOpen(true)}>
                        <Plus className="w-3 h-3" /> Add Parts from Library
                    </Button>
                </div>

                <ScrollArea className="flex-1 p-3 bg-muted/5">
                    <div className="grid grid-cols-2 gap-3 pb-20">
                        {unassignedItems.map((item: ProjectItem) => {
                            const m = item.model;
                            if (!m) return null;
                            const qty = item.quantityDesired - item.quantityAssigned;

                            return (
                                <div
                                    key={item.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, item.id)}
                                    className="group relative bg-background border rounded-lg overflow-hidden hover:shadow-md hover:border-primary/50 transition-all cursor-grab active:cursor-grabbing"
                                >
                                    <div className="aspect-square relative">
                                        <ImageWithFallback src={resolveModelThumbnail(m)} className="object-cover w-full h-full" />
                                        <Badge variant="default" className="absolute top-1 right-1 font-mono text-[10px] h-4 min-w-[16px] p-0 flex items-center justify-center shadow-sm">
                                            {qty}
                                        </Badge>

                                        {/* Drag Overlay Affordance */}
                                        <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                                            <div className="bg-background/90 text-primary px-2 py-1 rounded-full shadow-lg flex items-center gap-1 text-[10px] font-bold">
                                                <GripVertical className="w-3 h-3" /> DRAG
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-1.5 px-2 bg-card">
                                        <p className="text-xs truncate font-medium" title={m.name}>{m.name}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {unassignedItems.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground text-sm px-4">
                            All parts are assigned to plates! Add more from the library.
                        </div>
                    )}
                </ScrollArea>
            </div>

            {/* Modals */}
            <ProjectModelSelector_DB
                isOpen={isModelSelectorOpen}
                onClose={() => setIsModelSelectorOpen(false)}
                onAddModels={handleAddModels}
            />

            <Dialog open={isNewPlateOpen} onOpenChange={setIsNewPlateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New Build Plate</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            placeholder="Enter plate name (e.g., PLA White - Body Parts)"
                            value={newPlateName}
                            onChange={(e) => setNewPlateName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreatePlate()}
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsNewPlateOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreatePlate} disabled={!newPlateName.trim()}>Create Plate</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
