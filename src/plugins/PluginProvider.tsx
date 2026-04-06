import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { useConfig } from '@/context/AppConfigContext';
import { CorePlugins } from './registry';

type SlotRegistry = Record<string, Array<{ pluginId: string; Component: React.FC<any> | React.LazyExoticComponent<any> }>>;

interface PluginContextValue {
    slots: SlotRegistry;
}

const PluginContext = createContext<PluginContextValue>({ slots: {} });

export function PluginProvider({ children }: { children: ReactNode }) {
    const { appConfig } = useConfig();

    const slots = useMemo(() => {
        const activeSlots: SlotRegistry = {};

        // Build the active slot registry based on enabled plugins
        CorePlugins.forEach(plugin => {
            // Defaults to mostly enabled while we transition, but ultimately reads from config
            // We use optional chaining because config.plugins might not be deeply populated yet
            const isEnabled = appConfig?.plugins?.[plugin.id as keyof typeof appConfig.plugins] !== false;

            if (isEnabled) {
                Object.entries(plugin.slots).forEach(([slotName, Component]) => {
                    if (!activeSlots[slotName]) {
                        activeSlots[slotName] = [];
                    }
                    activeSlots[slotName].push({ pluginId: plugin.id, Component });
                });
            }
        });

        return activeSlots;
    }, [appConfig?.plugins]);

    return (
        <PluginContext.Provider value={{ slots }}>
            {children}
        </PluginContext.Provider>
    );
}

export function usePluginContext() {
    return useContext(PluginContext);
}
