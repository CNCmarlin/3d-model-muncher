import React from 'react';
import {
    Box, Images, ChevronLeft, ChevronRight, X, Maximize2,
    Plus, Info, FileText, CheckCircle2
} from 'lucide-react'; import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { ModelViewer3D } from "./ModelViewer3D";
import { ModelViewerErrorBoundary } from "./ErrorBoundary";
import { ImageWithFallback } from "./ImageWithFallback";
import { Model } from "@/types/model";


interface ModelPreviewSectionProps {
    viewMode: '3d' | 'images' | 'doc';
    setViewMode: (mode: '3d' | 'images' | 'doc') => void;
    handleViewDocument: (url: string) => void;
    currentModel: Model;
    activeDocUrl: string | null;
    allImages: string[];
    selectedImageIndex: number;
    setSelectedImageIndex: (index: number) => void;
    handleCapturedImage: (img: string) => void;
    defaultModelColor?: string;
    isWindowFullscreen: boolean;
    setIsWindowFullscreen: (val: boolean) => void;
    imageContainerRef: React.RefObject<HTMLDivElement | null>;
    prevButtonRef: React.RefObject<HTMLButtonElement | null>;
    thumbnailStripRef: React.RefObject<HTMLDivElement | null>;
    addImageInputRef: React.RefObject<HTMLInputElement | null>;
    handlePreviousImage: () => void;
    handleNextImage: () => void;
    handleToggleFullscreen: () => void;
    isEditing: boolean;
    handleSetAsMain: (index: number) => void;
    handleAddImageClick: (e: React.MouseEvent) => void;
    handleAddImageFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
    addImageProgress: { processed: number; total: number } | null;
    addImageError: string | null;
    toggleImageSelection: (index: number) => void;
    isImageSelected: (index: number) => boolean;
    handleDragStart: (e: React.DragEvent, index: number) => void;
    handleDragOver: (e: React.DragEvent, index: number) => void;
    handleDrop: (e: React.DragEvent, index: number) => void;
    handleDragLeave: (e: React.DragEvent) => void;
    handleDragEnd: () => void;
    dragOverIndex: number | null;
    active3DFile: string | null;
    setActive3DFile: (path: string | null) => void;
    onTogglePrinted?: (val: boolean) => void;
    //currentModel: any;
}

export const ModelPreviewSection = ({
    viewMode, setViewMode, currentModel, allImages, selectedImageIndex,
    setSelectedImageIndex, handleCapturedImage, defaultModelColor,
    isWindowFullscreen, setIsWindowFullscreen, imageContainerRef,
    prevButtonRef, thumbnailStripRef, addImageInputRef, handlePreviousImage,
    handleNextImage, handleToggleFullscreen, isEditing, handleSetAsMain,
    handleAddImageClick, handleAddImageFile, addImageProgress, addImageError,
    toggleImageSelection, isImageSelected, handleDragStart, handleDragOver,
    handleDrop, handleDragLeave, handleDragEnd, dragOverIndex, active3DFile,
    setActive3DFile, onTogglePrinted, activeDocUrl, handleViewDocument,
}: ModelPreviewSectionProps) => {

    const fileToDisplay = React.useMemo(() => {
        // If no specific part is selected, use the project's main modelUrl
        if (!active3DFile) return currentModel.modelUrl;

        // Ensure the path is an absolute web path for the renderer
        // If it already starts with /models/, return it.
        if (active3DFile.startsWith('/models/')) return active3DFile;

        // Otherwise, clean and prefix it correctly
        const cleanPath = active3DFile.replace(/^\//, '');
        return `/models/${cleanPath}`;
    }, [active3DFile, currentModel.modelUrl]);

    const isGcode = fileToDisplay?.toLowerCase().endsWith('.gcode') || fileToDisplay?.toLowerCase().endsWith('.gcode.3mf');
    const activeFileName = active3DFile?.split('/').pop() || "";

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <Button
                    variant="ghost" size="sm"
                    onClick={() => onTogglePrinted?.(!currentModel.isPrinted)}
                    className={`h-6 gap-1.5 px-2 text-[10px] font-bold uppercase tracking-tight rounded-md border transition-all ${currentModel.isPrinted
                        ? "bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20"
                        : "bg-muted/50 text-muted-foreground/60 border-transparent hover:bg-muted"
                        }`}
                >
                    <CheckCircle2 className={`h-3 w-3 ${currentModel.isPrinted ? "text-green-600" : "text-muted-foreground/40"}`} />
                    {currentModel.isPrinted ? "Printed" : "Mark Printed"}
                </Button>

                <div className="flex items-center bg-muted/30 rounded-lg p-1 border">
                    <Button variant={viewMode === '3d' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('3d')} className="gap-2 h-8 px-3">
                        <Box className="h-4 w-4" /> 3D Model
                    </Button>
                    <Button variant={viewMode === 'images' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('images')} className="gap-2 h-8 px-3">
                        <Images className="h-4 w-4" /> Images ({allImages.length})
                    </Button>
                </div>
            </div>

            <div className="relative bg-gradient-to-br from-muted/30 to-muted/60 rounded-xl border overflow-hidden">

                {/* --- STAGE 1: DOCUMENT VIEWER --- */}
                {viewMode === 'doc' && activeDocUrl ? (
                    <div className="relative w-full aspect-video bg-background overflow-hidden animate-in fade-in duration-300">
                        {activeDocUrl.toLowerCase().endsWith('.pdf') ? (
                            <iframe src={`${activeDocUrl}#toolbar=0&navpanes=0`} className="w-full h-full border-none" title="Document Viewer" />
                        ) : (
                            <div className="w-full h-full bg-muted/10 p-8 overflow-auto font-mono text-xs leading-relaxed text-foreground/80 selection:bg-primary/30">
                                <TextFileLoader url={activeDocUrl} />
                            </div>
                        )}
                        <div className="absolute top-4 right-4 z-50">
                            <Button size="sm" variant="secondary" className="h-8 gap-2 bg-background/80 backdrop-blur shadow-lg border border-primary/20 text-primary hover:bg-background text-[10px] font-black uppercase" onClick={() => setViewMode('images')}>
                                <X className="h-3.5 w-3.5" /> Close_Doc
                            </Button>
                        </div>
                    </div>
                ) : viewMode === '3d' ? (
                    /* --- STAGE 2: 3D VIEWER --- */
                    <div className="relative w-full aspect-video animate-in fade-in duration-300">
                        {active3DFile && (
                            <div className="absolute top-4 left-4 z-20">
                                <Badge variant="secondary" className="py-1.5 px-3 flex items-center gap-2 bg-background/80 backdrop-blur-md border shadow-sm">
                                    <Info className="h-3.5 w-3.5 text-primary" />
                                    <span className="text-[11px] font-bold uppercase tracking-tight">Viewing Part: {activeFileName}</span>
                                </Badge>
                            </div>
                        )}
                        {!isGcode ? (
                            <ModelViewerErrorBoundary>
                                <ModelViewer3D modelUrl={fileToDisplay} modelName={currentModel.name} onCapture={handleCapturedImage} customColor={defaultModelColor || undefined} />
                            </ModelViewerErrorBoundary>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full bg-muted/50 p-6 text-center">
                                <FileText className="h-12 w-12 text-muted-foreground/20 mb-2" />
                                <p className="text-sm font-medium">G-code Preview Not Available</p>
                            </div>
                        )}
                        {active3DFile && (
                            <div className="absolute bottom-4 left-4 z-10">
                                <Button size="sm" variant="secondary" className="h-7 text-[10px] gap-1.5 shadow-md border bg-background/90 hover:bg-background" onClick={() => setActive3DFile(null)}>
                                    <X className="h-3 w-3" /> Reset to Main Model
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    /* --- STAGE 3: IMAGE GALLERY --- */
                    <div
                        ref={imageContainerRef}
                        className={isWindowFullscreen ? 'fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/95 backdrop-blur-xl' : 'relative animate-in fade-in duration-300'}
                    >
                        {isWindowFullscreen ? (
                            /* FULLSCREEN OVERLAY */
                            <div className="w-full flex items-center justify-center">
                                <div className="relative z-10 w-full max-w-[90vw] max-h-[90vh] flex flex-col items-center justify-center">
                                    <div className="relative w-full flex items-center justify-center">
                                        <ImageWithFallback src={allImages[selectedImageIndex]} alt={`${currentModel.name} - Fullscreen`} className="relative max-w-full h-screen object-contain rounded-lg" />
                                        {allImages.length > 1 && (
                                            <>
                                                <Button variant="secondary" size="sm" onClick={handlePreviousImage} className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 p-0 bg-background/80 hover:bg-background/90 border shadow-lg"><ChevronLeft className="h-5 w-5" /></Button>
                                                <Button variant="secondary" size="sm" onClick={handleNextImage} className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 p-0 bg-background/80 hover:bg-background/90 border shadow-lg"><ChevronRight className="h-5 w-5" /></Button>
                                            </>
                                        )}
                                        <div className="absolute bottom-3 right-3 bg-background/80 backdrop-blur-sm rounded-lg px-2 py-1 text-sm font-medium border shadow-lg">{selectedImageIndex + 1} / {allImages.length}</div>
                                        <Button variant="secondary" size="sm" className="absolute top-3 right-3 w-10 h-10 p-0 bg-background/90 border shadow-lg rounded-full" onClick={handleToggleFullscreen}><X className="h-5 w-5" /></Button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* STANDARD GALLERY VIEW (The one with all the logic) */
                            <div>
                                <AspectRatio ratio={16 / 10} className="bg-muted relative group rounded-xl overflow-hidden border border-border/40 shadow-inner">
                                    <ImageWithFallback src={allImages[selectedImageIndex]} alt={currentModel.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />

                                    {/* FULLSCREEN BUTTON - ONLY IN IMAGE MODE */}
                                    <div className="absolute top-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                                        <Button variant="secondary" size="sm" className="h-10 w-10 bg-background/90 backdrop-blur border shadow-xl hover:bg-primary hover:text-primary-foreground" onClick={handleToggleFullscreen}>
                                            <Maximize2 className="h-5 w-5" />
                                        </Button>
                                    </div>

                                    {allImages.length > 1 && (
                                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button variant="secondary" size="icon" onClick={handlePreviousImage} className="w-9 h-9 rounded-full bg-background/80 border shadow-md"><ChevronLeft className="h-5 w-5" /></Button>
                                            <Button variant="secondary" size="icon" onClick={handleNextImage} className="w-9 h-9 rounded-full bg-background/80 border shadow-md"><ChevronRight className="h-5 w-5" /></Button>
                                        </div>
                                    )}
                                    <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md text-white text-[9px] font-black px-2 py-1 rounded border border-white/10 uppercase tracking-widest">
                                        Frame_{selectedImageIndex + 1}_of_{allImages.length}
                                    </div>
                                </AspectRatio>

                                {/* THE ROBUST THUMBNAIL STRIP */}
                                {(allImages.length > 1 || isEditing) && (
                                    <ScrollArea className="mt-4 h-24" viewportRef={thumbnailStripRef} showHorizontalScrollbar={true}>
                                        <div className="flex gap-2 items-center h-20 py-1 pl-2">
                                            <input ref={addImageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleAddImageFile} />
                                            {allImages.map((image, index) => {
                                                const isSystemRender = image.includes('-thumb.png');
                                                return (
                                                    <div
                                                        key={index}
                                                        draggable={isEditing && !isWindowFullscreen}
                                                        onDragStart={(e) => handleDragStart(e, index)}
                                                        onDragOver={(e) => handleDragOver(e, index)}
                                                        onDrop={(e) => handleDrop(e, index)}
                                                        onDragLeave={handleDragLeave}
                                                        onDragEnd={handleDragEnd}
                                                        onClick={() => {
                                                            if (isEditing) toggleImageSelection(index);
                                                            setSelectedImageIndex(index);
                                                        }}
                                                        className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all duration-200 
                                                        ${isImageSelected(index) ? 'opacity-60 ring-2 ring-destructive scale-95' : index === selectedImageIndex ? 'border-primary shadow-lg scale-105' : 'border-border/40 hover:border-primary/50'}
                                                        ${dragOverIndex === index ? 'ring-2 ring-primary' : ''}
                                                    `}
                                                    >
                                                        <ImageWithFallback src={image} className="w-full h-full object-cover" />
                                                        {isImageSelected(index) && (
                                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-[8px] font-black uppercase">Remove</div>
                                                        )}
                                                        {index === 0 && (
                                                            <div className="absolute top-0 left-0 bg-primary px-1 text-[8px] font-bold text-white rounded-br">MAIN</div>
                                                        )}
                                                        {/* [NEW] Indicator if this is one of the photos from Thingiverse */}
                                                        {!isSystemRender && (
                                                            <div className="absolute bottom-0 right-0 bg-black/40 p-0.5">
                                                                <Images className="w-2 h-2 text-white/60" />
                                                            </div>
                                                        )}
                                                        {isEditing && index !== 0 && !isImageSelected(index) && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); handleSetAsMain(index); }}
                                                                className="absolute top-1 right-1 bg-black/70 hover:bg-black/90 text-white text-[7px] px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                                SET MAIN
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            {isEditing && (
                                                <button onClick={handleAddImageClick} className="w-16 h-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary">
                                                    {addImageProgress ? <span className="text-[10px] font-mono">{addImageProgress.processed}/{addImageProgress.total}</span> : <Plus className="h-5 w-5" />}
                                                </button>
                                            )}
                                        </div>
                                        {addImageError && <div className="text-[10px] text-destructive mt-1 px-2 uppercase font-mono">{addImageError}</div>}
                                    </ScrollArea>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const TextFileLoader = ({ url }: { url: string }) => {
    const [content, setContent] = React.useState<string>("Loading technical log...");

    React.useEffect(() => {
        fetch(url)
            .then(res => res.text())
            .then(text => setContent(text))
            .catch(() => setContent("// Error: Failed to retrieve file content. Check server logs."));
    }, [url]);

    return <pre className="whitespace-pre-wrap">{content}</pre>;
};