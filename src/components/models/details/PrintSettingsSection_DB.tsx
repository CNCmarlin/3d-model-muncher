import { SearchableSelect_DB } from "@/components/common/SearchableSelect_DB";
import { Separator } from "@/components/ui/separator";
import { useSpoolman } from "@/context/SpoolmanContext";
import { Model } from "@/types/model_db";
import { formatFileSize } from "@/utils/clientUtils_db";
import { formatSecondsToDuration } from "@/utils/timeUtils_db";
import {
  Clock,
  Database,
  Diameter,
  Droplet,
  HardDrive,
  Info,
  Layers,
  RefreshCw,
  Store,
  Weight
} from "lucide-react";
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

export const PrintSettingsSection_DB = ({
  currentModel,
  safePrintSettings
}: PrintSettingsSectionProps) => {
  const { spools, getSpoolById, refreshSpools, loading: isSpoolmanLoading } = useSpoolman();
  const [localSpoolId, setLocalSpoolId] = useState<string>("");
  const activeSpool = getSpoolById(localSpoolId);

  return (
    <div className="space-y-6">
      {/* 1. Header & Primary Info Area */}
      <div className="space-y-4">
        <h3 className="font-black text-sm uppercase tracking-[0.2em] text-muted-foreground/50">PRINT SETTINGS</h3>

        {safePrintSettings.printer && (
          <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            <span className="opacity-40">Printer:</span>
            <span className="text-foreground">{safePrintSettings.printer}</span>
          </div>
        )}
      </div>

      <Separator />

      {/* 2. Primary Stats Grid - 2x2 with Time/Filament and Size/Price */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {/* Print Time */}
          <div className="flex items-center gap-3 bg-muted/20 p-3 rounded-xl border border-transparent hover:border-border hover:bg-muted/30 transition-all group">
            <Clock className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            <div className="flex flex-col">
              <span className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground/60 leading-tight">Print Time</span>
              <span className="font-bold text-sm text-foreground tabular-nums">{formatSecondsToDuration(currentModel.printTime || 0)}</span>
            </div>
          </div>

          {/* Filament Weight */}
          <div className="flex items-center gap-3 bg-muted/20 p-3 rounded-xl border border-transparent hover:border-border hover:bg-muted/30 transition-all group">
            <Weight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            <div className="flex flex-col">
              <span className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground/60 leading-tight">Filament</span>
              <span className="font-bold text-sm text-foreground tabular-nums">
                {currentModel.filamentUsage ? `${currentModel.filamentUsage}g` : 'Unknown'}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* File Size */}
          <div className="flex items-center gap-3 bg-muted/20 p-3 rounded-xl border border-transparent hover:border-border hover:bg-muted/30 transition-all group">
            <HardDrive className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            <div className="flex flex-col">
              <span className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground/60 leading-tight">File Size</span>
              <span className="font-bold text-sm text-foreground tabular-nums truncate max-w-[100px]">
                {currentModel.fileSize ? (isNaN(Number(currentModel.fileSize)) ? currentModel.fileSize : formatFileSize(Number(currentModel.fileSize))) : 'Unknown'}
              </span>
            </div>
          </div>

          {/* Price */}
          <div className="flex items-center gap-3 bg-primary/5 p-3 rounded-xl border border-primary/10 hover:border-primary/20 hover:bg-primary/10 transition-all group">
            <Store className="h-4 w-4 text-primary/60 shrink-0" />
            <div className="flex flex-col">
              <span className="text-[9px] uppercase font-bold tracking-widest text-primary/40 leading-tight">Price</span>
              <span className="font-black text-sm text-primary tabular-nums">
                {currentModel.price !== undefined && currentModel.price !== 0 ? `$${currentModel.price}` : 'Free'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* 3. Detailed Slicer Settings & Spoolman */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {/* Material */}
          <div className="flex items-center gap-2.5 p-3 bg-muted/10 rounded-xl border border-border/50">
            <Database className="h-3.5 w-3.5 text-muted-foreground/50" />
            <div className="flex flex-col">
              <span className="text-[8px] uppercase font-bold text-muted-foreground/40 leading-tight">Material</span>
              <span className="text-xs font-bold text-foreground truncate">{safePrintSettings.material || 'Unknown'}</span>
            </div>
          </div>

          {/* Layer Height */}
          <div className="flex items-center gap-2.5 p-3 bg-muted/10 rounded-xl border border-border/50">
            <Layers className="h-3.5 w-3.5 text-muted-foreground/50" />
            <div className="flex flex-col">
              <span className="text-[8px] uppercase font-bold text-muted-foreground/40 leading-tight">Layer</span>
              <span className="text-xs font-bold text-foreground">
                {safePrintSettings.layerHeight !== 'Unknown' ? `${safePrintSettings.layerHeight} mm` : 'Unknown'}
              </span>
            </div>
          </div>

          {/* Infill */}
          <div className="flex items-center gap-2.5 p-3 bg-muted/10 rounded-xl border border-border/50">
            <Droplet className="h-3.5 w-3.5 text-muted-foreground/50" />
            <div className="flex flex-col">
              <span className="text-[8px] uppercase font-bold text-muted-foreground/40 leading-tight">Infill</span>
              <span className="text-xs font-bold text-foreground">{safePrintSettings.infill || 'Unknown'}</span>
            </div>
          </div>

          {/* Nozzle */}
          <div className="flex items-center gap-2.5 p-3 bg-muted/10 rounded-xl border border-border/50">
            <Diameter className="h-3.5 w-3.5 text-muted-foreground/50" />
            <div className="flex flex-col">
              <span className="text-[8px] uppercase font-bold text-muted-foreground/40 leading-tight">Nozzle</span>
              <span className="text-xs font-bold text-foreground">
                {safePrintSettings.nozzle !== 'Unknown' ? `${safePrintSettings.nozzle} mm` : 'Unknown'}
              </span>
            </div>
          </div>
        </div>

        {/* Spoolman Integration */}
        {spools.length > 0 ? (
          <div className="flex flex-col gap-2 p-3 bg-primary/5 rounded-xl border border-primary/20 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-primary/60">Inventory Sync</p>
                <button
                  onClick={(e) => { e.stopPropagation(); refreshSpools(); }}
                  disabled={isSpoolmanLoading}
                  className={`p-1 rounded-full hover:bg-primary/10 transition-colors ${isSpoolmanLoading ? 'animate-spin opacity-50' : ''}`}
                >
                  <RefreshCw className="h-3 w-3 text-primary/40" />
                </button>
              </div>
              {activeSpool?.filament.color_hex && (
                <div className="w-2.5 h-2.5 rounded-full border border-black/10 shadow-sm" style={{ backgroundColor: `#${activeSpool.filament.color_hex}` }} />
              )}
            </div>

            <SearchableSelect_DB
              value={localSpoolId}
              onValueChange={setLocalSpoolId}
              placeholder={isSpoolmanLoading ? "Loading..." : "Select Spool..."}
              className="h-8 text-[11px] bg-background/50 border-primary/10 rounded-lg"
              options={spools.map(spool => ({
                value: spool.id.toString(),
                label: `${spool.filament.name} (${Math.round(spool.remaining_weight)}g)`
              }))}
            />

            {activeSpool && (
              <div className="flex items-center gap-1.5 mt-0.5 opacity-70">
                <Info className="h-3 w-3 text-primary/60" />
                <p className="text-[10px] font-bold text-muted-foreground">
                  Est. {Math.round(activeSpool.remaining_weight - (currentModel.filamentUsage || 0))}g remaining
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 bg-muted/20 rounded-xl border border-dashed flex flex-col items-center justify-center gap-1 text-center group hover:bg-muted/30 transition-all">
            <Database className="h-3.5 w-3.5 text-muted-foreground/30 mb-1" />
            <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Inventory Offline</p>
            <p className="text-[9px] text-muted-foreground/50 leading-tight">Connect Spoolman in Settings</p>
          </div>
        )}
      </div>

    </div>
  );
};