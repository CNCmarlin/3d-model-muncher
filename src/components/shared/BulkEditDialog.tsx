import { BulkOperationsPanel } from "@/components/bulk-edit/BulkOperationsPanel";
import { BulkTargetGrid } from "@/components/bulk-edit/BulkTargetGrid";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBulkEditForm } from "@/hooks/bulk/useBulkEditForm";
import { useBulkOperations } from "@/hooks/bulk/useBulkOperations";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Category } from "@/types/category";
import { Collection } from "@/types/collection";
import { Model } from "@/types/model";
import { Layers, Library, RefreshCw, Save, Users } from "lucide-react";

interface BulkEditDialogProps {
    isOpen: boolean;
    onClose: () => void;
    models: Model[];
    // Actions
    onRefresh?: () => Promise<void>;
    onBulkSaved?: (updatedModels: Model[]) => void;
    // Data
    categories: Category[];
    collectionsList: Collection[];
    pendingBulkCollectionId: string | null;

    // Selection control from parent (to handle removals)
    onRemoveFromSelection?: (modelId: string) => void;
    openMoveConfirmation?: () => Promise<boolean>;
}

export function BulkEditDialog({
    isOpen,
    onClose,
    models,
    onRefresh,
    onBulkSaved,
    // Data
    categories,
    collectionsList,
    pendingBulkCollectionId,
    // Selection control from parent (to handle removals)
    onRemoveFromSelection,
    openMoveConfirmation
}: BulkEditDialogProps) {
    const isDesktop = useMediaQuery("(min-width: 768px)");

    // Form State
    const form = useBulkEditForm({ models, isOpen, selectedTargetIds: models.map(m => m.id) });
    const { fieldSelection } = form;

    // Operations Logic
    const {
        isSaving,
        isGeneratingImages,
        generateProgress,
        handleSave,
        handleGenerateImages,
        setCloseRequestedWhileGenerating
    } = useBulkOperations({
        models,
        form,
        onRefresh,
        onBulkSaved,
        onClose,
        pendingBulkCollectionId,
        openMoveConfirmation
    });

    const hasChanges = Object.entries(fieldSelection).some(([k, v]) => k !== 'generateImages' && v);

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen && isGeneratingImages) {
            setCloseRequestedWhileGenerating(true);
            return;
        }
        if (!newOpen) onClose();
    };

    const handleRemoveModel = (modelId: string) => {
        if (onRemoveFromSelection) {
            onRemoveFromSelection(modelId);
        }
    };

    if (!isOpen) return null;

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent className="w-screen h-screen max-w-none rounded-none border-none p-0 gap-0 overflow-hidden flex flex-col bg-background">
                {/* Header */}
                <DialogHeader className="p-4 border-b shrink-0 flex flex-row items-center justify-between">
                    <div className="space-y-1">
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <Users className="h-5 w-5 text-primary" />
                            Bulk Organization Studio
                        </DialogTitle>
                        <DialogDescription>
                            Editing {models.length} models
                        </DialogDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="default"
                            onClick={handleSave}
                            disabled={!hasChanges || isSaving || isGeneratingImages}
                            className="gap-2"
                        >
                            {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {isSaving ? 'Saving...' : 'Apply Changes'}
                        </Button>
                    </div>
                </DialogHeader>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden">
                    {isDesktop ? (
                        <ResizablePanelGroup direction="horizontal">
                            <ResizablePanel defaultSize={35} minSize={25} maxSize={50} className="bg-background">
                                <BulkOperationsPanel
                                    form={form}
                                    models={models}
                                    categories={categories}
                                    collectionsList={collectionsList}
                                    pendingBulkCollectionId={pendingBulkCollectionId}
                                    isGeneratingImages={isGeneratingImages}
                                    generateProgress={generateProgress}
                                    onGenerateImages={handleGenerateImages}
                                    modelsMissingImagesCount={models.reduce((c, m) => c + ((m.thumbnail || (m.images && m.images.length)) ? 0 : 1), 0)}
                                />
                            </ResizablePanel>

                            <ResizableHandle withHandle />

                            <ResizablePanel defaultSize={65} className="bg-muted/10">
                                <BulkTargetGrid
                                    models={models}
                                    onRemoveModel={handleRemoveModel}
                                    selectedIds={models.map(m => m.id)}
                                    onToggleSelect={() => { }}
                                />
                            </ResizablePanel>
                        </ResizablePanelGroup>
                    ) : (
                        <Tabs defaultValue="operations" className="h-full flex flex-col">
                            <TabsList className="w-full justify-start rounded-none border-b px-4 h-12">
                                <TabsTrigger value="operations" className="gap-2"><Layers className="h-4 w-4" /> Operations</TabsTrigger>
                                <TabsTrigger value="models" className="gap-2"><Library className="h-4 w-4" /> Models ({models.length})</TabsTrigger>
                            </TabsList>
                            <TabsContent value="operations" className="flex-1 overflow-hidden m-0">
                                <BulkOperationsPanel
                                    form={form}
                                    models={models}
                                    categories={categories}
                                    collectionsList={collectionsList}
                                    pendingBulkCollectionId={pendingBulkCollectionId}
                                    isGeneratingImages={isGeneratingImages}
                                    generateProgress={generateProgress}
                                    onGenerateImages={handleGenerateImages}
                                    modelsMissingImagesCount={models.reduce((c, m) => c + ((m.thumbnail || (m.images && m.images.length)) ? 0 : 1), 0)}
                                />
                            </TabsContent>
                            <TabsContent value="models" className="flex-1 overflow-hidden m-0">
                                <BulkTargetGrid
                                    models={models}
                                    selectedIds={models.map(m => m.id)}
                                    // In dialog mode, we assume all are selected for operation scope, 
                                    // or we could implement sub-selection if needed. For now, selection matches models.
                                    onToggleSelect={() => { }}
                                    onRemoveModel={handleRemoveModel}
                                />
                            </TabsContent>
                        </Tabs>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
