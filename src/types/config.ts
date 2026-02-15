import { Category } from "./category";

export interface PrinterConfig {
  type: 'moonraker' | 'octoprint' | 'bambu';
  url: string;
  apiKey?: string;
  color?: string; // Icon color
  name?: string;  // Optional custom name
  enabled?: boolean;
}

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
  printers?: PrinterConfig[];

  // [DEPRECATED] Legacy single printer support (keep for safe migration)
  printer?: PrinterConfig;
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
    scanStrategy: 'smart' | 'strict' | 'top-level';
    modelCardPrimary: 'none' | 'printTime' | 'filamentUsed' | 'fileSize' | 'category' | 'designer' | 'layerHeight' | 'nozzle' | 'price';
    modelCardSecondary: 'none' | 'printTime' | 'filamentUsed' | 'fileSize' | 'category' | 'designer' | 'layerHeight' | 'nozzle' | 'price';
    modelCardTertiary: 'none' | 'printTime' | 'filamentUsed' | 'fileSize' | 'category' | 'designer' | 'layerHeight' | 'nozzle' | 'price';
    autoSave: boolean;
    modelDirectory: string;
    gcodeOverwriteBehavior?: 'prompt' | 'overwrite';
    gcodeStorageBehavior?: 'parse-only' | 'save-and-link';
    useDatabaseBackend?: boolean; // Phase 3: Dual-Running Feature Flag
    alwaysMoveFiles?: boolean; // If true, always move files on collection change without asking.
    onboardingCompleted?: boolean;
  };
  filters: {
    defaultCategory: string;
    defaultPrintStatus: string;
    defaultLicense: string;
    defaultSortBy?: string;
  };
  integrations?: IntegrationSettings;
  lastModified: string;
  lastRunTimestamps?: Record<string, string>; // key → ISO date string (e.g. "generateThumbnails" → "2026-02-14T...")
}