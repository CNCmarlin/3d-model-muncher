import { Category } from "./category";

export interface IntegrationSettings {
  spoolman?: {
    url?: string;
  };
  thingiverse?: {
    token?: string;
  };
  // [NEW] Unified AI Provider Selection
  ai?: {
    provider?: 'google' | 'openai' | 'ollama' | 'none';
  };
    google?: {
      provider?: 'vertex' | 'studio';
      apiKey?: string;
      projectId?: string;
      serviceAccountJson?: string;
    };
    openai?: {
      apiKey?: string;
      model?: string;
    };
    ollama?: {
      url?: string;
      model?: string;
    };
    printer?: {
      type?: 'moonraker' | 'octoprint' | 'bambu';
      url?: string;
      apiKey?: string;
    };
}

export interface AppConfig {
  version: string;
  categories: Category[];
  settings: {
    defaultTheme: "light" | "dark" | "system";
    defaultView: "grid" | "list";
    defaultGridDensity: number;
    defaultModelView: "3d" | "images";
    defaultModelColor?: string;
    primaryColor?: string | null;
    showPrintedBadge?: boolean;
    verboseScanLogs?: boolean;
    modelCardPrimary: 'none' | 'printTime' | 'filamentUsed' | 'fileSize' | 'category' | 'designer' | 'layerHeight' | 'nozzle' | 'price';
    modelCardSecondary: 'none' | 'printTime' | 'filamentUsed' | 'fileSize' | 'category' | 'designer' | 'layerHeight' | 'nozzle' | 'price';
    autoSave: boolean;
    modelDirectory: string;
    gcodeOverwriteBehavior?: 'prompt' | 'overwrite';
    gcodeStorageBehavior?: 'parse-only' | 'save-and-link';
  };
  filters: {
    defaultCategory: string;
    defaultPrintStatus: string;
    defaultLicense: string;
    defaultSortBy?: string;
  };
  integrations?: IntegrationSettings;
  lastModified: string;
}