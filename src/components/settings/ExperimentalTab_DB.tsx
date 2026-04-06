import { PluginSlot } from "@/plugins/PluginSlot";
import { LastRunLabel_DB } from '@/components/shared/LastRunLabel_DB';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Bot, Images as ImagesIcon, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from 'sonner';

type ModelEntry = {
  id?: string;
  name: string;
  description?: string;
  thumbnail?: string;
  category?: string;
  filePath?: string;
  modelUrl?: string;
  tags?: string[];
  parsedImages?: string[];
  userDefined?: any;
  images?: string[];
};

import type { Category } from '@/types/category';
import { resolveModelThumbnail } from '@/utils/thumbnailUtils';

interface ExperimentalTabProps {
  categories?: Category[];
}

import { useNavigation } from "@/context/NavigationContext";

export default function ExperimentalTab({ categories: propCategories }: ExperimentalTabProps) {
  const { setCurrentView } = useNavigation();
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<ModelEntry[]>([]);

  // Cover purge state
  const [isGeneratingCovers, setIsGeneratingCovers] = useState(false);
  const [showCoverPurgeDialog, setShowCoverPurgeDialog] = useState(false);
  const [isScanningCovers, setIsScanningCovers] = useState(false);
  const [isPurgingCovers, setIsPurgingCovers] = useState(false);
  const [coverPurgePreview, setCoverPurgePreview] = useState<any>(null);
  const [lastRunTimestamps, setLastRunTimestamps] = useState<Record<string, string>>({});

  // Load timestamps from config on mount
  useEffect(() => {
    fetch('/api/load-config')
      .then(r => r.json())
      .then(config => {
        if (config.lastRunTimestamps) {
          setLastRunTimestamps(config.lastRunTimestamps);
        }
      })
      .catch(() => { });
  }, []);

  const saveTimestamp = async (key: string) => {
    const ts = new Date().toISOString();
    const updated = { ...lastRunTimestamps, [key]: ts };
    setLastRunTimestamps(updated);
    try {
      const resp = await fetch('/api/load-config');
      const data = await resp.json();
      const actualConfig = data.config || {};
      await fetch('/api/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...actualConfig,
          lastRunTimestamps: { ...actualConfig.lastRunTimestamps, ...updated }
        })
      });
    } catch { /* best effort */ }
  };

  const handleGenerateCovers = async () => {
    try {
      setIsGeneratingCovers(true);
      toast.info("Starting mosaic generation...");

      const res = await fetch('/api/collections/generate-covers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // Empty body = Process All
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`Generated ${data.processed} covers (Skipped ${data.skipped})`);
        await saveTimestamp('generateCovers');
      } else {
        toast.error("Failed: " + data.error);
      }
    } catch (e) {
      toast.error("Network error");
    } finally {
      setIsGeneratingCovers(false);
    }
  };

  const handleCoverPurgePreview = async () => {
    setShowCoverPurgeDialog(true);
    setIsScanningCovers(true);
    setCoverPurgePreview(null);
    try {
      const resp = await fetch('/api/collections/purge-covers-preview', { method: 'POST' });
      const data = await resp.json();
      if (data.success) {
        setCoverPurgePreview(data);
      } else {
        toast.error(`Preview failed: ${data.error}`);
        setShowCoverPurgeDialog(false);
      }
    } catch {
      toast.error('Failed to scan for cover images');
      setShowCoverPurgeDialog(false);
    } finally {
      setIsScanningCovers(false);
    }
  };

  const handleCoverPurgeConfirm = async () => {
    setIsPurgingCovers(true);
    try {
      const resp = await fetch('/api/collections/purge-covers', { method: 'POST' });
      const data = await resp.json();
      if (data.success) {
        toast.success(`Deleted ${data.deleted} cover images, updated ${data.collectionsUpdated} collections.`);
        await saveTimestamp('purgeCovers');
      } else {
        toast.error(`Purge failed: ${data.error}`);
      }
    } catch {
      toast.error('Failed to purge covers');
    } finally {
      setIsPurgingCovers(false);
      setShowCoverPurgeDialog(false);
      setCoverPurgePreview(null);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  useEffect(() => {
    // Fetch models from backend API. Expecting `/api/models` to return an array of model metadata objects.
    setLoading(true);
    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => {
        // Normalize to ModelEntry where possible
        if (Array.isArray(data)) {
          const normalized = data.map((m: any) => ({
            id: m.id ?? m.name ?? undefined,
            name: m.name ?? m.title ?? "",
            description: m.description ?? m.desc ?? "",
            // keep thumbnail compatibility but also preserve parsedImages/userDefined so resolver can work
            thumbnail: m.thumbnail ?? m.image ?? m.preview ?? undefined,
            parsedImages: Array.isArray(m.parsedImages) ? m.parsedImages : (Array.isArray(m.parsed_images) ? m.parsed_images : []),
            userDefined: (m.userDefined && typeof m.userDefined === 'object') ? m.userDefined : (m.user_defined && typeof m.user_defined === 'object' ? m.user_defined : undefined),
            images: Array.isArray(m.images) ? m.images : undefined,
            category: m.category ?? "",
            // preserve underlying file path / modelUrl when provided so we can derive munchie.json
            filePath: m.filePath ?? m.file ?? undefined,
            modelUrl: m.modelUrl ?? m.url ?? undefined,
            tags: Array.isArray(m.tags) ? m.tags : typeof m.tags === "string" && m.tags ? m.tags.split(",").map((s: string) => s.trim()) : [],
          }));
          setModels(normalized);
        } else {
          setModels([]);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch models", err);
        setModels([]);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Experimental Features</h2>

      <div className="prose max-w-none text-sm text-foreground/90">
        <p>
          This area contains experimental settings and features which may change, be removed, or behave unexpectedly. Use with caution. Experimental options are not guaranteed to be stable and may be modified or deleted in future releases.
        </p>
      </div>

      <Separator />

      {/* Developer Tools (Dev Mode Only) */}
      {import.meta.env.DEV && (
        <Card className="border-yellow-400/50 bg-yellow-50/10 dark:bg-yellow-900/10">
          <CardHeader>
            <CardTitle className="text-yellow-600 dark:text-yellow-400 text-lg flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Developer Tools
            </CardTitle>
            <CardDescription>
              Debug helpers visible only in development mode (`npm run dev`).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-border/50">
              <div className="space-y-1">
                <p className="text-sm font-medium">Test Onboarding Flow</p>
                <p className="text-xs text-muted-foreground">
                  Launches the new user onboarding wizard. Config will be preserved if you skip.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentView('onboarding')}
              >
                Launch Wizard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* [NEW] Collection Mosaic Generator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ImagesIcon className="h-5 w-5" />
            Collection Mosaic Generator
          </CardTitle>
          <CardDescription>
            Automatically generate 2x2 mosaic cover images for all collections that have at least 4 models.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Generate Covers */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
              <div className="space-y-1">
                <p className="text-sm font-medium">Generate Mosaic Covers</p>
                <p className="text-xs text-muted-foreground">
                  Create 2×2 mosaic covers for collections with 4+ models. Requires 'sharp'.
                </p>
                <LastRunLabel_DB timestamp={lastRunTimestamps.generateCovers} />
              </div>
              <Button
                onClick={handleGenerateCovers}
                disabled={isGeneratingCovers}
                variant="outline"
                size="sm"
              >
                {isGeneratingCovers && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isGeneratingCovers ? "Generating..." : "Generate All Covers"}
              </Button>
            </div>

            {/* Remove Covers */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
              <div className="space-y-1">
                <p className="text-sm font-medium">Remove Generated Covers</p>
                <p className="text-xs text-muted-foreground">
                  Find and delete all generated mosaic cover images from data/covers/.
                </p>
                <LastRunLabel_DB timestamp={lastRunTimestamps.purgeCovers} />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCoverPurgePreview}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Find & Delete
              </Button>
            </div>

            {/* Cover Purge Dialog */}
            {showCoverPurgeDialog && (() => {
              if (isScanningCovers || !coverPurgePreview) {
                return (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-background border rounded-lg shadow-lg max-w-lg w-full mx-4 p-6 space-y-4">
                      <h3 className="text-lg font-semibold">Scanning Covers...</h3>
                      <div className="flex flex-col items-center justify-center py-8 gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Searching for generated cover images...</p>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                  <div className="bg-background border rounded-lg shadow-lg max-w-lg w-full mx-4 p-6 space-y-4">
                    <h3 className="text-lg font-semibold">Confirm Cover Removal</h3>
                    {coverPurgePreview.totalCount === 0 ? (
                      <>
                        <p className="text-sm text-muted-foreground">No generated cover images found.</p>
                        <div className="flex justify-end">
                          <Button variant="outline" onClick={() => setShowCoverPurgeDialog(false)}>Close</Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                          <p className="text-sm font-medium text-destructive">
                            This will permanently delete {coverPurgePreview.totalCount} cover image{coverPurgePreview.totalCount !== 1 ? 's' : ''} ({formatBytes(coverPurgePreview.totalSize)}).
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Collection cover references will also be cleared.
                          </p>
                        </div>

                        <div className="mb-1 text-xs text-muted-foreground">
                          Target Directory: <code className="bg-muted px-1 py-0.5 rounded">/data/covers</code>
                        </div>
                        <div className="max-h-48 overflow-y-auto border rounded p-2 text-xs font-mono space-y-1">
                          {coverPurgePreview.files.map((f: any, i: number) => (
                            <div key={i} className="flex justify-between items-center text-muted-foreground bg-muted/20 px-2 py-1.5 rounded-sm">
                              <div className="flex flex-col min-w-0 flex-1 mr-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="truncate font-medium text-foreground">{f.collectionName}</span>
                                  <span className="inline-flex flex-shrink-0 items-center justify-center text-[9px] uppercase tracking-widest font-bold text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">COLLECTION</span>
                                </div>
                                <span className="truncate text-[10px] text-muted-foreground/60" title={f.filename}>{f.filename}</span>
                              </div>
                              <span className="flex-shrink-0 text-[10px]">{formatBytes(f.size)}</span>
                            </div>
                          ))}
                        </div>

                        <div className="flex justify-between items-center">
                          <p className="text-xs text-muted-foreground">
                            {coverPurgePreview.totalCount} file{coverPurgePreview.totalCount !== 1 ? 's' : ''} ({formatBytes(coverPurgePreview.totalSize)})
                          </p>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setShowCoverPurgeDialog(false)} disabled={isPurgingCovers}>
                              Cancel
                            </Button>
                            <Button variant="destructive" onClick={handleCoverPurgeConfirm} disabled={isPurgingCovers}>
                              {isPurgingCovers ? 'Deleting...' : `Delete ${coverPurgePreview.totalCount} Files`}
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </CardContent>
      </Card>

      {/* Dynamic API Plugins */}
      <PluginSlot name="settings.experimental.ai" context={{ models, categories: propCategories || [], loading }} />
    </div>
  );
}
