import { CheckSquare, Download, Edit, List, ShoppingCart, Square, Trash2, X } from "lucide-react";
import { Button } from "./ui/button";

interface SelectionModeControlsProps {
  isSelectionMode: boolean;
  selectedCount: number;
  onEnterSelectionMode?: () => void;
  onExitSelectionMode?: () => void;
  onBulkEdit?: () => void | Promise<void>;
  onCreateCollection?: () => void;
  onBulkDelete?: () => void | Promise<void>;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  className?: string;
  selectLabel?: string;
  exitLabel?: string;
  onBulkDownload?: () => void | Promise<void>;
}

export function SelectionModeControls({
  isSelectionMode,
  selectedCount,
  onEnterSelectionMode,
  onExitSelectionMode,
  onBulkEdit,
  onCreateCollection,
  onBulkDelete,
  onSelectAll,
  onDeselectAll,
  onBulkDownload,
  className,
  selectLabel = "Select",
  exitLabel = "Done",
}: SelectionModeControlsProps) {
  const containerClass = ["flex items-center gap-2", className].filter(Boolean).join(" ");
  const hasBulkSelection = selectedCount > 0;

  // [Mode 1] Selection Mode Inactive (Persistent Cart Indicator)
  if (!isSelectionMode) {
    if (selectedCount > 0) {
      return (
        <div className={containerClass}>
          <div className="flex items-center bg-primary/10 text-primary px-3 py-1.5 rounded-full border border-primary/20 shadow-sm animate-in fade-in zoom-in duration-200">
            <ShoppingCart className="h-4 w-4 mr-2" />
            <span className="text-xs font-bold mr-3">{selectedCount}</span>
            <div className="h-4 w-px bg-primary/20 mr-3" />

            {onBulkEdit && (
              <Button
                variant="default"
                size="sm"
                className="h-6 px-3 text-[10px] rounded-full shadow-sm hover:shadow-md transition-all mr-2"
                onClick={onBulkEdit}
              >
                Bulk Edit
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={onEnterSelectionMode}
              className="h-6 px-2 text-[10px] hover:bg-primary/20 text-primary font-medium"
              title="View Selection"
            >
              Expand
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className={containerClass}>
        <Button
          variant="ghost"
          size="sm"
          onClick={onEnterSelectionMode}
          className="gap-2"
          title="Enter selection mode"
          disabled={!onEnterSelectionMode}
        >
          <CheckSquare className="h-4 w-4" />
          <span className="hidden sm:inline">{selectLabel}</span>
        </Button>
      </div>
    );
  }

  // [Mode 2] Selection Mode Active (Full Toolbar)
  return (
    <div className={containerClass}>
      <div className="flex items-center bg-muted/50 px-3 py-1 rounded-md border text-sm font-medium gap-2">
        <ShoppingCart className="h-4 w-4 text-primary" />
        <span>{selectedCount}</span>
      </div>

      {hasBulkSelection && (
        <>
          {onBulkEdit && (
            <Button
              variant="default"
              size="sm"
              onClick={onBulkEdit}
              className="gap-2 shadow-sm"
              title="Bulk edit selected models"
            >
              <Edit className="h-4 w-4" />
              <span className="hidden sm:inline">Bulk Edit</span>
            </Button>
          )}

          {onCreateCollection && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCreateCollection}
              className="gap-2"
              title="Create collection from selection"
            >
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">Collection</span>
            </Button>
          )}

          {onBulkDownload && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBulkDownload}
              className="gap-2"
              title="Download selected models"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Download</span>
            </Button>
          )}

          {onBulkDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBulkDelete}
              className="gap-2 text-destructive hover:text-destructive"
              title="Delete selected models"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Delete</span>
            </Button>
          )}
        </>
      )}

      <div className="h-4 w-px bg-border mx-1" />

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onSelectAll}
          title="Select all visible models"
          disabled={!onSelectAll}
        >
          <CheckSquare className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onDeselectAll}
          title="Deselect all models"
          disabled={!onDeselectAll}
        >
          <Square className="h-4 w-4" />
        </Button>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onExitSelectionMode}
        className="gap-2"
        title="Exit selection mode"
        disabled={!onExitSelectionMode}
      >
        <X className="h-4 w-4" />
        <span className="hidden sm:inline">{exitLabel}</span>
      </Button>
    </div>
  );
}