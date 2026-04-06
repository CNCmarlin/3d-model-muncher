import { SearchableSelect_DB } from "@/components/common/SearchableSelect_DB";
import { Database, Info, RefreshCw } from "lucide-react";
import React, { useState } from "react";
import { useSpoolman } from "./SpoolmanContext";
import { Model } from "@/types/model_db";

interface SpoolmanPrintSettingsWidgetProps {
  currentModel: Model;
}

export const SpoolmanPrintSettingsWidget_DB: React.FC<SpoolmanPrintSettingsWidgetProps> = ({ currentModel }) => {
  const { spools, getSpoolById, refreshSpools, loading: isSpoolmanLoading } = useSpoolman();
  const [localSpoolId, setLocalSpoolId] = useState<string>("");
  const activeSpool = getSpoolById(localSpoolId);

  if (spools.length === 0) {
    return (
      <div className="p-3 bg-muted/20 rounded-xl border border-dashed flex flex-col items-center justify-center gap-1 text-center group hover:bg-muted/30 transition-all">
        <Database className="h-3.5 w-3.5 text-muted-foreground/30 mb-1" />
        <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Inventory Offline</p>
        <p className="text-[9px] text-muted-foreground/50 leading-tight">Connect Spoolman in Settings</p>
      </div>
    );
  }

  return (
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
  );
};
