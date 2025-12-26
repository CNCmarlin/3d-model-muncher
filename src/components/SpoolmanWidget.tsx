import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Button } from './ui/button'; // Need button
import { Loader2, AlertTriangle, CheckCircle2, DollarSign, Star } from 'lucide-react'; // Added Star
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
}

export const SpoolmanWidget: React.FC<SpoolmanWidgetProps> = ({ model }) => {
  const [loading, setLoading] = useState(false);
  const [spools, setSpools] = useState<Spool[]>([]);
  const [selectedSpoolId, setSelectedSpoolId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 1. Get Preference from Model
  const preferredSpoolId = model.userDefined?.preferredSpoolId;

  // 2. Parse Model Weight
  const getModelWeight = (): number => {
    // Check nested G-code data first (most accurate)
    if (model.gcodeData?.totalFilamentWeight) return parseWeight(model.gcodeData.totalFilamentWeight);
    // Fallback to top level
    if (model.filamentUsed) return parseWeight(model.filamentUsed);
    return 0;
  };

  const parseWeight = (str: string) => {
    const match = str.match(/([\d.]+)\s*g/i);
    return match ? parseFloat(match[1]) : 0;
  };

  const modelWeight = getModelWeight();

  // 3. Fetch Spools on Mount
  useEffect(() => {
    const fetchSpools = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/spoolman/spools');
        const data = await res.json();
        
        if (data.success && Array.isArray(data.spools)) {
          setSpools(data.spools);
          
          // Logic: If preference exists, use it. Else default to first.
          if (preferredSpoolId) {
            setSelectedSpoolId(preferredSpoolId.toString());
          } else if (data.spools.length > 0) {
            setSelectedSpoolId(data.spools[0].id.toString());
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
  }, [preferredSpoolId]); // Re-run if model preference changes

  // 4. Save Preference Handler
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
            // Update local model object mutation (temporary until reload)
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

  // Calculations
  const selectedSpool = spools.find(s => s.id.toString() === selectedSpoolId);
  if (error) return null;
  if (loading) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin h-5 w-5 text-muted-foreground" /></div>;
  if (spools.length === 0) return null;

  const hasWeight = modelWeight > 0;
  const sufficient = selectedSpool ? selectedSpool.remaining_weight >= modelWeight : true;
  const spoolTotalWeight = selectedSpool?.initial_weight || 1000;
  const cost = selectedSpool ? (modelWeight / spoolTotalWeight) * selectedSpool.price : 0;
  
  // Is the current selection the saved preference?
  const isPreferred = selectedSpoolId === preferredSpoolId?.toString();

  return (
    <Card className="bg-muted/30 border-dashed">
      <CardContent className="p-3 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
            Material Estimate
          </span>
          {hasWeight && (
            <Badge variant={sufficient ? "outline" : "destructive"} className="gap-1">
              {sufficient ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              {sufficient ? "In Stock" : "Low Stock"}
            </Badge>
          )}
        </div>

        {/* Spool Selector Row */}
        <div className="flex gap-2">
            <Select value={selectedSpoolId} onValueChange={setSelectedSpoolId}>
            <SelectTrigger className="w-full bg-background h-9">
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
                    <span className="truncate max-w-[160px]">
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
                title="Save as preferred filament for this model"
            >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 
                 <Star className={`w-4 h-4 ${isPreferred ? "fill-current" : ""}`} />
                }
            </Button>
        </div>

        {/* Stats Grid */}
        {hasWeight && selectedSpool && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="bg-background rounded p-2 flex flex-col justify-center items-center border">
              <span className="text-[10px] text-muted-foreground uppercase">Est. Cost</span>
              <div className="text-lg font-bold text-green-600 dark:text-green-400 flex items-center">
                <DollarSign className="w-4 h-4" />
                {cost.toFixed(2)}
              </div>
            </div>
            <div className="bg-background rounded p-2 flex flex-col justify-center items-center border">
              <span className="text-[10px] text-muted-foreground uppercase">Remaining</span>
              <div className={`text-lg font-bold ${sufficient ? '' : 'text-red-500'}`}>
                {Math.round(selectedSpool.remaining_weight - modelWeight)}g
              </div>
            </div>
          </div>
        )}

        {!hasWeight && (
          <div className="text-xs text-center text-muted-foreground italic py-1">
            Upload .3mf/.gcode to calculate costs
          </div>
        )}
      </CardContent>
    </Card>
  );
};