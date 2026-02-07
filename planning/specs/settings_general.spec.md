
# General Settings Specification

**Source**: `src/components/SettingsPage.tsx.bak`
**Extraction Date**: 2026-02-06
**Purpose**: Reference for `SettingsGeneral.tsx`.

## 1. Local State
```typescript
  // Form State for Model Dir Editing
  const [isEditingModelDir, setIsEditingModelDir] = useState(false);
  const [tempModelDir, setTempModelDir] = useState('');
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);
  const [unsavedPrimaryColor, setUnsavedPrimaryColor] = useState<string | null>(null);
```

## 2. Utils
```typescript
  const applyThemeColor = (color: string | null) => {
    themeUtils.applyPrimaryColor(color);
  };

  const normalizeIconName = (name?: string) => {
    // ... PascalCase logic ...
    if (!name) return 'Folder';
    const parts = name.split(/[-\s]+/);
    const pascal = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    return pascal || 'Folder';
  };
```

## 3. Handlers
```typescript
  // Thumbnail Generation
  const handleGenerateThumbnails = async () => {
    setIsGeneratingThumbnails(true);
    setSaveStatus('saving');
    setStatusMessage('Starting thumbnail generation...');

    try {
      await fetch('/api/generate-missing-thumbnails', { method: 'POST' });
      setSaveStatus('saved');
      setStatusMessage('Thumbnail generation started in background');
    } catch (err) {
      setSaveStatus('error');
      setStatusMessage('Failed to start thumbnail generation');
    } finally {
      setTimeout(() => {
        setIsGeneratingThumbnails(false);
        setSaveStatus('idle');
        setStatusMessage('');
      }, 3000);
    }
  };

  const handleCancelThumbnails = async () => {
    // Call cancel endpoint
    await fetch('/api/cancel-thumbnails', { method: 'POST' });
    setIsGeneratingThumbnails(false);
    setStatusMessage('Thumbnail generation stopped');
  };

  // Model Directory Editing
  const handleSaveModelDir = async () => {
    try {
      setSaveStatus('saving');
      const newConfig = { ...localConfig, settings: { ...localConfig.settings, modelDirectory: tempModelDir } };
      // ... save logic ...
      toast.success('Model directory saved.');
      setIsEditingModelDir(false);
    } catch (err) {
      // ... error logic ...
    }
  };
```

## 4. UI Render Block
```tsx
          {/* General Tab */}
          <TabsContent value="general" className="space-y-6 mt-0">
             {/* Application Settings (Theme, Layout, Density) */}
             <Card>
               {/* ... */}
               <h3 className="font-medium">Visual Settings</h3>
               {/* Color Picker Logic */}
               <div className="flex flex-wrap gap-2 mt-2">
                  {/* ... Preset Colors ... */}
               </div>
               {/* Thumbnail Generation Section */}
               <div className="pt-4 border-t mt-4">
                  {/* ... Generate/Cancel Buttons ... */}
               </div>
             </Card>

             {/* G-Code Settings */}
             <Card>
               {/* ... Radio Group for gcodeStorageBehavior ... */}
             </Card>

             {/* Model Directory */}
             <Card>
               {/* ... Input + Edit/Save Toggle Buttons ... */}
             </Card>

             {/* Apply Server Config Button */}
             <div className="space-y-4">
                <Button variant="outline" onClick={handleLoadServerConfig}>
                  Load Configuration
                </Button>
             </div>
          </TabsContent>
```
