import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Loader2, CloudDownload, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface ThingiverseImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
  defaultFolder?: string; 
  defaultCollectionId?: string;
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
    
    // Defaults
    if (defaultFolder) setSelectedFolder(defaultFolder);
    if (defaultCollectionId) setSelectedCollection(defaultCollectionId);

    const loadData = async () => {
        console.log('[ImportDialog] Loading options...');
        
        // 1. Folders
        try {
            const resp = await fetch('/api/model-folders');
            if (resp.ok) {
                const data = await resp.json();
                const loadedFolders = Array.from(new Set(['imported', 'uploads', ...(data.folders || [])]));
                setFolders(loadedFolders);
                console.log('[ImportDialog] Folders loaded:', loadedFolders);
            }
        } catch (e) { console.error('Failed to load folders', e); }

        // 2. Collections
        try {
            const resp = await fetch('/api/collections');
            if (resp.ok) {
                const data = await resp.json();
                setCollections(data.collections || []);
                console.log('[ImportDialog] Collections loaded:', data.collections?.length);
            }
        } catch (e) { console.error('Failed to load collections', e); }

        // 3. Categories (from config)
        try {
             const resp = await fetch('/api/load-config');
             if(resp.ok) {
                 const d = await resp.json();
                 const cats = d.config?.categories?.map((c: any) => c.label) || [];
                 if (cats.length > 0) {
                    setCategories(['Uncategorized', ...cats]);
                    console.log('[ImportDialog] Categories loaded:', cats);
                 }
             }
        } catch (e) { console.error('Failed to load categories', e); }
    };
    loadData();
  }, [isOpen, defaultFolder, defaultCollectionId]);

  const handleImport = async () => {
    setErrorMessage(null);
    const match = inputUrl.match(/thing:(\d+)/) || inputUrl.match(/\/thing\/(\d+)/) || inputUrl.match(/^(\d+)$/);
    if (!match) {
      setErrorMessage("Invalid URL. Please use format 'thing:12345' or the full URL.");
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

      // Handle non-JSON responses (like 404 HTML pages)
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
          throw new Error(`Server returned ${res.status} ${res.statusText}. Is the route /api/import/thingiverse added to server.js?`);
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudDownload className="w-5 h-5" />
            Import from Thingiverse
          </DialogTitle>
          <DialogDescription>
            Enter ID or URL. We'll download files, tags, and license info automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
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
              placeholder="e.g. thing:123456" 
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
                <Label>Destination Folder</Label>
                <Select value={selectedFolder} onValueChange={setSelectedFolder} disabled={isLoading}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {folders.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
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
            <Label>Add to Collection (Optional)</Label>
            <Select value={selectedCollection} onValueChange={setSelectedCollection} disabled={isLoading}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {collections.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
            </Select>
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