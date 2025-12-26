import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Loader2, AlertTriangle, CheckCircle2, Printer } from 'lucide-react';
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
  };
}

interface SpoolmanWidgetProps {
  model: Model;
  onUpdateModel?: (updates: Partial<Model>) => void;
}

export const SpoolmanWidget: React.FC<SpoolmanWidgetProps> = ({ model, onUpdateModel }) => {
  const [loading, setLoading] = useState(false);
  const [spools, setSpools] = useState<Spool[]>([]);
  // Maps G-code Filament Index (0, 1, 2) -> Spoolman Spool ID
  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [isDeducting, setIsDeducting] = useState(false);

  // 1. Analyze G-code Data (Filaments & Weights)
  const gcodeFilaments = model.gcodeData?.filaments || [];
  const isMultiMaterial = gcodeFilaments.length > 1;
  
  // Helper to parse weight strings ("123.4g")
  const parseWeight = (str?: string | number) => {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    const match = str.match(/([\d.]+)\s*g?/i);
    return match ? parseFloat(match[1]) : 0;
  };

  // 2. Fetch Inventory
  useEffect(() => {
    const fetchSpools = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/spoolman/spools');
        const data = await res.json();
        if (data.success && Array.isArray(data.spools)) {
          let loaded = data.spools;
          
          // Smart Sort (prioritize matches for the *first* filament to help single-mode)
          const firstType = gcodeFilaments[0]?.type?.toLowerCase();
          if (firstType) {
             loaded = loaded.sort((a: Spool, b: Spool) => {
                const matA = (a.filament.material?.name || '').toLowerCase();
                const matB = (b.filament.material?.name || '').toLowerCase();
                if (matA === firstType && matB !== firstType) return -1;
                if (matB === firstType && matA !== firstType) return 1;
                return b.remaining_weight - a.remaining_weight;
             });
          }
          setSpools(loaded);

          // Initialize Assignments
          // If we have a saved preference, apply it to Index 0
          const initial: Record<number, string> = {};
          if (model.userDefined?.preferredSpoolId) {
             initial[0] = model.userDefined.preferredSpoolId;
          } else if (loaded.length > 0) {
             initial[0] = loaded[0].id.toString();
          }
          
          // For multi-material, we default subsequent slots to "Unassigned" or try to smart-match later
          // (For now, just leave them empty so user forces selection)
          setAssignments(prev => ({ ...initial, ...prev }));
        }
      } catch (e) {
        console.error("Spoolman fetch error", e);
      } finally {
        setLoading(false);
      }
    };
    fetchSpools();
  }, [model.filePath]); // Reload if file changes

  // 3. Handle Assignment Change
  const handleAssign = (index: number, spoolId: string) => {
    setAssignments(prev => ({ ...prev, [index]: spoolId }));
    
    // Auto-save preference for the primary filament (Index 0)
    if (index === 0) {
        // (Optional: Call API to save preferredSpoolId like before)
    }
  };

  // 4. Calculations
  let totalCost = 0;
  let canPrint = true;
  let missingAssignments = false;

  // If no detailed filament data, fallback to total weight on Index 0
  const renderList = gcodeFilaments.length > 0 ? gcodeFilaments : [{ type: 'Unknown', weight: model.filamentUsed || '0g', color: '#888' }];

  const calculationRows = renderList.map((gf, idx) => {
      const weight = parseWeight(gf.weight);
      const spoolId = assignments[idx];
      const spool = spools.find(s => s.id.toString() === spoolId);
      
      let rowCost = 0;
      let sufficient = true;

      if (spool) {
         const spoolWeight = spool.initial_weight || 1000;
         rowCost = (weight / spoolWeight) * spool.price;
         if (spool.remaining_weight < weight) sufficient = false;
         totalCost += rowCost;
      } else {
         missingAssignments = true;
      }
      
      if (!sufficient) canPrint = false;

      return { idx, weight, spool, sufficient, type: gf.type, color: gf.color };
  });

  // 5. Execute Deduction
  const handleDeductAll = async () => {
    if (!canPrint || missingAssignments) return;
    
    if (!confirm(`Confirm Usage?\n\nThis will deduct filament from ${Object.keys(assignments).length} spools.`)) return;

    setIsDeducting(true);
    try {
        // Sequentially process deductions
        for (const row of calculationRows) {
            if (!row.spool || row.weight <= 0) continue;
            
            await fetch('/api/spoolman/use', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ spoolId: row.spool.id, weight: row.weight })
            });
        }
        
        toast.success("Inventory updated!");
        if (onUpdateModel) {
            onUpdateModel({ isPrinted: true });
            // ... persist to backend ...
        }
    } catch (e) {
        toast.error("Error updating inventory");
    } finally {
        setIsDeducting(false);
    }
  };

  if (loading) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin h-5 w-5 text-muted-foreground" /></div>;
  if (spools.length === 0) return null;

  return (
    <Card className="bg-muted/20 border-dashed">
      <CardContent className="p-3 space-y-3">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1">
            <Printer className="w-3 h-3" /> 
            {isMultiMaterial ? "Multi-Material Setup" : "Material Estimate"}
          </span>
          {/* Global Status Badge */}
          {(!missingAssignments && canPrint) ? (
             <Badge variant="outline" className="text-[10px] h-5 gap-1 bg-green-500/10 text-green-600 border-green-200">
                <CheckCircle2 className="w-3 h-3" /> Ready
             </Badge>
          ) : (
             <Badge variant="outline" className="text-[10px] h-5 gap-1 bg-yellow-500/10 text-yellow-600 border-yellow-200">
                <AlertTriangle className="w-3 h-3" /> Check Stock
             </Badge>
          )}
        </div>

        {/* Rows */}
        <div className="space-y-2">
            {calculationRows.map((row) => (
                <div key={row.idx} className="flex gap-2 items-center">
                    {/* Visual Indicator of G-code Color */}
                    <div 
                        className="w-2 h-8 rounded-full shrink-0 border shadow-sm opacity-80" 
                        style={{ backgroundColor: row.color || '#888' }}
                        title={`G-code requests: ${row.type}`} 
                    />
                    
                    {/* Spool Selector */}
                    <div className="flex-1 min-w-0">
                        <Select value={assignments[row.idx] || ''} onValueChange={(v) => handleAssign(row.idx, v)}>
                            <SelectTrigger className="h-8 text-xs bg-background">
                                <SelectValue placeholder={`Select ${row.type}...`} />
                            </SelectTrigger>
                            <SelectContent>
                                {spools.map(s => (
                                    <SelectItem key={s.id} value={s.id.toString()}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{backgroundColor: s.filament.color_hex}} />
                                            <span className="truncate">{s.filament.vendor?.name} {s.filament.name}</span>
                                            <span className="text-muted-foreground ml-auto opacity-50">({Math.round(s.remaining_weight)}g)</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {/* Requirement Text */}
                        <div className="flex justify-between text-[10px] text-muted-foreground px-1 mt-0.5">
                            <span>Req: {row.type}</span>
                            <span>{Math.round(row.weight)}g needed</span>
                        </div>
                    </div>
                </div>
            ))}
        </div>

        {/* Footer: Totals & Actions */}
        <div className="grid grid-cols-2 gap-2 pt-2">
            {/* [FIX] Cost Box with Theme Matching Rounded Corners */}
            <div className="bg-card text-card-foreground border rounded-lg p-2 flex flex-col justify-center items-center shadow-sm">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Cost</span>
              <div className="text-lg font-bold flex items-center">
                <span className="text-sm opacity-50 mr-0.5">$</span>
                {totalCost.toFixed(2)}
              </div>
            </div>
            
            <Button 
              className="h-full shadow-sm rounded-lg" 
              variant={(!missingAssignments && canPrint) ? "default" : "secondary"}
              disabled={isDeducting || !canPrint || missingAssignments}
              onClick={handleDeductAll}
            >
                {isDeducting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Print & Deduct"}
            </Button>
        </div>

      </CardContent>
    </Card>
  );
};