import { useState, useEffect, useCallback } from "react";

export interface ThemeConfig {
  id: string;
  label: string;
  hueRotate: number;
  dotColor: string;
}

export const THEMES: ThemeConfig[] = [
  { id: "command", label: "Command", hueRotate: 0, dotColor: "#f59e0b" },
  { id: "arctic", label: "Arctic", hueRotate: 185, dotColor: "#38bdf8" },
  { id: "emerald", label: "Emerald", hueRotate: 120, dotColor: "#34d399" },
  { id: "crimson", label: "Crimson", hueRotate: -25, dotColor: "#fb7185" },
  { id: "nebula", label: "Nebula", hueRotate: 230, dotColor: "#a78bfa" },
  { id: "solar", label: "Solar", hueRotate: 15, dotColor: "#fb923c" },
];

const STORAGE_KEY = "data-theme";

function getInitialTheme(): ThemeConfig {
  if (typeof window === "undefined") return THEMES[0];
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const found = THEMES.find((t) => t.id === stored);
    if (found) return found;
  }
  return THEMES[0];
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeConfig>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme.id);
    localStorage.setItem(STORAGE_KEY, theme.id);
  }, [theme]);

  const setTheme = useCallback((id: string) => {
    const found = THEMES.find((t) => t.id === id);
    if (found) setThemeState(found);
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((current) => {
      const idx = THEMES.findIndex((t) => t.id === current.id);
      return THEMES[(idx + 1) % THEMES.length];
    });
  }, []);

  return { theme, setTheme, cycleTheme, themes: THEMES };
}
