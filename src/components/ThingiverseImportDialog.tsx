import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Loader2, CloudDownload, AlertCircle, Info } from 'lucide-react';
import { toast } from 'sonner';

interface ThingiverseImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
  defaultFolder?: string; 
  defaultCollectionId?: string;
}

// [NEW] Helper to truncate middle of long paths
function truncateMiddle(text: string, maxLength: number) {
  if (!text || text.length <= maxLength) return text;
  const startChars = Math.ceil(maxLength / 2) - 2;
  const endChars = Math.floor(maxLength / 2) - 1;
  return `${text.substring(0, startChars)}...${text.substring(text.length - endChars)}`;
}

export function ThingiverseImportDialog({ isOpen, onClose, onImportComplete, defaultFolder, defaultCollectionId }: ThingiverseImportDialogProps) {
  const [inputUrl, setInputUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Options State
  const [folders, setFolders] = useState<string[]>(['imported', 'uploads']);
  const [selectedFolder, setSelectedFolder] = useState<string>('imported');
  const [collections, setCollections] = useState<{id: string, name: string}[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string>('none');
  const [categories, setCategories] = useState<string[]>(['Uncategorized']);
  const [selectedCategory, setSelectedCategory] = useState<string>('Uncategorized');

  // Load options on open
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    setInputUrl(''); // Reset input
    
    // Defaults
    if (defaultFolder) setSelectedFolder(defaultFolder);
    
    // Reset or set collection based on prop
    if (defaultCollectionId) {
      setSelectedCollection(defaultCollectionId);
    } else {
      setSelectedCollection('none');
    }

    const loadData = async () => {
        // 1. Folders
        try {
            const resp = await fetch('/api/model-folders');
            if (resp.ok) {
                const data = await resp.json();
                const apiFolders = data.folders || [];
                const allFolders = ['imported', 'uploads', ...apiFolders];
                if (defaultFolder) allFolders.push(defaultFolder);
                
                const loadedFolders = Array.from(new Set(allFolders));
                setFolders(loadedFolders);
            }
        } catch (e) { console.error('Failed to load folders', e); }

        // 2. Collections
        try {
            const resp = await fetch('/api/collections');
            if (resp.ok) {
                const data = await resp.json();
                setCollections(data.collections || []);
            }
        } catch (e) { console.error('Failed to load collections', e); }

        // 3. Categories (from config)
        try {
             const resp = await fetch('/api/load-config');
             if(resp.ok) {
                 const d = await resp.json();
                 const cats = d.config?.categories?.map((c: any) => c.label) || [];
                 if (cats.length > 0) {
                    const uniqueCats = Array.from(new Set(['Uncategorized', ...cats]));
                    setCategories(uniqueCats);
                 }
             }
        } catch (e) { console.error('Failed to load categories', e); }
    };
    loadData();
  }, [isOpen, defaultFolder, defaultCollectionId]);

  const handleImport = async () => {
    setErrorMessage(null);
    // Simple validation to ensure it looks like a Thingiverse URL or ID
    const match = inputUrl.match(/thing:(\d+)/) || inputUrl.match(/\/thing:(\d+)/) || inputUrl.match(/\/thing\/(\d+)/) || inputUrl.match(/^(\d+)$/);
    
    if (!match) {
      setErrorMessage("Invalid URL. Please use the link from the 'Share' button (e.g., https://www.thingiverse.com/thing:12345).");
      return;
    }

    const thingId = match[1];
    setIsLoading(true);
    setStatus('Downloading files & metadata...');

    try {
      const res = await fetch('/api/import/thingiverse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            thingId,
            targetFolder: selectedFolder,
            collectionId: selectedCollection === 'none' ? null : selectedCollection,
            category: selectedCategory
        })
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
         throw new Error(`Server returned ${res.status} ${res.statusText}.`);
      }

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      toast.success(`Imported Thing #${thingId} successfully`);
      setInputUrl('');
      if (onImportComplete) onImportComplete();
      onClose();
    } catch (err: any) {
      console.error("Import failed:", err);
      setErrorMessage(err.message || "Import failed. Check console.");
    } finally {
      setIsLoading(false);
      setStatus('');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudDownload className="w-5 h-5" />
            Thingiverse Import
          </DialogTitle>
          <DialogDescription>
             Enter a Thingiverse URL or ID to download files, tags, and license info.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          
          <div className="bg-blue-50 border border-blue-200 rounded p-3 flex gap-3 text-sm text-blue-800">
             <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
             <div>
               <strong>Tip:</strong> For the most reliable results, please use the 
               <strong> "Share"</strong> button on the Thingiverse page to copy the link.
             </div>
          </div>

          {errorMessage && (
            <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {errorMessage}
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="tv-url">Thingiverse URL / ID</Label>
            <Input 
              id="tv-url" 
              placeholder="e.g. https://www.thingiverse.com/thing:123456" 
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
                <Label>Destination Folder</Label>
                <Select value={selectedFolder} onValueChange={setSelectedFolder} disabled={isLoading}>
                    {/* [FIX] Use custom display with truncation instead of generic SelectValue */}
                    <SelectTrigger title={selectedFolder}>
                        <span className="truncate block text-left">
                            {truncateMiddle(selectedFolder, 35)}
                        </span>
                    </SelectTrigger>
                    <SelectContent>
                        {folders.map(f => (
                            <SelectItem key={f} value={f} title={f}>
                                {f}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="grid gap-2">
                <Label>Category</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory} disabled={isLoading}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Add to Collection</Label>
            <Select value={selectedCollection} onValueChange={setSelectedCollection} disabled={isLoading}>
                <SelectTrigger>
                    <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {collections.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
            </Select>
            {defaultCollectionId && selectedCollection === defaultCollectionId && (
                <p className="text-xs text-muted-foreground">
                    * Automatically selected based on your current view.
                </p>
            )}
          </div>
          
          {isLoading && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2 animate-pulse bg-muted rounded">
              <Loader2 className="h-4 w-4 animate-spin" />
              {status}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button onClick={handleImport} disabled={isLoading || !inputUrl} className="gap-2">
            {isLoading ? 'Importing...' : 'Start Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}