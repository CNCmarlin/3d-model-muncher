import { AppConfig } from '@/types/config';
import { ConfigManager } from '@/utils/configManager';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export function useSettingsConfig(
    initialConfig: AppConfig | undefined,
    onConfigUpdate?: (config: AppConfig) => void
) {
    const [localConfig, setLocalConfig] = useState<AppConfig>(() => {
        return initialConfig || ConfigManager.loadConfig();
    });

    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [statusMessage, setStatusMessage] = useState<string>('');

    // Fetch server config on mount to ensure freshness
    useEffect(() => {
        let cancelled = false;

        async function loadServerConfig() {
            try {
                console.debug('[useSettingsConfig] fetching server config /api/load-config');
                const resp = await fetch('/api/load-config');
                if (!resp.ok) {
                    console.debug('[useSettingsConfig] /api/load-config not available, status=', resp.status);
                    return;
                }
                const data = await resp.json();
                if (data && data.success && data.config) {
                    if (cancelled) return;

                    let cleanConfig = data.config;
                    // [FIX] Recursive unwrap to prevent nesting disaster (mirroring ConfigContext logic)
                    while (cleanConfig && cleanConfig.success && cleanConfig.config) {
                        console.warn('[useSettingsConfig] Detected nested config, unwrapping...');
                        cleanConfig = cleanConfig.config;
                    }

                    console.debug('[useSettingsConfig] loaded server config, lastModified=', cleanConfig.lastModified);
                    setLocalConfig(cleanConfig);
                    // Don't trigger onConfigUpdate here loops
                }
            } catch (err) {
                console.warn('[useSettingsConfig] failed to fetch server config:', err);
            }
        }

        loadServerConfig();
        return () => { cancelled = true; };
    }, []);

    // Sync with prop update
    useEffect(() => {
        if (initialConfig) {
            setLocalConfig(prev => {
                if (JSON.stringify(prev) !== JSON.stringify(initialConfig)) {
                    return initialConfig;
                }
                return prev;
            });
        }
    }, [initialConfig]);

    const handleSaveConfig = async (newConfig: AppConfig = localConfig) => {
        setSaveStatus('saving');
        setStatusMessage('Saving configuration...');

        try {
            // Save to localStorage
            ConfigManager.saveConfig(newConfig);

            // Save to server
            const resp = await fetch('/api/save-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newConfig)
            });

            if (resp.ok) {
                setSaveStatus('saved');
                setStatusMessage('Configuration saved successfully');
                toast.success('Settings saved');

                // Notify parent
                onConfigUpdate?.(newConfig);

                // Update local state if different (though it should be same)
                setLocalConfig(newConfig);
            } else {
                throw new Error(`Server returned ${resp.status}`);
            }
        } catch (error) {
            console.error('Failed to save config:', error);
            setSaveStatus('error');
            setStatusMessage('Failed to save configuration');
            toast.error('Failed to save settings');
        }

        // Clear status after delay
        setTimeout(() => {
            setSaveStatus((s) => s === 'saving' ? s : 'idle');
            setStatusMessage('');
        }, 2000);
    };

    const handleExportConfig = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(localConfig, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "munchie-config.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        toast.success('Configuration exported');
    };

    const handleImportConfig = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target?.result as string;
                const importedConfig = JSON.parse(content);
                // Basic validation could go here
                await handleSaveConfig(importedConfig);
                toast.success('Configuration imported successfully');
            } catch (error) {
                console.error('Failed to import config:', error);
                toast.error('Invalid configuration file');
            }
        };
        reader.readAsText(file);
    };

    const handleResetConfig = async () => {
        if (window.confirm('Are you sure you want to reset all settings to default? This cannot be undone.')) {
            const defaults = ConfigManager.getDefaultConfig();
            await handleSaveConfig(defaults);
            toast.success('Configuration reset to defaults');
        }
    };

    return {
        localConfig,
        setLocalConfig,
        saveStatus,
        setSaveStatus,
        statusMessage,
        setStatusMessage,
        handleSaveConfig,
        handleExportConfig,
        handleImportConfig,
        handleResetConfig
    };
}
