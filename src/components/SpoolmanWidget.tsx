import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Loader2, AlertTriangle, CheckCircle2, DollarSign, Star, Printer } from 'lucide-react';
import { Model } from '../types/model';
import { toast } from 'sonner';

interface Spool {
  id: number;
  remaining_weight: number;
  initial_weight: number;
  price: number;
  filament: {
    id: number;
    name: string;
    vendor?: { name: string };
    material?: { name: string };
    color_hex?: string;
    density?: number;
  };
}

interface SpoolmanWidgetProps {
  model: Model;
  onUpdateModel?: (updates: Partial<Model>) => void; // Callback to update parent
}

export const SpoolmanWidget: React.FC<SpoolmanWidgetProps> = ({ model, onUpdateModel }) => {
  const [loading, setLoading] = useState(false);
  const [spools, setSpools] = useState<Spool[]>([]);
  const [selectedSpoolId, setSelectedSpoolId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeducting, setIsDeducting] = useState(false);

  // 1. Get Preference from Model
  const preferredSpoolId = model.userDefined?.preferredSpoolId;

  // 2. Parse Model Weight
  const getModelWeight = (): number => {
    if (model.gcodeData?.totalFilamentWeight) return parseWeight(model.gcodeData.totalFilamentWeight);
    if (model.filamentUsed) return parseWeight(model.filamentUsed);
    return 0;
  };

  const parseWeight = (str: string) => {
    const match = str.match(/([\d.]+)\s*g/i);
    return match ? parseFloat(match[1]) : 0;
  };

  const modelWeight = getModelWeight();

  // 3. Fetch Spools
  useEffect(() => {
    const fetchSpools = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/spoolman/spools');
        const data = await res.json();
        
        if (data.success && Array.isArray(data.spools)) {
          let loadedSpools = data.spools;

          // --- SMART SORTING ---
          const gcodeMaterial = model.gcodeData?.filaments?.[0]?.type?.toLowerCase();
          const gcodeColor = model.gcodeData?.filaments?.[0]?.color?.toLowerCase(); // e.g. "#ff0000"

          loadedSpools = loadedSpools.sort((a: Spool, b: Spool) => {
            const matA = (a.filament.material?.name || '').toLowerCase();
            const matB = (b.filament.material?.name || '').toLowerCase();
            
            // Check Color Match (if available)
            // Note: Spoolman stores hex like "FF0000", parser might be "#FF0000"
            const colA = (a.filament.color_hex || '').toLowerCase();
            const colB = (b.filament.color_hex || '').toLowerCase();
            const targetColor = (gcodeColor || '').replace('#', ''); // strip hash for comparison

            if (targetColor) {
               const matchA = colA === targetColor;
               const matchB = colB === targetColor;
               if (matchA && !matchB) return -1;
               if (matchB && !matchA) return 1;
            }

            // Check Material Match (if color didn't decide it)
            if (gcodeMaterial) {
              if (matA === gcodeMaterial && matB !== gcodeMaterial) return -1;
              if (matB === gcodeMaterial && matA !== gcodeMaterial) return 1;
            }
            
            // Fallback: Remaining Weight
            return b.remaining_weight - a.remaining_weight;
          });
          // --- END SORTING ---

          setSpools(loadedSpools);
          
          // Selection logic (unchanged)
          if (preferredSpoolId) {
            const exists = loadedSpools.some((s: Spool) => s.id.toString() === preferredSpoolId.toString());
            if (exists) setSelectedSpoolId(preferredSpoolId.toString());
            else if (loadedSpools.length > 0) setSelectedSpoolId(loadedSpools[0].id.toString());
          } else if (loadedSpools.length > 0) {
            setSelectedSpoolId(loadedSpools[0].id.toString());
          }
        } else {
          if (res.status !== 400) setError("Failed to load inventory");
        }
      } catch (e) {
        console.error("Spoolman fetch error", e);
        setError("Connection failed");
      } finally {
        setLoading(false);
      }
    };

    fetchSpools();
  }, [preferredSpoolId, model.gcodeData]);

  // 4. Save Preference
  const handleSavePreference = async () => {
    if (!selectedSpoolId) return;
    setIsSaving(true);
    try {
        const res = await fetch('/api/model/metadata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filePath: model.filePath,
                updates: { preferredSpoolId: selectedSpoolId }
            })
        });

        if (res.ok) {
            toast.success("Spool preference saved!");
            if (!model.userDefined) model.userDefined = {};
            model.userDefined.preferredSpoolId = selectedSpoolId;
        } else {
            toast.error("Failed to save preference");
        }
    } catch (e) {
        toast.error("Error saving preference");
    } finally {
        setIsSaving(false);
    }
  };

  // 5. Handle "Print & Deduct"
  const handleDeduct = async () => {
    if (!selectedSpoolId || modelWeight <= 0) return;
    
    // Safety check
    const spool = spools.find(s => s.id.toString() === selectedSpoolId);
    if (!spool) return;

    if (!confirm(`Confirm Print?\n\nThis will deduct ${modelWeight}g from ${spool.filament.vendor?.name || 'Generic'} ${spool.filament.name}.\n\nCurrent: ${spool.remaining_weight}g\nNew: ${Math.round(spool.remaining_weight - modelWeight)}g`)) {
      return;
    }

    setIsDeducting(true);
    try {
      const res = await fetch('/api/spoolman/use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spoolId: selectedSpoolId,
          weight: modelWeight
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Deducted ${modelWeight}g from inventory!`);
        
        // Update local spool state to reflect new weight immediately
        setSpools(prev => prev.map(s => 
          s.id.toString() === selectedSpoolId 
            ? { ...s, remaining_weight: data.spool.remaining_weight } 
            : s
        ));

        // Mark as printed in Muncher
        if (onUpdateModel) {
          onUpdateModel({ isPrinted: true });
          
          // Also persist this change to backend
          await fetch('/api/save-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filePath: model.filePath,
              id: model.id,
              isPrinted: true
            })
          });
        }
      } else {
        toast.error(`Deduction failed: ${data.error}`);
      }
    } catch (e) {
      toast.error("Network error during deduction");
    } finally {
      setIsDeducting(false);
    }
  };

  // Logic & Render
  const selectedSpool = spools.find(s => s.id.toString() === selectedSpoolId);
  if (error) return null; // Or return simplified view
  if (loading) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin h-5 w-5 text-muted-foreground" /></div>;
  if (spools.length === 0) return null;

  const hasWeight = modelWeight > 0;
  const sufficient = selectedSpool ? selectedSpool.remaining_weight >= modelWeight : true;
  const spoolTotalWeight = selectedSpool?.initial_weight || 1000;
  const cost = selectedSpool ? (modelWeight / spoolTotalWeight) * selectedSpool.price : 0;
  const isPreferred = selectedSpoolId === preferredSpoolId?.toString();

  return (
    <Card className="bg-muted/30 border-dashed">
      <CardContent className="p-3 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1">
            <Printer className="w-3 h-3" /> Material Estimate
          </span>
          {hasWeight && (
            <Badge variant={sufficient ? "outline" : "destructive"} className="gap-1 text-[10px] h-5">
              {sufficient ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              {sufficient ? "In Stock" : "Low Stock"}
            </Badge>
          )}
        </div>

        {/* Spool Selector Row */}
        <div className="flex gap-2">
            <Select value={selectedSpoolId} onValueChange={setSelectedSpoolId}>
            <SelectTrigger className="w-full bg-background h-9 text-xs">
                <SelectValue placeholder="Select Filament" />
            </SelectTrigger>
            <SelectContent>
                {spools.map((spool) => (
                <SelectItem key={spool.id} value={spool.id.toString()}>
                    <div className="flex items-center gap-2">
                    <div 
                        className="w-3 h-3 rounded-full border shadow-sm" 
                        style={{ backgroundColor: spool.filament.color_hex || '#888' }} 
                    />
                    <span className="truncate max-w-[160px] text-xs">
                        {spool.filament.vendor?.name} {spool.filament.name}
                    </span>
                    </div>
                </SelectItem>
                ))}
            </SelectContent>
            </Select>
            
            <Button 
                size="icon" 
                variant={isPreferred ? "default" : "outline"} 
                className="h-9 w-9 shrink-0"
                onClick={handleSavePreference}
                disabled={isSaving}
                title="Save as preferred filament"
            >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 
                 <Star className={`w-4 h-4 ${isPreferred ? "fill-current" : ""}`} />
                }
            </Button>
        </div>

        {/* Stats Grid */}
        {hasWeight && selectedSpool && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-background rounded p-2 flex flex-col justify-center items-center border">
              <span className="text-[10px] text-muted-foreground uppercase">Est. Cost</span>
              <div className="text-lg font-bold text-green-600 dark:text-green-400 flex items-center">
                <DollarSign className="w-4 h-4" />
                {cost.toFixed(2)}
              </div>
            </div>
            
            {/* The "Print & Deduct" Action Button */}
            <Button 
              className="h-full flex flex-col items-center justify-center p-1 gap-0" 
              variant={sufficient ? "default" : "destructive"}
              disabled={isDeducting || !sufficient}
              onClick={handleDeduct}
              title="Deduct filament from inventory and mark as printed"
            >
                {isDeducting ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                    <>
                        <div className="text-[10px] uppercase opacity-80">Use</div>
                        <div className="text-lg font-bold leading-none">{Math.round(modelWeight)}g</div>
                    </>
                )}
            </Button>
          </div>
        )}

        {!hasWeight && (
          <div className="text-xs text-center text-muted-foreground italic py-1">
            Upload .gcode to enable cost calculation
          </div>
        )}
      </CardContent>
    </Card>
  );
};