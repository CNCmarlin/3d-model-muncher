import { useState, useEffect } from 'react';
import { Printer, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AppConfig } from '../types/config';

interface PrinterStatusHubProps {
  config: AppConfig;
}

interface PrinterStatus {
  status: 'printing' | 'idle' | 'paused' | 'error' | 'disconnected';
  progress: number;
  timeLeft: number | null;
  filename: string;
}

export function PrinterStatusHub({ config }: PrinterStatusHubProps) {
  const [data, setData] = useState<PrinterStatus | null>(null);
  
  // Load settings
  const enabled = !!config.integrations?.printer?.url;
  const customColor = config.integrations?.printer?.color || '#3b82f6'; // Default blue

  useEffect(() => {
    if (!enabled) return;

    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/printer/job-status');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (e) {
        // ignore errors silently in polling
      }
    };

    // Initial fetch
    fetchStatus();

    // Poll every 5s
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [enabled]);

  if (!enabled || !data) return null;

  // Format time left (seconds -> HH:MM)
  const formatTime = (seconds: number) => {
    if (!seconds) return '--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const getStatusText = () => {
    switch (data.status) {
      case 'printing': return `Printing (${Math.round(data.progress)}%)`;
      case 'paused': return 'Paused';
      case 'error': return 'Printer Error';
      case 'disconnected': return 'Disconnected';
      default: return 'Ready';
    }
  };

  const getStatusIcon = () => {
    if (data.status === 'printing') return <Clock className="w-3 h-3 animate-pulse" />;
    if (data.status === 'error' || data.status === 'disconnected') return <AlertCircle className="w-3 h-3" />;
    return <CheckCircle2 className="w-3 h-3" />;
  };

  return (
    // Desktop only (hidden on mobile), centered items
    <div className="hidden md:flex items-center gap-3 px-4 py-1.5 bg-muted/30 rounded-full border border-border/50 backdrop-blur-sm transition-all hover:bg-muted/50">
      {/* Icon with custom color */}
      <div 
        className="flex items-center justify-center w-8 h-8 rounded-full shadow-sm text-white"
        style={{ backgroundColor: customColor }}
      >
        <Printer className="w-4 h-4" />
      </div>

      <div className="flex flex-col text-xs leading-none gap-1 min-w-[80px]">
        <div className="font-medium flex items-center gap-1.5">
          {getStatusText()}
        </div>
        
        {data.status === 'printing' && data.timeLeft !== null && (
          <span className="text-muted-foreground">
            {formatTime(data.timeLeft)} remaining
          </span>
        )}
        {data.status === 'idle' && (
          <span className="text-muted-foreground">System Idle</span>
        )}
      </div>
    </div>
  );
}