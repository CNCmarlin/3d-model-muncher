import { Collection } from '@/types/collection';
import { ViewType } from '@/types/view';
import { ReactNode, useContext, useState } from 'react';
import { NavigationContext } from './NavigationContext';

// Settings Action Type
export interface SettingsAction {
    type: 'hash-check' | 'generate';
    fileType: '3mf' | 'stl';
}

/**
 * Database NavigationProvider — full independent copy.
 * Shares the React context object with NavigationContext so hooks work
 * regardless of which provider the ContextRouter mounts.
 * Diverge this implementation freely for DB-specific navigation logic.
 */
export function NavigationProvider_DB({ children }: { children: ReactNode }) {
    const [currentView, setCurrentView] = useState<ViewType>('models');
    const [activeCollection, setActiveCollection] = useState<Collection | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    // Settings specific
    const [settingsInitialTab, setSettingsInitialTab] = useState<string | undefined>(undefined);
    const [settingsAction, setSettingsAction] = useState<SettingsAction | null>(null);

    // Actions
    const handleBackToModels = () => {
        setCurrentView('models');
        setActiveCollection(null);
    };

    const openCollectionsList = () => {
        setCurrentView('collections');
    };

    const openCollection = (col: Collection) => {
        setActiveCollection(col);
        setCurrentView('collection-view');
    };

    const openSettingsOnTab = (tab: string, action?: SettingsAction) => {
        setSettingsInitialTab(tab);
        setCurrentView('settings');
        if (action) setSettingsAction(action);
    };

    const toggleSidebar = () => setIsSidebarOpen(prev => !prev);

    const getViewTitle = () => {
        switch (currentView) {
            case 'settings': return 'Settings';
            case 'demo': return 'UI Demo';
            case 'collections': return 'Collections';
            case 'collection-view': return activeCollection ? activeCollection.name : 'Collection';
            case 'model-hero': return 'Model Details';
            case 'bulk-edit': return 'Bulk Editor';
            default: return 'Organize & Print';
        }
    };

    return (
        <NavigationContext.Provider value={{
            currentView,
            activeCollection,
            isSidebarOpen,
            settingsInitialTab,
            settingsAction,

            handleBackToModels,
            openCollectionsList,
            openCollection,
            openSettingsOnTab,
            toggleSidebar,

            setCurrentView,
            setActiveCollection,
            setSettingsInitialTab,
            setSettingsAction,
            setIsSidebarOpen,

            getViewTitle
        }}>
            {children}
        </NavigationContext.Provider>
    );
}

export function useNavigation() {
    const context = useContext(NavigationContext);
    if (context === undefined) {
        throw new Error('useNavigation must be used within a NavigationProvider_DB');
    }
    return context;
}
