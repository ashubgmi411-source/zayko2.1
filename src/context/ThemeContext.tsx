/**
 * ThemeContext — Multi-theme state management for user section
 *
 * Features:
 * - 6 premium themes (dark, light, midnight, cyberpunk, minimal, canteen)
 * - localStorage persistence
 * - Time-based auto theme switching (optional)
 * - Scoped via data-theme attribute (doesn't affect admin/stock/executive)
 * - Minimal re-renders via memoized context value
 */

"use client";
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";

// ── Theme types ──────────────────────────────────────────
export type Theme = "dark" | "light" | "midnight" | "cyberpunk" | "minimal" | "canteen";

export interface ThemeConfig {
  id: Theme;
  name: string;
  icon: string;
  description: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    card: string;
  };
}

export const THEMES: ThemeConfig[] = [
  {
    id: "dark",
    name: "Dark",
    icon: "🌙",
    description: "Premium dark interface",
    colors: { primary: "#0B1220", secondary: "#101c2e", accent: "#fbbf24", card: "#162342" },
  },
  {
    id: "light",
    name: "Light",
    icon: "☀️",
    description: "Clean & bright",
    colors: { primary: "#f8fafc", secondary: "#ffffff", accent: "#2563eb", card: "#ffffff" },
  },
  {
    id: "midnight",
    name: "Midnight",
    icon: "🔮",
    description: "Deep indigo cosmos",
    colors: { primary: "#0c0a1d", secondary: "#13102a", accent: "#a78bfa", card: "#1a1640" },
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    icon: "⚡",
    description: "Neon-lit future",
    colors: { primary: "#0a0a0a", secondary: "#111111", accent: "#00ff88", card: "#161616" },
  },
  {
    id: "minimal",
    name: "Minimal",
    icon: "✨",
    description: "Soft & distraction-free",
    colors: { primary: "#fafaf9", secondary: "#ffffff", accent: "#1c1917", card: "#ffffff" },
  },
  {
    id: "canteen",
    name: "Canteen",
    icon: "🍕",
    description: "Warm food-inspired",
    colors: { primary: "#1a0f07", secondary: "#241508", accent: "#ea580c", card: "#2a1c0e" },
  },
];

// ── Context shape ────────────────────────────────────────
interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isPanelOpen: boolean;
  togglePanel: () => void;
  closePanel: () => void;
  autoTheme: boolean;
  setAutoTheme: (v: boolean) => void;
  themeConfig: ThemeConfig;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const STORAGE_KEY = "zayko-user-theme";
const AUTO_THEME_KEY = "zayko-auto-theme";

// ── Helper: get theme from time of day ───────────────────
function getTimeBasedTheme(): Theme {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 19) return "light";
  return "dark";
}

// ── Provider ─────────────────────────────────────────────
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [autoTheme, setAutoThemeState] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      const storedAuto = localStorage.getItem(AUTO_THEME_KEY) === "true";

      if (storedAuto) {
        setAutoThemeState(true);
        setThemeState(getTimeBasedTheme());
      } else if (stored && THEMES.some((t) => t.id === stored)) {
        setThemeState(stored);
      }
    } catch {
      // SSR or localStorage unavailable
    }
    setMounted(true);
  }, []);

  // Auto-theme interval
  useEffect(() => {
    if (!autoTheme) return;

    const checkTheme = () => setThemeState(getTimeBasedTheme());
    checkTheme();
    const interval = setInterval(checkTheme, 60_000); // check every minute
    return () => clearInterval(interval);
  }, [autoTheme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    setAutoThemeState(false);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
      localStorage.setItem(AUTO_THEME_KEY, "false");
    } catch {
      // noop
    }
  }, []);

  const setAutoTheme = useCallback((v: boolean) => {
    setAutoThemeState(v);
    try {
      localStorage.setItem(AUTO_THEME_KEY, String(v));
      if (v) {
        const timeTheme = getTimeBasedTheme();
        setThemeState(timeTheme);
        localStorage.setItem(STORAGE_KEY, timeTheme);
      }
    } catch {
      // noop
    }
  }, []);

  const togglePanel = useCallback(() => setIsPanelOpen((p) => !p), []);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);

  const themeConfig = useMemo(
    () => THEMES.find((t) => t.id === theme) || THEMES[0],
    [theme]
  );

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      isPanelOpen,
      togglePanel,
      closePanel,
      autoTheme,
      setAutoTheme,
      themeConfig,
    }),
    [theme, setTheme, isPanelOpen, togglePanel, closePanel, autoTheme, setAutoTheme, themeConfig]
  );

  return (
    <ThemeContext.Provider value={value}>
      <div
        data-theme={mounted ? theme : "dark"}
        className={`min-h-screen ${mounted ? "theme-transition" : ""} ${theme === "cyberpunk" && mounted ? "cyberpunk-scanline" : ""}`}
        style={{
          backgroundColor: mounted ? "var(--theme-bg-primary)" : "#0B1220",
          color: mounted ? "var(--theme-text-primary)" : "#f1f5f9",
        }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────
export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
