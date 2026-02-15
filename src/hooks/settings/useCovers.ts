
import { useConfig } from "@/context/ConfigContext";
import { useState } from "react";
import { toast } from "sonner";

export function useCovers() {
    const { appConfig, updateConfig } = useConfig();
    const [isGenerating, setIsGenerating] = useState(false);

    // Covers endpoint doesn't return detailed results object like thumbnails yet, mainly just success/fail/counts
    // But consistent state is good. 

    const handleGenerateCovers = async () => {
        try {
            setIsGenerating(true);
            toast.info("Starting mosaic generation...");

            const res = await fetch('/api/collections/generate-covers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}) // Empty body = Process All
            });

            const data = await res.json();
            if (data.success) {
                toast.success(`Generated ${data.processed} covers (Skipped ${data.skipped})`);

                if (appConfig) {
                    const updated = {
                        ...appConfig,
                        lastRunTimestamps: {
                            ...appConfig.lastRunTimestamps,
                            generateCovers: new Date().toISOString()
                        }
                    };
                    updateConfig(updated);
                }
            } else {
                toast.error("Failed: " + data.error);
            }
        } catch (e) {
            console.error("Cover generation error", e);
            toast.error("Network error during cover generation");
        } finally {
            setIsGenerating(false);
        }
    };

    return {
        isGenerating,
        handleGenerateCovers
    };
}
