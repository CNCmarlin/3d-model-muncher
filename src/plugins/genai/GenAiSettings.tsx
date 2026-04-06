import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Bot, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { SearchableSelect_DB } from '@/components/common/SearchableSelect_DB';
import TagsInput from '@/components/common/TagsInput_DB';
import { resolveModelThumbnail } from '@/utils/thumbnailUtils';
import { toast } from 'sonner';

// Reusing types from ExperimentalTab
type ModelEntry = any;
interface GenAiSettingsProps {
    models: ModelEntry[];
    categories: string[]; // passed down from parent
    loading: boolean;
}

export function GenAiSettings({ models, categories: propCategories, loading: modelsLoading }: GenAiSettingsProps) {
    const [query, setQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const INITIAL_LIMIT = 25;
    const [showAll, setShowAll] = useState(false);
    const [selected, setSelected] = useState<ModelEntry | null>(null);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return models;
        return models.filter((m) => m.name.toLowerCase().includes(q));
    }, [models, query]);

    const visibleModels = useMemo(() => {
        const q = query.trim();
        if (!q && !showAll && filtered.length > INITIAL_LIMIT) {
            return filtered.slice(0, INITIAL_LIMIT);
        }
        return filtered;
    }, [filtered, query, showAll]);

    // --- Gemini State ---
    const [geminiPrompt, setGeminiPrompt] = useState("");
    const [geminiResult, setGeminiResult] = useState("");
    const [geminiLoading, setGeminiLoading] = useState(false);
    const [geminiError, setGeminiError] = useState("");
    const [provider, setProvider] = useState<'gemini' | 'openai' | 'mock'>('gemini');
    const [promptOption, setPromptOption] = useState<'image_description' | 'translate_description' | 'rewrite_description' | 'other'>('image_description');
    const [sendImage, setSendImage] = useState(true);
    const [includeModelName, setIncludeModelName] = useState(true);

    const [editDescription, setEditDescription] = useState("");
    const [editCategory, setEditCategory] = useState("");
    const [editTags, setEditTags] = useState<string[]>([]);
    const [categoryLoading, setCategoryLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [suggestionDescription, setSuggestionDescription] = useState("");
    const [suggestionCategory, setSuggestionCategory] = useState("");
    const [suggestionTags, setSuggestionTags] = useState<string[]>([]);
    const [resizedPreview, setResizedPreview] = useState<string | null>(null);

    const categories = useMemo(() => {
        const src = propCategories && propCategories.length > 0
            ? propCategories
            : Array.from(new Set(models.map(m => m.category).filter(Boolean))) as string[];
        const set = new Set<string>();
        set.add('Uncategorized');
        for (const s of src) {
            if (s && typeof s === 'string' && s.trim() && s !== 'Uncategorized') set.add(s);
        }
        if (editCategory && editCategory.trim() && editCategory !== 'Uncategorized') set.add(editCategory);
        if (suggestionCategory && suggestionCategory.trim() && suggestionCategory !== 'Uncategorized') set.add(suggestionCategory);
        return Array.from(set);
    }, [models, propCategories, editCategory, suggestionCategory]);

    useEffect(() => {
        if (provider !== 'mock') {
            setSuggestionDescription('');
            setSuggestionCategory('');
            setSuggestionTags([]);
            setGeminiResult('');
        }
        setGeminiError('');
    }, [provider]);

    async function resizeImageBlobToDataUrl(blob: Blob, targetW = 512, targetH = 512, mimeType?: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            const url = URL.createObjectURL(blob);
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = targetW;
                    canvas.height = targetH;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) throw new Error('Canvas context unavailable');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, targetW, targetH);
                    const iw = img.width;
                    const ih = img.height;
                    const ratio = Math.min(targetW / iw, targetH / ih);
                    const nw = Math.round(iw * ratio);
                    const nh = Math.round(ih * ratio);
                    const dx = Math.round((targetW - nw) / 2);
                    const dy = Math.round((targetH - nh) / 2);
                    ctx.drawImage(img, 0, 0, iw, ih, dx, dy, nw, nh);
                    const outMime = mimeType && (mimeType === 'image/jpeg' || mimeType === 'image/png') ? mimeType : 'image/png';
                    const dataUrl = canvas.toDataURL(outMime);
                    resolve(dataUrl);
                } catch (err) {
                    reject(err);
                } finally {
                    URL.revokeObjectURL(url);
                }
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load image for resizing'));
            };
            img.src = url;
        });
    }

    async function handleGeminiSuggest() {
        setGeminiLoading(true);
        setGeminiError("");
        setGeminiResult("");
        if (provider === 'mock') {
            setSuggestionDescription("");
            setSuggestionCategory("");
            setSuggestionTags([]);
            try {
                if (sendImage) {
                    const imgUrl = selected ? resolveModelThumbnail(selected as any) : "";
                    if (imgUrl) {
                        const imgRes = await fetch(imgUrl);
                        const imgBlob = await imgRes.blob();
                        const resizedDataUrl = await resizeImageBlobToDataUrl(imgBlob, 512, 512, imgBlob.type);
                        setResizedPreview(resizedDataUrl);
                    }
                } else {
                    setResizedPreview(null);
                }
                await new Promise((res) => setTimeout(res, 700));
                const sampleDescription = `Munchie the mascot features a spherical body.`;
                setSuggestionDescription(sampleDescription);
                setSuggestionCategory("Figurine");
                setSuggestionTags(["monster", "creature"]);
                setGeminiResult(sampleDescription);
            } catch (e: any) {
                setGeminiError(e?.message ?? 'Mock suggestion failed');
            } finally {
                setGeminiLoading(false);
            }
            return;
        }

        try {
            let base64 = '';
            let mimeType = '';
            if (sendImage) {
                const imgUrl = selected ? resolveModelThumbnail(selected as any) : "";
                const PLACEHOLDER = '/images/placeholder.svg';
                if (!imgUrl || imgUrl === PLACEHOLDER) throw new Error("Model requires a thumbnail for AI assistance");
                const imgRes = await fetch(imgUrl);
                const imgBlob = await imgRes.blob();
                const resizedDataUrl = await resizeImageBlobToDataUrl(imgBlob, 512, 512, imgBlob.type);
                setResizedPreview(resizedDataUrl);
                base64 = resizedDataUrl.split(',')[1] ?? '';
                mimeType = imgBlob.type;
            } else {
                setResizedPreview(null);
            }

            const filename = selected?.name ?? selected?.id ?? "";
            const payloadBody: any = { provider, promptOption };
            if (sendImage) {
                payloadBody.imageBase64 = base64;
                payloadBody.mimeType = mimeType;
            }

            if (promptOption === 'image_description') {
                const existingDesc = typeof editDescription === 'string' ? editDescription : (selected?.description ?? "");
                payloadBody.prompt = geminiPrompt || `Create a description for ${filename}. Existing: ${existingDesc}`;
            } else if (promptOption === 'translate_description') {
                payloadBody.description = typeof editDescription === 'string' ? editDescription : (selected?.description ?? "");
                payloadBody.prompt = geminiPrompt || `Translate the following description:\n\n${payloadBody.description}`;
            } else if (promptOption === 'rewrite_description') {
                payloadBody.description = typeof editDescription === 'string' ? editDescription : (selected?.description ?? "");
                payloadBody.prompt = geminiPrompt || `Rewrite the following description:\n\n${payloadBody.description}`;
            } else if (promptOption === 'other') {
                payloadBody.prompt = geminiPrompt || '';
            }

            if (includeModelName) {
                payloadBody.filename = filename;
            }

            const res = await fetch("/api/gemini-suggest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payloadBody),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'Gemini API error');
            }

            let data: any = null;
            try { data = await res.json(); } catch (e) { data = { text: await res.text() }; }

            setGeminiResult(data.text ?? data.result ?? "No suggestion returned.");
            if (data.suggestion) {
                setSuggestionDescription(data.suggestion.description ?? "");
                setSuggestionCategory(data.suggestion.category ?? "");
                setSuggestionTags(Array.isArray(data.suggestion.tags) ? data.suggestion.tags : []);
            } else {
                setSuggestionDescription(data.text ?? "");
                setSuggestionCategory("");
                setSuggestionTags([]);
            }
        } catch (err: any) {
            setGeminiError(err?.message ?? "Unknown error");
            setSuggestionDescription("");
            setSuggestionCategory("");
            setSuggestionTags([]);
            setGeminiResult("");
            setResizedPreview(null);
        } finally {
            setGeminiLoading(false);
        }
    }

    useEffect(() => {
        setResizedPreview(null);
        setGeminiError("");
        setGeminiResult("");
        setSuggestionDescription("");
        setSuggestionCategory("");
        setSuggestionTags([]);
        setGeminiLoading(false);

        if (!selected) {
            setEditDescription("");
            setEditCategory("");
            setEditTags([]);
            return;
        }

        setEditDescription(selected.description ?? "");
        setEditTags(selected.tags ? selected.tags.slice() : []);
        const defaultCategory = selected.category && selected.category.trim() ? selected.category : 'Uncategorized';

        if ((selected as any)?.id) {
            setCategoryLoading(true);
            fetch(`/api/models/${encodeURIComponent((selected as any).id)}`)
                .then(r => r.ok ? r.json() : null)
                .then((fetched: any) => {
                    if (fetched) {
                        setEditCategory(fetched.category || defaultCategory);
                        setEditDescription(fetched.description || "");
                    }
                })
                .catch(() => setEditCategory(defaultCategory))
                .finally(() => setCategoryLoading(false));
        } else {
            setEditCategory(defaultCategory);
        }
    }, [selected]);

    return (
        <div className="space-y-2">
            <h3>AI Metadata Generation</h3>
            <label className="block text-sm font-medium text-foreground/90">Search models by name</label>
            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                        ref={inputRef as any}
                        placeholder="Type model name..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="pl-10 pr-8 bg-background border-border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-primary input-sm"
                    />
                    {query && (
                        <button
                            className="absolute right-1 top-1/2 -translate-y-1/2 btn btn-ghost btn-sm"
                            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
                        >✕</button>
                    )}
                </div>
                <div className="text-sm text-muted-foreground">{modelsLoading ? "Loading..." : `${filtered.length} results`}</div>
            </div>

            <div className="mt-2 grid grid-cols-1 gap-2">
                {filtered.length === 0 && !modelsLoading ? (
                    <div className="text-sm text-muted-foreground">No models found.</div>
                ) : (
                    <>
                        {visibleModels.map((m: any) => (
                            <button
                                key={m.id ?? m.name}
                                onClick={() => setSelected(m)}
                                className="flex items-center gap-3 rounded border p-2 text-left hover:bg-muted"
                            >
                                <img
                                    src={resolveModelThumbnail(m as any) || "/images/placeholder.svg"}
                                    alt={m.name}
                                    className="h-12 w-12 object-cover rounded"
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/images/placeholder.svg"; }}
                                />
                                <div className="overflow-hidden text-clip">
                                    <div className="font-medium">{m.name}</div>
                                    <div className="text-xs text-muted-foreground truncate w-72">{m.description}</div>
                                </div>
                            </button>
                        ))}
                    </>
                )}
            </div>

            <Sheet open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
                {selected && (
                    <SheetContent className="w-full sm:max-w-2xl">
                        <SheetHeader className="border-b p-4 sticky top-0 bg-background/95 backdrop-blur-sm z-20">
                            <div className="flex items-center justify-between">
                                <SheetTitle className="text-lg font-semibold px-2">{selected?.name}</SheetTitle>
                                <button className="btn btn-ghost p-2" onClick={() => setSelected(null)}>
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                            <SheetDescription className="sr-only">Edit AI metadata for {selected?.name}</SheetDescription>
                        </SheetHeader>
                        <ScrollArea className="min-h-0">
                            <div className="h-full p-4 space-y-4">
                                <img
                                    src={resolveModelThumbnail(selected as any) || "/images/placeholder.svg"}
                                    alt={selected.name}
                                    className="w-64 rounded object-cover"
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/images/placeholder.svg'; }}
                                />
                                <label className="text-sm font-medium">Description</label>
                                <Textarea
                                    value={editDescription}
                                    onChange={e => setEditDescription(e.target.value)}
                                    placeholder="Edit description here or use Gemini suggestion"
                                />

                                <label className="text-sm font-medium">Category</label>
                                <SearchableSelect_DB
                                    value={editCategory || 'Uncategorized'}
                                    onValueChange={(v: string) => setEditCategory(v)}
                                    disabled={categoryLoading}
                                    options={(categories || []).map(c => ({ value: c, label: c }))}
                                />

                                <label className="text-sm font-medium">Tags</label>
                                <TagsInput value={editTags} onChange={setEditTags} size="sm" fallbackDisplay={selected?.tags || []} />

                                <Separator className="mb-4" />
                                <h3>Generative AI</h3>
                                <p className="text-sm text-muted-foreground">Use AI to generate or improve model metadata.</p>
                                
                                <label className="text-sm font-medium">Provider</label>
                                <SearchableSelect_DB
                                    value={provider}
                                    onValueChange={(v: string) => setProvider(v as any)}
                                    options={[
                                        { value: 'mock', label: 'Simulated (fake)' },
                                        { value: 'gemini', label: 'Google Gemini' }
                                    ]}
                                />

                                <label className="text-sm font-medium">Prompt Template</label>
                                <SearchableSelect_DB
                                    value={promptOption}
                                    onValueChange={(v: string) => {
                                        setPromptOption(v as any);
                                        if (v !== 'other') setGeminiPrompt('');
                                    }}
                                    options={[
                                        { value: 'image_description', label: 'Create description from image' },
                                        { value: 'translate_description', label: 'Translate this description' },
                                        { value: 'rewrite_description', label: 'Rewrite description' },
                                        { value: 'other', label: 'Other' }
                                    ]}
                                />

                                {promptOption === 'other' && (
                                    <>
                                        <Input placeholder="Describe what you want Gemini to do" value={geminiPrompt} onChange={e => setGeminiPrompt(e.target.value)} className="input-sm mt-1" />
                                        <div className="flex items-center gap-3 mt-3">
                                            <Switch checked={sendImage} onCheckedChange={setSendImage} id="send-image-switch" />
                                            <Label htmlFor="send-image-switch">Include image</Label>
                                        </div>
                                        <div className="mt-2 flex items-center gap-3">
                                            <Switch checked={includeModelName} onCheckedChange={setIncludeModelName} id="include-name-switch" />
                                            <Label htmlFor="include-name-switch">Include model name</Label>
                                        </div>
                                    </>
                                )}

                                {geminiError && (
                                    <Alert variant="destructive" className="mt-2 border-red-500 text-red-700">
                                        <AlertTitle>Error</AlertTitle>
                                        <AlertDescription>{geminiError}</AlertDescription>
                                    </Alert>
                                )}

                                {(!geminiError && (suggestionDescription || suggestionCategory || suggestionTags.length > 0 || geminiResult || geminiLoading)) && (
                                    <div className="mt-3 p-3 rounded bg-muted text-sm">
                                        <div className="flex items-center justify-between">
                                            <div className="font-medium">Gemini Suggestion</div>
                                            <div className="flex items-center gap-3">
                                                {resizedPreview && (
                                                    <div className="flex items-center gap-2">
                                                        <img src={resizedPreview} alt="Resized preview" className="h-12 w-12 rounded object-cover border" />
                                                        <div className="text-xs text-muted-foreground">Image sent</div>
                                                    </div>
                                                )}
                                                {geminiLoading && <Loader2 className="animate-spin h-4 w-4 text-muted-foreground" />}
                                            </div>
                                        </div>
                                        {geminiLoading ? null : (
                                            <>
                                                {suggestionDescription && <div className="mt-2 whitespace-pre-line">{suggestionDescription}</div>}
                                                {suggestionCategory && <div className="mt-2"><span className="font-medium">Category:</span> {suggestionCategory}</div>}
                                                {suggestionTags.length > 0 && <div className="mt-2"><span className="font-medium">Tags:</span> {suggestionTags.join(', ')}</div>}
                                                <div className="flex gap-2 mt-3">
                                                    <Button size="sm" onClick={() => {
                                                        if (suggestionDescription) setEditDescription(suggestionDescription);
                                                        if (suggestionCategory) setEditCategory(suggestionCategory);
                                                        if (suggestionTags.length > 0) setEditTags(suggestionTags);
                                                    }}>Update Fields</Button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                <Button size="sm" variant="default" className="w-full justify-center" onClick={handleGeminiSuggest} disabled={geminiLoading}>
                                    <Bot /> <span className="ml-2">{geminiLoading ? 'Sent...' : 'Send'}</span>
                                </Button>

                                <div className="flex gap-2 mt-3">
                                    <Button size="sm" onClick={async () => {
                                        if (saving) return;
                                        setSaving(true);
                                        const toastId = toast.loading('Saving updates...');
                                        try {
                                            const modelId = selected?.id;
                                            if (!modelId) throw new Error('No model ID');
                                            const body: any = {};
                                            if (typeof editDescription === 'string') body.description = editDescription;
                                            if (editCategory) body.category = editCategory;
                                            if (editTags.length > 0) body.tags = editTags;

                                            const r = await fetch(`/api/models/${encodeURIComponent(modelId)}`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify(body)
                                            });
                                            const result = await r.json();
                                            if (!r.ok || result.success === false) throw new Error(result.error);
                                            toast.success('Changes saved', { id: toastId });
                                        } catch (e: any) {
                                            toast.error(e?.message ?? 'Save error', { id: toastId });
                                        } finally {
                                            setSaving(false);
                                        }
                                    }} disabled={saving}>{saving ? 'Saving...' : 'Save User Data'}</Button>
                                </div>
                            </div>
                        </ScrollArea>
                    </SheetContent>
                )}
            </Sheet>
        </div>
    );
}

// Ensure the GenAiSettings is wrapped for registration
export const GenAiSettingsSlot = (props: any) => {
    return <GenAiSettings {...props} />;
};
