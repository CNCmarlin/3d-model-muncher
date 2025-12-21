import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Label } from "./ui/label";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Checkbox } from "./ui/checkbox";
import { Loader2, FolderOpen, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface AutoImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

export function AutoImportDialog({ open, onOpenChange, onImportComplete }: AutoImportDialogProps) {
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>("(Root)"); // Default to Root
  const [strategy, setStrategy] = useState<"smart" | "strict">("smart");
  const [clearPrevious, setClearPrevious] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ count: number; message: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setResult(null);
      setClearPrevious(false);
      setSelectedFolder("(Root)");
      fetch('/api/model-folders')
        .then(res => res.json())
        .then(data => {
          if (data.success && Array.isArray(data.folders)) setFolders(data.folders);
        })
        .catch(err => console.error("Failed to load folders", err));
    }
  }, [open]);

  const handleStartClick = () => {
    if (clearPrevious) {
      setShowConfirm(true);
    } else {
      runImport();
    }
  };

  const runImport = async () => {
    setShowConfirm(false);
    setIsLoading(true);
    try {
      const response = await fetch('/api/collections/auto-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetFolder: selectedFolder === '(Root)' ? '' : selectedFolder,
          strategy: strategy,
          clearPrevious: clearPrevious
        })
      });
      const data = await response.json();
      if (data.success) {
        setResult({ count: data.count, message: data.message });
        toast.success(`Success! Processed ${data.count} collections.`);
        if (onImportComplete) onImportComplete();
      } else {
        toast.error(data.error || "Import failed");
      }
    } catch (error) {
      toast.error("Network error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Auto-Import Collections</DialogTitle>
            <DialogDescription>
              Generate collections from your folder structure.
            </DialogDescription>
          </DialogHeader>

          {!result ? (
            <div className="grid gap-6 py-4">
              <div className="grid gap-2">
                <Label>Target Directory</Label>
                <Select value={selectedFolder} onValueChange={setSelectedFolder}>
                  <SelectTrigger><SelectValue placeholder="Select folder..." /></SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    <SelectItem value="(Root)">/ (Entire Library)</SelectItem>
                    {folders.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3">
                <Label>Strategy</Label>
                <RadioGroup value={strategy} onValueChange={(v) => setStrategy(v as any)} className="gap-4">
                  <div className="flex items-start space-x-3 border p-3 rounded-md hover:bg-accent/50 cursor-pointer" onClick={() => setStrategy('smart')}>
                    <RadioGroupItem value="smart" id="smart" className="mt-1" />
                    <div className="cursor-pointer">
                      <Label htmlFor="smart" className="cursor-pointer font-medium">Smart Grouping (Top-Level)</Label>
                      <p className="text-xs text-muted-foreground">Aggregates subfolders into parent collection. Best for clean, project-based views.</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 border p-3 rounded-md hover:bg-accent/50 cursor-pointer" onClick={() => setStrategy('strict')}>
                    <RadioGroupItem value="strict" id="strict" className="mt-1" />
                    <div className="cursor-pointer">
                      <Label htmlFor="strict" className="cursor-pointer font-medium">Strict Mirroring</Label>
                      <p className="text-xs text-muted-foreground">Creates a separate collection for every subfolder found.</p>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              <div className="flex items-start space-x-2 border-t pt-4">
                <Checkbox id="clearPrevious" checked={clearPrevious} onCheckedChange={(c) => setClearPrevious(!!c)} />
                <div className="grid gap-1.5 leading-none">
                  <Label htmlFor="clearPrevious" className="text-sm font-medium text-destructive">Clean Re-Import (Reset)</Label>
                  <p className="text-xs text-muted-foreground">
                    Check this to <b>delete all existing auto-imported collections</b> before scanning. 
                    <br/><span className="font-semibold text-orange-600">Warning: Manual edits to auto-collections will be lost.</span>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-6 flex flex-col items-center text-center space-y-2">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <h3 className="font-medium">Import Complete</h3>
              <p className="text-sm text-muted-foreground">{result.message}</p>
            </div>
          )}

          <DialogFooter>
            {!result ? (
              <Button onClick={handleStartClick} disabled={isLoading} variant={clearPrevious ? "destructive" : "default"}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderOpen className="mr-2 h-4 w-4" />}
                {clearPrevious ? "Reset & Import" : "Start Import"}
              </Button>
            ) : (
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm Reset?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action is <b>not reversible</b>. It will delete all collections marked as "Auto-Imported" and rebuild them from scratch.
              <br/><br/>
              If you manually added items to these collections, those links will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runImport} className="bg-destructive hover:bg-destructive/90">Yes, Wipe & Rebuild</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}