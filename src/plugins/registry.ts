import React from 'react';

export interface PluginDefinition {
    id: string; // matches config.plugins[id]
    slots: {
        [slotName: string]: React.FC<any> | React.LazyExoticComponent<any>;
    };
}

// Global registry of all built-in monorepo plugins.
// Plugins are added here during the migration phases.
export const CorePlugins: PluginDefinition[] = [
    {
        id: 'genai',
        slots: {
            'settings.experimental.ai': React.lazy(() => import('./genai/GenAiSettings').then(m => ({ default: m.GenAiSettingsSlot })))
        }
    },
    {
        id: 'spoolman',
        slots: {
            'model.details.print_settings': React.lazy(() => import('./spoolman/SpoolmanPrintSettingsWidget_DB').then(m => ({ default: m.SpoolmanPrintSettingsWidget_DB })))
        }
    },
    {
        id: 'projects',
        slots: {
            'navigation.primary': React.lazy(() => import('./projects/ProjectsSidebarButton').then(m => ({ default: m.ProjectsSidebarButton }))),
            'app.views.projects': React.lazy(() => import('./projects/ProjectsList_DB').then(m => ({ default: m.ProjectsList_DB }))),
            'app.views.project_workspace': React.lazy(() => import('./projects/ProjectWorkspace_DB').then(m => ({ default: m.ProjectWorkspace_DB })))
        }
    }
];
