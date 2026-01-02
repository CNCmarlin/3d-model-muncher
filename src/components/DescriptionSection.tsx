import React, { useState, useEffect } from 'react';
import { User, FileText, Edit2, Trash2, Check, X } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button"; // Ensure Button is imported
import { Model } from "@/types/model";

interface DescriptionSectionProps {
    isEditing: boolean; // Global editing state
    currentModel: Model;
    editedModel: Model | null;
    setEditedModel: React.Dispatch<React.SetStateAction<Model | null>>;
    originalUserDefinedDescriptionRef: React.RefObject<string | null>;
    originalTopLevelDescriptionRef: React.RefObject<string | null>;
    restoreOriginalDescription: boolean;
    setRestoreOriginalDescription: (val: boolean) => void;
    onModelUpdate?: (model: Model) => void; // Added for In-Place saving
}

export const DescriptionSection = ({
    isEditing,
    currentModel,
    editedModel,
    setEditedModel,
    originalUserDefinedDescriptionRef,
    originalTopLevelDescriptionRef,
    restoreOriginalDescription,
    setRestoreOriginalDescription,
    onModelUpdate // New optional prop
}: DescriptionSectionProps) => {

    // --- IN-PLACE EDITING STATE ---
    const [isLocalEditing, setIsLocalEditing] = useState(false);
    const [localValue, setLocalValue] = useState("");

    const displayDescription = (() => {
        const source = isEditing ? (editedModel || currentModel) : currentModel;
        try {
            const ud = (source as any).userDefined;
            if (ud && typeof ud.description === 'string' && ud.description.trim() !== '') {
                return ud.description;
            }
        } catch (e) { }
        return source.description || "";
    })();

    // Keep local value in sync with viewed model
    useEffect(() => {
        if (!isEditing) setLocalValue(displayDescription);
    }, [displayDescription, isEditing]);

    const handleInPlaceSave = () => {
        const updated = {
            ...currentModel,
            description: localValue,
            userDefined: { ...(currentModel.userDefined || {}), description: localValue }
        };
        onModelUpdate?.(updated);
        setIsLocalEditing(false);
    };

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setEditedModel(prev => {
            const base = prev || { ...currentModel };
            return {
                ...base,
                description: val,
                userDefined: { ...(base.userDefined || {}), description: val }
            };
        });
        if (restoreOriginalDescription) setRestoreOriginalDescription(false);
    };

    return (
        <div className="space-y-4">
            {/* ==================== DESCRIPTION AREA ==================== */}
            <div className="space-y-2">
                {isEditing ? (
                    /* --- OPTION A: GLOBAL EDIT MODE (Original Logic) --- */
                    <>
                        <div className="p-4 rounded-xl border border-primary/30 bg-primary/5">
                            <Textarea
                                id="edit-description"
                                value={editedModel?.description ?? currentModel.description ?? ""}
                                onChange={handleTextChange}
                                rows={6}
                                className="w-full resize-none border-none bg-transparent p-0 font-mono text-sm leading-relaxed focus-visible:ring-0 shadow-none placeholder:text-muted-foreground/20"
                                placeholder="// Enter technical model description..."
                                autoFocus
                            />
                        </div>
                        {originalUserDefinedDescriptionRef.current !== null && (
                            <div className="pt-2 flex items-center space-x-3 bg-muted/30 p-3 rounded-lg border border-dashed">
                                <Switch
                                    id="restore-original-description"
                                    checked={restoreOriginalDescription}
                                    onCheckedChange={(next: boolean) => {
                                        setRestoreOriginalDescription(next);
                                        setEditedModel(prev => {
                                            if (!prev) return prev;
                                            const copy = { ...prev } as any;
                                            if (next) {
                                                const ud = copy.userDefined && typeof copy.userDefined === 'object' ? { ...copy.userDefined } : {};
                                                if (Object.prototype.hasOwnProperty.call(ud, 'description')) delete ud.description;
                                                copy.userDefined = ud;
                                                copy.description = originalTopLevelDescriptionRef.current || '';
                                            } else {
                                                if (originalUserDefinedDescriptionRef.current !== null) {
                                                    copy.userDefined = { ...copy.userDefined, description: originalUserDefinedDescriptionRef.current };
                                                    copy.description = originalUserDefinedDescriptionRef.current;
                                                }
                                            }
                                            return copy as Model;
                                        });
                                    }}
                                />
                                <Label htmlFor="restore-original-description" className="text-sm cursor-pointer">Restore original description</Label>
                            </div>
                        )}
                    </>
                ) : (
                    /* --- OPTION B: VIEW MODE (Notes Vibe / In-Place Editing) --- */
                    <div className="relative group p-5 rounded-xl border border-border/40 bg-card/20 backdrop-blur-sm font-mono text-sm leading-relaxed transition-all hover:border-primary/30">
                        {/* Visual Indicator Line */}
                        <div className="absolute left-0 top-4 bottom-4 w-0.5 bg-primary/20 group-hover:bg-primary/50 transition-colors" />

                        {isLocalEditing ? (
                            <div className="space-y-3">
                                <Textarea
                                    value={localValue}
                                    onChange={(e) => setLocalValue(e.target.value)}
                                    className="min-h-[120px] w-full bg-transparent border-none p-0 focus-visible:ring-0 text-sm font-mono leading-relaxed"
                                    autoFocus
                                />
                                <div className="flex justify-end gap-2 pt-2 border-t border-border/20">
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] uppercase font-bold" onClick={() => setIsLocalEditing(false)}>
                                        <X className="mr-1 h-3 w-3" /> Cancel
                                    </Button>
                                    <Button size="sm" variant="default" className="h-7 px-3 text-[10px] uppercase font-black" onClick={handleInPlaceSave}>
                                        <Check className="mr-1 h-3 w-3" /> Save Changes
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Hover Actions */}
                                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => setIsLocalEditing(true)}>
                                        <Edit2 className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => { if(window.confirm("Clear description?")) onModelUpdate?.({...currentModel, description: ""}) }}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                                <div className={`whitespace-pre-wrap pr-10 ${!displayDescription ? 'text-muted-foreground/30 italic' : 'text-foreground/80'}`}>
                                    {displayDescription || "// No project documentation provided."}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* ==================== METADATA GRID (LAB STYLE) ==================== */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {currentModel.license && (
                    <div className="flex flex-col gap-1 p-3 bg-muted/20 rounded-lg border border-border/40 font-mono">
                        <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/50">License_Agreement</span>
                        <span className="text-xs text-foreground/70">{currentModel.license}</span>
                    </div>
                )}
                {currentModel.designer && (
                    <div className="flex flex-col gap-1 p-3 bg-muted/20 rounded-lg border border-border/40 font-mono">
                        <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/50">Designer_Architect</span>
                        <span className="text-xs text-foreground/70">{currentModel.designer}</span>
                    </div>
                )}
            </div>
        </div>
    );
};