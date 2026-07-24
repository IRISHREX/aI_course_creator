export type LessonLanguage = {
  code: string;
  label: string;
  nativeLabel: string;
  dir?: "ltr" | "rtl";
};

export type LessonTranslation = {
  languageCode: string;
  languageName: string;
  dir?: "ltr" | "rtl";
  title: string;
  summary: string;
  content: any[];
  quiz?: any[];
  generatedAt?: string;
};

export const LESSON_LANGUAGES: LessonLanguage[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "bn", label: "Bangla", nativeLabel: "বাংলা" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी" },
  { code: "ur", label: "Urdu", nativeLabel: "اردو", dir: "rtl" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", dir: "rtl" },
  { code: "zh", label: "Chinese", nativeLabel: "中文" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語" },
  { code: "ko", label: "Korean", nativeLabel: "한국어" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português" },
  { code: "ru", label: "Russian", nativeLabel: "Русский" },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்" },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు" },
  { code: "mr", label: "Marathi", nativeLabel: "मराठी" },
];

export function languageByCode(code?: string) {
  return LESSON_LANGUAGES.find((language) => language.code === code) || LESSON_LANGUAGES[0];
}

export function normalizeTranslations(value: unknown): LessonTranslation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Partial<LessonTranslation>;
      const language = languageByCode(raw.languageCode);
      const code = typeof raw.languageCode === "string" && raw.languageCode ? raw.languageCode : language.code;
      if (code === "en") return null;
      return {
        languageCode: code,
        languageName: typeof raw.languageName === "string" && raw.languageName ? raw.languageName : language.label,
        dir: raw.dir || language.dir || "ltr",
        title: typeof raw.title === "string" ? raw.title : "",
        summary: typeof raw.summary === "string" ? raw.summary : "",
        content: Array.isArray(raw.content) ? raw.content : [],
        quiz: Array.isArray(raw.quiz) ? raw.quiz : undefined,
        generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : undefined,
      };
    })
    .filter((item): item is LessonTranslation => Boolean(item && item.title && item.content.length));
}
