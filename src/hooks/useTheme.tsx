import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { applyCustomTheme } from "@/lib/appSettings";

export type ThemeName = "dark" | "light" | "paper" | "retro";

export const THEMES: { id: ThemeName; label: string; icon: string }[] = [
  { id: "paper", label: "Paper", icon: "Paper" },
  { id: "dark", label: "Dark", icon: "Dark" },
  { id: "light", label: "Light", icon: "Light" },
  { id: "retro", label: "Retro", icon: "Retro" },
];

const KEY = "signal-theme";

interface Ctx {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
}

const ThemeContext = createContext<Ctx>({ theme: "paper", setTheme: () => {} });

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    if (typeof window === "undefined") return "paper";
    return (localStorage.getItem(KEY) as ThemeName) || "paper";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    localStorage.setItem(KEY, theme);
    applyCustomTheme();
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme: setThemeState }}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
