// src/components/CollectionEditorDialog.tsx
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea"; // Assuming a textarea component exists
import { Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Collection } from "../types/collection";
import { Category } from "../types/category";

interface CollectionEditorDialogProps {
  // If editing an existing collection, pass the object. If creating new, pass null.
  collection: Collection | null;
  // All available categories for the dropdown selector
  categories: Category[];
  // Function to save/update the collection
  onSave: (collection: Collection) => Promise<void>;
  // Function to delete the collection
  onDelete: (id: string) => Promise<void>;
  // State control for opening/closing the dialog
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function CollectionEditorDialog({
  collection,
  categories,
  onSave,
  onDelete,
  open,
  onOpenChange,
}: CollectionEditorDialogProps) {
  const [localCollection, setLocalCollection] = useState<Collection>(
    collection || defaultCollectionState
  );
  const [isLoading, setIsLoading] = useState(false);

  // Sync external prop changes (e.g., when opening/switching)
  useEffect(() => {
    setLocalCollection(collection || { ...defaultCollectionState, id: '' });
  }, [collection]);

  const isEditing = !!collection;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setLocalCollection(prev => ({ ...prev, [id]: value }));
  };

  const handleCategoryChange = (value: string) => {
    const categoryValue = value === '--none--' ? '' : value;
    setLocalCollection(prev => ({ ...prev, category: categoryValue }));
  };

  const handleSave = async () => {
    if (!localCollection.name.trim()) {
      toast.error("Collection name is required.");
      return;
    }
    setIsLoading(true);

    const dataToSave = {
        ...localCollection,
        // Ensure ID exists for new collections
        id: localCollection.id || crypto.randomUUID(), 
        modelIds: localCollection.modelIds || [],
        tags: localCollection.tags || [],
    };
    
    try {
        await onSave(dataToSave);
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Edit Collection: ${collection?.name}` : "Create New Collection"}</DialogTitle>
          <DialogDescription>
            Manage basic information for this collection.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={localCollection.name}
              onChange={handleInputChange}
              required
              disabled={isLoading}
            />
          </div>
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
              // 1. CRITICAL: Use the sentinel value if localCollection.category is empty
              value={localCollection.category || '--none--'} 
              onValueChange={handleCategoryChange}
              disabled={isLoading}
            >
              <SelectTrigger id="category">
                <SelectValue placeholder="Select a category..." />
              </SelectTrigger>
              <SelectContent>
                {/* 2. Sentinel Item for Uncategorized (Value is non-empty) */}
                <SelectItem value="--none--">(None / Uncategorized)</SelectItem>
                
                {/* 3. Filter the categories array to remove any with empty labels */}
                {categories
                  .filter(c => c.label && c.label.trim() !== '') // <-- NEW: Filter out empty labels
                  .map((c) => (
                    <SelectItem key={c.id} value={c.label}>
                      {c.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Read-only model counter */}
          <div className="text-sm text-muted-foreground mt-2">
            Models in Collection: {(localCollection.modelIds || []).length}
          </div>
        </div>
        <DialogFooter className="flex justify-between items-center">
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
            <div className="flex space-x-2">
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