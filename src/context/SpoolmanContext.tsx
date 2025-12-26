import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface Spool {
  id: number;
  remaining_weight: number;
  filament: {
    id: number;
    name: string;
    material?: { name: string };
    color_hex?: string;
  };
}

interface SpoolmanContextType {
  spools: Spool[];
  loading: boolean;
  refreshSpools: () => void;
  getSpoolById: (id: string | number) => Spool | undefined;
}

const SpoolmanContext = createContext<SpoolmanContextType | undefined>(undefined);

export const SpoolmanProvider = ({ children }: { children: ReactNode }) => {
  const [spools, setSpools] = useState<Spool[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSpools = async () => {
    // Prevent fetching if we are already loading or if the feature isn't set up
    setLoading(true);
    try {
      const res = await fetch('/api/spoolman/spools');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.spools)) {
          setSpools(data.spools);
        }
      }
    } catch (error) {
      console.error("Failed to load Spoolman inventory context", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpools();
  }, []);

  const getSpoolById = (id: string | number) => {
    return spools.find(s => s.id.toString() === id.toString());
  };

  return (
    <SpoolmanContext.Provider value={{ spools, loading, refreshSpools: fetchSpools, getSpoolById }}>
      {children}
    </SpoolmanContext.Provider>
  );
};

export const useSpoolman = () => {
  const context = useContext(SpoolmanContext);
  if (context === undefined) {
    throw new Error('useSpoolman must be used within a SpoolmanProvider');
  }
  return context;
};