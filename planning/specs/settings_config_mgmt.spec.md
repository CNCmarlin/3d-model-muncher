
# Config Management Specification

**Source**: `src/components/SettingsPage.tsx.bak`
**Extraction Date**: 2026-02-06
**Purpose**: Reference for `SettingsConfigMgmt.tsx` (Logic primarily found in Lines 816-1022).

## 1. Handlers
```typescript
  const handleSaveConfig = async (configToSave?: AppConfig) => {
    const config = configToSave || localConfig;
    config.lastModified = new Date().toISOString();
    setSaveStatus('saving');

    try {
      ConfigManager.saveConfig(config); // Local
      if (onConfigUpdate) onConfigUpdate(config);

      // Server persistence
      const resp = await fetch('/api/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      // ... handle success/fail ...
    } catch (error) {
       // ... handler error ...
    }
  };

  const handleLoadServerConfig = async () => {
    // Fetches /api/load-config
    // Clears localStorage
    // Reloads page
  };

  const handleExportConfig = () => {
    ConfigManager.exportConfig(localConfig);
  };

  const handleImportConfig = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = async (event) => {
    const file = event.target.files?.[0];
    const importedConfig = await ConfigManager.importConfig(file);
    await handleSaveConfig(importedConfig);
    // Update local state
  };

  const handleResetConfig = () => {
    const defaultConfig = ConfigManager.resetConfig();
    handleSaveConfig(defaultConfig);
  };
```

## 2. UI Render Block
```tsx
          {/* Configuration Tab */}
          <TabsContent value="config" className="space-y-6 mt-0">
             <Card>
               {/* Export / Import / Reset Buttons */}
               <div className="flex flex-col gap-4">
                 <Button onClick={handleExportConfig}>Export JSON</Button>
                 <Button onClick={handleImportConfig}>Import JSON</Button>
                 <Button variant="destructive" onClick={handleResetConfig}>Reset to Defaults</Button>
               </div>
             </Card>
          </TabsContent>
```
