import { useState, useRef } from "react";
import { Model } from "../types/model";
import { AppConfig } from "../types/config";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { ImageWithFallback } from "./ImageWithFallback";
import { resolveModelThumbnail } from "../utils/thumbnailUtils";
import { HardDrive, Box } from "lucide-react";
import { Grid3DViewer } from "./Grid3DViewer";
import { useSpoolman } from '../context/SpoolmanContext';
import { AlertTriangle, Droplet } from 'lucide-react';

interface ModelCardProps {
  model: Model;
  onClick: (e: React.MouseEvent) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelectionChange?: (id: string, shiftKey: boolean) => void;
  config?: AppConfig | null;
}

export function ModelCard({
  model,
  onClick,
  isSelectionMode = false,
  isSelected = false,
  onSelectionChange,
  config,
}: ModelCardProps) {
  const { getSpoolById } = useSpoolman();
  const [isHovered, setIsHovered] = useState(false);
  const [show3D, setShow3D] = useState(false);
  const hoverTimer = useRef<NodeJS.Timeout | null>(null);

  const showBadge = config?.settings?.showPrintedBadge !== false;
  
  // Resolve the URL (prefer local filePath served via API, or direct modelUrl)
  // Ensure your API serves files correctly!
  const modelUrl = model.modelUrl || model.filePath;

  // Handle Hover with Delay
  const handleMouseEnter = () => {
    // Don't load 3D if in selection mode (distracting) or if no URL
    if (isSelectionMode || !modelUrl) return; 
    
    setIsHovered(true);
    // Wait 600ms before triggering the heavy 3D load
    // This allows the user to scroll past without triggering 50 downloads
    hoverTimer.current = setTimeout(() => {
      setShow3D(true);
    }, 600);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setShow3D(false);
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  let stockStatus: 'ok' | 'low' | 'empty' | null = null;
  
  const preferredSpoolId = model.userDefined?.preferredSpoolId;
  const neededWeightStr = model.gcodeData?.totalFilamentWeight || model.filamentUsed;
  
  if (preferredSpoolId && neededWeightStr) {
    const match = neededWeightStr.match(/([\d.]+)\s*g/i);
    const needed = match ? parseFloat(match[1]) : 0;
    const spool = getSpoolById(preferredSpoolId);

    if (spool && needed > 0) {
      if (spool.remaining_weight < needed) {
        stockStatus = 'empty'; // Not enough to print
      } else if (spool.remaining_weight < (needed * 1.2)) {
        stockStatus = 'low'; // Enough, but barely (20% buffer)
      }
    }
  }

  return (
    <div
      className={`group relative flex flex-col bg-card rounded-lg border transition-all duration-200 overflow-hidden cursor-pointer hover:shadow-md ${
        isSelected ? "border-primary ring-1 ring-primary" : "hover:border-primary/50"
      }`}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Aspect Ratio Container */}
      <div className="relative w-full aspect-[4/3] bg-muted overflow-hidden">
        
        {/* 1. Static Image (Always shown initially) */}
        {(!show3D) && (
          <div className="absolute inset-0">
            <ImageWithFallback
              src={resolveModelThumbnail(model)}
              alt={model.name}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </div>
        )}

        {/* 2. 3D Viewer (Loads after hover delay) */}
        {show3D && modelUrl && (
          <div className="absolute inset-0 z-10 bg-background/50 animate-in fade-in duration-300">
             <div className="w-full h-full" onClick={(e) => e.stopPropagation()}>
                <Grid3DViewer 
                  url={modelUrl} 
                  color={config?.settings?.defaultModelColor || '#aaaaaa'}
                />
             </div>
          </div>
        )}

        {/* Overlays / Badges */}
        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end pointer-events-none z-20">
          {isSelectionMode && (
            <div className="pointer-events-auto">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => {}}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectionChange?.(model.id, e.nativeEvent.shiftKey);
                }}
                className="bg-background/80 backdrop-blur-sm"
              />
            </div>
          )}
          
          {model.isPrinted && showBadge && (
            <Badge variant="default" className="bg-green-600/90 hover:bg-green-600/90 backdrop-blur-sm shadow-sm">Printed</Badge>
          )}
        </div>
        
        {/* Loading Indicator (Visual feedback while 3D initializes) */}
        {isHovered && !show3D && (
            <div className="absolute bottom-2 right-2 z-20">
                <Badge variant="secondary" className="gap-1 opacity-70">
                    <Box className="h-3 w-3 animate-pulse" />
                    <span className="text-[10px]">Loading 3D...</span>
                </Badge>
            </div>
        )}
      </div>

      {/* Metadata Footer */}
      <div className="p-3 flex flex-col gap-2 relative bg-card z-20 border-t">
        <h3 className="font-semibold text-sm truncate leading-tight" title={model.name}>
          {model.name}
        </h3>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal truncate max-w-[100px]">
             {model.category}
          </Badge>
          <div className="flex items-center gap-1">
             <HardDrive className="h-3 w-3" />
             <span>{model.fileSize}</span>
          </div>
          {/* [NEW] Stock Warning Indicator */}
          {stockStatus === 'empty' && (
               <div className="flex items-center gap-1 text-destructive font-medium" title="Not enough filament in preferred spool">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Stock</span>
               </div>
            )}
            {stockStatus === 'low' && (
               <div className="flex items-center gap-1 text-amber-500 font-medium" title="Low filament stock">
                  <Droplet className="w-3 h-3" />
                  <span>Low</span>
               </div>
            )}
        </div>
      </div>
    </div>
  );
}