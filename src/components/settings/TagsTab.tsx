import { useTagManager } from '@/hooks/settings/useTagManager';
import { Model, TagInfo } from '@/types/model';
import { resolveModelThumbnail } from '@/utils/thumbnailUtils';
import { Activity, BarChart3, Edit2, Eye, Search, Tag, Trash2 } from 'lucide-react';
import React from 'react';
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Helper component for smart truncation
const TruncatedBadge = ({ name }: { name: string }) => {
    const textRef = React.useRef<HTMLSpanElement>(null);
    const [isTruncated, setIsTruncated] = React.useState(false);

    const checkTruncation = React.useCallback(() => {
        const el = textRef.current;
        if (el) {
            // We use a small tolerance (1px) for browser sub-pixel rendering differences
            setIsTruncated(el.scrollWidth > el.clientWidth + 1);
        }
    }, []);

    React.useLayoutEffect(() => {
        checkTruncation();
        window.addEventListener('resize', checkTruncation);
        return () => window.removeEventListener('resize', checkTruncation);
    }, [checkTruncation]);

    // The content is identical in both cases to ensure layout stability
    const renderBadge = (triggerProps?: any) => (
        <Badge
            variant="secondary"
            className="px-3 py-1 text-base bg-secondary/50 flex min-w-[60px] shrink"
            {...triggerProps}
        >
            <span ref={textRef} className="truncate">{name}</span>
        </Badge>
    );

    if (isTruncated) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    {renderBadge()}
                </TooltipTrigger>
                <TooltipContent>
                    <p>{name}</p>
                </TooltipContent>
            </Tooltip>
        );
    }

    // Return just the badge if not truncated
    return renderBadge();
};

type TagsTabProps = {
    tagManager: ReturnType<typeof useTagManager>;
    models: Model[];
    onModelClick?: (model: Model) => void;
};

export function TagsTab({
    tagManager,
    models,
    onModelClick
}: TagsTabProps) {
    const {
        selectedTag,
        viewTagModels,
        setViewTagModels,
        isRenameDialogOpen,
        setIsRenameDialogOpen,
        renameTagValue,
        setRenameTagValue,
        tagSearchTerm,
        setTagSearchTerm,
        startRenameTag,
        handleRenameTag,
        handleDeleteTag
    } = tagManager;

    // Derived tags list
    const tagsList = React.useMemo(() => {
        const counts = new Map<string, number>();
        models.forEach(m => {
            if (m.tags && Array.isArray(m.tags)) {
                m.tags.forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
            }
        });

        return Array.from(counts.entries())
            .map(([name, count]) => ({ name, count, models: models.filter(m => Array.isArray(m.tags) && m.tags.includes(name)) } as TagInfo))
            .sort((a, b) => b.count - a.count);
    }, [models]);

    const filteredTags = React.useMemo(() => {
        return tagsList.filter(t => t.name.toLowerCase().includes(tagSearchTerm.toLowerCase()));
    }, [tagsList, tagSearchTerm]);

    // Statistics
    const stats = React.useMemo(() => {
        const totalTags = tagsList.length;
        const totalUsages = tagsList.reduce((acc, t) => acc + t.count, 0);
        const avgPerTag = totalTags > 0 ? (totalUsages / totalTags).toFixed(1) : "0.0";
        return { totalTags, totalUsages, avgPerTag };
    }, [tagsList]);

    return (
        <div className="space-y-6">
            {/* Top Stats Chips */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-card/50">
                    <CardContent className="p-6 flex items-center gap-4">
                        <div className="p-3 bg-primary/10 rounded-full">
                            <Tag className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold">{stats.totalTags}</div>
                            <div className="text-sm text-muted-foreground">Total Tags</div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-card/50">
                    <CardContent className="p-6 flex items-center gap-4">
                        <div className="p-3 bg-primary/10 rounded-full">
                            <BarChart3 className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold">{stats.totalUsages}</div>
                            <div className="text-sm text-muted-foreground">Total Usages</div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-card/50">
                    <CardContent className="p-6 flex items-center gap-4">
                        <div className="p-3 bg-primary/10 rounded-full">
                            <Activity className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold">{stats.avgPerTag}</div>
                            <div className="text-sm text-muted-foreground">Avg per Tag</div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Global Tag Management */}
            <Card>
                <CardHeader>
                    <CardTitle>Global Tag Management</CardTitle>
                    <CardDescription>Manage tags across all your models. Rename or delete tags globally.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="relative">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search tags..."
                            value={tagSearchTerm}
                            onChange={(e) => setTagSearchTerm(e.target.value)}
                            className="pl-9"
                        />
                    </div>

                    <ScrollArea className="h-[500px] w-full pr-4">
                        <div className="space-y-3">
                            {filteredTags.length === 0 ? (
                                <div className="text-center py-10 text-muted-foreground">
                                    No tags found matching "{tagSearchTerm}"
                                </div>
                            ) : (
                                filteredTags.map((tag) => (
                                    <div
                                        key={tag.name}
                                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors gap-4"
                                    >
                                        <div className="flex items-center gap-4 min-w-0 flex-1 overflow-hidden">
                                            <TruncatedBadge name={tag.name} />
                                            <span className="text-sm text-muted-foreground whitespace-nowrap flex-shrink-0">
                                                Used in {tag.count} model{tag.count !== 1 ? 's' : ''}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="gap-2 hover:bg-primary/10 hover:text-primary"
                                                onClick={() => setViewTagModels(tag)}
                                            >
                                                <Eye className="h-4 w-4" />
                                                <span className="hidden lg:inline">View</span>
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="gap-2 hover:bg-primary/10 hover:text-primary"
                                                onClick={() => startRenameTag(tag)}
                                            >
                                                <Edit2 className="h-4 w-4" />
                                                <span className="hidden lg:inline">Rename</span>
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                onClick={() => handleDeleteTag(tag.name)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                                <span className="hidden lg:inline">Delete</span>
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>

            <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Rename Tag</DialogTitle>
                        <DialogDescription>
                            This will rename the tag across all models that use it.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="rename-tag">New tag name</Label>
                            <Input
                                id="rename-tag"
                                value={renameTagValue}
                                onChange={(e) => setRenameTagValue(e.target.value)}
                                placeholder="Enter new tag name"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => selectedTag && handleRenameTag(selectedTag.name, renameTagValue)}
                            disabled={!renameTagValue.trim() || renameTagValue === selectedTag?.name}
                        >
                            Rename Tag
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!viewTagModels} onOpenChange={() => setViewTagModels(null)}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>Models with tag: "{viewTagModels?.name}"</DialogTitle>
                        <DialogDescription>
                            {viewTagModels?.count} model{viewTagModels?.count !== 1 ? 's' : ''} found
                        </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-96 w-full">
                        <div className="p-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {viewTagModels?.models.map((model) => (
                                    <div
                                        key={model.id}
                                        className="flex items-center gap-3 p-3 border rounded-lg hover:bg-accent/50 cursor-pointer"
                                        onClick={() => {
                                            if (onModelClick) onModelClick(model);
                                            setViewTagModels(null);
                                        }}
                                    >
                                        <ImageWithFallback
                                            src={resolveModelThumbnail(model)}
                                            alt={model.name}
                                            className="w-12 h-12 object-cover rounded border"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{model.name}</p>
                                            <div className="flex flex-col text-sm text-muted-foreground">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline" className="text-xs">
                                                        {model.category}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>
        </div>
    );
}
