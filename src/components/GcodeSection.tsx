// GcodeSection.tsx
import React from 'react';
import { Codesandbox, Upload, RefreshCw, Clock, Weight, ChevronUp, ChevronDown, HardDrive } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Model } from "../types/model";

interface GcodeSectionProps {
  currentModel: Model; // Used the Model type here
  isEditing: boolean;
  gcodeInputRef: React.RefObject<HTMLInputElement | null>;
  isUploadingGcode: boolean;
  handleGcodeUpload: (file: File) => void;
  handleReanalyzeGcode: () => void;
  isGcodeExpanded: boolean;
  setIsGcodeExpanded: (open: boolean) => void;
  handleGcodeDragOver: (e: React.DragEvent) => void;
  handleGcodeDrop: (e: React.DragEvent) => void;
}

export const GcodeSection = ({
  currentModel,
  isEditing,
  gcodeInputRef,
  isUploadingGcode,
  handleGcodeUpload,
  handleReanalyzeGcode,
  isGcodeExpanded,
  setIsGcodeExpanded,
  handleGcodeDragOver,
  handleGcodeDrop
}: GcodeSectionProps) => {
  if (isEditing) return null; // Original logic: G-code hidden during edit

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Codesandbox className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold text-lg text-card-foreground">G-code Analysis</h3>
      </div>

      {/* Hidden file input */}
      <input
        ref={gcodeInputRef}
        type="file"
        accept=".gcode,.3mf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleGcodeUpload(file);
            e.target.value = '';
          }
        }}
      />

      {currentModel.gcodeData ? (
        <>
          {/* Upload and Re-analyze buttons (when data exists) */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => gcodeInputRef.current?.click()}
              disabled={isUploadingGcode}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              {isUploadingGcode ? 'Uploading...' : 'Upload New G-code'}
            </Button>
            {currentModel.gcodeData.gcodeFilePath && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReanalyzeGcode}
                disabled={isUploadingGcode}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Re-analyze
              </Button>
            )}
          </div>

          {/* Summary display */}
          <Collapsible open={isGcodeExpanded} onOpenChange={setIsGcodeExpanded}>
            <div className="p-4 bg-muted/30 rounded-lg border">
              <CollapsibleTrigger className="flex items-center justify-between w-full text-left">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{currentModel.gcodeData.printTime || 'N/A'}</span>
                  </div>
                  <div className="text-muted-foreground">|</div>
                  <div className="flex items-center gap-2">
                    <Weight className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{currentModel.gcodeData.totalFilamentWeight || 'N/A'}</span>
                  </div>
                </div>
                {currentModel.gcodeData.filaments.length > 1 && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <span>{currentModel.gcodeData.filaments.length} filaments</span>
                    {isGcodeExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                )}
              </CollapsibleTrigger>

              {/* Multi-filament details table */}
              {currentModel.gcodeData.filaments.length > 1 && (
                <CollapsibleContent className="mt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">Color</th>
                        <th className="text-left py-2 px-2">Type</th>
                        <th className="text-right py-2 px-2">Length</th>
                        <th className="text-right py-2 px-2">Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentModel.gcodeData.filaments.map((filament, idx) => (
                        <tr key={idx} className="border-b last:border-0">
                          <td className="py-2 px-2">
                            <div
                              className="w-6 h-6 rounded border"
                              style={{ backgroundColor: filament.color || '#888' }}
                              title={filament.color || 'No color data'}
                            />
                          </td>
                          <td className="py-2 px-2">{filament.type}</td>
                          <td className="text-right py-2 px-2">{filament.length}</td>
                          <td className="text-right py-2 px-2">{filament.weight}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CollapsibleContent>
              )}
            </div>
          </Collapsible>
        </>
      ) : (
        <>
          {/* Prominent drag-and-drop zone when no data exists */}
          <div
            onDragOver={handleGcodeDragOver}
            onDrop={handleGcodeDrop}
            onClick={() => gcodeInputRef.current?.click()}
            className={`
    relative group cursor-pointer
    flex flex-col items-center justify-center
    py-4 px-4 rounded-xl border-2 border-dashed
    transition-all duration-200
    ${isUploadingGcode ? 'bg-muted animate-pulse' : 'bg-muted/30 hover:bg-muted/50 hover:border-primary/50'}
  `}
          >
            <input
              type="file"
              ref={gcodeInputRef}
              onChange={(e) => e.target.files?.[0] && handleGcodeUpload(e.target.files[0])}
              accept=".gcode,.3mf"
              className="hidden"
            />

            <div className="flex items-center gap-3">
              <div className="p-2 bg-background rounded-lg border shadow-sm group-hover:scale-110 transition-transform">
                <HardDrive className={`h-4 w-4 ${isUploadingGcode ? 'text-primary animate-bounce' : 'text-muted-foreground'}`} />
              </div>

              <div className="flex flex-col">
                <p className="text-xs font-bold text-foreground leading-none">
                  {isUploadingGcode ? 'Analyzing...' : 'Upload G-Code File'}
                </p>
                <p className="text-[12px] text-muted-foreground mt-1">
                  Analyze print time, filament usage, and multi-color information from your sliced G-code
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>

  )
}