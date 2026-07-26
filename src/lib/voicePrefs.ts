import { useEffect, useState } from "react";

export const VOICE_PREFS_KEY = "signal-tts-prefs";

export interface VoicePrefs {
  voiceURI?: string;
  rate: number;
  pitch: number;
}

export const DEFAULT_VOICE_PREFS: VoicePrefs = { rate: 1, pitch: 1 };

export const speechLangMap: Record<string, string> = {
  en: "en-US", bn: "bn-BD", hi: "hi-IN", ur: "ur-PK", ar: "ar-SA", zh: "zh-CN",
  ja: "ja-JP", ko: "ko-KR", fr: "fr-FR", es: "es-ES", de: "de-DE", pt: "pt-PT",
  ru: "ru-RU", ta: "ta-IN", te: "te-IN", mr: "mr-IN",
};

function loadPrefs(): VoicePrefs {
  if (typeof window === "undefined") return { ...DEFAULT_VOICE_PREFS };
  try {
    return { ...DEFAULT_VOICE_PREFS, ...JSON.parse(localStorage.getItem(VOICE_PREFS_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_VOICE_PREFS };
  }
}

const listeners = new Set<(p: VoicePrefs) => void>();
let current: VoicePrefs = loadPrefs();

export function getVoicePrefs() { return current; }
export function setVoicePrefsGlobal(p: VoicePrefs) {
  current = p;
  try { localStorage.setItem(VOICE_PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
  listeners.forEach((l) => l(p));
}

/** Shared reactive prefs — updates propagate to every component using the hook. */
export function useVoicePrefs(): [VoicePrefs, (p: VoicePrefs) => void] {
  const [prefs, setPrefs] = useState<VoicePrefs>(current);
  useEffect(() => {
    const l = (p: VoicePrefs) => setPrefs(p);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return [prefs, setVoicePrefsGlobal];
}

/** Shared voices list — kept in sync with speechSynthesis. */
export function useSpeechVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() =>
    typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis.getVoices() : [],
  );
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    let cancelled = false;
    const load = () => {
      if (cancelled) return;
      const list = window.speechSynthesis.getVoices();
      setVoices((prev) => (prev.length === list.length ? prev : list));
    };
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
    window.speechSynthesis.onvoiceschanged = load;
    // Some browsers (Chrome) populate voices lazily — poll briefly until we get them.
    const timers: number[] = [];
    [100, 300, 700, 1500, 3000].forEach((ms) => timers.push(window.setTimeout(load, ms)));
    return () => {
      cancelled = true;
      window.speechSynthesis.removeEventListener?.("voiceschanged", load);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);
  return voices;
}


export function pickVoice(voices: SpeechSynthesisVoice[], prefs: VoicePrefs, lang: string) {
  const speechLang = speechLangMap[lang] || lang || "en-US";
  const selected = voices.find((v) => v.voiceURI === prefs.voiceURI);
  if (selected) return selected;
  const lower = speechLang.toLowerCase();
  return (
    voices.find((v) => v.lang.toLowerCase() === lower) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(lower.split("-")[0])) ||
    null
  );
}
