import { useEffect, useState } from "react";

export type ThreePositionPreset = "left" | "right" | "top" | "bottom" | "custom";
export type LessonVisualStyle = "terrain" | "particles" | "orbit";

export type AppSettings = {
  profile: {
    displayName: string;
    title: string;
    bio: string;
  };
  customTheme: {
    enabled: boolean;
    primary: string;
    secondary: string;
    background: string;
    foreground: string;
    card: string;
  };
  threeD: {
    enabled: boolean;
    speed: number;
    opacity: number;
    position: ThreePositionPreset;
    vector: { x: number; y: number; z: number };
  };
  ai: {
    coursePrompt: string;
    lessonPrompt: string;
    optimizationPrompt: string;
  };
};

export type CourseSettings = {
  generationPrompt: string;
  lessonPrompt: string;
  duplicateCleanupPrompt: string;
  threeDEnabled: boolean;
  threeDSpeed: number;
  lessonGraphicsEnabled: boolean;
  lessonVisualStyle: LessonVisualStyle;
  lessonSoundsEnabled: boolean;
  quizEnhanced: boolean;
};

const APP_SETTINGS_KEY = "signal.admin.settings";
const COURSE_SETTINGS_PREFIX = "signal.course.settings.";
const SETTINGS_EVENT = "signal:settings";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  profile: {
    displayName: "",
    title: "Course admin",
    bio: "",
  },
  customTheme: {
    enabled: false,
    primary: "#22d3ee",
    secondary: "#a855f7",
    background: "#080b16",
    foreground: "#f2fbff",
    card: "#101423",
  },
  threeD: {
    enabled: true,
    speed: 1,
    opacity: 1,
    position: "custom",
    vector: { x: 0, y: 0, z: -1 },
  },
  ai: {
    coursePrompt: "",
    lessonPrompt: "",
    optimizationPrompt: "Avoid repeating concept explanations across lessons in the same unit. Keep each lesson focused and non-overlapping.",
  },
};

export const DEFAULT_COURSE_SETTINGS: CourseSettings = {
  generationPrompt: "",
  lessonPrompt: "",
  duplicateCleanupPrompt: "",
  threeDEnabled: true,
  threeDSpeed: 1,
  lessonGraphicsEnabled: true,
  lessonVisualStyle: "terrain",
  lessonSoundsEnabled: true,
  quizEnhanced: true,
};

function mergeAppSettings(value: Partial<AppSettings>): AppSettings {
  return {
    profile: { ...DEFAULT_APP_SETTINGS.profile, ...(value.profile || {}) },
    customTheme: { ...DEFAULT_APP_SETTINGS.customTheme, ...(value.customTheme || {}) },
    threeD: {
      ...DEFAULT_APP_SETTINGS.threeD,
      ...(value.threeD || {}),
      vector: { ...DEFAULT_APP_SETTINGS.threeD.vector, ...(value.threeD?.vector || {}) },
    },
    ai: { ...DEFAULT_APP_SETTINGS.ai, ...(value.ai || {}) },
  };
}

export function getAppSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_APP_SETTINGS;
  try {
    return mergeAppSettings(JSON.parse(localStorage.getItem(APP_SETTINGS_KEY) || "{}"));
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function setAppSettings(settings: AppSettings) {
  localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event(SETTINGS_EVENT));
  applyCustomTheme(settings);
}

export function useAppSettings() {
  const [settings, setSettingsState] = useState(getAppSettings);
  useEffect(() => {
    const refresh = () => setSettingsState(getAppSettings());
    window.addEventListener(SETTINGS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  const update = (next: AppSettings) => {
    setSettingsState(next);
    setAppSettings(next);
  };
  return [settings, update] as const;
}

export function getCourseSettings(courseId?: string): CourseSettings {
  if (!courseId || typeof window === "undefined") return DEFAULT_COURSE_SETTINGS;
  try {
    return { ...DEFAULT_COURSE_SETTINGS, ...JSON.parse(localStorage.getItem(`${COURSE_SETTINGS_PREFIX}${courseId}`) || "{}") };
  } catch {
    return DEFAULT_COURSE_SETTINGS;
  }
}

export function setCourseSettings(courseId: string, settings: CourseSettings) {
  localStorage.setItem(`${COURSE_SETTINGS_PREFIX}${courseId}`, JSON.stringify(settings));
  window.dispatchEvent(new Event(SETTINGS_EVENT));
}

export function useCourseSettings(courseId?: string) {
  const [settings, setSettingsState] = useState(() => getCourseSettings(courseId));
  useEffect(() => {
    const refresh = () => setSettingsState(getCourseSettings(courseId));
    refresh();
    window.addEventListener(SETTINGS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [courseId]);
  const update = (next: CourseSettings) => {
    setSettingsState(next);
    if (courseId) setCourseSettings(courseId, next);
  };
  return [settings, update] as const;
}

function hexToHsl(hex: string) {
  const normalized = hex.replace("#", "");
  const bigint = parseInt(normalized.length === 3 ? normalized.split("").map(ch => ch + ch).join("") : normalized, 16);
  const r = ((bigint >> 16) & 255) / 255;
  const g = ((bigint >> 8) & 255) / 255;
  const b = (bigint & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function applyCustomTheme(settings = getAppSettings()) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!settings.customTheme.enabled) {
    ["--primary", "--secondary", "--background", "--foreground", "--card"].forEach((name) => root.style.removeProperty(name));
    return;
  }
  root.style.setProperty("--primary", hexToHsl(settings.customTheme.primary));
  root.style.setProperty("--secondary", hexToHsl(settings.customTheme.secondary));
  root.style.setProperty("--background", hexToHsl(settings.customTheme.background));
  root.style.setProperty("--foreground", hexToHsl(settings.customTheme.foreground));
  root.style.setProperty("--card", hexToHsl(settings.customTheme.card));
}
