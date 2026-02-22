
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppConfig } from "@/types/config";
import { FolderOpen, HardDrive } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface PhaseWelcomeProps {
    config: AppConfig;
    onUpdateConfig: (newConfig: AppConfig) => void;
    onNext: () => void;
}

export function PhaseWelcome({ config, onUpdateConfig }: PhaseWelcomeProps) {
    const [path, setPath] = useState(config.settings.modelDirectory || "");

    const handleSavePath = async () => {
        // Validate path basically (could do a server check here if needed)
        if (!path.trim()) {
            toast.error("Please enter a valid path");
            return;
        }

        const updated = {
            ...config,
            settings: {
                ...config.settings,
                modelDirectory: path
            }
        };
        onUpdateConfig(updated);
        // We don't auto-advance, let user click Next
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Context / Education */}
            <div className="prose prose-zinc dark:prose-invert max-w-none">
                <p className="text-lg">
                    Welcome to 3D Model Muncher! We're here to help you organize, visualize, and manage your 3D printing library.
                </p>
                <p>
                    Before we get started, we need to know where your models are stored. This folder will be scanned to build your library.
                </p>
            </div>

            {/* Interactive Area */}
            <div className="space-y-6 max-w-lg p-6 rounded-xl border border-border bg-card shadow-sm">
                <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-primary" />
                        Library Location
                    </Label>
                    <div className="flex gap-2">
                        <Input
                            value={path}
                            onChange={(e) => setPath(e.target.value)}
                            placeholder="/path/to/your/3d/models"
                            className="font-mono text-sm"
                        />
                        <Button variant="secondary" onClick={handleSavePath} disabled={path === config.settings.modelDirectory}>
                            Save
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        This should be the root folder containing all your .stl, .3mf, and .obj files.
                    </p>
                </div>

                {/* Status Indicator */}
                {config.settings.modelDirectory ? (
                    <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-200 dark:border-green-800">
                        <FolderOpen className="w-4 h-4" />
                        <span>Library path configured: <strong>{config.settings.modelDirectory}</strong></span>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                        <FolderOpen className="w-4 h-4" />
                        <span>Please configure your library path to continue.</span>
                    </div>
                )}
            </div>

            {/* Screenshot Preview */}
            <div className="space-y-2 max-w-3xl">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                    Preview: What you'll get
                </Label>
                <div className="rounded-xl overflow-hidden border border-border shadow-2xl relative bg-muted/50 min-h-[200px] flex items-center justify-center group">
                    <img
                        src="/images/onboarding-preview.png"
                        alt="3D Model Muncher Interface Preview"
                        className="w-full h-auto object-cover transition-opacity duration-300 opacity-90 group-hover:opacity-100"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement?.classList.add('hidden'); // Hide container if image fails
                        }}
                    />
                    {/* Fallback text if image missing (handled by error, but good to have helper in dev) */}
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm opacity-0 -z-10">
                        (Image not found: /images/onboarding-preview.png)
                    </div>
                </div>
            </div>
        </div>
    );
}

// Left Panel Content (Static)
export function PhaseWelcomeInfo() {
    return (
        <div className="space-y-6">
            <div className="p-4 rounded-lg bg-background/50 border border-border shadow-sm">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs">1</span>
                    Connect
                </h3>
                <p className="text-sm text-muted-foreground">
                    Link your existing folder of 3D models. We don't modify files without your permission.
                </p>
            </div>

            <div className="p-4 rounded-lg bg-background/50 border border-border shadow-sm opacity-60">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs">2</span>
                    Personalize
                </h3>
                <p className="text-sm text-muted-foreground">
                    Customize the look and feel of your library.
                </p>
            </div>

            <div className="p-4 rounded-lg bg-background/50 border border-border shadow-sm opacity-60">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs">3</span>
                    Secure & Visualize
                </h3>
                <p className="text-sm text-muted-foreground">
                    Ensure file integrity and generate thumbnails/covers.
                </p>
            </div>
        </div>
    );
}
