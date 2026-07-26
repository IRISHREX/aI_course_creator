import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Volume2, Pause, Play, Square, Headphones } from "lucide-react";
import { VoiceSettingsPopover } from "@/components/VoiceSettingsPopover";
import { useVoicePrefs, useSpeechVoices, pickVoice as pickBestVoice, speechLangMap } from "@/lib/voicePrefs";

interface Props {
  /** Plain text to read aloud. */
  text: string;
  lang?: string;
  /** Optional: word currently spoken — emit index. */
  onWordIndex?: (index: number | null) => void;
  autoScroll?: boolean;
  onDone?: () => void;
}

export interface KaraokeReadModeHandle {
  toggleRead: () => void;
  togglePause: () => void;
  pause: () => void;
  resume: () => void;
}

/** Tokenise text into [{word, start}] using char offsets in the original string. */
export function tokenizeWords(text: string): { word: string; start: number; end: number }[] {
  const out: { word: string; start: number; end: number }[] = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(text))) out.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

export const KaraokeReadMode = forwardRef<KaraokeReadModeHandle, Props>(function KaraokeReadMode({ text, lang = "en", onWordIndex, autoScroll = true, onDone }, ref) {
  const voices = useSpeechVoices();
  const [prefs] = useVoicePrefs();
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const utterIdRef = useRef(0);
  const startCharRef = useRef(0);
  const stopRequestedRef = useRef(false);

  const tokens = useMemo(() => tokenizeWords(text), [text]);
  const speechLang = speechLangMap[lang] || lang || "en-US";


  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; window.speechSynthesis.cancel(); };
  }, []);

  useEffect(() => { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }, [prefs]);

  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!supported) return;
    stopRequestedRef.current = true;
    utterIdRef.current += 1;
    window.speechSynthesis.cancel();
    utterRef.current = null;
    setState("idle");
    onWordIndex?.(null);
  }, [supported, text, onWordIndex]);

  const pickVoice = useCallback(() => {
    const selected = voices.find(x => x.voiceURI === prefs.voiceURI);
    if (selected) return selected;
    const lower = speechLang.toLowerCase();
    return voices.find((voice) => voice.lang.toLowerCase() === lower)
      || voices.find((voice) => voice.lang.toLowerCase().startsWith(lower.split("-")[0]))
      || null;
  }, [prefs.voiceURI, speechLang, voices]);

  const startFrom = useCallback((charOffset: number) => {
    if (!supported || !text.trim()) return;
    const utterId = utterIdRef.current + 1;
    utterIdRef.current = utterId;
    stopRequestedRef.current = true;
    window.speechSynthesis.cancel();
    stopRequestedRef.current = false;
    startCharRef.current = charOffset;
    const slice = text.slice(charOffset);
    const u = new SpeechSynthesisUtterance(slice);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v?.lang || speechLang;
    u.rate = prefs.rate;
    u.pitch = prefs.pitch;
    u.onboundary = (ev: SpeechSynthesisEvent) => {
      if (utterIdRef.current !== utterId) return;
      if (ev.name && ev.name !== "word") return;
      const absChar = startCharRef.current + (ev.charIndex || 0);
      // find token whose range contains absChar
      let lo = 0, hi = tokens.length - 1, found = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const t = tokens[mid];
        if (absChar < t.start) hi = mid - 1;
        else if (absChar >= t.end) lo = mid + 1;
        else { found = mid; break; }
      }
      if (found === -1) {
        // fallback: nearest >= absChar
        for (let i = 0; i < tokens.length; i++) if (tokens[i].start >= absChar) { found = i; break; }
      }
      const wordIndex = found >= 0 ? found : null;
      onWordIndex?.(wordIndex);
      if (autoScroll && wordIndex !== null) {
        window.requestAnimationFrame(() => {
          document.querySelector(`[data-w="${wordIndex}"]`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        });
      }
    };
    u.onend = () => {
      if (utterIdRef.current !== utterId) return;
      const wasStopped = stopRequestedRef.current;
      setState("idle");
      onWordIndex?.(null);
      if (!wasStopped) onDone?.();
    };
    u.onerror = () => {
      if (utterIdRef.current !== utterId) return;
      setState("idle");
      onWordIndex?.(null);
    };
    utterRef.current = u;
    window.setTimeout(() => {
      if (utterIdRef.current !== utterId) return;
      window.speechSynthesis.speak(u);
      setState("playing");
    }, 40);
  }, [autoScroll, onDone, onWordIndex, pickVoice, prefs.pitch, prefs.rate, speechLang, supported, text, tokens]);

  const start = useCallback(() => startFrom(0), [startFrom]);

  /** Public: jump to word index */
  const seekTo = useCallback((wordIdx: number) => {
    const t = tokens[wordIdx];
    if (!t) return;
    startFrom(t.start);
  }, [startFrom, tokens]);

  // Expose seek through a custom event so non-React code (renderer) can trigger it
  useEffect(() => {
    const handler = (e: Event) => {
      const idx = (e as CustomEvent<number>).detail;
      if (typeof idx === "number") seekTo(idx);
    };
    window.addEventListener("karaoke:seek", handler as EventListener);
    return () => window.removeEventListener("karaoke:seek", handler as EventListener);
  }, [seekTo]);

  const togglePause = useCallback(() => {
    if (!supported) return;
    if (state === "playing") { window.speechSynthesis.pause(); setState("paused"); }
    else if (state === "paused") { window.speechSynthesis.resume(); setState("playing"); }
  }, [state, supported]);

  const stop = useCallback(() => {
    if (!supported) return;
    stopRequestedRef.current = true;
    utterIdRef.current += 1;
    window.speechSynthesis.cancel();
    utterRef.current = null;
    setState("idle");
    onWordIndex?.(null);
  }, [onWordIndex, supported]);

  const toggleRead = useCallback(() => {
    if (!supported) return;
    if (state === "idle") start();
    else stop();
  }, [start, state, stop, supported]);

  useImperativeHandle(ref, () => ({
    toggleRead,
    togglePause,
    pause: () => {
      if (!supported || state !== "playing") return;
      window.speechSynthesis.pause();
      setState("paused");
    },
    resume: () => {
      if (!supported || state !== "paused") return;
      window.speechSynthesis.resume();
      setState("playing");
    },
  }), [state, supported, togglePause, toggleRead]);

  if (!supported) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Headphones className="h-3.5 w-3.5" /> Read mode not supported in this browser
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {state === "idle" ? (
        <Button variant="neon" size="sm" onClick={start} disabled={!text.trim()} title="Read aloud (click any word to jump)" className="px-2 sm:px-3">
          <Volume2 className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Read</span>
        </Button>
      ) : (
        <>
          <Button variant="neon" size="sm" onClick={togglePause}>
            {state === "playing" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={stop}><Square className="h-4 w-4" /></Button>
        </>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" title="Voice settings"><Settings2 className="h-4 w-4" /></Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="end">
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Voice</Label>
              <Select value={prefs.voiceURI || ""} onValueChange={v => setPrefs({ ...prefs, voiceURI: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="System default" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {voices.map(v => (
                    <SelectItem key={v.voiceURI} value={v.voiceURI}>
                      {v.name} <span className="text-muted-foreground">({v.lang})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs flex justify-between"><span>Speed</span><span className="font-mono text-primary">{prefs.rate.toFixed(2)}x</span></Label>
              <Slider min={0.5} max={2} step={0.05} value={[prefs.rate]} onValueChange={v => setPrefs({ ...prefs, rate: v[0] })} className="mt-2" />
            </div>
            <div>
              <Label className="text-xs flex justify-between"><span>Pitch</span><span className="font-mono text-primary">{prefs.pitch.toFixed(2)}</span></Label>
              <Slider min={0.5} max={2} step={0.05} value={[prefs.pitch]} onValueChange={v => setPrefs({ ...prefs, pitch: v[0] })} className="mt-2" />
            </div>
            <p className="text-[10px] text-muted-foreground">Tip: click any highlighted word to start reading from there.</p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
});

/** Helper: dispatch a seek to a global karaoke instance */
export function karaokeSeek(wordIdx: number) {
  window.dispatchEvent(new CustomEvent("karaoke:seek", { detail: wordIdx }));
}
