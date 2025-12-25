import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { CheckCircle2, XCircle, Loader2, Save, ExternalLink, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { ConfigManager } from '../../utils/configManager'; // Correct path based on file structure

export const IntegrationsSettings: React.FC = () => {
  // Spoolman State
  const [spoolmanUrl, setSpoolmanUrl] = useState('');
  const [spoolmanStatus, setSpoolmanStatus] = useState<'idle' | 'loading' | 'connected' | 'error' | 'disabled'>('idle');
  
  // Thingiverse State
  const [thingiverseToken, setThingiverseToken] = useState('');

  useEffect(() => {
    loadInitialSettings();
  }, []);

  const loadInitialSettings = async () => {
    try {
      // 1. Load Local Config
      const config = ConfigManager.loadConfig();
      
      // Spoolman
      if (config.integrations?.spoolman?.url) {
        setSpoolmanUrl(config.integrations.spoolman.url);
        checkSpoolmanConnection(config.integrations.spoolman.url);
      }

      // Thingiverse
      if (config.integrations?.thingiverse?.token) {
        setThingiverseToken(config.integrations.thingiverse.token);
      }
    } catch (e) {
      console.error("Failed to load settings", e);
    }
  };

  const checkSpoolmanConnection = async (urlOverride?: string) => {
    const urlToCheck = urlOverride || spoolmanUrl;
    if (!urlToCheck) return;

    setSpoolmanStatus('loading');
    try {
      // We save via API first to ensure the backend uses the new URL
      const saveResp = await fetch('/api/spoolman/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToCheck }),
      });
      
      if (!saveResp.ok) throw new Error("Failed to save URL");

      // Now check status
      const statusResp = await fetch('/api/spoolman/status');
      const statusData = await statusResp.json();
      
      if (statusData.status === 'connected') {
        setSpoolmanStatus('connected');
        toast.success("Connected to Spoolman!");
      } else {
        setSpoolmanStatus('error');
        toast.error("Could not connect to Spoolman");
      }
    } catch (e) {
      setSpoolmanStatus('error');
      toast.error("Connection failed");
    }
  };

  const handleSaveThingiverse = async () => {
    try {
      // We reuse the existing generic save-config endpoint
      const current = ConfigManager.loadConfig();
      const newConfig = {
        ...current,
        integrations: {
          ...current.integrations,
          thingiverse: { token: thingiverseToken }
        }
      };
      
      const resp = await fetch('/api/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });

      if (resp.ok) {
        // Update local storage too
        ConfigManager.saveConfig(newConfig);
        toast.success("Thingiverse token saved");
      } else {
        throw new Error("Server rejected config");
      }
    } catch (e) {
      toast.error("Failed to save token");
    }
  };

  return (
    <div className="space-y-6">
      
      {/* --- Spoolman Section --- */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>Spoolman Integration</CardTitle>
              {spoolmanStatus === 'connected' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
              {spoolmanStatus === 'error' && <XCircle className="w-5 h-5 text-red-500" />}
              {spoolmanStatus === 'idle' && <Unplug className="w-5 h-5 text-muted-foreground" />}
            </div>
            <a href="https://github.com/Donkie/Spoolman" target="_blank" rel="noreferrer" className="text-xs text-blue-500 flex items-center hover:underline">
              Documentation <ExternalLink className="w-3 h-3 ml-1" />
            </a>
          </div>
          <CardDescription>
            Connect to your self-hosted Spoolman instance to track filament inventory and calculate costs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="spoolman-url">Server URL</Label>
            <div className="flex gap-2">
              <Input 
                id="spoolman-url" 
                placeholder="http://192.168.1.50:7912" 
                value={spoolmanUrl}
                onChange={(e) => setSpoolmanUrl(e.target.value)}
              />
              <Button 
                onClick={() => checkSpoolmanConnection()} 
                disabled={spoolmanStatus === 'loading'}
                variant={spoolmanStatus === 'connected' ? "outline" : "default"}
              >
                {spoolmanStatus === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : "Test & Save"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter the full URL including port. Ensure Model Muncher can reach this IP.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* --- Thingiverse Section --- */}
      <Card>
        <CardHeader>
          <CardTitle>Thingiverse Integration</CardTitle>
          <CardDescription>
            Required for importing models directly from Thingiverse using the Import dialog.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="thingiverse-token">App Token</Label>
            <div className="flex gap-2">
              <Input 
                id="thingiverse-token" 
                type="password"
                placeholder="Enter your API Token" 
                value={thingiverseToken}
                onChange={(e) => setThingiverseToken(e.target.value)}
              />
              <Button onClick={handleSaveThingiverse}>
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              You can generate a token in your Thingiverse App settings.
            </p>
          </div>
        </CardContent>
      </Card>

    </div>
  );
};