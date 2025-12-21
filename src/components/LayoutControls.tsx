import { LayoutGrid, List, Sliders } from "lucide-react";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { useLayoutSettings } from "./LayoutSettingsContext";

interface LayoutControlsProps {
  className?: string;
  hideDensityOnMobile?: boolean;
}

export function LayoutControls({ className = "", hideDensityOnMobile = true }: LayoutControlsProps) {
  const { viewMode, setViewMode, gridDensity, setGridDensity } = useLayoutSettings();

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      {/* View Toggle */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
        <Button 
          variant={viewMode === 'grid' ? 'default' : 'ghost'} 
          size="sm" 
          onClick={() => setViewMode('grid')} 
          className="h-8 px-3 transition-all"
        >
          <LayoutGrid className="h-4 w-4 mr-2" /> Grid
        </Button>
        <Button 
          variant={viewMode === 'list' ? 'default' : 'ghost'} 
          size="sm" 
          onClick={() => setViewMode('list')} 
          className="h-8 px-3 transition-all"
        >
          <List className="h-4 w-4 mr-2" /> List
        </Button>
      </div>

      {/* Density Slider (Hidden in List Mode) */}
      {viewMode === 'grid' && (
        <div className={`flex items-center gap-3 min-w-0 ${hideDensityOnMobile ? 'hidden md:flex' : 'flex'}`}>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sliders className="h-4 w-4" />
            <span className="hidden sm:inline">Density</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-3">1</span>
            <Slider 
              value={[gridDensity]} 
              onValueChange={(vals) => setGridDensity(vals[0])} 
              min={1} 
              max={6} 
              step={1} 
              className="w-20 sm:w-28" 
            />
            <span className="text-xs text-muted-foreground w-3">6</span>
          </div>
        </div>
      )}
    </div>
  );
}