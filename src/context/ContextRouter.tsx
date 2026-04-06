import { ReactNode } from 'react';
import { useConfig } from './AppConfigContext';

// Legacy providers
import { TagsProvider } from '@/components/common/TagsContext';
import { ThemeProvider } from '@/components/common/ThemeProvider';
import { LayoutSettingsProvider } from '@/components/layout/LayoutSettingsContext';
import { NavigationProvider } from './NavigationContext';
import { SpoolmanProvider } from '@/plugins/spoolman/SpoolmanContext';

// DB providers (full independent copies)
import { TagsProvider_DB } from '@/components/common/TagsContext_DB';
import { ThemeProvider_DB } from '@/components/common/ThemeProvider_DB';
import { LayoutSettingsProvider_DB } from '@/components/layout/LayoutSettingsContext_DB';
import { NavigationProvider_DB } from './NavigationContext_DB';
import { SpoolmanProvider_DB } from '@/plugins/spoolman/SpoolmanContext_DB';

/**
 * Frontend ContextRouter
 * 
 * Mirrors the server-side routeSelector.js pattern.
 * Reads the `useDatabaseBackend` setting from config,
 * then mounts ONLY the correct provider stack — preventing
 * duplicate API calls and context initialization.
 * 
 * Each _DB provider is a full independent copy that can be
 * diverged later for database-specific logic.
 */
export function ContextRouter({ children }: { children: ReactNode }) {
    const { appConfig, isConfigLoading } = useConfig();
    const useDatabaseBackend = appConfig?.settings?.useDatabaseBackend ?? false;

    // Show loading state while config loads
    if (isConfigLoading && !appConfig) {
        return (
            <div className="flex items-center justify-center h-screen bg-background">
                <div className="text-center space-y-4">
                    <div className="flex items-center justify-center w-16 h-16 bg-gradient-primary rounded-xl shadow-lg mx-auto">
                        <img src="/images/favicon-32x32.png" alt="3D Model Muncher" className="animate-pulse" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold">Loading 3D Model Muncher</h2>
                        <p className="text-muted-foreground">Initializing configuration...</p>
                    </div>
                </div>
            </div>
        );
    }

    // Mount the correct provider stack based on mode
    if (useDatabaseBackend) {
        return (
            <ThemeProvider_DB defaultTheme="system">
                <NavigationProvider_DB>
                    <SpoolmanProvider_DB>
                        <LayoutSettingsProvider_DB>
                            <TagsProvider_DB>
                                {children}
                            </TagsProvider_DB>
                        </LayoutSettingsProvider_DB>
                    </SpoolmanProvider_DB>
                </NavigationProvider_DB>
            </ThemeProvider_DB>
        );
    }

    return (
        <ThemeProvider defaultTheme="system">
            <NavigationProvider>
                <SpoolmanProvider>
                    <LayoutSettingsProvider>
                        <TagsProvider>
                            {children}
                        </TagsProvider>
                    </LayoutSettingsProvider>
                </SpoolmanProvider>
            </NavigationProvider>
        </ThemeProvider>
    );
}
