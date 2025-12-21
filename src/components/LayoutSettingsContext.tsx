import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type ViewMode = 'grid' | 'list';

interface LayoutSettingsContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  gridDensity: number;
  setGridDensity: (density: number) => void;
  getGridClasses: () => string;
}

const LayoutSettingsContext = createContext<LayoutSettingsContextType | undefined>(undefined);

const UI_PREFS_KEY = '3d-model-muncher-ui-prefs';

export function LayoutSettingsProvider({ children }: { children: ReactNode }) {
  // Load initial state from local storage
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    try {
      const raw = localStorage.getItem(UI_PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.defaultView === 'grid' || parsed.defaultView === 'list') return parsed.defaultView;
      }
    } catch (e) { console.warn(e); }
    return 'grid';
  });

  const [gridDensity, setGridDensityState] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(UI_PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.defaultGridDensity === 'number') return parsed.defaultGridDensity;
      }
    } catch (e) { console.warn(e); }
    return 4;
  });

  // Save to local storage whenever state changes
  useEffect(() => {
    const prefs = { defaultView: viewMode, defaultGridDensity: gridDensity };
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
  }, [viewMode, gridDensity]);

  const setViewMode = (mode: ViewMode) => setViewModeState(mode);
  const setGridDensity = (val: number) => setGridDensityState(val);

  // Helper to generate Tailwind classes
  const getGridClasses = () => {
    const densityMap: Record<number, string> = {
      1: "grid-cols-1",
      2: "grid-cols-1 sm:grid-cols-2",
      3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
      4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
      5: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
      6: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
    };
    return densityMap[gridDensity] || densityMap[4];
  };

  return (
    <LayoutSettingsContext.Provider value={{ viewMode, setViewMode, gridDensity, setGridDensity, getGridClasses }}>
      {children}
    </LayoutSettingsContext.Provider>
  );
}

export function useLayoutSettings() {
  const context = useContext(LayoutSettingsContext);
  if (!context) throw new Error('useLayoutSettings must be used within a LayoutSettingsProvider');
  return context;
}