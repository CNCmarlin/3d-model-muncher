import { useState, useMemo } from 'react';
import { Collection } from '../types/collection';
import { Model } from '../types/model';
import { Button } from './ui/button';
import { ScrollArea, ScrollBar } from './ui/scroll-area';
import { Plus, Trash2, Printer, Box, LayoutGrid } from 'lucide-react';
import { ImageWithFallback } from './ImageWithFallback';
import { resolveModelThumbnail } from '../utils/thumbnailUtils';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { toast } from 'sonner';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "./ui/dropdown-menu";
  import { CheckCircle2, CircleDashed, Slice } from "lucide-react"; // Icons for statuses

interface ProjectViewProps {
  collection: Collection;
  models: Model[]; // ALL models in the library (we filter locally)
  onUpdateCollection: (updated: Collection) => void;
  onModelClick: (model: Model) => void;
  onBack: () => void;
}

export function ProjectView({ collection, models, onUpdateCollection, onModelClick, onBack }: ProjectViewProps) {
  const [isPoolOpen, setIsPoolOpen] = useState(true);
  const [editingPlateId, setEditingPlateId] = useState<string | null>(null);
  const [tempName, setTempName] = useState("");

  // 1. Filter models belonging to this project
  const projectModelIds = useMemo(() => new Set(collection.modelIds || []), [collection.modelIds]);
  const projectModels = useMemo(() => models.filter(m => projectModelIds.has(m.id)), [models, projectModelIds]);

  // 2. Determine Assigned vs Unassigned
  const assignedModelIds = useMemo(() => {
    const set = new Set<string>();
    collection.buildPlates?.forEach(bp => bp.modelIds.forEach(id => set.add(id)));
    return set;
  }, [collection.buildPlates]);

  const unassignedModels = useMemo(() => 
    projectModels.filter(m => !assignedModelIds.has(m.id)), 
  [projectModels, assignedModelIds]);

  // --- Actions ---

  const handleAddPlate = async () => {
    try {
      const res = await fetch(`/api/collections/${collection.id}/build-plates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Plate ${(collection.buildPlates?.length || 0) + 1}` })
      });
      const data = await res.json();
      if (data.success && data.collection) {
        onUpdateCollection(data.collection);
        toast.success("Build plate added");
      }
    } catch (e) { toast.error("Failed to add plate"); }
  };

  const handleDeletePlate = async (plateId: string) => {
    if(!confirm("Delete this build plate? Models will return to the unassigned pool.")) return;
    try {
        const res = await fetch(`/api/collections/${collection.id}/build-plates/${plateId}`, { method: 'DELETE' });
        if(res.ok) {
            // Optimistic update
            const updatedPlates = collection.buildPlates?.filter(p => p.id !== plateId) || [];
            onUpdateCollection({ ...collection, buildPlates: updatedPlates });
            toast.success("Plate removed");
        }
    } catch(e) { toast.error("Failed to delete"); }
  };

  const handleRenamePlate = async (plateId: string) => {
    if(!tempName.trim()) return;
    try {
        const res = await fetch(`/api/collections/${collection.id}/build-plates/${plateId}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name: tempName })
        });
        const data = await res.json();
        if(data.success) {
            const updatedPlates = collection.buildPlates?.map(p => p.id === plateId ? data.buildPlate : p) || [];
            onUpdateCollection({ ...collection, buildPlates: updatedPlates });
            setEditingPlateId(null);
        }
    } catch(e) { toast.error("Rename failed"); }
  };

  const handleAssignModel = async (modelId: string, plateId: string) => {
    // Optimistic Logic: Remove from current plate (if any) and add to target
    const currentPlates = [...(collection.buildPlates || [])];
    
    // 1. Remove from source plate(s)
    currentPlates.forEach(p => {
        if(p.modelIds.includes(modelId)) {
            p.modelIds = p.modelIds.filter(id => id !== modelId);
            // Trigger backend update for source plate... (omitted for brevity, ideally batch)
        }
    });

    const handleUpdateStatus = async (plateId: string, newStatus: string) => {
        try {
            const res = await fetch(`/api/collections/${collection.id}/build-plates/${plateId}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ status: newStatus })
            });
            if(res.ok) {
                const data = await res.json();
                // Optimistic update of local state
                const updatedPlates = collection.buildPlates?.map(p => 
                    p.id === plateId ? { ...p, status: newStatus as any } : p
                ) || [];
                onUpdateCollection({ ...collection, buildPlates: updatedPlates });
                toast.success(`Status changed to ${newStatus}`);
            }
        } catch(e) { toast.error("Failed to update status"); }
      };

    // 2. Add to target plate
    const target = currentPlates.find(p => p.id === plateId);
    if(target) {
        if(!target.modelIds.includes(modelId)) target.modelIds.push(modelId);
        
        // Save Target
        await fetch(`/api/collections/${collection.id}/build-plates/${target.id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ modelIds: target.modelIds })
        });
        
        onUpdateCollection({ ...collection, buildPlates: currentPlates });
    }
  };

  const handleUnassignModel = async (modelId: string) => {
    const currentPlates = [...(collection.buildPlates || [])];
    let changed = false;
    
    for(const p of currentPlates) {
        if(p.modelIds.includes(modelId)) {
            p.modelIds = p.modelIds.filter(id => id !== modelId);
            changed = true;
            // Save this plate
            await fetch(`/api/collections/${collection.id}/build-plates/${p.id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ modelIds: p.modelIds })
            });
        }
    }
    if(changed) onUpdateCollection({ ...collection, buildPlates: currentPlates });
  };

  return (
    <div className="flex h-full overflow-hidden bg-background">
      
      {/* ZONE A: The Build Floor (Center) */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-4 border-b flex justify-between items-center bg-card shadow-sm z-10">
            <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                    <Box className="w-5 h-5 text-primary" />
                    {collection.name}
                </h2>
                <p className="text-xs text-muted-foreground">Project Workspace</p>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onBack}>Back to Library</Button>
                <Button size="sm" onClick={handleAddPlate} className="gap-2">
                    <Plus className="w-4 h-4" /> New Build Plate
                </Button>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => setIsPoolOpen(!isPoolOpen)}
                    className={isPoolOpen ? "bg-accent" : ""}
                >
                    <LayoutGrid className="w-4 h-4" />
                </Button>
            </div>
        </div>

        <ScrollArea className="flex-1 p-6 bg-muted/10">
            <div className="space-y-8 pb-20">
                {collection.buildPlates?.map((plate) => (
                    <div key={plate.id} className="bg-card rounded-xl border shadow-sm overflow-hidden">
                        {/* Plate Header */}
                        <div className="px-4 py-3 border-b flex justify-between items-center bg-muted/30">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 bg-background rounded-md border shadow-sm">
                                    <Printer className="w-4 h-4 text-orange-500" />
                                </div>
                                {editingPlateId === plate.id ? (
                                    <div className="flex items-center gap-2">
                                        <Input 
                                            value={tempName} 
                                            onChange={e => setTempName(e.target.value)} 
                                            className="h-7 w-48"
                                            autoFocus
                                        />
                                        <Button size="sm" onClick={() => handleRenamePlate(plate.id)}>Save</Button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 group cursor-pointer" onClick={() => { setTempName(plate.name); setEditingPlateId(plate.id); }}>
                                        <span className="font-semibold text-sm">{plate.name}</span>
                                        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full border bg-background">
                                            {plate.modelIds.length} items
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {/* [NEW] Status Switcher Dropdown */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Badge 
                                            variant={plate.status === 'printed' ? 'default' : plate.status === 'sliced' ? 'secondary' : 'outline'} 
                                            className="capitalize cursor-pointer hover:opacity-80 gap-1 pr-2 transition-all select-none"
                                        >
                                            {plate.status === 'printed' && <CheckCircle2 className="w-3 h-3" />}
                                            {plate.status === 'sliced' && <Slice className="w-3 h-3" />}
                                            {plate.status === 'draft' && <CircleDashed className="w-3 h-3" />}
                                            {plate.status}
                                        </Badge>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => handleUpdateStatus(plate.id, 'draft')}>
                                            <CircleDashed className="w-4 h-4 mr-2" /> Draft
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleUpdateStatus(plate.id, 'sliced')}>
                                            <Slice className="w-4 h-4 mr-2" /> Sliced
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleUpdateStatus(plate.id, 'printed')}>
                                            <CheckCircle2 className="w-4 h-4 mr-2" /> Printed
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDeletePlate(plate.id)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>

                        {/* Plate Content (Horizontal Scroll) */}
                        <div className="p-4 bg-muted/10 min-h-[140px]">
                            {plate.modelIds.length === 0 ? (
                                <div className="h-24 border-2 border-dashed border-muted-foreground/20 rounded-lg flex flex-col items-center justify-center text-muted-foreground text-xs">
                                    <span>Empty Build Plate</span>
                                    <span className="opacity-50">Drag items here (Click "+" on models in Pool)</span>
                                </div>
                            ) : (
                                <ScrollArea className="w-full whitespace-nowrap pb-2">
                                    <div className="flex gap-3">
                                        {plate.modelIds.map(id => {
                                            const m = projectModels.find(mod => mod.id === id);
                                            if(!m) return null;
                                            return (
                                                <div key={id} className="relative group w-28 shrink-0">
                                                    <div className="aspect-square rounded-lg border bg-background overflow-hidden relative">
                                                        <ImageWithFallback 
                                                            src={resolveModelThumbnail(m)} 
                                                            className="w-full h-full object-cover" 
                                                        />
                                                        <Button 
                                                            size="icon" 
                                                            variant="destructive" 
                                                            className="absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            onClick={() => handleUnassignModel(m.id)}
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </Button>
                                                    </div>
                                                    <p className="text-[10px] font-medium mt-1 truncate px-1" title={m.name}>
                                                        {m.name}
                                                    </p>
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <ScrollBar orientation="horizontal" />
                                </ScrollArea>
                            )}
                        </div>
                    </div>
                ))}

                {(!collection.buildPlates || collection.buildPlates.length === 0) && (
                    <div className="text-center py-12">
                        <h3 className="text-lg font-medium text-muted-foreground">No Build Plates Yet</h3>
                        <Button onClick={handleAddPlate} className="mt-4">Create Your First Plate</Button>
                    </div>
                )}
            </div>
        </ScrollArea>
      </div>

      {/* ZONE B: The Warehouse (Right Sidebar) */}
      <div 
        className={`bg-card border-l transition-all duration-300 ease-in-out flex flex-col ${
            isPoolOpen ? "w-80" : "w-0 opacity-0 overflow-hidden"
        }`}
      >
        <div className="p-3 border-b bg-muted/20 flex justify-between items-center shrink-0">
            <h3 className="text-sm font-semibold flex items-center gap-2">
                <Box className="w-4 h-4" />
                Unassigned Parts
            </h3>
            <Badge variant="secondary">{unassignedModels.length}</Badge>
        </div>

        <ScrollArea className="flex-1 p-3">
            <div className="grid grid-cols-2 gap-2">
                {unassignedModels.map(model => (
                    <div 
                        key={model.id} 
                        className="group relative bg-background border rounded-md overflow-hidden hover:shadow-md transition-all cursor-pointer"
                        onClick={() => onModelClick(model)}
                    >
                        <div className="aspect-square relative">
                            <ImageWithFallback src={resolveModelThumbnail(model)} className="object-cover w-full h-full" />
                            
                            {/* Quick Assign Overlay */}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 transition-opacity">
                                <span className="text-[10px] text-white font-medium mb-1">Add to:</span>
                                {collection.buildPlates?.slice(0, 3).map(bp => (
                                    <Button 
                                        key={bp.id} 
                                        size="sm" 
                                        variant="secondary" 
                                        className="h-5 text-[10px] w-20 truncate"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleAssignModel(model.id, bp.id);
                                        }}
                                    >
                                        {bp.name}
                                    </Button>
                                ))}
                            </div>
                        </div>
                        <div className="p-1.5">
                            <p className="text-xs truncate font-medium">{model.name}</p>
                        </div>
                    </div>
                ))}
            </div>
            {unassignedModels.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-xs">
                    All parts assigned!
                </div>
            )}
        </ScrollArea>
      </div>
    </div>
  );
}