import { Category } from '@/types/category';
import { AppConfig } from '@/types/config';
import { ConfigManager } from '@/utils/configManager';
import { applyThemeColor } from '@/utils/themeUtils';
import { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import * as pkg from '../../package.json';

// Ensure the type matches what the app expects
export interface ConfigContextType {
    appConfig: AppConfig | null;
    categories: Category[];
    isConfigLoading: boolean;
    updateConfig: (newConfig: AppConfig) => void;
    updateCategories: (newCategories: Category[]) => void;
    updateRunTimestamp: (key: string) => void;

    // Release Notes State
    isReleaseNotesOpen: boolean;
    closeReleaseNotes: (dontShow: boolean) => void;
    dontShowReleaseNotes: boolean;
    setDontShowReleaseNotes: (v: boolean) => void;
}

export const AppConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function AppConfigProvider({ children }: { children: ReactNode }) {
    const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [isConfigLoading, setIsConfigLoading] = useState(true);
    const [dontShowReleaseNotes, setDontShowReleaseNotes] = useState(false);
    const [isReleaseNotesOpen, setIsReleaseNotesOpen] = useState(false);

    // Keep a ref to appConfig to avoid stale closures in callbacks
    const configRef = useRef<AppConfig | null>(null);
    useEffect(() => {
        configRef.current = appConfig;
    }, [appConfig]);

    // 1. Theme Persistence Effect
    useEffect(() => {
        if (appConfig) {
            const color = appConfig.settings?.primaryColor || null;
            applyThemeColor(color);
        }
    }, [appConfig]);

    // 2. Load Initial Config
    useEffect(() => {
        async function loadConfig() {
            try {
                let config: AppConfig | null = null;
                setIsConfigLoading(true);

                // A. Try LocalStorage (Fastest)
                try {
                    const stored = localStorage.getItem('3d-model-muncher-config');
                    if (stored) {
                        config = ConfigManager.loadConfig(); // ConfigManager reads from localStorage internally
                    }
                } catch (e) {
                    console.warn('LocalStorage config read failed', e);
                }

                // B. Try Server (Authoritative)
                // Always fetch from server to ensure we have the latest config (e.g. DB mode toggle)
                try {
                    const resp = await fetch('/api/load-config');
                    if (resp.ok) {
                        const data = await resp.json();
                        if (data && data.success && data.config) {
                            let cleanConfig = data.config;
                            // Recursive unwrap to prevent nesting disaster
                            while (cleanConfig && cleanConfig.success && cleanConfig.config) {
                                console.warn('[AppConfigProvider] Detected nested config, unwrapping...');
                                cleanConfig = cleanConfig.config;
                            }

                            config = cleanConfig;
                            // Sync to local
                            try { ConfigManager.saveConfig(cleanConfig); } catch (e) { console.warn(e); }
                            console.log('[AppConfigProvider] Synced config from server:', config);
                        }
                    }
                } catch (e) { console.warn('Server config fetch failed', e); }

                // C. Fallback to Defaults
                if (!config) {
                    config = ConfigManager.getDefaultConfig();
                }

                // D. Apply Theme Immediately
                const savedColor = config.settings?.primaryColor || null;
                applyThemeColor(savedColor);

                setAppConfig(config);
                setCategories(config.categories);
            } catch (error) {
                console.error('Failed to load configuration:', error);
                // Fallback safety
                const defaultConfig = ConfigManager.getDefaultConfig();
                setAppConfig(defaultConfig);
                setCategories(defaultConfig.categories);
            } finally {
                setIsConfigLoading(false);
            }
        }

        loadConfig();
    }, []);

    // 3. Release Notes Logic
    useEffect(() => {
        if (!appConfig) return;
        try {
            const getMajorMinor = (v: string) => {
                const parts = (v || '').split('.');
                return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : v;
            };
            // @ts-ignore
            const rawVersion = (pkg && pkg.version) ? String(pkg.version) : ConfigManager.getDefaultConfig().version || '0.0.0';
            const previousVersion = getMajorMinor(rawVersion);
            const key = `release-notes:${previousVersion}`;
            const stored = localStorage.getItem(key);

            if (!stored) {
                setIsReleaseNotesOpen(true);
            } else if (stored === 'show') {
                setIsReleaseNotesOpen(true);
            }
        } catch (e) {
            setIsReleaseNotesOpen(true);
        }
    }, [appConfig]);

    const closeReleaseNotes = (dontShow: boolean) => {
        const getMajorMinor = (v: string) => {
            const parts = (v || '').split('.');
            return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : v;
        };
        // @ts-ignore
        const rawVersion = (pkg && pkg.version) ? String(pkg.version) : ConfigManager.getDefaultConfig().version || '0.0.0';
        const previousVersion = getMajorMinor(rawVersion);
        const key = `release-notes:${previousVersion}`;

        try {
            localStorage.setItem(key, dontShow ? 'hidden' : 'show');
        } catch (e) { console.warn(e); }

        setDontShowReleaseNotes(dontShow);
        setIsReleaseNotesOpen(false);
    };

    // Actions
    const updateConfig = (newConfig: AppConfig) => {
        // 1. Optimistic Update
        setAppConfig(newConfig);
        setCategories(newConfig.categories);

        // 2. Persist
        try {
            ConfigManager.saveConfig(newConfig);

            // 3. Sync to Server
            fetch('/api/save-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newConfig)
            }).catch(err => console.warn('Background config save failed:', err));

        } catch (error) {
            console.error('Failed to save config:', error);
            toast.error('Failed to save settings');
        }
    };

    const updateCategories = (newCategories: Category[]) => {
        setCategories(newCategories);
        const current = configRef.current;
        if (current) {
            const updatedConfig = { ...current, categories: newCategories };
            updateConfig(updatedConfig);
        }
    };

    const updateRunTimestamp = (key: string) => {
        const current = configRef.current;
        if (!current) return;

        const now = new Date().toISOString();
        const updatedTimestamps = { ...(current.lastRunTimestamps || {}), [key]: now };

        const updatedConfig = {
            ...current,
            lastRunTimestamps: updatedTimestamps
        };

        // Reuse main update logic
        updateConfig(updatedConfig);
    };

    return (
        <AppConfigContext.Provider value={{
            appConfig,
            categories,
            isConfigLoading,
            updateConfig,
            updateCategories,
            updateRunTimestamp,
            isReleaseNotesOpen,
            closeReleaseNotes,
            dontShowReleaseNotes,
            setDontShowReleaseNotes
        }}>
            {children}
        </AppConfigContext.Provider>
    );
}

// Export the hook with the original name to avoid changing every file
export function useConfig() {
    const context = useContext(AppConfigContext);
    if (context === undefined) {
        throw new Error('useConfig must be used within a AppConfigProvider');
    }
    return context;
}
