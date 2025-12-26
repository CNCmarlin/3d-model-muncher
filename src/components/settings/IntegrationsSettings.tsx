import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { CheckCircle2, XCircle, Save, ExternalLink, Cpu, Cloud, Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { AppConfig } from '../../types/config';

interface IntegrationsSettingsProps {
  config: AppConfig;
  onConfigChange: (updated: AppConfig) => void;
  // [FIX] Update onSave signature to accept the config directly
  onSave: (config: AppConfig) => void;
}

export const IntegrationsSettings: React.FC<IntegrationsSettingsProps> = ({ config, onConfigChange, onSave }) => {
  // Spoolman
  const [spoolmanStatus, setSpoolmanStatus] = useState<'idle' | 'loading' | 'connected' | 'error'>('idle');
  const [spoolmanUrl, setSpoolmanUrl] = useState('');

  // Thingiverse
  const [thingiverseToken, setThingiverseToken] = useState('');
  const [thingiverseStatus, setThingiverseStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // AI Provider
  const [aiProvider, setAiProvider] = useState<'google' | 'openai' | 'ollama' | 'none'>('google');
  const [aiTestStatus, setAiTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // Google Config
  const [googleType, setGoogleType] = useState<'vertex' | 'studio'>('vertex');
  const [googleKey, setGoogleKey] = useState('');
  const [googleProject, setGoogleProject] = useState('');
  const [googleJson, setGoogleJson] = useState('');

  // OpenAI Config
  const [openaiKey, setOpenaiKey] = useState('');
  const [openaiModel, setOpenaiModel] = useState('gpt-4o');

  // Ollama Config
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llava');

  // Sync with incoming config
  useEffect(() => {
    setSpoolmanUrl(prev => config.integrations?.spoolman?.url ?? prev);
    setThingiverseToken(prev => config.integrations?.thingiverse?.token ?? prev);

    // AI Smart Default
    let active = (config.integrations?.ai?.provider as any) || 'google';
    const hasGoogle = !!config.integrations?.google?.apiKey || !!config.integrations?.google?.serviceAccountJson;
    const hasOpenAI = !!config.integrations?.openai?.apiKey;

    if (active === 'google' && !hasGoogle && hasOpenAI) {
      active = 'openai';
    }
    setAiProvider(active);

    // Load fields
    if (config.integrations?.google?.provider) setGoogleType(config.integrations.google.provider);
    if (config.integrations?.google?.apiKey) setGoogleKey(config.integrations.google.apiKey);
    if (config.integrations?.google?.projectId) setGoogleProject(config.integrations.google.projectId);
    if (config.integrations?.google?.serviceAccountJson) setGoogleJson(config.integrations.google.serviceAccountJson);

    if (config.integrations?.openai?.apiKey) setOpenaiKey(config.integrations.openai.apiKey);
    if (config.integrations?.openai?.model) setOpenaiModel(config.integrations.openai.model);

    if (config.integrations?.ollama?.url) setOllamaUrl(config.integrations.ollama.url);
    if (config.integrations?.ollama?.model) setOllamaModel(config.integrations.ollama.model);
  }, [config]);

  const checkSpoolmanConnection = async (urlOverride?: string) => {
    const urlToCheck = urlOverride || spoolmanUrl;
    if (!urlToCheck) return;
    setSpoolmanStatus('loading');
    try {
      await fetch('/api/spoolman/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToCheck }),
      });
      const statusResp = await fetch('/api/spoolman/status');
      const statusData = await statusResp.json();
      setSpoolmanStatus(statusData.status === 'connected' ? 'connected' : 'error');
      if (statusData.status === 'connected') toast.success("Spoolman Connected");
    } catch (e) {
      setSpoolmanStatus('error');
    }
  };

  const handleTestThingiverse = async () => {
    if (!thingiverseToken) return toast.error("Enter a token first");
    setThingiverseStatus('loading');
    try {
      const res = await fetch('/api/thingiverse/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: thingiverseToken })
      });
      const data = await res.json();
      if (data.success) {
        setThingiverseStatus('success');
        toast.success(`Verified as: ${data.username}`);
      } else {
        setThingiverseStatus('error');
        toast.error("Verification failed");
      }
    } catch (e) {
      setThingiverseStatus('error');
      toast.error("Network error");
    }
  };

  const handleTestAI = async () => {
    setAiTestStatus('loading');
    const testConfig: any = {};
    if (aiProvider === 'google') {
      testConfig.apiKey = googleKey;
      testConfig.provider = googleType;
      testConfig.serviceAccountJson = googleJson;
    } else if (aiProvider === 'openai') {
      testConfig.apiKey = openaiKey;
      testConfig.model = openaiModel;
    } else if (aiProvider === 'ollama') {
      testConfig.url = ollamaUrl;
      testConfig.model = ollamaModel;
    }

    try {
      const res = await fetch('/api/gemini-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: "Say hello",
          provider: aiProvider,
          config: testConfig
        })
      });
      const data = await res.json();
      if (data.success) {
        setAiTestStatus('success');
        toast.success("AI Connected Successfully!");
      } else {
        setAiTestStatus('error');
        toast.error("AI Test Failed: " + (data.error || "Unknown error"));
      }
    } catch (e) {
      setAiTestStatus('error');
      toast.error("AI Request Failed");
    }
  };

  const handleSaveAll = () => {
    // 1. Create the NEW config object immediately from local state
    const newConfig: AppConfig = {
      ...config,
      integrations: {
        ...config.integrations,
        spoolman: { url: spoolmanUrl },
        thingiverse: { token: thingiverseToken },
        ai: { provider: aiProvider },
        google: {
          provider: googleType,
          apiKey: googleKey,
          projectId: googleProject,
          serviceAccountJson: googleJson
        },
        openai: {
          apiKey: openaiKey,
          model: openaiModel
        },
        ollama: {
          url: ollamaUrl,
          model: ollamaModel
        }
      }
    };

    // 2. Update parent state
    onConfigChange(newConfig);

    // 3. Trigger save with the FRESH config (bypassing race conditions)
    onSave(newConfig);

    // 4. Show Feedback
    toast.success("Integrations saved successfully");
  };

  return (
    <div className="space-y-8 pb-8">

      {/* 1. Spoolman */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>Material Management</CardTitle>
              {spoolmanStatus === 'connected' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
              {spoolmanStatus === 'error' && <XCircle className="w-5 h-5 text-red-500" />}
            </div>
            <a href="https://github.com/Donkie/Spoolman" target="_blank" rel="noreferrer" className="text-xs text-blue-500 flex items-center hover:underline">
              Spoolman Docs <ExternalLink className="w-3 h-3 ml-1" />
            </a>
          </div>
          <CardDescription>Connect to Spoolman to track filament inventory.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="http://192.168.1.50:7912"
              value={spoolmanUrl}
              onChange={(e) => setSpoolmanUrl(e.target.value)}
            />
            <Button onClick={() => checkSpoolmanConnection()} variant="outline">
              {spoolmanStatus === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 2. Generative AI */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-muted-foreground" />
            <CardTitle>Generative AI Provider</CardTitle>
          </div>
          <CardDescription>Select the AI "Brain" for auto-tagging and descriptions.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">

          <div className="flex gap-4 items-end">
            <div className="grid gap-2 flex-1">
              <Label>Active Provider</Label>
              <Select value={aiProvider} onValueChange={(v: any) => setAiProvider(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select AI Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="google">Google Cloud (Gemini)</SelectItem>
                  <SelectItem value="openai">OpenAI (GPT-4)</SelectItem>
                  <SelectItem value="ollama">Ollama (Local)</SelectItem>
                  <SelectItem value="none">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {aiProvider !== 'none' && (
              <Button variant="outline" onClick={handleTestAI} disabled={aiTestStatus === 'loading'}>
                {aiTestStatus === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test Connection'}
              </Button>
            )}
          </div>

          <div className="p-4 border rounded-lg bg-card/50">
            {aiProvider === 'google' && (
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label>Connection Type</Label>
                  <Select value={googleType} onValueChange={(v: any) => setGoogleType(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vertex">Vertex AI (Recommended)</SelectItem>
                      <SelectItem value="studio">AI Studio (API Key)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {googleType === 'studio' ? (
                  <div className="grid gap-2">
                    <Label>API Key</Label>
                    <Input type="password" value={googleKey} onChange={(e) => setGoogleKey(e.target.value)} placeholder="AIzaSy..." />
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <Label>Service Account JSON</Label>
                    <Textarea
                      className="font-mono text-xs h-24"
                      value={googleJson}
                      onChange={(e) => setGoogleJson(e.target.value)}
                      placeholder='{ "type": "service_account", ... }'
                    />
                  </div>
                )}
              </div>
            )}

            {aiProvider === 'openai' && (
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label>API Key</Label>
                  <Input type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-..." />
                </div>
                <div className="grid gap-2">
                  <Label>Model</Label>
                  <Input value={openaiModel} onChange={(e) => setOpenaiModel(e.target.value)} placeholder="gpt-4o" />
                </div>
              </div>
            )}

            {aiProvider === 'ollama' && (
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label>Ollama URL</Label>
                  <Input value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} placeholder="http://localhost:11434" />
                </div>
                <div className="grid gap-2">
                  <Label>Model Name</Label>
                  <Input value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} placeholder="llava" />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 3. Repositories */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="w-5 h-5 text-muted-foreground" />
              <CardTitle>Content Repositories</CardTitle>
            </div>
            {thingiverseStatus === 'success' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
            {thingiverseStatus === 'error' && <XCircle className="w-5 h-5 text-red-500" />}
          </div>
          <CardDescription>Integrate with public model repositories.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            <Label>Thingiverse Token</Label>
            <div className="flex gap-2">
              <Input type="password" value={thingiverseToken} onChange={(e) => setThingiverseToken(e.target.value)} placeholder="App Token" />
              <Button onClick={handleTestThingiverse} variant="outline" disabled={thingiverseStatus === 'loading'}>
                {thingiverseStatus === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* [NEW] 3D Printer Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-orange-500" />
            <CardTitle>Printer Link</CardTitle>
          </div>
          <CardDescription>Send G-code directly to your printer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Printer Type</Label>
            <Select
              value={config.integrations?.printer?.type || 'moonraker'}
              onValueChange={(v: any) => onConfigChange({
                ...config, integrations: { ...config.integrations, printer: { ...config.integrations?.printer, type: v } }
              })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="moonraker">Klipper (Moonraker/Mainsail)</SelectItem>
                <SelectItem value="octoprint">OctoPrint (Legacy)</SelectItem>
                <SelectItem value="bambu">Bambu Lab (Basic)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>IP Address / URL</Label>
            <div className="flex gap-2">
              <Input
                placeholder="http://192.168.1.50"
                value={config.integrations?.printer?.url || ''}
                onChange={(e) => onConfigChange({
                  ...config, integrations: { ...config.integrations, printer: { ...config.integrations?.printer, url: e.target.value } }
                })}
              />
              <Button variant="outline" onClick={async () => {
                 // 1. Validate Input
                 const currentUrl = config.integrations?.printer?.url || '';
                 const currentType = config.integrations?.printer?.type || 'moonraker';
                 const currentKey = config.integrations?.printer?.apiKey || '';

                 if (!currentUrl) return toast.error("Enter an IP address first");

                 const toastId = toast.loading("Testing connection...");

                 try {
                   // 2. Send values DIRECTLY via query params (bypassing save lag)
                   const params = new URLSearchParams({
                     type: currentType,
                     url: currentUrl,
                     apiKey: currentKey
                   });

                   const res = await fetch(`/api/printer/status?${params.toString()}`);
                   const data = await res.json();
                   
                   toast.dismiss(toastId);

                   if (data.status === 'connected') {
                     toast.success("Printer Connected Successfully!");
                   } else {
                     // 3. Show the EXACT error from the server
                     toast.error(`Connection Failed: ${data.message || 'Unknown Error'}`);
                     
                     // Helpful Hint for Klipper Users
                     if (currentType === 'moonraker' && !currentUrl.includes(':')) {
                        toast.info("Hint: Klipper/Moonraker often uses port 7125. Try adding :7125 to the IP.");
                     }
                   }
                 } catch(e) { 
                   toast.dismiss(toastId);
                   toast.error("Network request failed"); 
                 }
              }}>Test</Button>
            </div>
          </div>
          {config.integrations?.printer?.type === 'octoprint' && (
            <div className="grid gap-2">
              <Label>API Key</Label>
              <Input
                type="password"
                value={config.integrations?.printer?.apiKey || ''}
                onChange={(e) => onConfigChange({
                  ...config, integrations: { ...config.integrations, printer: { ...config.integrations?.printer, apiKey: e.target.value } }
                })}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end pt-4">
        <Button onClick={handleSaveAll} className="gap-2 w-full sm:w-auto">
          <Save className="w-4 h-4" />
          Save All Integrations
        </Button>
      </div>

    </div>
  );
};