// src/components/CollectionEditorDialog.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Loader2, Save, Trash2, Folder, FolderOpen, FolderPlus, ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Collection } from "../types/collection";
import { Category } from "../types/category";
import { Model } from "../types/model";
import { ScrollArea } from "./ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";
import { Checkbox } from "./ui/checkbox";

interface CollectionEditorDialogProps {
  collection: Collection | null;
  categories: Category[];
  models: Model[]; // <--- NEW PROP
  onSave: (collection: Collection) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: 'manual' | 'folder';
  defaultParentId?: string;
}

const defaultCollectionState: Collection = {
  id: '',
  name: '',
  description: '',
  modelIds: [],
  childCollectionIds: [],
  category: '',
  tags: [],
  images: [],
  created: new Date().toISOString(),
  lastModified: new Date().toISOString(),
};

// Helper to truncate middle of long paths
function truncateMiddle(text: string, maxLength: number) {
  if (!text || text.length <= maxLength) return text;
  const startChars = Math.ceil(maxLength / 2) - 2;
  const endChars = Math.floor(maxLength / 2) - 1;
  return `${text.substring(0, startChars)}...${text.substring(text.length - endChars)}`;
}

// --- Folder Tree Helpers ---
interface FolderNode {
  name: string;
  fullPath: string;
  children: Record<string, FolderNode>;
  fileCount: number;
}

const buildFolderTree = (models: Model[]): FolderNode => {
  const root: FolderNode = { name: 'Root', fullPath: '', children: {}, fileCount: 0 };
  if (!models) return root;

  models.forEach(model => {
    let pathStr = model.modelUrl || model.filePath || '';
    // Normalize path: remove leading 'models/' or '/models/' and backslashes
    pathStr = pathStr.replace(/^(\/)?models\//, '').replace(/\\/g, '/');
    
    if (!pathStr) return;
    const parts = pathStr.split('/');
    parts.pop(); // Remove filename
    if (parts.length === 0) return;

    let current = root;
    let currentPath = '';

    parts.forEach((part) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!current.children[part]) {
        current.children[part] = { name: part, fullPath: currentPath, children: {}, fileCount: 0 };
      }
      current = current.children[part];
      current.fileCount++;
    });
  });
  return root;
};

const FolderTreeItem = ({ node, level, onSelect }: { node: FolderNode, level: number, onSelect: (node: FolderNode) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = Object.keys(node.children).length > 0;

  return (
    <div className="w-full select-none">
      <div 
        className={`flex items-center gap-2 py-1 px-2 rounded-md hover:bg-accent cursor-pointer ${level > 0 ? 'ml-3 border-l border-border/50' : ''}`}
        onClick={(e) => {
            // Clicking the row selects the folder
            e.stopPropagation();
            onSelect(node);
        }}
      >
        {/* Indentation / Toggle Button */}
        {hasChildren ? (
          <span 
            className="cursor-pointer p-0.5 hover:bg-muted rounded"
            onClick={(e) => {
              // [FIX] Stop propagation so clicking arrow ONLY toggles expansion, doesn't select
              e.stopPropagation(); 
              setIsOpen(!isOpen);
            }}
          >
            {isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          </span>
        ) : <span className="w-4" />} {/* Adjusted width for alignment */}
        
        {isOpen || (!hasChildren && level > 0) ? <FolderOpen className="h-4 w-4 text-primary" /> : <Folder className="h-4 w-4 text-muted-foreground" />}
        
        <span className="text-sm truncate flex-1">{node.name}</span>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 rounded-full">{node.fileCount}</span>
      </div>
      
      {isOpen && hasChildren && (
        <div className="mt-1">
          {Object.values(node.children).sort((a,b) => a.name.localeCompare(b.name)).map((child) => (
            <FolderTreeItem key={child.fullPath} node={child} level={level + 1} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
};
// ---------------------------

export function CollectionEditorDialog({
  collection,
  categories,
  models,
  onSave,
  onDelete,
  open,
  onOpenChange,
  initialMode = 'manual',
  defaultParentId
}: CollectionEditorDialogProps) {
  const [localCollection, setLocalCollection] = useState<Collection>(
    collection || defaultCollectionState
  );
  const [isLoading, setIsLoading] = useState(false);
  const [createOnDisk, setCreateOnDisk] = useState(false);
  const [availableFolders, setAvailableFolders] = useState<string[]>(['(Root)']);
  const [targetFolder, setTargetFolder] = useState<string>('(Root)');

  // Sync external prop changes
  // Sync external prop changes & Initialize Mode
  useEffect(() => {
    // 1. Reset form data
    setLocalCollection(collection || { ...defaultCollectionState, id: '' });

    // 2. Set "Create on Disk" default based on button clicked
    if (!collection) {
      // Creating NEW
      if (initialMode === 'folder') {
        setCreateOnDisk(true);
      } else {
        setCreateOnDisk(false);
      }
    } else {
      // Editing existing (never creating folder)
      setCreateOnDisk(false);
    }
  }, [collection, initialMode]);
  
  useEffect(() => {
    if (open) {
        fetch('/api/model-folders')
            .then(res => res.json())
            .then(data => {
                if (data.success && Array.isArray(data.folders)) {
                    // Filter out hidden folders if needed
                    const folders = ['(Root)', ...data.folders];
                    setAvailableFolders(folders);
                }
            })
            .catch(console.error);
    }
  }, [open]);

  // [NEW] Context-Aware Default Folder
  // If a parentId is provided (e.g. from context), try to find its matching physical folder
  useEffect(() => {
    if (!collection && open && defaultParentId && defaultParentId !== 'root') {
        // Try to decode the path from the ID (if it's an auto-collection)
        if (defaultParentId.startsWith('col_')) {
            try {
                // Decode base64 ID to get path
                const b64 = defaultParentId.substring(4);
                const relPath = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
                // normalize
                const normalized = relPath.replace(/\\/g, '/');
                setTargetFolder(normalized);
            } catch (e) {
                console.log("Could not decode parent path", e);
            }
        }
    } else {
        setTargetFolder('(Root)');
    }
  }, [defaultParentId, open, collection]);

  const isEditing = !!collection;
  const folderTree = useMemo(() => buildFolderTree(models), [models]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setLocalCollection(prev => ({ ...prev, [id]: value }));
  };

  const handleCategoryChange = (value: string) => {
    const categoryValue = value === '--none--' ? '' : value;
    setLocalCollection(prev => ({ ...prev, category: categoryValue }));
  };

  const handleFolderSelect = (node: FolderNode) => {
    const folderPrefix = node.fullPath + '/';
    const modelsInFolder = models.filter(m => {
        let path = m.modelUrl || m.filePath || '';
        path = path.replace(/^(\/)?models\//, '').replace(/\\/g, '/');
        return path.startsWith(folderPrefix) || path === node.fullPath;
    });
    const ids = modelsInFolder.map(m => m.id);
    setLocalCollection(prev => ({ ...prev, name: node.name, modelIds: ids }));
    toast.info(`Selected ${ids.length} models from "${node.name}"`);
  };

  const handleSave = async () => {
    if (!localCollection.name.trim()) {
      toast.error("Collection name is required.");
      return;
    }
    setIsLoading(true);

    const dataToSave = {
        ...localCollection,
        id: (createOnDisk && !isEditing) ? "" : (localCollection.id || crypto.randomUUID()), 
        modelIds: localCollection.modelIds || [],
        tags: localCollection.tags || [],
        createOnDisk: !isEditing && createOnDisk,
        targetFolderPath: (createOnDisk && targetFolder !== '(Root)') ? targetFolder : undefined
    };
    
    try {
        await onSave(dataToSave as Collection); // [FIX] Cast to Collection to bypass strict type check on extra props
        toast.success(`${isEditing ? 'Updated' : 'Created'} collection: ${dataToSave.name}`);
        onOpenChange(false);
    } catch (e: any) {
        toast.error(`Save failed: ${e.message || 'Unknown error'}`);
    } finally {
        setIsLoading(false);
    }
  };
  
  const handleDelete = async () => {
    if (!isEditing || !localCollection.id) return;
    const confirmDelete = window.confirm(`Are you sure you want to delete the collection "${localCollection.name}"? This cannot be undone.`);
    if (!confirmDelete) return;
    setIsLoading(true);
    try {
        await onDelete(localCollection.id);
        toast.success(`Collection "${localCollection.name}" deleted.`);
        onOpenChange(false);
    } catch (e: any) {
        toast.error(`Delete failed: ${e.message || 'Unknown error'}`);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Edit Collection: ${collection?.name}` : "Create New Collection"}</DialogTitle>
          <DialogDescription>
            Manage basic information for this collection.
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="flex-1 pr-4 -mr-4">
            <div className="grid gap-4 py-4 px-1">
            <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                id="name"
                value={localCollection.name}
                onChange={handleInputChange}
                required
                disabled={isLoading}
                placeholder="My Collection"
                />
            </div>

            {!isEditing && initialMode === 'folder' && (
                <div className="rounded-md border p-3 bg-muted/20 space-y-3">
                    <div className="flex items-start space-x-2">
                        <Checkbox 
                            id="create-disk" 
                            checked={createOnDisk} 
                            onCheckedChange={(c) => setCreateOnDisk(!!c)} 
                        />
                        <div className="grid gap-1.5 leading-none">
                            <Label htmlFor="create-disk" className="text-sm font-medium leading-none flex items-center gap-2 cursor-pointer">
                                <FolderPlus className="h-3.5 w-3.5 text-primary" />
                                Create Physical Folder
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                Creates a directory on your disk.
                            </p>
                        </div>
                    </div>

                    {createOnDisk && (
                        <div className="space-y-2 pl-6 animate-in slide-in-from-top-1 fade-in-0 duration-200">
                            <Label className="text-xs">Location (Parent Folder)</Label>
                            <Select value={targetFolder} onValueChange={setTargetFolder}>
                                <SelectTrigger>
                                    <span className="truncate block text-left">
                                        {targetFolder === '(Root)' ? 'Root Directory' : truncateMiddle(targetFolder, 35)}
                                    </span>
                                </SelectTrigger>
                                <SelectContent className="max-h-[200px]">
                                    <SelectItem value="(Root)">
                                        <span className="font-semibold">Root Directory</span> (./models)
                                    </SelectItem>
                                    {availableFolders.map(f => (
                                        <SelectItem key={f} value={f} title={f}>
                                            {truncateMiddle(f, 40)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
            )}

            {/* Folder Import (Manual Mode Only) */}
            {(!isEditing && initialMode === 'manual') && (
                <Accordion type="single" collapsible className="w-full border rounded-md px-2">
                    <AccordionItem value="folder-import" className="border-0">
                        <AccordionTrigger className="hover:no-underline py-2">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <Folder className="h-4 w-4 text-blue-500" />
                                Select from Existing Folder
                            </div>
                        </AccordionTrigger>
                        <AccordionContent>
                            <div className="max-h-48 overflow-y-auto border rounded bg-muted/30 p-2">
                                {Object.values(folderTree.children).map(node => (
                                    <FolderTreeItem key={node.fullPath} node={node} level={0} onSelect={handleFolderSelect} />
                                ))}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            )}

            <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                id="description"
                value={localCollection.description}
                onChange={handleInputChange}
                rows={3}
                disabled={isLoading}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select 
                value={localCollection.category || '--none--'} 
                onValueChange={handleCategoryChange}
                disabled={isLoading}
                >
                <SelectTrigger id="category">
                    <SelectValue placeholder="Select a category..." />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="--none--">(None / Uncategorized)</SelectItem>
                    {categories
                    .filter(c => c.label && c.label.trim() !== '') 
                    .map((c) => (
                        <SelectItem key={c.id} value={c.label}>
                        {c.label}
                        </SelectItem>
                    ))}
                </SelectContent>
                </Select>
            </div>
            
            {/* Read-only model counter */}
            <div className="text-sm text-muted-foreground mt-2 flex items-center justify-between bg-muted/50 p-2 rounded">
                <span>Models included:</span>
                <span className="font-semibold text-foreground">{(localCollection.modelIds || []).length}</span>
            </div>
            </div>
        </ScrollArea>

        <DialogFooter className="flex justify-between items-center pt-4">
            {isEditing && (
                <Button 
                    variant="destructive" 
                    onClick={handleDelete}
                    disabled={isLoading}
                >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                </Button>
            )}
            <div className="flex space-x-2 ml-auto">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                    Cancel
                </Button>
                <Button onClick={handleSave} disabled={isLoading}>
                    {isLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Save className="mr-2 h-4 w-4" />
                    )}
                    {isEditing ? "Save Changes" : "Create Collection"}
                </Button>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}