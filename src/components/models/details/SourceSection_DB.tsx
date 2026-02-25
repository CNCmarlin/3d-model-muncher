import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Model } from "@/types/model_db";
import { AlertCircle, ExternalLink, Globe } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

interface SourceSectionProps {
    isEditing: boolean;
    currentModel: Model;
    editedModel: Model | null;
    setEditedModel: React.Dispatch<React.SetStateAction<Model | null>>;
    onValidationChange?: (isValid: boolean) => void;
}

const hasProtocol = (url: string): boolean => /^https?:\/\//i.test(url);

export const SourceSection_DB = ({ isEditing, currentModel, editedModel, setEditedModel, onValidationChange }: SourceSectionProps) => {
    // 1. Initial State parsing
    const initialSource = editedModel?.source || '';
    const initialProtocol = initialSource.startsWith('http://') ? 'http://' : 'https://';
    const initialBody = hasProtocol(initialSource) ? initialSource.replace(/^https?:\/\//i, '') : initialSource;

    const [protocol, setProtocol] = useState<string>(initialProtocol);
    const [body, setBody] = useState<string>(initialBody);
    const [touched, setTouched] = useState(false);

    // Keep internal state synced if editedModel changes externally
    useEffect(() => {
        const src = editedModel?.source || '';
        if (src) {
            setProtocol(src.startsWith('http://') ? 'http://' : 'https://');
            setBody(hasProtocol(src) ? src.replace(/^https?:\/\//i, '') : src);
        } else {
            setProtocol('https://');
            setBody('');
        }
    }, [isEditing]);

    // 2. Validation
    // A valid URL has some text and at least one dot (domain.com)
    // Blank is also inherently valid (optional field)
    const isValid = body.trim() === '' || body.includes('.');
    const showError = touched && !isValid;

    useEffect(() => {
        onValidationChange?.(isValid);
    }, [isValid, onValidationChange]);

    // 3. Handlers
    const updateParent = useCallback((newProtocol: string, newBody: string) => {
        if (newBody.trim() === '') {
            setEditedModel(prev => prev ? { ...prev, source: null } : null);
        } else {
            // Auto strip protocol if user pasted it directly into the body
            let finalProtocol = newProtocol;
            let finalBody = newBody;

            if (newBody.startsWith('https://')) {
                finalProtocol = 'https://';
                finalBody = newBody.replace('https://', '');
            } else if (newBody.startsWith('http://')) {
                finalProtocol = 'http://';
                finalBody = newBody.replace('http://', '');
            }

            setProtocol(finalProtocol);
            setBody(finalBody);
            setEditedModel(prev => prev ? { ...prev, source: `${finalProtocol}${finalBody}` } : null);
        }
    }, [setEditedModel]);

    const handleProtocolChange = (val: string) => {
        setProtocol(val);
        updateParent(val, body);
    };

    const handleBodyChange = (val: string) => {
        setBody(val);
        updateParent(protocol, val);
        setTouched(true);
    };

    if (!isEditing && !currentModel.source) return null;

    return (
        <div className="space-y-4">
            {isEditing ? (
                <div className="space-y-2">
                    <Label htmlFor="edit-source">Source URL</Label>
                    <div className="flex gap-0">
                        <Select value={protocol} onValueChange={handleProtocolChange}>
                            <SelectTrigger className="w-[100px] rounded-r-none border-r-0 h-9 text-xs shrink-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="https://">https://</SelectItem>
                                <SelectItem value="http://">http://</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input
                            id="edit-source"
                            type="text" // Use text to avoid browser natively choking on split protocols
                            value={body}
                            onChange={(e) => handleBodyChange(e.target.value)}
                            onBlur={() => setTouched(true)}
                            placeholder="www.thingiverse.com/thing/123456"
                            className={`rounded-l-none h-9 text-xs flex-1 ${showError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                        />
                    </div>
                    {showError && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Please enter a valid URL (e.g. www.thingiverse.com)
                        </p>
                    )}
                </div>
            ) : (
                /* VIEW MODE */
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
                                href={currentModel.source ?? undefined}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-primary hover:text-primary/80 transition-colors break-all"
                            >
                                {currentModel.source}
                            </a>
                        </div>
                        <Button variant="outline" size="sm" asChild className="shrink-0">
                            <a href={currentModel.source ?? undefined} target="_blank" rel="noopener noreferrer" className="gap-2">
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