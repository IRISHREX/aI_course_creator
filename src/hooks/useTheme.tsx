import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type ThemeName = "dark" | "light" | "paper" | "retro";

export const THEMES: { id: ThemeName; label: string; icon: string }[] = [
  { id: "dark", label: "Dark", icon: "🌌" },
  { id: "light", label: "Light", icon: "☀️" },
  { id: "paper", label: "Paper", icon: "📜" },
  { id: "retro", label: "Retro", icon: "🖥️" },
];

const KEY = "signal-theme";

interface Ctx { theme: ThemeName; setTheme: (t: ThemeName) => void }
const ThemeContext = createContext<Ctx>({ theme: "dark", setTheme: () => {} });

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem(KEY) as ThemeName) || "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme: setThemeState }}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
