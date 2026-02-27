import { useState, useEffect, useCallback } from "react";

export interface ThemeConfig {
  id: string;
  label: string;
  hueRotate: number;
  dotColor: string;
  accentClass: string;
  accentBorder: string;
  accentText: string;
  accentBg: string;
}

export const THEMES: ThemeConfig[] = [
  {
    id: "command", label: "Command", hueRotate: 0, dotColor: "#00d4ec",
    accentClass: "text-cyan-400", accentBorder: "border-cyan-500/8",
    accentText: "text-cyan-300/70", accentBg: "bg-cyan-500/10",
  },
  {
    id: "arctic", label: "Arctic", hueRotate: 0, dotColor: "#38bdf8",
    accentClass: "text-sky-400", accentBorder: "border-sky-500/12",
    accentText: "text-sky-300/80", accentBg: "bg-sky-500/12",
  },
  {
    id: "emerald", label: "Emerald", hueRotate: 0, dotColor: "#10e68c",
    accentClass: "text-emerald-400", accentBorder: "border-emerald-500/12",
    accentText: "text-emerald-300/80", accentBg: "bg-emerald-500/12",
  },
  {
    id: "crimson", label: "Crimson", hueRotate: 0, dotColor: "#ff5064",
    accentClass: "text-rose-400", accentBorder: "border-rose-500/12",
    accentText: "text-rose-300/80", accentBg: "bg-rose-500/12",
  },
  {
    id: "nebula", label: "Nebula", hueRotate: 0, dotColor: "#a878ff",
    accentClass: "text-violet-400", accentBorder: "border-violet-500/12",
    accentText: "text-violet-300/80", accentBg: "bg-violet-500/12",
  },
  {
    id: "solar", label: "Solar", hueRotate: 0, dotColor: "#ffa01e",
    accentClass: "text-amber-400", accentBorder: "border-amber-500/12",
    accentText: "text-amber-300/80", accentBg: "bg-amber-500/12",
  },
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
