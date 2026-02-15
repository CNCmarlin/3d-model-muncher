
import { useConfig } from "@/context/ConfigContext";
import { useState } from "react";
import { toast } from "sonner";

export function useThumbnails() {
    const { appConfig, updateConfig } = useConfig();
    const [isGenerating, setIsGenerating] = useState(false);
    const [results, setResults] = useState<{
        success: boolean;
        processed: number;
        skipped: number;
        errors: { id: string; error: string }[];
        aborted?: boolean;
    } | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const handleStartGeneration = async (options: { force: boolean; skipEmbedded: boolean }) => {
        setIsGenerating(true);
        setResults(null);

        try {
            const resp = await fetch('/api/generate-thumbnails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    force: options.force,
                    skipEmbedded: options.skipEmbedded
                })
            });
            const data = await resp.json();

            setResults(data);

            if (data.success) {
                toast.success(`Thumbnail generation finished: ${data.processed} processed.`);
                // Update timestamp
                if (appConfig) {
                    const updated = {
                        ...appConfig,
                        lastRunTimestamps: {
                            ...appConfig.lastRunTimestamps,
                            generateThumbnails: new Date().toISOString()
                        }
                    };
                    updateConfig(updated);
                }
            } else {
                if (data.aborted) {
                    toast.info('Generation cancelled.');
                } else {
                    toast.error(`Generation failed: ${data.error}`);
                }
            }
        } catch (error: any) {
            console.error('Error starting thumbnail generation:', error);
            toast.error('Network error starting generation');
            setResults({
                success: false,
                processed: 0,
                skipped: 0,
                errors: [{ id: 'system', error: error.message || 'Unknown network error' }]
            });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleStopGeneration = async () => {
        try {
            await fetch('/api/tools/cancel-thumbnails', { method: 'POST' });
            toast.info('Cancellation requested...');
            // We don't set isGenerating False here, we wait for the generation call to return (it should abort)
        } catch (error) {
            console.error('Error cancelling:', error);
        }
    };

    return {
        isGenerating,
        results,
        isDialogOpen,
        setIsDialogOpen,
        handleStartGeneration,
        handleStopGeneration
    };
}
