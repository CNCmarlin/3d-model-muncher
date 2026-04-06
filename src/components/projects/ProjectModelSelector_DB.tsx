import { Search } from 'lucide-react';
import { useState } from 'react';
import { useModels_db } from '../../hooks/queries/useModels_db';
import { Model } from '../../types/model_db';
import { resolveModelThumbnail } from '../../utils/thumbnailUtils_db';
import { ImageWithFallback } from '../common/ImageWithFallback';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';

interface ProjectModelSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    onAddModels: (modelIds: string[]) => void;
}

export function ProjectModelSelector_DB({ isOpen, onClose, onAddModels }: ProjectModelSelectorProps) {
    const { data: models = [], isLoading } = useModels_db();
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const filtered = models.filter((m: Model) => m.name.toLowerCase().includes(search.toLowerCase()));

    const toggle = (id: string) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelected(next);
    };

    const handleAdd = () => {
        onAddModels(Array.from(selected));
        setSelected(new Set());
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl h-[85vh] flex flex-col overflow-hidden">
                <DialogHeader>
                    <DialogTitle>Add Parts from Library</DialogTitle>
                </DialogHeader>
                <div className="px-1 pt-2 pb-4">
                    <div className="relative max-w-sm">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search library..."
                            className="pl-9"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
                <ScrollArea className="flex-1 min-h-0 bg-muted/20 border rounded-xl p-4">
                    {isLoading ? <div className="text-center py-12 text-muted-foreground animate-pulse">Loading models...</div> : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                            {filtered.map((m: Model) => (
                                <div
                                    key={m.id}
                                    onClick={() => toggle(m.id)}
                                    className={`relative rounded-xl border-2 bg-card cursor-pointer overflow-hidden transition-all hover:shadow-md ${selected.has(m.id) ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : 'border-transparent hover:border-primary/40'}`}
                                >
                                    <div className="aspect-square bg-muted">
                                        <ImageWithFallback src={resolveModelThumbnail(m)} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="p-2 border-t text-[11px] leading-tight line-clamp-2 font-medium">
                                        {m.name}
                                    </div>
                                    {selected.has(m.id) && (
                                        <div className="absolute top-2 right-2 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold shadow-lg ring-2 ring-background">
                                            ✓
                                        </div>
                                    )}
                                </div>
                            ))}
                            {filtered.length === 0 && (
                                <div className="col-span-full py-12 text-center text-muted-foreground">
                                    No models found.
                                </div>
                            )}
                        </div>
                    )}
                </ScrollArea>
                <DialogFooter className="pt-4 mt-2 border-t">
                    <div className="flex items-center justify-between w-full">
                        <span className="text-sm text-muted-foreground">{selected.size} parts selected</span>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={onClose}>Cancel</Button>
                            <Button onClick={handleAdd} disabled={selected.size === 0}>
                                Add {selected.size} {selected.size === 1 ? 'Part' : 'Parts'} to Warehouse
                            </Button>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
