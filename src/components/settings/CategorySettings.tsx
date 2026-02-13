import { useCategoryManager } from '@/hooks/settings/useCategoryManager';
import { Model } from '@/types/model';
import * as LucideIcons from 'lucide-react';
import { Box, Edit2, Folder, GripVertical, Plus, Save, Trash2 } from 'lucide-react';
import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CategorySettingsProps = ReturnType<typeof useCategoryManager> & {
    models: Model[];
};

// Helper to resolve icon component dynamically
const getLucideIconComponent = (iconName?: string) => {
    if (!iconName) return Folder;
    // @ts-ignore - Dynamic access to icon library
    const Icon = LucideIcons[iconName];
    return Icon || Folder;
};

export function CategorySettings(props: CategorySettingsProps) {
    const {
        localCategories,
        draggedIndex,
        handleDragStart,
        handleDragOver,
        handleDragEnd,
        handleSaveCategories,
        isAddCategoryDialogOpen,
        setIsAddCategoryDialogOpen,
        newCategoryLabel,
        setNewCategoryLabel,
        newCategoryIcon,
        setNewCategoryIcon,
        handleConfirmAddCategory,
        unmappedCategories,
        handleAddUnmappedCategory,
        startRenameCategory,
        isCategoryRenameDialogOpen,
        setIsCategoryRenameDialogOpen,
        renameCategoryValue,
        setRenameCategoryValue,
        renameCategoryIcon,
        setRenameCategoryIcon,
        handleRenameCategory,
        selectedCategory,
        openDeleteConfirm,
        isDeleteConfirmOpen,
        setIsDeleteConfirmOpen,
        handleDeleteCategory,
        pendingDeleteCount,
        models
    } = props;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Categories</CardTitle>
                <CardDescription>
                    Drag and drop to reorder categories. Click edit to rename categories and update all associated models.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    {localCategories.map((category, index) => (
                        <div
                            key={category.id}
                            draggable
                            onDragStart={() => handleDragStart(index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDragEnd={handleDragEnd}
                            className={`
                        flex items-center gap-3 p-3 bg-muted rounded-lg border border-border
                        cursor-move hover:bg-accent/50 transition-colors duration-200
                        ${draggedIndex === index ? 'opacity-50' : ''}
                      `}
                        >
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                            <div className="flex items-center gap-2">
                                {(() => {
                                    const IconComp = getLucideIconComponent(category.icon);
                                    return <IconComp className="h-4 w-4 text-muted-foreground" />;
                                })()}
                                <Badge variant="outline" className="font-medium">
                                    {category.label}
                                </Badge>
                            </div>
                            <span className="text-sm text-muted-foreground">
                                <span className="text-sm text-muted-foreground hidden sm:inline">
                                    ID: {category.id}
                                </span>
                            </span>
                            <div className="flex items-center gap-2 ml-auto">
                                <span className="text-sm text-muted-foreground hidden sm:inline">
                                    Used in {models.reduce((acc, m) => acc + (m.category === category.label ? 1 : 0), 0)} model{models.reduce((acc, m) => acc + (m.category === category.label ? 1 : 0), 0) !== 1 ? 's' : ''}
                                </span>
                                {!(category.id === 'uncategorized' || category.label === 'Uncategorized') && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e: React.MouseEvent) => {
                                            e.stopPropagation();
                                            startRenameCategory(category);
                                        }}
                                        className="gap-2"
                                    >
                                        <Edit2 className="h-4 w-4" />
                                        Edit
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Unmapped categories found in munchie.json files */}
                {unmappedCategories.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="text-sm font-medium">Unmapped Categories</h4>
                        <p className="text-xs text-muted-foreground">Categories discovered in model metadata that are not defined in your configuration. You can add them as configured categories.</p>
                        <div className="space-y-2 mt-2">
                            {unmappedCategories.map((uc) => (
                                <div key={uc.label} className="flex items-center gap-3 p-3 bg-muted/60 rounded-lg border border-border">
                                    <div className="flex items-center gap-2">
                                        <Box className="h-4 w-4 text-muted-foreground" />
                                        <Badge variant="outline" className="font-medium">{uc.label}</Badge>
                                    </div>
                                    <div className="ml-auto flex items-center gap-2">
                                        <span className="text-sm text-muted-foreground hidden sm:inline">Used in {uc.count} model{uc.count !== 1 ? 's' : ''}</span>
                                        <Button size="sm" variant="ghost" onClick={() => handleAddUnmappedCategory(uc.label)} className="gap-2">
                                            <Plus className="h-4 w-4" />
                                            Add
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                    <Button onClick={handleSaveCategories} className="gap-2">
                        <Save className="h-4 w-4" />
                        Save Category Order
                    </Button>

                    <Button variant="secondary" onClick={() => setIsAddCategoryDialogOpen(true)} className="gap-2">
                        <Plus className="h-4 w-4" />
                        Add Category
                    </Button>
                </div>

                {/* --- DIALOGS --- */}

                {/* Add Category Dialog */}
                <Dialog open={isAddCategoryDialogOpen} onOpenChange={setIsAddCategoryDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add New Category</DialogTitle>
                            <DialogDescription>Create a new category for your models.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="new-cat-label">Label</Label>
                                <Input
                                    id="new-cat-label"
                                    value={newCategoryLabel}
                                    onChange={(e) => setNewCategoryLabel(e.target.value)}
                                    placeholder="e.g. Miniatures"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="new-cat-icon">Icon (Lucide name)</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="new-cat-icon"
                                        value={newCategoryIcon}
                                        onChange={(e) => setNewCategoryIcon(e.target.value)}
                                        placeholder="e.g. Box"
                                    />
                                    <div className="flex items-center justify-center w-10 h-10 border rounded bg-muted">
                                        {(() => {
                                            const Icon = getLucideIconComponent(newCategoryIcon);
                                            return <Icon className="w-5 h-5" />;
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsAddCategoryDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleConfirmAddCategory} disabled={!newCategoryLabel.trim()}>Add Category</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Rename/Edit Category Dialog */}
                <Dialog open={isCategoryRenameDialogOpen} onOpenChange={setIsCategoryRenameDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Edit Category</DialogTitle>
                            <DialogDescription>
                                Modify existing category details. Renaming will update all associated models.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>ID</Label>
                                <Input value={selectedCategory?.id || ''} disabled className="bg-muted" />
                                <p className="text-xs text-muted-foreground">Internal ID cannot be changed.</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="rename-cat-val">Label</Label>
                                <Input
                                    id="rename-cat-val"
                                    value={renameCategoryValue}
                                    onChange={(e) => setRenameCategoryValue(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="rename-cat-icon">Icon (Lucide name)</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="rename-cat-icon"
                                        value={renameCategoryIcon}
                                        onChange={(e) => setRenameCategoryIcon(e.target.value)}
                                    />
                                    <div className="flex items-center justify-center w-10 h-10 border rounded bg-muted">
                                        {(() => {
                                            const Icon = getLucideIconComponent(renameCategoryIcon);
                                            return <Icon className="w-5 h-5" />;
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <DialogFooter className="flex justify-between sm:justify-between">
                            <Button
                                variant="destructive"
                                onClick={() => selectedCategory && openDeleteConfirm(selectedCategory.id)}
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                            </Button>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => setIsCategoryRenameDialogOpen(false)}>Cancel</Button>
                                <Button
                                    onClick={() => selectedCategory && handleRenameCategory(selectedCategory.id, selectedCategory.id, renameCategoryValue)}
                                    disabled={!renameCategoryValue.trim()}
                                >
                                    Save Changes
                                </Button>
                            </div>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Delete Confirmation Dialog */}
                <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Delete Category</DialogTitle>
                            <DialogDescription>
                                Are you sure you want to delete the category "{selectedCategory?.label}"?
                                <br /><br />
                                This will affect <strong>{pendingDeleteCount}</strong> model(s).
                                Their category will be set to "Uncategorized", and their metadata files will be updated.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>Cancel</Button>
                            <Button variant="destructive" onClick={() => selectedCategory && handleDeleteCategory(selectedCategory.id)}>
                                Confirm Delete
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    );
}
