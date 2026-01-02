import React, { useCallback, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Upload, FileText, X, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Model } from '@/types/model';

interface ProjectFolderDialogProps {
    isOpen: boolean;
    onClose: () => void;
    model: Model;
    onUpdated: (model: Model) => void;
}

export const ProjectFolderDialog = ({ isOpen, onClose, model, onUpdated }: ProjectFolderDialogProps) => {
    const [uploading, setUploading] = useState(false);
    const [files, setFiles] = useState<File[]>([]);

    const handleUpload = async () => {
        if (files.length === 0) return;
        setUploading(true);

        try {
            // We'll upload them one by one for maximum reliability 
            let lastUpdatedModel = model;
            for (const file of files) {
                const fd = new FormData();
                fd.append('file', file);
                fd.append('modelId', model.id);
                fd.append('filePath', model.filePath);

                const resp = await fetch('/api/models/upload-document', { method: 'POST', body: fd });
                const result = await resp.json();
                if (result.success && result.model) {
                    lastUpdatedModel = result.model;
                }
            }
            onUpdated(lastUpdatedModel);
            toast.success(`Successfully added ${files.length} files to project folder.`);
            setFiles([]);
            onClose();
        } catch (err) {
            toast.error("Failed to upload files.");
        } finally {
            setUploading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md border-primary/20 bg-card/95 backdrop-blur-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 font-black uppercase tracking-tighter text-primary">
                        <Upload className="h-5 w-5" /> Project_Folder_Maintenance
                    </DialogTitle>
                    <DialogDescription className="font-mono text-[10px] uppercase opacity-50">
                        Target: {model?.filePath ? model.filePath.split('/').slice(0, -1).join('/') : 'ROOT'}
                    </DialogDescription>
                </DialogHeader>

                <div
                    className="mt-4 border-2 border-dashed border-primary/20 rounded-xl p-8 text-center bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer group"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                        e.preventDefault();
                        setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
                    }}
                    onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.multiple = true;
                        input.onchange = (e) => setFiles(prev => [...prev, ...Array.from((e.target as any).files)]);
                        input.click();
                    }}
                >
                    <Upload className="h-8 w-8 mx-auto mb-2 text-primary/40 group-hover:text-primary transition-colors" />
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Drop Docs / Images / Configs</p>
                </div>

                {files.length > 0 && (
                    <ScrollArea className="h-32 mt-4 border rounded-lg bg-background/50 p-2">
                        {files.map((f, i) => (
                            <div key={i} className="flex items-center justify-between p-2 text-[10px] font-mono border-b last:border-0 border-border/40">
                                <span className="truncate flex-1">{f.name}</span>
                                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => {
                                    e.stopPropagation();
                                    setFiles(prev => prev.filter((_, idx) => idx !== i));
                                }}>
                                    <X className="h-3 w-3" />
                                </Button>
                            </div>
                        ))}
                    </ScrollArea>
                )}

                <DialogFooter className="mt-6">
                    <Button variant="ghost" onClick={onClose} disabled={uploading} className="text-[10px] uppercase font-bold">Cancel</Button>
                    <Button onClick={handleUpload} disabled={uploading || files.length === 0} className="gap-2 text-[10px] uppercase font-black">
                        {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                        Commit_to_Folder
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};