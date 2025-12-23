import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Checkbox } from "./ui/checkbox"; // Ensure you have this component
import { Loader2, Save, Trash2, Folder, FolderOpen, ChevronRight, ChevronDown, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { Collection } from "../types/collection";
import { Category } from "../types/category";
import { Model } from "../types/model";
import { ScrollArea } from "./ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";

interface CollectionEditorDialogProps {
  collection: Collection | null;
  categories: Category[];
  collections?: Collection[]; // [NEW] List of all collections for parent selection
  models: Model[];
  onSave: (collection: Collection) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // [NEW] Context props
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

// --- Folder Tree Helpers (Keep existing implementation) ---
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
    pathStr = pathStr.replace(/^(\/)?models\//, '').replace(/\\/g, '/');
    if (!pathStr) return;
    const parts = pathStr.split('/');
    parts.pop(); 
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
        onClick={(e) => { e.stopPropagation(); onSelect(node); }}
      >
        {hasChildren ? (
          <span className="cursor-pointer p-0.5 hover:bg-muted rounded" onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}>
            {isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          </span>
        ) : <span className="w-4" />}
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

export function CollectionEditorDialog({
  collection,
  categories,
  collections = [], // Default to empty array
  models,
  onSave,
  onDelete,
  open,
  onOpenChange,
  initialMode = 'manual',
  defaultParentId
}: CollectionEditorDialogProps) {
  const [localCollection, setLocalCollection] = useState<Collection>(collection || defaultCollectionState);
  const [isLoading, setIsLoading] = useState(false);
  
  // [NEW] Local state for enhanced features
  const [createOnDisk, setCreateOnDisk] = useState(false);
  const [parentId, setParentId] = useState<string>("root");

  // Sync external prop changes & Initialize
  useEffect(() => {
    setLocalCollection(collection || { ...defaultCollectionState, id: '' });
    
    if (collection) {
        // Edit Mode
        setParentId(collection.parentId || "root");
        setCreateOnDisk(false);
    } else {
        // Create Mode
        setParentId(defaultParentId || "root");
        if (initialMode === 'folder') {
            setCreateOnDisk(true);
        } else {
            setCreateOnDisk(false);
        }
    }
  }, [collection, initialMode, defaultParentId, open]);

  const isEditing = !!collection;
  const folderTree = useMemo(() => buildFolderTree(models), [models]);
  
  // Filter out self to avoid circular parents
  const availableParents = collections.filter(c => !collection || c.id !== collection.id);

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
        // If creating folder, send empty ID so server generates the path-based ID
        id: (createOnDisk && !isEditing) ? "" : (localCollection.id || crypto.randomUUID()), 
        modelIds: localCollection.modelIds || [],
        tags: localCollection.tags || [],
        // [NEW] Send parent and flag
        parentId: parentId === "root" ? null : parentId,
        createOnDisk: !isEditing && createOnDisk
    };
    
    try {
        await onSave(dataToSave as Collection);
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
    if (!window.confirm(`Delete "${localCollection.name}"? This cannot be undone.`)) return;
    setIsLoading(true);
    try {
        await onDelete(localCollection.id);
        toast.success(`Collection deleted.`);
        onOpenChange(false);
    } catch (e: any) {
        toast.error(`Delete failed: ${e.message}`);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? `Edit: ${collection?.name}` : (initialMode === 'folder' ? 'New Collection Folder' : 'Manual Import')}
          </DialogTitle>
          <DialogDescription>
             {isEditing ? 'Update collection details.' : (initialMode === 'folder' ? 'Create a physical folder and collection.' : 'Group models into a collection.')}
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

            {/* [NEW] Parent Collection Selector */}
            <div className="space-y-2">
                <Label>Parent Collection</Label>
                <Select value={parentId} onValueChange={setParentId} disabled={isLoading}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select parent..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="root">
                            <span className="text-muted-foreground italic">No Parent (Root Level)</span>
                        </SelectItem>
                        {availableParents.map((col) => (
                            <SelectItem key={col.id} value={col.id}>{col.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* [NEW] Create Folder Checkbox (Only for New + Folder Mode) */}
            {!isEditing && initialMode === 'folder' && (
                <div className="flex items-start space-x-2 border p-3 rounded-md bg-muted/20">
                    <Checkbox 
                        id="create-disk" 
                        checked={createOnDisk} 
                        onCheckedChange={(c) => setCreateOnDisk(!!c)} 
                    />
                    <div className="grid gap-1.5 leading-none">
                        <Label 
                            htmlFor="create-disk" 
                            className="text-sm font-medium leading-none flex items-center gap-2 cursor-pointer"
                        >
                            <FolderPlus className="h-3.5 w-3.5 text-primary" />
                            Create Physical Folder
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            Creates a folder on disk at <code>/{parentId !== 'root' ? '.../' : ''}{localCollection.name || '...'}</code>
                        </p>
                    </div>
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
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" value={localCollection.description} onChange={handleInputChange} rows={3} disabled={isLoading} />
            </div>
            
            <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={localCollection.category || '--none--'} onValueChange={handleCategoryChange} disabled={isLoading}>
                <SelectTrigger id="category"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="--none--">(Uncategorized)</SelectItem>
                    {categories.filter(c => c.label).map((c) => (
                        <SelectItem key={c.id} value={c.label}>{c.label}</SelectItem>
                    ))}
                </SelectContent>
                </Select>
            </div>
            </div>
        </ScrollArea>

        <DialogFooter className="flex justify-between items-center pt-4">
            {isEditing && (
                <Button variant="destructive" onClick={handleDelete} disabled={isLoading}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                </Button>
            )}
            <div className="flex space-x-2 ml-auto">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Cancel</Button>
                <Button onClick={handleSave} disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {isEditing ? "Save Changes" : "Create"}
                </Button>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}