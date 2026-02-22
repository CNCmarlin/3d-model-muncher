import { Collection } from '@/types/collection';
import { ViewType } from '@/types/view';
import { createContext, ReactNode, useContext, useState } from 'react';

// Settings Action Type
export interface SettingsAction {
    type: 'hash-check' | 'generate';
    fileType: '3mf' | 'stl';
}

interface NavigationContextType {
    // State
    currentView: ViewType;
    activeCollection: Collection | null;
    isSidebarOpen: boolean;

    // Settings specific state
    settingsInitialTab: string | undefined;
    settingsAction: SettingsAction | null;

    // Actions
    handleBackToModels: () => void;
    openCollectionsList: () => void;
    openCollection: (col: Collection) => void;
    openSettingsOnTab: (tab: string, action?: SettingsAction) => void;
    toggleSidebar: () => void;

    // Direct Setters (for advanced cases)
    setCurrentView: (view: ViewType) => void;
    setActiveCollection: (col: Collection | null) => void;
    setIsSidebarOpen: (isOpen: boolean) => void;
    setSettingsInitialTab: (tab: string | undefined) => void;
    setSettingsAction: (action: SettingsAction | null) => void;

    // Helpers
    getViewTitle: () => string;
}

export const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export function NavigationProvider({ children }: { children: ReactNode }) {
    const [currentView, setCurrentView] = useState<ViewType>('models');
    const [activeCollection, setActiveCollection] = useState<Collection | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    // Settings specific
    const [settingsInitialTab, setSettingsInitialTab] = useState<string | undefined>(undefined);
    const [settingsAction, setSettingsAction] = useState<SettingsAction | null>(null);

    // Actions
    const handleBackToModels = () => {
        setCurrentView('models');
        setActiveCollection(null); // Clear active collection when going back to global models
    };

    const openCollectionsList = () => {
        setCurrentView('collections');
        // setIsSelectionMode(false); // TODO: Selection mode clearing should be handled by consumer (App/SelectionHook)
    };

    const openCollection = (col: Collection) => {
        setActiveCollection(col);
        setCurrentView('collection-view');
        // NOTE: Filtering logic (setting filteredModels) must be handled by an effect in the consumer
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
        throw new Error('useNavigation must be used within a NavigationProvider');
    }
    return context;
}
