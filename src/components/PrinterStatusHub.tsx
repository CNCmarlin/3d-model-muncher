import { useState, useEffect } from 'react';
import { Printer, Clock, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { AppConfig, PrinterConfig } from '../types/config';

interface PrinterStatusHubProps {
  config: AppConfig;
}

interface PrinterStatus {
  index: number;
  status: 'printing' | 'idle' | 'paused' | 'error' | 'disconnected' | 'offline';
  progress: number;
  timeLeft: number | null;
  name: string;
}

export function PrinterStatusHub({ config }: PrinterStatusHubProps) {
  const [apiPrinters, setApiPrinters] = useState<PrinterStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // 1. Determine enabled printers from CONFIG (Source of Truth)
  const configPrinters: PrinterConfig[] = config.integrations?.printers || 
    (config.integrations?.printer ? [config.integrations.printer] : []);

  // Filter only those with URLs (Active configurations)
  // We map them to preserve their original index for matching
  const activeConfigs = configPrinters
    .map((p, idx) => ({ ...p, originalIndex: idx }))
    .filter(p => p && p.url);

  useEffect(() => {
    if (activeConfigs.length === 0) return;

    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/printer/status');
        if (res.ok) {
          const json = await res.json();
          // The server returns { status: 'active', printers: [...] }
          if (json.printers && Array.isArray(json.printers)) {
            setApiPrinters(json.printers);
          }
        }
      } catch (e) {
        // Keep existing data on error to prevent flickering, or set to empty if critical
      } finally {
        setIsLoading(false);
      }
    };

    // Initial fetch
    fetchStatus();
    // Poll every 5s
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [activeConfigs.length]);

  if (activeConfigs.length === 0) return null;

  const formatTime = (seconds: number) => {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="hidden md:flex items-center gap-2">
      {activeConfigs.map((conf, i) => {
        // 2. Match API data to Config data
        // We try to find the status update for this specific printer index
        const statusData = apiPrinters.find(p => p.index === conf.originalIndex);
        
        // Default Color
        const color = conf.color || '#3b82f6';
        const displayName = conf.name || `Printer ${conf.originalIndex + 1}`;

        // 3. Determine Display State
        let displayStatus = 'Connecting...';
        let progress = 0;
        let timeLeft: number | null = null;
        let isOnline = false;

        if (statusData) {
            displayStatus = statusData.status;
            progress = statusData.progress;
            timeLeft = statusData.timeLeft;
            isOnline = statusData.status !== 'offline' && statusData.status !== 'error' && statusData.status !== 'disconnected';
        } else if (!isLoading) {
            displayStatus = 'Offline'; // API returned but didn't have data for this index
        }

        return (
          <div key={conf.originalIndex} className="flex items-center gap-2 px-3 py-1.5 bg-muted/40 rounded-full border border-border/40 hover:bg-muted/60 transition-colors">
            <div 
              className={`flex items-center justify-center w-6 h-6 rounded-full text-white shadow-sm ${!isOnline && !isLoading ? 'opacity-50 grayscale' : ''}`}
              style={{ backgroundColor: isOnline || isLoading ? color : undefined }}
            >
              {isLoading && !statusData ? (
                 <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
              ) : (
                 <Printer className="w-3.5 h-3.5" />
              )}
            </div>
            
            <div className="flex flex-col text-[10px] leading-tight min-w-[60px]">
               <div className="font-semibold flex justify-between">
                  <span className="truncate max-w-[80px]" title={displayName}>{displayName}</span>
               </div>
               
               <div className="text-muted-foreground">
                 {displayStatus === 'printing' ? (
                    <span className="text-primary font-medium">{Math.round(progress)}% {timeLeft ? `(${formatTime(timeLeft)})` : ''}</span>
                 ) : (
                    <span className="capitalize">{displayStatus}</span>
                 )}
               </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}