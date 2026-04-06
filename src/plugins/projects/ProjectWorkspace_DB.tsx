
import { Box, ChevronDown, ChevronUp, GripVertical, Minus, Plus, Trash2 } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useGetProjectDetails, useProjectMutations } from '@/hooks/useProjects_db';
import { BuildPlate, BuildPlateItem, ProjectItem } from '@/types/project';
// Removed unused dbAdapter
import { resolveModelThumbnail } from '@/utils/thumbnailUtils_db';
import { ImageWithFallback } from '@/components/common/ImageWithFallback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { InteractiveBuildPlate_DB } from './InteractiveBuildPlate_DB';
import { PlateSettingsPopover_DB } from './PlateSettingsPopover_DB';
import { ProjectModelSelector_DB } from './ProjectModelSelector_DB';

// --- COMPONENT ---
export function ProjectWorkspace_DB({ projectId, onBack }: { projectId: string, onBack: () => void }) {

    const { data: projectData, isLoading: projectLoading } = useGetProjectDetails(projectId);
    const updatedProject = projectData?.project;
    const project = updatedProject; // Alias for internal use
    const plates = updatedProject?.buildPlates || [];

    const { createBuildPlate, assignToPlate, unassignFromPlate, stageItems, deleteBuildPlate, updateProjectItemQuantity, updateProjectItemColor } = useProjectMutations();

    // State
    const [activePlateId, setActivePlateId] = useState<string | null>(null);
    const [isNewPlateOpen, setIsNewPlateOpen] = useState(false);
    const [newPlateName, setNewPlateName] = useState("");
    const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);

    // Dock State
    const [dockMode, setDockMode] = useState<'plates' | 'models'>('plates');
    const [zoneBMode, setZoneBMode] = useState<'warehouse' | 'parts-list'>('warehouse');
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


    if (projectLoading) return <div className="p-8 text-center animate-pulse">Loading Workspace...</div>;
    if (!updatedProject) return <div className="p-8 text-center">Project not found</div>;

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
                await assignToPlate.mutateAsync({
                    plateId: targetPlateId,
                    projectItemId: data.projectItemId,
                    projectId: projectId
                });
            } else if (data.source === 'parts-list' && data.projectItemId) {
                await assignToPlate.mutateAsync({
                    plateId: targetPlateId,
                    projectItemId: data.projectItemId,
                    projectId: projectId
                });
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleCreatePlate = async () => {
        if (!newPlateName.trim()) return;
        await createBuildPlate.mutateAsync({ projectId: projectId, name: newPlateName });
        setNewPlateName("");
        setIsNewPlateOpen(false);
    };

    const handleAddModels = async (modelIds: string[]) => {
        if (!modelIds.length) return;
        await stageItems.mutateAsync({ projectId: projectId, modelIds });
    };

    // Calculate Active Plate size for performance mitigation
    const activePlateTotalBytes = activePlate?.items?.reduce((sum: number, item: BuildPlateItem) => {
        const primaryFile = item.projectItem?.model?.files?.find((f) => f.isPrimary) || item.projectItem?.model?.files?.[0];
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
        <div className="flex flex-col lg:flex-row flex-1 w-full h-[calc(100vh-4rem)] lg:h-full overflow-hidden bg-background">

            {/* MAIN CONTENT (Zone A) */}
            <div className="flex-1 flex flex-col min-w-0 relative h-full">

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
                                        {project?.name}
                                        <Badge variant="secondary" className="text-xs ml-2 font-normal">{project?.status}</Badge>
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
                                        <Badge className={`shadow-sm cursor-help transition-colors ${badgeColor}`} title={warningTooltip}>
                                            {formatBytes(activePlateTotalBytes)}
                                        </Badge>
                                    ) : null;
                                })()}
                                <div className="h-4 w-px bg-border mx-1" />
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => {
                                    if (confirm("Delete this plate? Items will return to warehouse.")) {
                                        deleteBuildPlate.mutate({ plateId: activePlate.id, projectId });
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
                    <div
                        className="absolute top-0 left-0 right-0 z-0 transition-all duration-300 ease-in-out"
                        style={{ bottom: dockExpanded ? '66%' : '280px' }}
                    >
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
                        className={`absolute bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t shadow-[0_-10px_40px_rgba(0,0,0,0.1)] transition-all duration-300 ease-in-out z-20 flex flex-col pb-4 ${dockExpanded ? 'h-[66%]' : 'h-[280px]'}`}
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
                                                    className={`bg-card border-2 cursor-pointer transition-all rounded-xl flex flex-col group overflow-hidden ${activePlate?.id === p.id ? 'border-primary shadow-md ring-2 ring-primary/20' : 'border-border hover:border-primary/50'}`}
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
                                        <div
                                            className="flex gap-4 p-4 h-full w-max min-w-full"
                                            onWheel={(e) => {
                                                const container = e.currentTarget.closest('[data-radix-scroll-area-viewport]');
                                                if (container) container.scrollLeft += e.deltaY;
                                            }}
                                        >
                                            {plates.map((p: BuildPlate) => (
                                                <div
                                                    key={p.id}
                                                    onClick={() => { setActivePlateId(p.id); setDockMode('models'); }}
                                                    className={`shrink-0 w-64 h-full rounded-xl border-2 transition-all cursor-pointer flex flex-col ${activePlate?.id === p.id ? 'border-primary ring-2 ring-primary/20 shadow-md' : 'border-border hover:border-primary/50 hover:bg-muted/50'}`}
                                                >
                                                    <div className="p-3 border-b bg-card rounded-t-xl flex justify-between items-center">
                                                        <span className="font-semibold text-sm truncate pr-2">{p.name}</span>
                                                        <Badge variant="outline" className="text-[10px] h-5">{p.items?.reduce((acc: number, i: any) => acc + i.quantity, 0) || 0} items</Badge>
                                                    </div>
                                                    <div className="flex-1 p-2 bg-muted/20 rounded-b-xl flex flex-wrap content-start gap-1 overflow-hidden"
                                                        onDragOver={handleDragOver}
                                                        onDrop={(e) => handleDropOnPlate(e, p.id)}
                                                    >
                                                        {p.items?.slice(0, 8).map((i: any) => i.projectItem?.model && (
                                                            <div key={i.id} className="h-11 w-11 rounded border bg-background overflow-hidden shrink-0">
                                                                <ImageWithFallback src={resolveModelThumbnail(i.projectItem.model)} className="h-full w-full object-cover" />
                                                            </div>
                                                        ))}
                                                        {(p.items?.length || 0) > 8 && (
                                                            <div className="h-11 w-11 rounded border bg-background flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                                                                +{p.items!.length - 8}
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
                                                className="shrink-0 w-48 h-full border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/30 cursor-pointer transition-all rounded-xl flex flex-col items-center justify-center p-4 text-muted-foreground"
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
                                        className={`p-4 gap-4 min-h-full ${!activePlate.items?.length ? 'flex items-center justify-center border-2 border-dashed border-primary/20 m-4 rounded-xl bg-muted/30' : ''} ${dockExpanded ? 'grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 pb-12' : 'flex w-max min-w-full'}`}
                                        onDragOver={handleDragOver}
                                        onWheel={(e) => {
                                            if (dockExpanded) return;
                                            const container = e.currentTarget.closest('[data-radix-scroll-area-viewport]');
                                            if (container) container.scrollLeft += e.deltaY;
                                        }}
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
                                                        className={`relative group bg-background border rounded-lg overflow-hidden shadow-sm shrink-0 ${dockExpanded ? 'w-full' : 'w-32'}`}
                                                    >
                                                        <div className="aspect-square relative flex items-center justify-center bg-muted/10">
                                                            <ImageWithFallback src={resolveModelThumbnail(m)} className="object-cover w-full h-full" />
                                                            {plateItem.quantity > 1 && (
                                                                <Badge className="absolute top-1 left-1 bg-black/70 text-white">x{plateItem.quantity}</Badge>
                                                            )}
                                                            <Button
                                                                size="icon"
                                                                variant="destructive"
                                                                className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                onClick={() => unassignFromPlate.mutate({ plateItemId: plateItem.id, projectId })}
                                                            >
                                                                <Trash2 className="w-3 h-3" />
                                                            </Button>
                                                        </div>
                                                        <div className="p-2 bg-card border-t">
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
            <div className="w-full lg:w-96 bg-card border-t lg:border-t-0 lg:border-l flex flex-col h-full shrink-0 shadow-xl z-20 overflow-hidden">
                <div className="p-4 border-b bg-muted/10 shrink-0">
                    <h3 className="font-semibold flex justify-between items-center">
                        Project Assets
                        <Badge variant="secondary">{unassignedItems.reduce((acc: number, i: any) => acc + (i.quantityDesired - i.quantityAssigned), 0)} unassigned</Badge>
                    </h3>
                    <div className="flex bg-muted p-1 rounded-lg mt-3">
                        <Button
                            variant={zoneBMode === 'warehouse' ? 'default' : 'ghost'}
                            size="sm"
                            className="flex-1 h-7 text-xs"
                            onClick={() => setZoneBMode('warehouse')}
                        >
                            Warehouse
                        </Button>
                        <Button
                            variant={zoneBMode === 'parts-list' ? 'default' : 'ghost'}
                            size="sm"
                            className="flex-1 h-7 text-xs"
                            onClick={() => setZoneBMode('parts-list')}
                        >
                            Parts List
                        </Button>
                    </div>
                </div>

                {zoneBMode === 'warehouse' ? (
                    <>
                        <div className="p-2 border-b shrink-0 bg-card">
                            <Button variant="outline" size="sm" className="w-full text-xs items-center gap-2" onClick={() => setIsModelSelectorOpen(true)}>
                                <Plus className="w-3 h-3" /> Add Parts from Library
                            </Button>
                        </div>

                        <ScrollArea className="flex-1 p-3 bg-muted/5 h-0">
                            <div className="grid grid-cols-2 gap-3 pb-6">
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
                                            <div className="aspect-square relative flex items-center justify-center bg-muted/10">
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
                                            <div className="p-1.5 px-2 bg-card border-t">
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
                    </>
                ) : (
                    <ScrollArea className="flex-1 p-3 bg-muted/5">
                        <div className="flex flex-col gap-3 pb-20">
                            {!items?.length ? (
                                <div className="text-center py-12 text-muted-foreground text-sm px-4">
                                    Empty Parts List. Add parts from the Library to begin.
                                </div>
                            ) : (
                                items.map((projectItem: ProjectItem) => {
                                    const m = projectItem.model;
                                    if (!m) return null;
                                    const qtyDesired = projectItem.quantityDesired;
                                    const qtyAssigned = projectItem.quantityAssigned;
                                    const isWarning = qtyDesired !== qtyAssigned;

                                    return (
                                        <div
                                            key={projectItem.id}
                                            draggable={qtyDesired > qtyAssigned}
                                            onDragStart={(e) => {
                                                e.dataTransfer.setData("application/json", JSON.stringify({ projectItemId: projectItem.id, source: 'parts-list' }));
                                                e.dataTransfer.effectAllowed = 'copy';
                                            }}
                                            className={`relative group bg-background border transition-all rounded-lg overflow-hidden shrink-0 flex items-stretch h-24 ${isWarning ? 'border-yellow-500 shadow-yellow-500/20 shadow-sm ring-1 ring-yellow-500' : 'border-border'}`}
                                        >
                                            <div className="w-24 shrink-0 relative flex items-center justify-center bg-muted/10 border-r">
                                                <ImageWithFallback src={resolveModelThumbnail(m)} className="object-cover w-full h-full" />

                                                <div className="absolute top-1 left-1 flex flex-col gap-1 transition-opacity">
                                                    <div className="relative">
                                                        <div className="w-6 h-6 rounded border shadow-sm cursor-pointer bg-background overflow-hidden relative" title="Global Part Color">
                                                            <input
                                                                type="color"
                                                                value={projectItem.colorHex || '#6366f1'}
                                                                onChange={(e) => updateProjectItemColor.mutate({ projectItemId: projectItem.id, colorHex: e.target.value, projectId: projectId })}
                                                                className="absolute -top-2 -left-2 w-10 h-10 p-0 cursor-pointer border-0"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                                {isWarning && (
                                                    <div className="absolute bottom-1 right-1 text-[10px] font-bold bg-yellow-500 text-yellow-950 px-1 py-0 rounded shadow pointer-events-none" title={`${Math.abs(qtyDesired - qtyAssigned)} items mismatch`}>
                                                        !
                                                    </div>
                                                )}

                                                {qtyDesired > qtyAssigned && (
                                                    <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                                                        <div className="bg-background/90 text-primary p-1 rounded-full shadow-lg flex items-center">
                                                            <GripVertical className="w-4 h-4" />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="p-2 bg-card flex flex-col justify-between flex-1 min-w-0">
                                                <p className="text-sm truncate font-medium" title={m.name}>{m.name}</p>

                                                <div className="flex items-end justify-between">
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="text-[10px] text-muted-foreground uppercase font-bold">Placed</span>
                                                        <span className={`text-sm ${isWarning ? 'text-yellow-600 font-bold dark:text-yellow-500' : ''}`}>{qtyAssigned}</span>
                                                    </div>
                                                    <div className="flex flex-col gap-0.5 items-end">
                                                        <span className="text-[10px] text-muted-foreground uppercase font-bold">Desired</span>
                                                        <div className="flex items-center gap-1 border rounded bg-background">
                                                            <Button variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={() => updateProjectItemQuantity.mutate({ projectItemId: projectItem.id, quantityDesired: Math.max(0, qtyDesired - 1), projectId: projectId })}><Minus className="w-3 h-3" /></Button>
                                                            <span className="text-xs font-mono font-bold w-6 text-center">{qtyDesired}</span>
                                                            <Button variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={() => updateProjectItemQuantity.mutate({ projectItemId: projectItem.id, quantityDesired: qtyDesired + 1, projectId: projectId })}><Plus className="w-3 h-3" /></Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </ScrollArea>
                )}
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
