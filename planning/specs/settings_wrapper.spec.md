
# Settings Wrapper Specification

**Source**: `src/components/SettingsPage.tsx.bak`
**Extraction Date**: 2026-02-06
**Purpose**: Reference for the main `SettingsPage.tsx`.

## 1. Global State & Props
```typescript
interface SettingsPageProps {
  initialTab?: string;
  config: AppConfig;
  onConfigUpdate?: (newConfig: AppConfig) => void;
  models: Model[];
  onModelsUpdate: (newModels: Model[]) => void;
  onCollectionCreatedForBulkEdit?: (collectionId: string) => void;
}

// State
const [selectedTab, setSelectedTab] = useState(initialTab || 'general');
const [localConfig, setLocalConfig] = useState<AppConfig>(config);
```

## 2. Initialization Effects
```typescript
  // Load Server Config on Mount
  useEffect(() => {
    const initConfig = async () => {
      try {
        const resp = await fetch('/api/load-config');
        const data = await resp.json();
        if (data.success) {
           // ... setLocalConfig ...
        }
      } catch (e) { console.error(e); }
    };
    initConfig();
  }, []);

  // Check Backups existence
  useEffect(() => {
    checkBackups();
  }, []);
```

## 3. Layout Structure
```tsx
    <div className="flex h-screen flex-col bg-background/95">
      <div className="flex-1 flex overflow-hidden">
         {/* SIDEBAR (Desktop) */}
         <aside className="hidden lg:block w-64 border-r bg-muted/30">
            {/* Navigation Buttons for Tabs */}
            <TabsList className="flex flex-col h-full justify-start space-y-1 p-2 bg-transparent">
               <TabsTrigger value="general">General</TabsTrigger>
               <TabsTrigger value="collections">Collections</TabsTrigger>
               <TabsTrigger value="categories">Categories</TabsTrigger>
               {/* ... etc ... */}
            </TabsList>
         </aside>

         {/* MAIN CONTENT AREA */}
         <main className="flex-1 overflow-y-auto p-6 md:p-8">
            <Tabs value={selectedTab} onValueChange={setSelectedTab}>
               {/* Mobile Tabs List (Sheet or Horizontal Scroll) */}
               
               {/* CONTENT AREAS */}
               <TabsContent value="general">...</TabsContent>
               <TabsContent value="collections">...</TabsContent>
               {/* ... etc ... */}
            </Tabs>
         </main>
      </div>
    </div>
```
