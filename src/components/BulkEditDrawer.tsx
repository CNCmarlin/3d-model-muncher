import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { LICENSES } from '@/constants/licenses';
import {
  AlertCircle,
  CheckCircle,
  CircleCheckBig,
  Clock,
  DollarSign,
  Eye,
  EyeOff,
  FileCog,
  FileText,
  Globe,
  ImagePlus,
  Layers,
  Library,
  RefreshCw,
  Save,
  StickyNote,
  Tag,
  Users,
  Weight,
  XCircle
} from "lucide-react";

import { Category } from "@/types/category";
import { Collection } from "@/types/collection";
import { Model } from "@/types/model";

import { useBulkEditForm } from "@/hooks/bulk/useBulkEditForm";
import { useBulkOperations } from "@/hooks/bulk/useBulkOperations";
import { BulkEditSection } from "@/components/bulk-edit/BulkEditSection";
import { BulkRelatedFilesEditor } from "@/components/bulk-edit/BulkRelatedFilesEditor";
import { BulkTagEditor } from "@/components/bulk-edit/BulkTagEditor";

interface BulkEditDrawerProps {
  models: Model[];
  isOpen: boolean;
  onClose: () => void;
  onBulkUpdate: (updates: Partial<Model>) => void;
  onRefresh?: () => Promise<void>;
  onBulkSaved?: (updatedModels: Model[]) => void;
  onModelUpdate?: (model: Model) => void;
  onClearSelections?: () => void;
  categories: Category[];
  modelDirectory?: string;
  collectionsList: Collection[];
  pendingBulkCollectionId: string | null;
  onBulkEditComplete: () => void;
}

export function BulkEditDrawer({
  models,
  isOpen,
  onClose,
  onBulkUpdate,
  onRefresh,
  onBulkSaved,
  onClearSelections,
  categories,
  modelDirectory,
  collectionsList,
  pendingBulkCollectionId,
  onBulkEditComplete,
}: BulkEditDrawerProps) {

  const form = useBulkEditForm({ models, isOpen, pendingBulkCollectionId });
  const {
    editState, fieldSelection, handleFieldToggle, commonValues,
    setCategory, setLicense, setDesigner, setPrintStatus, setHidden,
    setNotes, setSource, setPrice, setPrintTime, setFilament,
    setCollectionId, setCollectionAction, setPrintSettings
  } = form;

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
    onBulkUpdate,
    onRefresh,
    onBulkSaved,
    onBulkEditComplete,
    onClose,
    onClearSelections,
    modelDirectory,
    pendingBulkCollectionId // Pass the prop
  });

  if (!isOpen || models.length === 0) return null;

  const hasChanges = Object.entries(fieldSelection).some(([k, v]) => k !== 'generateImages' && v);
  const modelsMissingImagesCount = models.reduce((count, m) => count + ((m.thumbnail || (m.images && m.images.length > 0)) ? 0 : 1), 0);
  const pendingCollectionName = pendingBulkCollectionId ? (collectionsList.find(c => c.id === pendingBulkCollectionId)?.name || 'New Collection') : '';

  const handleSheetOpenChange = (newOpen: boolean) => {
    if (!newOpen && isGeneratingImages) {
      setCloseRequestedWhileGenerating(true);
      return;
    }
    if (!newOpen) onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleSheetOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl flex flex-col h-full p-0 gap-0 bg-background">
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <SheetTitle className="text-2xl font-semibold flex items-center gap-2">
                <Users className="h-6 w-6 text-primary" />
                Bulk Edit Models
              </SheetTitle>
              <SheetDescription>
                Editing {models.length} selected models. Only check fields to update.
              </SheetDescription>
            </div>
            <Button onClick={handleSave} disabled={!hasChanges || isSaving || isGeneratingImages} size="sm" className="gap-2">
              {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">

            {/* Selected Models Badge List */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Selected Models</h3>
              <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto p-1">
                {models.slice(0, 10).map((m) => (
                  <Badge key={m.id} variant="secondary" className="text-xs">{m.name}</Badge>
                ))}
                {models.length > 10 && <Badge variant="outline">+{models.length - 10} more</Badge>}
              </div>
            </div>

            <Separator />

            {/* --- SECTIONS --- */}

            <BulkEditSection
              id="collection"
              label="Collection Assignment"
              icon={<Library className="h-4 w-4" />}
              checked={fieldSelection.collection}
              onToggle={() => handleFieldToggle('collection')}
            >
              {pendingBulkCollectionId && (
                <Alert className="border-green-500 bg-green-500/10">
                  <AlertTitle>Action Pending</AlertTitle>
                  <AlertDescription className="text-xs">
                    Queued for <strong>{pendingCollectionName}</strong>.
                    Models will be {editState.collectionAction === 'remove' ? 'removed from' : 'added to'} this collection.
                  </AlertDescription>
                </Alert>
              )}
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label>Collection</Label>
                  <Select value={editState.collectionId || ''} onValueChange={setCollectionId}>
                    <SelectTrigger><SelectValue placeholder="Select collection" /></SelectTrigger>
                    <SelectContent>
                      {collectionsList.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Action</Label>
                  <Select value={editState.collectionAction || 'none'} onValueChange={(v: any) => setCollectionAction(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="add">Add to collection</SelectItem>
                      <SelectItem value="remove">Remove from collection</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </BulkEditSection>

            <Separator />

            <BulkEditSection
              id="category"
              label="Category"
              icon={<Layers className="h-4 w-4" />}
              checked={fieldSelection.category}
              onToggle={() => handleFieldToggle('category')}
            >
              <div className="space-y-2">
                <Select value={editState.category || ''} onValueChange={(v) => {
                  // Find label to ensure case consistency
                  const found = categories.find(c => c.label === v || c.id === v);
                  setCategory(found ? found.label : v);
                }}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.label}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
                {commonValues.category && <p className="text-xs text-muted-foreground">Current: {commonValues.category}</p>}
              </div>
            </BulkEditSection>

            <BulkEditSection
              id="tags"
              label="Tags"
              icon={<Tag className="h-4 w-4" />}
              checked={fieldSelection.tags}
              onToggle={() => handleFieldToggle('tags')}
            >
              <BulkTagEditor form={form} />
            </BulkEditSection>

            <BulkEditSection
              id="designer"
              label="Designer"
              icon={<Users className="h-4 w-4" />}
              checked={fieldSelection.designer}
              onToggle={() => handleFieldToggle('designer')}
            >
              <Input placeholder="Designer name" value={editState.designer || ''} onChange={e => setDesigner(e.target.value)} />
              {commonValues.designer && <p className="text-xs text-muted-foreground">Current: {commonValues.designer}</p>}
            </BulkEditSection>

            <BulkEditSection
              id="license"
              label="License"
              icon={<FileText className="h-4 w-4" />}
              checked={fieldSelection.license}
              onToggle={() => handleFieldToggle('license')}
            >
              <Select value={editState.license as string || ''} onValueChange={setLicense}>
                <SelectTrigger><SelectValue placeholder="Select license" /></SelectTrigger>
                <SelectContent>{LICENSES.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
              {commonValues.license && <p className="text-xs text-muted-foreground">Current: {commonValues.license}</p>}
            </BulkEditSection>

            <BulkEditSection
              id="source"
              label="Source URL"
              icon={<Globe className="h-4 w-4" />}
              checked={fieldSelection.source}
              onToggle={() => handleFieldToggle('source')}
            >
              <Input placeholder="https://..." value={editState.source || ''} onChange={e => setSource(e.target.value)} />
            </BulkEditSection>

            <BulkEditSection
              id="isPrinted"
              label="Print Status"
              icon={<CircleCheckBig className="h-4 w-4" />}
              checked={fieldSelection.isPrinted}
              onToggle={() => handleFieldToggle('isPrinted')}
            >
              <div className="flex items-center gap-2">
                <Switch checked={editState.isPrinted || false} onCheckedChange={setPrintStatus} />
                <span className="text-sm flex items-center gap-2">
                  {editState.isPrinted ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                  {editState.isPrinted ? "Printed" : "Not Printed"}
                </span>
              </div>
              {commonValues.isPrinted !== undefined && <p className="text-xs text-muted-foreground mt-2">Current: {commonValues.isPrinted ? 'Printed' : 'Not Printed'}</p>}
            </BulkEditSection>

            <BulkEditSection
              id="hidden"
              label="Hidden Status"
              icon={<Eye className="h-4 w-4" />}
              checked={fieldSelection.hidden}
              onToggle={() => handleFieldToggle('hidden')}
            >
              <div className="flex items-center gap-2">
                <Switch checked={editState.hidden || false} onCheckedChange={setHidden} />
                <span className="text-sm flex items-center gap-2">
                  {editState.hidden ? <EyeOff className="h-4 w-4 text-orange-500" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                  {editState.hidden ? "Hide from view" : "Visible"}
                </span>
              </div>
              {commonValues.hidden !== undefined && <p className="text-xs text-muted-foreground mt-2">Current: {commonValues.hidden ? 'Hidden' : 'Visible'}</p>}
            </BulkEditSection>

            <BulkEditSection
              id="notes"
              label="Notes"
              icon={<StickyNote className="h-4 w-4" />}
              checked={fieldSelection.notes}
              onToggle={() => handleFieldToggle('notes')}
            >
              <Textarea placeholder="Notes..." value={editState.notes || ''} onChange={e => setNotes(e.target.value)} rows={3} />
            </BulkEditSection>

            <BulkEditSection
              id="relatedFiles"
              label="Related Files"
              icon={<FileText className="h-4 w-4" />}
              checked={fieldSelection.relatedFiles}
              onToggle={() => handleFieldToggle('relatedFiles')}
            >
              <BulkRelatedFilesEditor form={form} models={models} />
            </BulkEditSection>

            {/* --- METADATA --- */}

            <BulkEditSection
              id="printTime"
              label="Print Time"
              icon={<Clock className="h-4 w-4" />}
              checked={fieldSelection.printTime}
              onToggle={() => handleFieldToggle('printTime')}
            >
              <Input placeholder="e.g. 1h 30m" value={editState.printTime || ''} onChange={e => setPrintTime(e.target.value)} />
              {commonValues.printTime && <p className="text-xs text-muted-foreground">Current: {commonValues.printTime}</p>}
            </BulkEditSection>

            <BulkEditSection
              id="filamentUsed"
              label="Filament"
              icon={<Weight className="h-4 w-4" />}
              checked={fieldSelection.filamentUsed}
              onToggle={() => handleFieldToggle('filamentUsed')}
            >
              <Input placeholder="e.g. 12g PLA" value={editState.filamentUsed || ''} onChange={e => setFilament(e.target.value)} />
              {commonValues.filamentUsed && <p className="text-xs text-muted-foreground">Current: {commonValues.filamentUsed}</p>}
            </BulkEditSection>

            <BulkEditSection
              id="price"
              label="Price"
              icon={<DollarSign className="h-4 w-4" />}
              checked={fieldSelection.price}
              onToggle={() => handleFieldToggle('price')}
            >
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="number" step="0.01" min="0" placeholder="0.00" value={editState.price || ''} onChange={e => setPrice(e.target.value)} className="pl-9" />
              </div>
            </BulkEditSection>

            <BulkEditSection
              id="printSettings"
              label="Print Settings (STL only)"
              icon={<FileCog className="h-4 w-4" />}
              checked={fieldSelection.printSettings}
              disabled={!form.hasAnyStlSelected}
              onToggle={() => handleFieldToggle('printSettings')}
            >
              {!form.hasAnyStlSelected ? <p className="text-xs text-muted-foreground">No STL models selected.</p> : (
                <div className="grid grid-cols-2 gap-3">
                  {['Layer Height', 'Infill', 'Nozzle', 'Printer'].map(label => {
                    const key = (label.toLowerCase().replace(' ', '') === 'layerheight' ? 'layerHeight' : label.toLowerCase()) as 'layerHeight' | 'infill' | 'nozzle' | 'printer';
                    return (
                      <div key={key} className="space-y-1">
                        <Label className="text-xs">{label}</Label>
                        <Input
                          value={editState.printSettings?.[key] || ''}
                          onChange={e => setPrintSettings(key, e.target.value)}
                          placeholder="..."
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </BulkEditSection>

            {/* --- ACTIONS --- */}

            <BulkEditSection
              id="generateImages"
              label="Generate Images"
              icon={<ImagePlus className="h-4 w-4" />}
              checked={fieldSelection.generateImages}
              onToggle={() => handleFieldToggle('generateImages')}
              disabled={isGeneratingImages}
            >
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Automatically generate thumbnails for models that lack them.</p>
                <Button onClick={handleGenerateImages} disabled={isGeneratingImages || modelsMissingImagesCount === 0} size="sm">
                  {isGeneratingImages ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <ImagePlus className="h-4 w-4 mr-2" />}
                  {isGeneratingImages ? `Generating ${generateProgress.current}/${generateProgress.total}` : "Start Generation"}
                </Button>
                {isGeneratingImages && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>In Progress</AlertTitle>
                    <AlertDescription>Please do not close the window.</AlertDescription>
                  </Alert>
                )}
              </div>
            </BulkEditSection>

            <BulkEditSection
              id="regenerateMunchie"
              label="Regenerate Metadata"
              icon={<RefreshCw className="h-4 w-4" />}
              checked={fieldSelection.regenerateMunchie}
              onToggle={() => handleFieldToggle('regenerateMunchie')}
            >
              <Alert className="border-yellow-500 bg-yellow-500/10">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <AlertTitle className="text-yellow-700">Warning</AlertTitle>
                <AlertDescription className="text-yellow-700/80">
                  Re-parsing files will overwrite standard metadata but preserve your custom notes and tags.
                </AlertDescription>
              </Alert>
            </BulkEditSection>

          </div>
        </ScrollArea>

        <div className="border-t bg-muted/40 p-4 flex justify-between items-center">
          <p className="text-sm text-muted-foreground">{models.length} models selected</p>
          <Button onClick={handleSave} disabled={!hasChanges || isSaving || isGeneratingImages} className="gap-2">
            {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}