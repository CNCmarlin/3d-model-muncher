import { Suspense } from 'react';
import { usePluginContext } from './PluginProvider';

interface PluginSlotProps {
    name: string;      // The unique identifier for this injection slot, e.g. "model.details.card"
    context?: any;     // Any data to pass down to the plugin components, e.g. { modelId: 123 }
    className?: string; // Optional wrapper styling
}

export function PluginSlot({ name, context, className }: PluginSlotProps) {
    const { slots } = usePluginContext();

    // Find all plugins that registered a component for this specific slot
    const injectedComponents = slots[name] || [];

    if (injectedComponents.length === 0) {
        return null; // Slot is empty, render nothing
    }

    return (
        <div className={`plugin-slot plugin-slot-${name.replace(/\./g, '-')} ${className || ''}`}>
            {injectedComponents.map(({ pluginId, Component }) => (
                <Suspense key={`${pluginId}-${name}`} fallback={<div className="text-xs text-muted-foreground animate-pulse">Loading {pluginId}...</div>}>
                    <Component {...context} />
                </Suspense>
            ))}
        </div>
    );
}
