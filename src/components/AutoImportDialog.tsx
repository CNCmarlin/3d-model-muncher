// src/components/AutoImportDialog.tsx
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Label } from "./ui/label";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Loader2, FolderOpen, CheckCircle2 } from "lucide-react";
import { toast } from "sonner"; // Assuming you use sonner or similar for toasts

interface AutoImportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onImportComplete?: () => void;
  }
  
  export function AutoImportDialog({ open, onOpenChange, onImportComplete }: AutoImportDialogProps) {
    const [folders, setFolders] = useState<string[]>([]);
    const [selectedFolder, setSelectedFolder] = useState<string>("uploads");
    const [strategy, setStrategy] = useState<"smart" | "strict">("smart");
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<{ count: number; message: string } | null>(null);
  
    useEffect(() => {
      if (open) {
        setResult(null);
        fetch('/api/model-folders')
          .then(res => res.json())
          .then(data => {
            if (data.success && Array.isArray(data.folders)) setFolders(data.folders);
          })
          .catch(err => console.error("Failed to load folders", err));
      }
    }, [open]);
  
    const handleRunImport = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/collections/auto-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetFolder: selectedFolder === '(Root)' ? '' : selectedFolder,
            strategy: strategy
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
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Auto-Import Collections</DialogTitle>
            <DialogDescription>Generate collections from your folder structure.</DialogDescription>
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
                  <div className="flex items-start space-x-3 border p-3 rounded-md">
                    <RadioGroupItem value="smart" id="smart" className="mt-1" />
                    <div>
                      <Label htmlFor="smart">Smart Grouping (Recommended)</Label>
                      <p className="text-xs text-muted-foreground">Skips empty folders. Reduces clutter.</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 border p-3 rounded-md">
                    <RadioGroupItem value="strict" id="strict" className="mt-1" />
                    <div>
                      <Label htmlFor="strict">Strict Mirroring</Label>
                      <p className="text-xs text-muted-foreground">Creates a collection for every folder.</p>
                    </div>
                  </div>
                </RadioGroup>
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
              <Button onClick={handleRunImport} disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderOpen className="mr-2 h-4 w-4" />}
                Start Import
              </Button>
            ) : (
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  