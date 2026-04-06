import { ConfigManager } from "@/utils/configManager";
import { useContext, useEffect, useState } from "react";
import { ThemeProviderContext } from "./ThemeProvider";

const UI_PREFS_KEY = '3d-model-muncher-ui-prefs';

function loadUiPrefs(): any {
  try {
    const raw = localStorage.getItem(UI_PREFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[ThemeProvider_DB] Failed to load UI prefs:', err);
    return {};
  }
}

function saveUiPrefs(prefs: any) {
  try {
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
  } catch (err) {
    console.warn('[ThemeProvider_DB] Failed to save UI prefs:', err);
  }
}

type Theme = "light" | "dark" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
};

/**
 * Database ThemeProvider — full independent copy.
 * Shares the React context object with ThemeProvider so hooks work
 * regardless of which provider the ContextRouter mounts.
 * Diverge this implementation freely for DB-specific theme logic.
 */
export function ThemeProvider_DB({
  children,
  defaultTheme = "system",
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const prefs = loadUiPrefs();
      if (prefs && (prefs.defaultTheme === 'light' || prefs.defaultTheme === 'dark' || prefs.defaultTheme === 'system')) {
        return prefs.defaultTheme as Theme;
      }
    } catch (e) {
      console.warn('[ThemeProvider_DB] Error reading UI prefs on init', e);
    }

    const savedTheme = ConfigManager.getSetting("theme", defaultTheme) as Theme;
    return savedTheme;
  });

  // On mount, if UI prefs are not present, prefer server-backed config
  useEffect(() => {
    let cancelled = false;

    try {
      const prefs = loadUiPrefs();
      if (prefs && (prefs.defaultTheme === 'light' || prefs.defaultTheme === 'dark' || prefs.defaultTheme === 'system')) {
        console.debug('[ThemeProvider_DB] UI prefs found on mount, using', prefs.defaultTheme);
        return;
      }
    } catch (err) {
      console.warn('[ThemeProvider_DB] Error reading UI prefs on mount', err);
    }

    // If no UI prefs, try localStorage global config first
    try {
      const raw = localStorage.getItem('3d-model-muncher-config');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const serverTheme = parsed?.settings?.defaultTheme;
          if (serverTheme && (serverTheme === 'light' || serverTheme === 'dark' || serverTheme === 'system')) {
            console.debug('[ThemeProvider_DB] Found localStorage global config on mount, applying theme=', serverTheme);
            if (!cancelled) setTheme(serverTheme as Theme);
            return;
          }
        } catch (e) {
          console.warn('[ThemeProvider_DB] Failed to parse localStorage global config:', e);
        }
      }
    } catch (err) {
      console.warn('[ThemeProvider_DB] Error accessing localStorage global config:', err);
    }

    // As a last resort, attempt to fetch server config
    (async () => {
      try {
        const resp = await fetch('/api/load-config');
        if (!resp.ok) {
          console.debug('[ThemeProvider_DB] /api/load-config not available, status=', resp.status);
          return;
        }
        const data = await resp.json();
        if (data && data.success && data.config) {
          const serverTheme = data.config?.settings?.defaultTheme;
          if (serverTheme && (serverTheme === 'light' || serverTheme === 'dark' || serverTheme === 'system')) {
            console.debug('[ThemeProvider_DB] Loaded server config on mount, applying serverTheme=', serverTheme);
            if (!cancelled) setTheme(serverTheme as Theme);
          }
        }
      } catch (err) {
        console.warn('[ThemeProvider_DB] Failed to fetch /api/load-config on mount:', err);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  const value = {
    theme,
    setTheme: (newTheme: Theme) => {
      try {
        const prefs = loadUiPrefs();
        prefs.defaultTheme = newTheme;
        saveUiPrefs(prefs);
      } catch (err) {
        console.warn('[ThemeProvider_DB] Failed to persist theme to UI prefs:', err);
      }
      setTheme(newTheme);
    },
  };

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider_DB");

  return context;
};
