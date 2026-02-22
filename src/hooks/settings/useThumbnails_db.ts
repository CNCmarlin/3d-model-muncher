
import { useConfig } from "@/context/ConfigContext";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export function useThumbnails_db() {
    // [Fix] Remove manual updateConfig and appConfig dependency for updates
    // use updateRunTimestamp which handles stale closures internally via ref
    const { updateRunTimestamp } = useConfig();
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState<{ total: number; current: number; status: string } | null>(null);
    const [results, setResults] = useState<{
        success: boolean;
        processed: number;
        skipped: number;
        errors: { id: string; error: string }[];
        aborted?: boolean;
    } | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const pollInterval = useRef<NodeJS.Timeout | null>(null);

    // Polling Logic
    const startPolling = () => {
        if (pollInterval.current) clearInterval(pollInterval.current);
        pollInterval.current = setInterval(async () => {
            try {
                const res = await fetch('/api/admin/thumbnail-status');
                if (res.ok) {
                    const status = await res.json();
                    setProgress(status);
                }
            } catch (e) {
                console.error("Poll error", e);
            }
        }, 1000);
    };

    const stopPolling = () => {
        if (pollInterval.current) {
            clearInterval(pollInterval.current);
            pollInterval.current = null;
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => stopPolling();
    }, []);

    const handleStartGeneration = async (options: { force: boolean; skipEmbedded: boolean }) => {
        setIsGenerating(true);
        setResults(null);
        setProgress(null);
        startPolling();

        try {
            const resp = await fetch('/api/admin/generate-thumbnails', {
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
                // [Fix] Safe update using context method
                updateRunTimestamp('generateThumbnails');
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
            stopPolling();
        }
    };

    const handleStopGeneration = async () => {
        try {
            await fetch('/api/admin/cancel-thumbnails', { method: 'POST' });
            toast.info('Cancellation requested...');
        } catch (error) {
            console.error('Error cancelling:', error);
        }
    };

    return {
        isGenerating,
        results,
        progress,
        isDialogOpen,
        setIsDialogOpen,
        handleStartGeneration,
        handleStopGeneration
    };
}
