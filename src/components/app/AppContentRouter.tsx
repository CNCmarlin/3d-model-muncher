/**
 * AppContentRouter — Lightweight mode switch.
 *
 * Reads `useDatabaseBackend` from config, then lazy-loads and renders
 * ONLY the correct AppContent component. The unused mode's code
 * never enters the runtime bundle.
 */

import { useConfig } from "@/context/AppConfigContext";
import { lazy, Suspense } from "react";

const AppContent_DB = lazy(() => import("./AppContent_DB"));
const AppContent_Legacy = lazy(() => import("./AppContent_Legacy"));

function LoadingFallback() {
    return (
        <div className="flex items-center justify-center h-screen bg-background">
            <div className="text-center space-y-4">
                <div className="flex items-center justify-center w-16 h-16 bg-gradient-primary rounded-xl shadow-lg mx-auto">
                    <img
                        src="/images/favicon-32x32.png"
                        alt="3D Model Muncher"
                        className="animate-pulse"
                    />
                </div>
                <div>
                    <h2 className="text-lg font-semibold">Loading 3D Model Muncher</h2>
                    <p className="text-muted-foreground">Initializing application...</p>
                </div>
            </div>
        </div>
    );
}

export function AppContentRouter() {
    const { appConfig, isConfigLoading } = useConfig();
    const useDatabaseBackend = appConfig?.settings?.useDatabaseBackend ?? false;

    // While config is still loading, show spinner
    if (isConfigLoading && !appConfig) {
        return <LoadingFallback />;
    }

    return (
        <Suspense fallback={<LoadingFallback />}>
            {useDatabaseBackend ? <AppContent_DB /> : <AppContent_Legacy />}
        </Suspense>
    );
}
