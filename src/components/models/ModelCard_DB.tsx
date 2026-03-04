import { ImageWithFallback_DB } from "@/components/common/ImageWithFallback_DB";
import { Grid3DViewer_DB } from "@/components/models/Grid3DViewer_DB";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useSpoolman } from "@/context/SpoolmanContext";
import { AppConfig } from "@/types/config";
import { Model } from "@/types/model_db";
import { resolveModelThumbnail } from "@/utils/thumbnailUtils_db";
import {
  AlertTriangle,
  Box,
  Clock,
  DollarSign,
  DraftingCompass,
  Droplet,
  Folder,
  HardDrive,
  Layers,
  User,
  Weight,
} from "lucide-react";
import { useRef, useState } from "react";

interface ModelCardProps {
  model: Model;
  onClick: (e: React.MouseEvent) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelectionChange?: (id: string, shiftKey: boolean) => void;
  config?: AppConfig | null;
}

export function ModelCard_DB({
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

  // ─── DB-First 3D URL Resolution ───────────────────────────────────────────
  // Priority:
  //   1. model.modelUrl — set per-model by migration/upload routes, already correct
  //      (cam_bed.stl → ".stl", cam_bed.3mf → ".3mf"). Most reliable source.
  //   2. model.files[isPrimary + valid 3D] — DB relation, per-model scoped
  //   3. model.primaryModelPath — flat column, last resort when files not loaded
  const VALID_3D = /\.(stl|3mf|obj)$/i;

  const modelUrlFromColumn =
    model.modelUrl && VALID_3D.test(model.modelUrl) ? model.modelUrl : null;

  const primaryDbFile = !modelUrlFromColumn
    ? (model.files as any[] | undefined)?.find(
        (f: any) => f.isPrimary && VALID_3D.test(f.filePath || f.path || ""),
      )
    : null;

  const primaryModelPathFallback =
    !modelUrlFromColumn && !primaryDbFile
      ? (((model as any).primaryModelPath as string | null | undefined) ?? null)
      : null;

  const rawPath =
    modelUrlFromColumn ??
    primaryDbFile?.filePath ??
    primaryDbFile?.path ??
    primaryModelPathFallback ??
    null;

  const modelUrl: string | null = rawPath
    ? rawPath.startsWith("/")
      ? rawPath
      : `/models/${rawPath}`
    : null;

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

  let stockStatus: "ok" | "low" | "empty" | null = null;

  // DB-First: Read from metadata, fall back to legacy flat fields
  const meta = model.metadata || {};
  const ud = meta.userDefined || model.userDefined || {};
  const preferredSpoolId = ud.preferredSpoolId;
  const neededWeightStr =
    meta.gcodeData?.totalFilamentWeight || model.filamentUsage?.toString();

  if (preferredSpoolId && neededWeightStr) {
    const match = neededWeightStr.match(/([\d.]+)\s*g/i);
    const needed = match ? parseFloat(match[1]) : 0;
    const spool = getSpoolById(preferredSpoolId);

    if (spool && needed > 0) {
      if (spool.remaining_weight < needed) {
        stockStatus = "empty"; // Not enough to print
      } else if (spool.remaining_weight < needed * 1.2) {
        stockStatus = "low"; // Enough, but barely (20% buffer)
      }
    }
  }

  // Helper to resolve field content
  const getFieldContent = (
    fieldType: string | undefined,
  ): {
    icon: React.ReactNode;
    label: string;
    value: string | number | null;
  } | null => {
    if (!fieldType || fieldType === "none") return null;

    switch (fieldType) {
      case "printTime":
        return {
          icon: <Clock className="w-3 h-3" />,
          label: "Print Time",
          value:
            model.printTime ||
            meta.gcodeData?.printTime ||
            ud.printTime ||
            null,
        };
      case "filamentUsed":
        return {
          icon: <Weight className="w-3 h-3" />,
          label: "Filament",
          value:
            model.filamentUsage || meta.gcodeData?.totalFilamentWeight || null,
        };
      case "fileSize": {
        // DB-First: Sum file sizes from the files relation
        const totalSize = model.files?.reduce(
          (acc, f) => acc + (f.size || 0),
          0,
        );
        const sizeStr = totalSize
          ? `${(totalSize / 1024 / 1024).toFixed(1)} MB`
          : null;
        return {
          icon: <HardDrive className="w-3 h-3" />,
          label: "Size",
          value: sizeStr,
        };
      }
      case "category":
        return {
          icon: <Folder className="w-3 h-3" />,
          label: "Category",
          value: meta.category || model.category || null,
        };
      case "designer":
        return {
          icon: <User className="w-3 h-3" />,
          label: "Designer",
          value: model.designer || ud.designer || null,
        };
      case "layerHeight": {
        const ps = meta.printSettings || {};
        return {
          icon: <Layers className="w-3 h-3" />,
          label: "Layer Height",
          value: ps.layerHeight ? `${ps.layerHeight}mm` : null,
        };
      }
      case "nozzle": {
        const ps2 = meta.printSettings || {};
        return {
          icon: <DraftingCompass className="w-3 h-3" />,
          label: "Nozzle",
          value: ps2.nozzle ? `${ps2.nozzle}mm` : null,
        };
      }
      case "price": {
        const priceVal = meta.price || model.price || ud.price;
        if (!priceVal)
          return {
            icon: <DollarSign className="w-3 h-3" />,
            label: "Price",
            value: null,
          };
        // Remove leading $ if present to rely on icon
        const formattedPrice = String(priceVal).startsWith("$")
          ? String(priceVal).substring(1)
          : priceVal;
        return {
          icon: <DollarSign className="w-3 h-3" />,
          label: "Price",
          value: formattedPrice,
        };
      }
      default:
        return null;
    }
  };

  const primaryField = getFieldContent(config?.settings?.modelCardPrimary);
  const secondaryField = getFieldContent(config?.settings?.modelCardSecondary);
  const tertiaryField = getFieldContent(config?.settings?.modelCardTertiary);

  // Default fallbacks if not configured (to match original behavior or reasonable defaults)
  // const leftField = primaryField || { icon: <Folder className="w-3 h-3" />, label: 'Category', value: model.category };
  // const centerField = secondaryField; // Center is optional/tertiary usually, but here we shift
  // const rightField = tertiaryField;

  // If we only have 2 fields configured (legacy behavior), we might want to stick to split?
  // But user asked for 3rd field.
  // Actually, let's map them to positions:
  // Primary -> Left
  // Secondary -> Center
  // Tertiary -> Right
  // But wait, user said "make them centered on the bottom".
  // If I have 3 slots: L, C, R.

  const field1 = primaryField;
  const field2 = secondaryField;
  const field3 = tertiaryField;

  return (
    <div
      className={`group relative flex flex-col bg-card rounded-lg border transition-all duration-200 overflow-hidden cursor-pointer hover:shadow-md ${
        isSelected
          ? "border-primary ring-1 ring-primary"
          : "hover:border-primary/50"
      }`}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Aspect Ratio Container */}
      <div className="relative w-full aspect-[4/3] bg-muted overflow-hidden">
        {/* 1. Static Image (Always shown initially) */}
        {!show3D && (
          <div className="absolute inset-0">
            <ImageWithFallback_DB
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
              <Grid3DViewer_DB
                url={modelUrl}
                color={config?.settings?.defaultModelColor || "#aaaaaa"}
              />
            </div>
          </div>
        )}

        {/* [NEW] TOP LEFT OVERLAY - Stock Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1 items-start pointer-events-none z-20">
          {stockStatus === "empty" && (
            <Badge
              variant="destructive"
              className="gap-1 backdrop-blur-sm shadow-sm border-none bg-red-600/90 py-0.5"
            >
              <AlertTriangle className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase">No Stock</span>
            </Badge>
          )}
          {stockStatus === "low" && (
            <Badge
              variant="secondary"
              className="gap-1 backdrop-blur-sm shadow-sm border-none bg-amber-500/90 text-white py-0.5"
            >
              <Droplet className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase">Low Stock</span>
            </Badge>
          )}
        </div>

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
            <Badge
              variant="default"
              className="bg-green-600/90 hover:bg-green-600/90 backdrop-blur-sm shadow-sm"
            >
              Printed
            </Badge>
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
        <h3
          className="font-semibold text-sm truncate leading-tight"
          title={model.name}
        >
          {model.name}
        </h3>

        {/* Tags Section — DB schema uses ModelTag_db[] with nested tag.name */}
        {model.tags && model.tags.length > 0 && (
          <div className="flex gap-1 overflow-hidden flex-wrap h-9 content-start">
            {model.tags.slice(0, 6).map((mt: any) => {
              const tagName =
                typeof mt === "string"
                  ? mt
                  : (mt.tag?.name ?? mt?.name ?? `tag-${mt.tagId}`);
              return (
                <Badge
                  key={tagName}
                  variant="secondary"
                  className="text-[10px] h-4 px-1.5 font-normal truncate max-w-[120px]"
                >
                  {tagName}
                </Badge>
              );
            })}
            {model.tags.length > 6 && (
              <span className="text-[9px] text-muted-foreground self-center">
                +{model.tags.length - 6}
              </span>
            )}
          </div>
        )}

        {/* footer fields */}
        <div className="flex items-center justify-center gap-4 text-xs mt-1 min-h-[1.25rem]">
          {/* Left Field */}
          {field1 && field1.value ? (
            <div
              className="flex items-center gap-1 min-w-0 font-semibold text-foreground"
              title={field1.label}
            >
              {field1.icon}
              <span className="truncate max-w-[60px]">{field1.value}</span>
            </div>
          ) : (
            <div className="hidden" />
          )}

          {/* Center Field */}
          {field2 && field2.value ? (
            <div
              className="flex items-center gap-1 min-w-0 font-semibold text-foreground"
              title={field2.label}
            >
              {field2.icon}
              <span className="truncate max-w-[60px]">{field2.value}</span>
            </div>
          ) : (
            <div className="hidden" />
          )}

          {/* Right Field */}
          {field3 && field3.value ? (
            <div
              className="flex items-center gap-1 min-w-0 font-semibold text-foreground"
              title={field3.label}
            >
              {field3.icon}
              <span className="truncate max-w-[60px] text-right">
                {field3.value}
              </span>
            </div>
          ) : (
            <div className="hidden" />
          )}
        </div>
      </div>
    </div>
  );
}
