import { ImageWithFallback_DB } from "@/components/common/ImageWithFallback_DB";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Archive, ArrowLeft, Boxes, Code, FlaskConical, FolderOpen, Github, Heart, Layers, Plug, Settings, ShieldCheck, Star, Tag } from 'lucide-react';
import React, { Suspense } from 'react';
// Sub-components
import { MigrationStatus_DB } from '@/components/admin/MigrationStatus_DB';
import { BackupSettings_DB } from '@/components/settings/BackupSettings_DB';
import { CategorySettings_DB } from '@/components/settings/CategorySettings_DB';
import { CollectionsSettings_DB } from '@/components/settings/CollectionsSettings_DB';
import { GeneralSettings_DB } from '@/components/settings/GeneralSettings_DB';
import { IntegrationsSettings_DB } from '@/components/settings/IntegrationsSettings_DB';
import { IntegritySettings_DB } from '@/components/settings/IntegritySettings_DB';
import { ModelFilesSettings_DB } from '@/components/settings/ModelFilesSettings_DB';
import { TagsTab_DB } from '@/components/settings/TagsTab_DB';

// Hooks
import { useNavigation } from '@/context/NavigationContext';
import { useBackups_db } from '@/hooks/settings/useBackups_db';
import { useCategoryManager_db } from '@/hooks/settings/useCategoryManager_db';
import { useIntegrityCheck_db } from '@/hooks/settings/useIntegrityCheck_db';
import { useSettingsConfig_db } from '@/hooks/settings/useSettingsConfig_db';
import { useTagManager_db } from '@/hooks/settings/useTagManager_db';

// Types
import { Category } from '@/types/category';
import { AppConfig } from '@/types/config';
import { Model } from '@/types/model_db';

const ExperimentalTab = React.lazy(() => import('@/components/settings/ExperimentalTab_DB'));

type SettingsPageProps = {
  config?: AppConfig;
  onConfigUpdate?: (config: AppConfig) => void;
  models: Model[];
  onModelsUpdate: (models: Model[]) => void;
  onModelClick?: (model: Model) => void;
  onDonationClick: () => void;
  onBack?: () => void;
  categories: Category[];
  onCategoriesUpdate: (categories: Category[]) => void;
  initialTab?: string;
  settingsAction?: any;
  onActionHandled?: () => void;
  onCollectionCreatedForBulkEdit?: (collection: any) => void;
};

export function SettingsPage_DB({
  config,
  onConfigUpdate,
  models,
  onModelsUpdate,
  onModelClick,
  onDonationClick,
  onBack,
  categories,
  onCategoriesUpdate,
  initialTab,
  settingsAction,
  onActionHandled
}: SettingsPageProps) {
  const { setCurrentView: _setCurrentView } = useNavigation();
  const SETTINGS_TAB_KEY = 'settings_active_tab';
  const [selectedTab, setSelectedTab] = React.useState<string>(() => {
    // Honour explicit initialTab prop first (e.g. deep-linked navigation)
    // then fall back to the last tab the user had open, then 'general'
    return initialTab || localStorage.getItem(SETTINGS_TAB_KEY) || 'general';
  });

  // Keep localStorage in sync whenever the tab changes
  const handleTabChange = React.useCallback((tab: string) => {
    setSelectedTab(tab);
    try { localStorage.setItem(SETTINGS_TAB_KEY, tab); } catch { /* quota full */ }
  }, []);

  React.useEffect(() => {
    if (initialTab) {
      handleTabChange(initialTab);
    }
  }, [initialTab]);

  React.useEffect(() => {
    if (settingsAction) {
      // Handle actions like 'import'
      if (settingsAction.type === 'import') {
        setSelectedTab('config');
      }
      onActionHandled?.();
    }
  }, [settingsAction, onActionHandled]);

  // 1. Config Management Hook
  const settingsConfig = useSettingsConfig_db(config, onConfigUpdate);
  const {
    localConfig,
    setLocalConfig,
    handleSaveConfig,
    saveStatus,
    statusMessage,
    setStatusMessage,
    setSaveStatus
  } = settingsConfig;

  // 2. Tag Manager Hook
  const tagManager = useTagManager_db({
    models: models as any,
    onModelsUpdate: onModelsUpdate as any,
    setSaveStatus,
    setStatusMessage
  });

  // 3. Category Manager Hook
  const categoryManager = useCategoryManager_db({
    categories,
    models: models as any,
    localConfig,
    handleSaveConfig,
    onModelsUpdate: onModelsUpdate as any,
    onCategoriesUpdate: (cats) => {
      // Notify parent
      onCategoriesUpdate(cats);
    },
    setSaveStatus,
    setStatusMessage
  });

  // 4. Integrity Check Hook — hash check + duplicate detection (DB-first)
  const integrityCheck = useIntegrityCheck_db({
    models: models as any,
    onModelsUpdate: onModelsUpdate as any,
    setSaveStatus,
    setStatusMessage
  });

  // 5. Backups Hook
  const backups = useBackups_db({
    setSaveStatus,
    setStatusMessage
  });

  // 6. Config Hook
  const configSettings = useSettingsConfig_db(localConfig, setLocalConfig);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="p-6 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {onBack && (
              <Button variant="ghost" size="icon" onClick={onBack}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
              <p className="text-muted-foreground">Manage your library configuration and preferences</p>
            </div>
          </div>
        </div>
      </div>

      <Separator className="mt-2 mb-0" />

      {/* Status Alert */}
      {saveStatus === 'error' && statusMessage && (
        <div className="px-6 pt-6">
          <Alert className={`border-red-500 bg-red-50 dark:bg-red-950`}>
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            <AlertDescription className={`text-red-700 dark:text-red-300`}>
              {statusMessage}
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Settings Tabs Container */}
      <Tabs
        value={selectedTab}
        onValueChange={handleTabChange}
        orientation="vertical"
        className="flex flex-col md:flex-row flex-1 overflow-hidden"
      >
        {/* SIDEBAR NAVIGATION */}
        <aside className="w-64 border-r bg-muted/10 flex-shrink-0 overflow-y-auto hidden md:block">
          <TabsList className="flex flex-col h-auto p-4 space-y-1 bg-transparent justify-start w-full">
            <TabsTrigger value="general" className="w-full justify-start px-4 py-3 data-[state=active]:bg-secondary">
              <Settings className="mr-2 h-4 w-4" /> General
            </TabsTrigger>
            <TabsTrigger value="collections" className="w-full justify-start px-4 py-3 data-[state=active]:bg-secondary">
              <Boxes className="mr-2 h-4 w-4" /> Collections
            </TabsTrigger>
            <TabsTrigger value="model-files" className="w-full justify-start px-4 py-3 data-[state=active]:bg-secondary">
              <FolderOpen className="mr-2 h-4 w-4" /> Model Files
            </TabsTrigger>
            <TabsTrigger value="categories" className="w-full justify-start px-4 py-3 data-[state=active]:bg-secondary">
              <Layers className="mr-2 h-4 w-4" /> Categories
            </TabsTrigger>
            <TabsTrigger value="tags" className="w-full justify-start px-4 py-3 data-[state=active]:bg-secondary">
              <Tag className="mr-2 h-4 w-4" /> Tags
            </TabsTrigger>
            <TabsTrigger value="backup" className="w-full justify-start px-4 py-3 data-[state=active]:bg-secondary">
              <Archive className="mr-2 h-4 w-4" /> Backup & Restore
            </TabsTrigger>
            <TabsTrigger value="integrity" className="w-full justify-start px-4 py-3 data-[state=active]:bg-secondary">
              <ShieldCheck className="mr-2 h-4 w-4" /> File Integrity
            </TabsTrigger>
            <TabsTrigger value="integrations" className="w-full justify-start px-4 py-3 data-[state=active]:bg-secondary">
              <Plug className="mr-2 h-4 w-4" /> Integrations
            </TabsTrigger>
            <TabsTrigger value="support" className="w-full justify-start px-4 py-3 data-[state=active]:bg-secondary">
              <Heart className="mr-2 h-4 w-4" /> Support
            </TabsTrigger>
            <TabsTrigger value="experimental" className="w-full justify-start px-4 py-3 data-[state=active]:bg-secondary">
              <FlaskConical className="mr-2 h-4 w-4" /> Experimental
            </TabsTrigger>
            <TabsTrigger value="migration" className="w-full justify-start px-4 py-3 data-[state=active]:bg-secondary">
              <ShieldCheck className="mr-2 h-4 w-4" /> Database
            </TabsTrigger>
          </TabsList>
        </aside>

        {/* Mobile Sidebar (Horizontal Scroll) */}
        <div className="md:hidden border-b bg-muted/10 flex-shrink-0 overflow-x-auto">
          <TabsList className="flex w-max p-2 space-x-1 bg-transparent">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="collections">Collections</TabsTrigger>
            <TabsTrigger value="model-files">Model Files</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="tags">Tags</TabsTrigger>
            <TabsTrigger value="backup">Backup</TabsTrigger>
            <TabsTrigger value="integrity">File Integrity</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="support">Support</TabsTrigger>
            <TabsTrigger value="experimental">Experimental</TabsTrigger>
            <TabsTrigger value="migration">Database</TabsTrigger>
          </TabsList>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-background p-6">
          <TabsContent value="general" className="space-y-6 mt-0">
            <GeneralSettings_DB
              localConfig={localConfig}
              setLocalConfig={setLocalConfig}
              handleSaveConfig={handleSaveConfig}
              models={models}
              categories={categories}
              onModelClick={onModelClick}
            />
          </TabsContent>

          <TabsContent value="collections" className="space-y-6 mt-0">
            <CollectionsSettings_DB
              categories={categories}
              models={models}
            />
          </TabsContent>

          <TabsContent value="model-files" className="space-y-6 mt-0">
            <ModelFilesSettings_DB />
          </TabsContent>

          <TabsContent value="categories" className="space-y-6 mt-0">
            <CategorySettings_DB {...categoryManager} models={models} />
          </TabsContent>

          <TabsContent value="tags" className="space-y-6 mt-0">
            <TagsTab_DB
              tagManager={tagManager}
              models={models}
              onModelClick={onModelClick}
            />
          </TabsContent>

          <TabsContent value="backup" className="space-y-6 mt-0">
            <BackupSettings_DB
              isCreatingBackup={backups.isCreatingBackup}
              isRestoring={backups.isRestoring}
              backupHistory={backups.backupHistory}
              restoreResult={backups.restoreResult}
              restoreStrategy={backups.restoreStrategy}
              setRestoreStrategy={backups.setRestoreStrategy}
              backupFileInputRef={backups.backupFileInputRef}
              handleCreateBackup={backups.handleCreateBackup}
              handleRestoreFromFile={backups.handleRestoreFromFile}
              handleBackupFileRestore={backups.handleBackupFileRestore}
              safeRestores={backups.safeRestores}
              isFetchingSafeRestores={backups.isFetchingSafeRestores}
              triggerSafeRestore={backups.triggerSafeRestore}
              fetchSafeRestores={backups.fetchSafeRestores}
              models={models}
              configSettings={configSettings}
            />
          </TabsContent>

          {/* IntegritySettings_DB — DB-first: hash check + duplicate detection */}
          <TabsContent value="integrity" className="space-y-6 mt-0">
            <IntegritySettings_DB
              {...integrityCheck}
              models={models}
              onModelClick={onModelClick}
            />
          </TabsContent>

          <TabsContent value="integrations" className="space-y-6 mt-0">
            <IntegrationsSettings_DB
              config={localConfig}
              onConfigChange={setLocalConfig}
              onSave={handleSaveConfig}
            />
          </TabsContent>

          <TabsContent value="support" className="space-y-6 mt-0">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Heart className="h-5 w-5 text-primary" />
                  Support 3D Model Muncher
                </CardTitle>
                <CardDescription>
                  Help keep this project alive and growing! Your support enables continued development and new features.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-medium">Ways to Support</h3>
                  <div className="grid gap-4">
                    <button
                      type="button"
                      onClick={onDonationClick}
                      className="w-full text-left flex items-center gap-4 p-4 bg-gradient-to-r from-primary/5 to-secondary/5 rounded-lg border border-primary/20 cursor-pointer transform transition duration-150 ease-in-out hover:scale-105 hover:from-primary/10 hover:to-secondary/10 hover:border-2 hover:border-primary hover:bg-primary/6 dark:hover:border-primary dark:hover:bg-primary/900 hover:ring-2 hover:ring-primary/40 dark:hover:ring-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary/50 transition-colors"
                    >
                      <div className="flex items-center justify-center w-12 h-12 bg-primary/10 rounded-lg">
                        <Heart className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium">Financial Support</h4>
                        <p className="text-sm text-muted-foreground">
                          Buy me a coffee or sponsor development through various platforms
                        </p>
                      </div>
                      <span className="hidden sm:inline-flex items-center gap-2">
                        <Heart className="h-4 w-4" />
                        Donate
                      </span>
                    </button>

                    <a
                      href="https://github.com/robsturgill/3d-model-muncher"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full text-left flex items-center gap-4 p-4 bg-muted/30 rounded-lg border cursor-pointer hover:bg-muted/50"
                    >
                      <div className="flex items-center justify-center w-12 h-12 bg-muted rounded-lg">
                        <Star className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium">Star on GitHub</h4>
                        <p className="text-sm text-muted-foreground">
                          Show your appreciation and help others discover the project
                        </p>
                      </div>
                      <span className="hidden sm:inline-flex items-center gap-2">
                        <Github className="h-4 w-4" />
                        Star
                      </span>
                    </a>

                    <a
                      href="https://github.com/robsturgill/3d-model-muncher/pulls"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full text-left flex items-center gap-4 p-4 bg-muted/30 rounded-lg border cursor-pointer hover:bg-muted/50"
                    >
                      <div className="flex items-center justify-center w-12 h-12 bg-muted rounded-lg">
                        <Code className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium">Contribute Code</h4>
                        <p className="text-sm text-muted-foreground">
                          Fix bugs, add features, or improve documentation
                        </p>
                      </div>
                      <span className="hidden sm:inline-flex items-center gap-2">
                        <Github className="h-4 w-4" />
                        PRs
                      </span>
                    </a>

                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                  <ImageWithFallback_DB
                    src="/images/munchie-side.png"
                    alt="Community mascot"
                    className="w-72 sm:w-[200px] h-auto flex-shrink-0 mx-auto sm:mx-0"
                  />
                  <div className="flex-1 w-full flex flex-col justify-center space-y-3 text-left">
                    <h3 className="font-medium">Join the Community</h3>
                    <ul className="text-sm text-muted-foreground space-y-2 text-left list-disc list-inside">
                      <li>Share your 3D printing projects and experiences</li>
                      <li>Get help from fellow makers and developers</li>
                      <li>Suggest new features and improvements</li>
                      <li>Stay updated on the latest releases</li>
                    </ul>
                  </div>
                </div>

                <div className="text-center p-6 bg-gradient-to-r from-primary/5 to-secondary/5 rounded-lg border border-primary/20">
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-primary">Thank you</strong> for using 3D Model Muncher!
                    Your support helps keep this project free and open-source for the entire 3D printing community.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="experimental" className="space-y-6 mt-0">
            <Suspense fallback={<div>Loading experimental features...</div>}>
              <ExperimentalTab categories={categoryManager.localCategories} />
            </Suspense>
          </TabsContent>

          <TabsContent value="migration" className="space-y-6 mt-0">
            <MigrationStatus_DB />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export default SettingsPage_DB;