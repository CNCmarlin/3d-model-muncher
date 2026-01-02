import {
  Clock, Weight, HardDrive, Layers, Droplet,
  Diameter, Database, Store,
  Info, RefreshCw
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Model } from "@/types/model";
import { useSpoolman } from "@/context/SpoolmanContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useState } from "react";

interface PrintSettingsSectionProps {
  currentModel: Model;
  safePrintSettings: {
    layerHeight: string;
    infill: string;
    nozzle: string;
    printer: string;
    material: string;
  };
}

export const PrintSettingsSection = ({
  currentModel,
  safePrintSettings
}: PrintSettingsSectionProps) => {
  // 1. Get tools from your actual Spoolman Context
  const { spools, getSpoolById, refreshSpools, loading: isSpoolmanLoading } = useSpoolman();

  // 2. Local selection state (Select component requires string values)
  const [localSpoolId, setLocalSpoolId] = useState<string>("");

  // 3. Find active spool using your context's helper function
  const activeSpool = getSpoolById(localSpoolId);

  return (
    <div className="space-y-4 mb-4">
      <h3 className="font-semibold text-lg text-card-foreground">Print Settings</h3>

      {safePrintSettings.printer && (
        <p className="text-sm text-muted-foreground">
          Printer: <span className="font-medium text-foreground">{safePrintSettings.printer}</span>
        </p>
      )}

      {/* Primary Stats Grid - Unified 2x2 */}
      <div className="grid grid-cols-2 gap-4 pt-2 pt-4 border-t">
        {/* Print Time */}
        <div className="flex items-center gap-2 text-sm bg-muted/20 p-2 rounded-md border border-transparent hover:border-border transition-colors">
          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-tighter text-muted-foreground">Print Time</span>
            <span className="font-medium text-foreground leading-none">{currentModel.printTime || 'Unknown'}</span>
          </div>
        </div>

        {/* Filament Weight */}
        <div className="flex items-center gap-2 text-sm bg-muted/20 p-2 rounded-md border border-transparent hover:border-border transition-colors">
          <Weight className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-tighter text-muted-foreground">Filament</span>
            <span className="font-medium text-foreground leading-none">{currentModel.filamentUsed || 'Unknown'}</span>
          </div>
        </div>

        {/* File Size */}
        <div className="flex items-center gap-2 text-sm bg-muted/20 p-2 rounded-md border border-transparent hover:border-border transition-colors">
          <HardDrive className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-tighter text-muted-foreground">File Size</span>
            <span className="font-medium text-foreground leading-none truncate max-w-[80px]">{currentModel.fileSize || 'Unknown'}</span>
          </div>
        </div>

        {/* Price (Moved into the 2x2 grid) */}
        <div className="flex items-center gap-2 text-sm bg-primary/5 p-2 rounded-md border border-primary/10 transition-colors">
          <Store className="h-4 w-4 text-primary/60 shrink-0" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-tighter text-primary/70 font-bold">Price</span>
            <span className="font-bold text-foreground leading-none">
              {currentModel.price !== undefined && currentModel.price !== 0 ? `$${currentModel.price}` : 'Free'}
            </span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Slicer Settings Cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* Material */}
        <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg border">
          <div className="flex items-center justify-center w-10 h-10 bg-background rounded-lg border">
            <Database className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Material</p>
            <p className="font-semibold text-foreground uppercase">{safePrintSettings.material}</p>
          </div>
        </div>

        {/* Layer Height */}
        <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg border">
          <div className="flex items-center justify-center w-10 h-10 bg-background rounded-lg border">
            <Layers className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Layer Height</p>
            <p className="font-semibold text-foreground">
              {safePrintSettings.layerHeight !== 'Unknown' ? `${safePrintSettings.layerHeight} mm` : 'Unknown'}
            </p>
          </div>
        </div>

        {/* Infill */}
        <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg border">
          <div className="flex items-center justify-center w-10 h-10 bg-background rounded-lg border">
            <Droplet className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Infill</p>
            <p className="font-semibold text-foreground">{safePrintSettings.infill}</p>
          </div>
        </div>

        {/* Nozzle */}
        <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg border">
          <div className="flex items-center justify-center w-10 h-10 bg-background rounded-lg border">
            <Diameter className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Nozzle</p>
            <p className="font-semibold text-foreground">
              {safePrintSettings.nozzle !== 'Unknown' ? `${safePrintSettings.nozzle} mm` : 'Unknown'}
            </p>
          </div>
        </div>
      </div>

      {/* CONDITIONAL SPOOLMAN WIDGET */}
      {spools.length > 0 ? (
        /* 1. THE ACTIVE WIDGET (Your existing code) */
        <div className="flex flex-col gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20 transition-all pt-4 border-t">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-primary/70">Inventory Sync</p>
              <button
                onClick={(e) => { e.stopPropagation(); refreshSpools(); }}
                disabled={isSpoolmanLoading}
                className={`p-1 rounded-full hover:bg-primary/10 transition-colors ${isSpoolmanLoading ? 'animate-spin opacity-50' : ''}`}
                title="Sync with Spoolman"
              >
                <RefreshCw className="h-3 w-3 text-primary/60" />
              </button>
            </div>

            {activeSpool?.filament.color_hex && (
              <div
                className="w-3 h-3 rounded-full border border-black/10 shadow-sm animate-in fade-in duration-300"
                style={{ backgroundColor: `#${activeSpool.filament.color_hex}` }}
              />
            )}
          </div>

          <Select value={localSpoolId} onValueChange={setLocalSpoolId}>
            <SelectTrigger className="h-7 text-[11px] bg-background border-primary/20">
              <SelectValue placeholder={isSpoolmanLoading ? "Loading..." : "Select Spool..."} />
            </SelectTrigger>
            <SelectContent>
              {spools.map(spool => (
                <SelectItem key={spool.id} value={spool.id.toString()}>
                  {spool.filament.name} ({Math.round(spool.remaining_weight)}g)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {activeSpool && (
            <div className="flex items-center gap-1.5 mt-1 animate-in slide-in-from-left-1 duration-200">
              <Info className="h-3 w-3 text-primary/60" />
              <p className="text-[10px] text-muted-foreground leading-none">
                Est. {Math.round(activeSpool.remaining_weight - parseFloat(currentModel.filamentUsed || "0"))}g remaining
              </p>
            </div>
          )}
        </div>
      ) : (
        /* 2. THE DISCONNECTED MESSAGE (Placeholder) */
        <div className="p-3 bg-muted/20 rounded-lg border border-dashed flex flex-col items-center justify-center gap-1 text-center group hover:bg-muted/40 transition-colors">
          <Database className="h-4 w-4 text-muted-foreground/50" />
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">
            Inventory Offline
          </p>
          <p className="text-[9px] text-muted-foreground/60 leading-tight max-w-[180px]">
            Connect Spoolman in the <span className="text-primary/60 font-bold">Integrations</span> tab to track filament usage.
          </p>
        </div>
      )}
    </div>
  );
};