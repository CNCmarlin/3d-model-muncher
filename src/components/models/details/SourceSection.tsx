import React from 'react';
import { Globe, ExternalLink } from 'lucide-react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Model } from "@/types/model";

interface SourceSectionProps {
    isEditing: boolean;
    currentModel: Model;
    editedModel: Model | null;
    setEditedModel: React.Dispatch<React.SetStateAction<Model | null>>;
}

export const SourceSection = ({ isEditing, currentModel, editedModel, setEditedModel }: SourceSectionProps) => {
    if (!isEditing && !currentModel.source) return null;
    return (
        <div className="space-y-4">
            {isEditing ? (
                <div className="space-y-2">
                    <Label htmlFor="edit-source">Source URL</Label>
                    <Input
                        id="edit-source"
                        type="url"
                        value={editedModel?.source || ""}
                        onChange={(e) => setEditedModel(prev => prev ? { ...prev, source: e.target.value } : null)}
                        placeholder="https://www.thingiverse.com/thing/123456"
                    />
                </div>
            ) : (
                /* VIEW MODE: Source Link */
                <div className="space-y-4">
                    <Separator />
                    <div className="flex items-center gap-2">
                        <Globe className="h-5 w-5 text-muted-foreground" />
                        <h3 className="font-semibold text-lg text-card-foreground">Source</h3>
                    </div>
                    <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg border">
                        <div className="flex items-center justify-center w-10 h-10 bg-background rounded-lg border">
                            <ExternalLink className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm text-muted-foreground">Downloaded from:</p>
                            <a
                                href={currentModel.source}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-primary hover:text-primary/80 transition-colors break-all"
                            >
                                {currentModel.source}
                            </a>
                        </div>
                        <Button variant="outline" size="sm" asChild className="shrink-0">
                            <a href={currentModel.source} target="_blank" rel="noopener noreferrer" className="gap-2">
                                <ExternalLink className="h-4 w-4" />
                                Visit
                            </a>
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};