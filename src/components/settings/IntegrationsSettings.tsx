// src/components/settings/IntegrationsSettings.tsx

import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { CheckCircle2, XCircle, Save, ExternalLink, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { AppConfig } from '../../types/config'; // Import types

// [FIX] Add props interface
interface IntegrationsSettingsProps {
  config: AppConfig;
  onConfigChange: (updated: AppConfig) => void;
  onSave: () => void; // Trigger the main save function
}

export const IntegrationsSettings: React.FC<IntegrationsSettingsProps> = ({ config, onConfigChange, onSave }) => {
  // Spoolman State
  const [spoolmanStatus, setSpoolmanStatus] = useState<'idle' | 'loading' | 'connected' | 'error' | 'disabled'>('idle');
  
  // Local state for inputs (sync with props on load)
  const [spoolmanUrl, setSpoolmanUrl] = useState(config.integrations?.spoolman?.url || '');
  const [thingiverseToken, setThingiverseToken] = useState(config.integrations?.thingiverse?.token || '');

  // Sync state if parent config changes (e.g. after a reload)
  useEffect(() => {
    setSpoolmanUrl(config.integrations?.spoolman?.url || '');
    setThingiverseToken(config.integrations?.thingiverse?.token || '');
  }, [config]);

  // Initial check if URL exists
  useEffect(() => {
    if (config.integrations?.spoolman?.url) {
      checkSpoolmanConnection(config.integrations.spoolman.url);
    }
  }, []);

  const checkSpoolmanConnection = async (urlOverride?: string) => {
    const urlToCheck = urlOverride || spoolmanUrl;
    if (!urlToCheck) return;

    setSpoolmanStatus('loading');
    try {
      // NOTE: For the check to work, we temporarily might need to save, 
      // OR we update the backend proxy to accept a URL param instead of reading from config.
      // For now, let's assume we save the config first.
      
      // Update parent state first
      const newConfig = {
        ...config,
        integrations: {
          ...config.integrations,
          spoolman: { ...config.integrations?.spoolman, url: urlToCheck }
        }
      };
      onConfigChange(newConfig);
      
      // Trigger the backend test (this requires the backend to have the config, 
      // so we might need to hit Save first or pass the URL to the status endpoint)
      // Ideally, update the status endpoint to accept ?url=... for testing unsaved values.
      // But adhering to current logic: we save first.
      await fetch('/api/spoolman/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToCheck }),
      });

      const statusResp = await fetch('/api/spoolman/status');
      const statusData = await statusResp.json();
      
      if (statusData.status === 'connected') {
        setSpoolmanStatus('connected');
        toast.success("Connected to Spoolman!");
      } else {
        setSpoolmanStatus('error');
        toast.error("Could not connect");
      }
    } catch (e) {
      setSpoolmanStatus('error');
      toast.error("Connection failed");
    }
  };

  const handleSaveAll = () => {
    // Construct updated config object
    const newConfig: AppConfig = {
      ...config,
      integrations: {
        ...config.integrations,
        spoolman: { url: spoolmanUrl },
        thingiverse: { token: thingiverseToken }
      }
    };

    // Update Parent State
    onConfigChange(newConfig);
    
    // Trigger Parent Save (writes file + localStorage)
    onSave();
    
    toast.success("Integration settings saved");
  };

  return (
    <div className="space-y-6">
      
      {/* Spoolman Section */}
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
            Connect to your self-hosted Spoolman instance.
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
                variant="outline"
              >
                Test Connection
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Thingiverse Section */}
      <Card>
        <CardHeader>
          <CardTitle>Thingiverse Integration</CardTitle>
          <CardDescription>
            App Token for importing models.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="thingiverse-token">App Token</Label>
            <Input 
              id="thingiverse-token" 
              type="password"
              placeholder="Enter your API Token" 
              value={thingiverseToken}
              onChange={(e) => setThingiverseToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Paste your generated token here.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Unified Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSaveAll} className="gap-2">
          <Save className="w-4 h-4" />
          Save Integrations
        </Button>
      </div>

    </div>
  );
};