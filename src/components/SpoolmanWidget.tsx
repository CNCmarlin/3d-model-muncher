import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Loader2, AlertTriangle, CheckCircle2, DollarSign } from 'lucide-react';
import { Model } from '../types/model';
import { toast } from 'sonner';

interface Spool {
  id: number;
  remaining_weight: number;
  initial_weight: number; // needed for cost calc if price is per spool
  price: number;
  filament: {
    id: number;
    name: string;
    vendor?: { name: string };
    material?: { name: string };
    color_hex?: string;
    density?: number; // g/cm3
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

  // 1. Parse Model Weight (e.g. "45g" -> 45)
  const getModelWeight = (): number => {
    // Check userDefined first, then parsed
    const raw = model.userDefined?.filamentUsed || model.filamentUsed;
    if (!raw) return 0;
    
    // Simple regex to extract number from "123.45g" or "123g"
    const match = raw.match(/([\d.]+)\s*g/i);
    return match ? parseFloat(match[1]) : 0;
  };

  const modelWeight = getModelWeight();

  // 2. Fetch Spools on Mount
  useEffect(() => {
    const fetchSpools = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/spoolman/spools');
        const data = await res.json();
        
        if (data.success && Array.isArray(data.spools)) {
          setSpools(data.spools);
          // Optional: Auto-select first compatible material or just the first spool
          if (data.spools.length > 0) setSelectedSpoolId(data.spools[0].id.toString());
        } else {
          // If 400, maybe not configured
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
  }, []);

  // 3. Calculate Logic
  const selectedSpool = spools.find(s => s.id.toString() === selectedSpoolId);
  
  if (error) return null; // Don't show if broken/not configured
  if (loading) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin h-5 w-5 text-muted-foreground" /></div>;
  if (spools.length === 0) return null; // Hide if no spools found

  // Calculations
  const hasWeight = modelWeight > 0;
  const sufficient = selectedSpool ? selectedSpool.remaining_weight >= modelWeight : true;
  
  // Cost = (ModelWeight / InitialWeight) * Price
  // Fallback: If initial_weight is 0/missing, assume 1000g standard
  const spoolTotalWeight = selectedSpool?.initial_weight || 1000;
  const cost = selectedSpool ? (modelWeight / spoolTotalWeight) * selectedSpool.price : 0;

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

        {/* Spool Selector */}
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
                  <span className="truncate max-w-[180px]">
                    {spool.filament.vendor?.name} {spool.filament.name}
                  </span>
                  <span className="text-muted-foreground text-xs ml-auto">
                    {Math.round(spool.remaining_weight)}g left
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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