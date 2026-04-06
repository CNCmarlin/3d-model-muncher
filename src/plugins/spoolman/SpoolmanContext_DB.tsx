import { ReactNode, useContext, useEffect, useState } from 'react';
import { SpoolmanContext } from './SpoolmanContext';

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

/**
 * Database SpoolmanProvider — full independent copy.
 * Shares the React context object with SpoolmanContext so hooks work
 * regardless of which provider the ContextRouter mounts.
 * Diverge this implementation freely for DB-specific Spoolman logic.
 */
export const SpoolmanProvider_DB = ({ children }: { children: ReactNode }) => {
  const [spools, setSpools] = useState<Spool[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSpools = async () => {
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
    throw new Error('useSpoolman must be used within a SpoolmanProvider_DB');
  }
  return context;
};
