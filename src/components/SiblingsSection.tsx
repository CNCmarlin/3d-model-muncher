import React from 'react';
import { Layers, ChevronRight } from 'lucide-react';
import { Model } from "../types/model";
import { ImageWithFallback } from "./ImageWithFallback";

interface SiblingsSectionProps {
    siblings: Model[];
    onModelUpdate: (model: Model) => void;
    detailsViewportRef: React.RefObject<HTMLDivElement | null>;
}

export const SiblingsSection = ({ 
    siblings, 
    onModelUpdate, 
    detailsViewportRef 
}: SiblingsSectionProps) => {
    
    if (siblings.length === 0) return null;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-semibold text-lg text-card-foreground">
                        In this Collection ({siblings.length})
                    </h3>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {siblings.map((sibling) => (
                    <button
                        key={sibling.id}
                        onClick={() => {
                            onModelUpdate(sibling);
                            // Scroll back to top so the user sees the new model info
                            detailsViewportRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="group relative aspect-square rounded-lg border overflow-hidden bg-muted/50 hover:border-primary transition-all text-left"
                    >
                        <ImageWithFallback 
                            src={sibling.thumbnail} 
                            alt={sibling.name} 
                            className="w-full h-full object-cover transition-transform group-hover:scale-105" 
                        />
                        
                        {/* Overlay Label */}
                        <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 backdrop-blur-sm transform translate-y-full group-hover:translate-y-0 transition-transform">
                            <p className="text-[10px] text-white font-medium truncate">
                                {sibling.name}
                            </p>
                        </div>

                        {/* Quick Indicator */}
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="bg-primary text-primary-foreground rounded-full p-1 shadow-lg">
                                <ChevronRight className="h-3 w-3" />
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};