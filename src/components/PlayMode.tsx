import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, X, ChevronLeft, ChevronRight, Volume2, VolumeX, Repeat, Repeat1, Maximize2, Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BlockRenderer, blockToText, countWords } from "@/components/BlockRenderer";
import ThreePageBackground from "@/components/ThreePageBackground";
import { tokenizeWords } from "@/components/KaraokeReadMode";
import { VoiceSettingsPopover } from "@/components/VoiceSettingsPopover";
import { useVoicePrefs, useSpeechVoices, pickVoice, speechLangMap } from "@/lib/voicePrefs";
import { cn } from "@/lib/utils";

interface Slide { blocks: any[] }

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  slides: Slide[];
  lang?: string;
  dir?: "ltr" | "rtl";
  initialIndex?: number;
}

export function PlayMode({ open, onClose, title, subtitle, slides, lang = "en", dir = "ltr", initialIndex = 0 }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState<"off" | "one" | "all">("off");
  const [prefs] = useVoicePrefs();
  const voices = useSpeechVoices();
  const [activeWord, setActiveWord] = useState<number | null>(null);
  const [isFullscreen, setFullscreen] = useState(false);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const utterIdRef = useRef(0);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const total = slides.length;
  const slide = slides[index];
  const slideText = useMemo(() => (slide?.blocks || []).map(blockToText).filter(Boolean).join(". "), [slide]);
  const tokens = useMemo(() => tokenizeWords(slideText), [slideText]);

  useEffect(() => { if (open) setIndex(Math.min(initialIndex, Math.max(0, total - 1))); }, [open, initialIndex, total]);


  const stopSpeech = useCallback(() => {
    if (!supported) return;
    utterIdRef.current += 1;
    window.speechSynthesis.cancel();
    setActiveWord(null);
  }, [supported]);

  const speakSlide = useCallback((onFinish?: () => void) => {
    if (!supported || muted || !slideText.trim()) { onFinish?.(); return; }
    const speechLang = speechLangMap[lang] || lang || "en-US";
    const id = ++utterIdRef.current;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(slideText);
    const voice = voices.find(v => v.voiceURI === prefs.voiceURI)
      || voices.find(v => v.lang.toLowerCase().startsWith(speechLang.toLowerCase().split("-")[0]));
    if (voice) u.voice = voice;
    u.lang = voice?.lang || speechLang;
    u.rate = prefs.rate;
    u.pitch = prefs.pitch;
    u.onboundary = (ev) => {
      if (utterIdRef.current !== id) return;
      if (ev.name && ev.name !== "word") return;
      const ci = ev.charIndex || 0;
      let found = -1;
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (ci >= t.start && ci < t.end) { found = i; break; }
        if (t.start > ci) { found = i; break; }
      }
      setActiveWord(found >= 0 ? found : null);
    };
    u.onend = () => { if (utterIdRef.current === id) { setActiveWord(null); onFinish?.(); } };
    u.onerror = () => { if (utterIdRef.current === id) { setActiveWord(null); onFinish?.(); } };
    window.setTimeout(() => { if (utterIdRef.current === id) window.speechSynthesis.speak(u); }, 40);
  }, [lang, muted, prefs.pitch, prefs.rate, prefs.voiceURI, slideText, supported, tokens, voices]);

  const advance = useCallback(() => {
    setIndex((i) => {
      if (i < total - 1) return i + 1;
      if (loop === "all") return 0;
      return i;
    });
  }, [loop, total]);

  // Playback engine
  useEffect(() => {
    if (!open || !playing) { stopSpeech(); return; }
    let cancelled = false;
    let timer: number | null = null;
    const run = () => {
      speakSlide(() => {
        if (cancelled) return;
        if (loop === "one") { timer = window.setTimeout(run, 400); return; }
        if (index >= total - 1 && loop !== "all") { setPlaying(false); return; }
        timer = window.setTimeout(() => { if (!cancelled) advance(); }, 500);
      });
    };
    run();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); stopSpeech(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, playing, index, loop, muted, prefs.rate, prefs.pitch, prefs.voiceURI, slideText]);

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setIndex((i) => Math.min(total - 1, i + 1)), [total]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === " " || e.key.toLowerCase() === "p") { e.preventDefault(); setPlaying(p => !p); }
      else if (e.key.toLowerCase() === "m") setMuted(m => !m);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, goNext, goPrev]);

  useEffect(() => { if (!open) { setPlaying(false); stopSpeech(); } }, [open, stopSpeech]);

  const toggleFullscreen = async () => {
    const el = rootRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) { await el.requestFullscreen(); setFullscreen(true); }
      else { await document.exitFullscreen(); setFullscreen(false); }
    } catch { /* no-op */ }
  };

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]; touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchRef.current; if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { dx < 0 ? goNext() : goPrev(); }
    else if (dy < -80 && Math.abs(dy) > Math.abs(dx)) { onClose(); }
    touchRef.current = null;
  };

  if (!open || typeof document === "undefined") return null;

  const progress = total ? ((index + 1) / total) * 100 : 0;

  return createPortal(
    <div
      ref={rootRef}
      className="fixed inset-0 z-[100] flex flex-col bg-[#05070d] text-foreground"
      role="dialog"
      aria-modal="true"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      dir={dir}
    >
      {/* Ambient 3D background */}
      <ThreePageBackground className="opacity-70" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.55)_70%,rgba(0,0,0,0.85)_100%)]" />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2 sm:px-6">
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-sm font-semibold tracking-wide text-white/90 sm:text-base">{title}</div>
          {subtitle && <div className="truncate text-[11px] text-white/50">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9 text-white/70 hover:text-white" onClick={toggleFullscreen} aria-label="Toggle fullscreen">
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 text-white/70 hover:text-white" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative z-10 mx-4 h-1 overflow-hidden rounded-full bg-white/10 sm:mx-8">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
      </div>

      {/* Slide stage */}
      <div className="relative z-10 flex flex-1 items-center justify-center overflow-hidden px-3 py-4 sm:px-10 sm:py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.98 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto w-full max-w-4xl"
          >
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_30px_100px_-30px_rgba(0,0,0,0.7)] backdrop-blur-2xl sm:p-8 md:p-12">
              <div className="mb-3 text-[10px] font-mono uppercase tracking-[0.3em] text-primary/70">
                Slide {index + 1} / {total}
              </div>
              <div className="max-h-[62vh] space-y-5 overflow-y-auto pr-1 sm:max-h-[68vh]">
                {slide?.blocks?.map((b, i) => {
                  let off = 0;
                  for (let k = 0; k < i; k++) off += countWords(blockToText(slide.blocks[k]));
                  return <BlockRenderer key={i} block={b} wordOffset={off} activeWordIndex={activeWord} />;
                })}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Side arrows (desktop) */}
        <button
          onClick={goPrev}
          disabled={index === 0}
          className={cn("absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full border border-white/10 bg-black/40 p-3 text-white/80 backdrop-blur transition hover:bg-white/10 hover:text-white sm:block", index === 0 && "opacity-30")}
          aria-label="Previous slide"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={goNext}
          disabled={index >= total - 1}
          className={cn("absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full border border-white/10 bg-black/40 p-3 text-white/80 backdrop-blur transition hover:bg-white/10 hover:text-white sm:block", index >= total - 1 && "opacity-30")}
          aria-label="Next slide"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Bottom control bar */}
      <div className="relative z-10 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-1.5 rounded-full border border-white/10 bg-black/50 p-1.5 shadow-2xl backdrop-blur-xl sm:gap-2 sm:p-2">
          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-white/80 hover:text-white sm:hidden" onClick={goPrev} disabled={index === 0} aria-label="Previous">
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full bg-primary/90 text-primary-foreground hover:bg-primary"
            onClick={() => setPlaying(p => !p)}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </Button>

          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-white/80 hover:text-white sm:hidden" onClick={goNext} disabled={index >= total - 1} aria-label="Next">
            <ChevronRight className="h-5 w-5" />
          </Button>

          {/* Dot indicator */}
          <div className="mx-1 hidden min-w-0 flex-1 items-center gap-1 overflow-hidden sm:flex">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                className={cn("h-1.5 flex-1 rounded-full transition-all", i === index ? "bg-primary" : i < index ? "bg-white/40" : "bg-white/15 hover:bg-white/30")}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-0.5 font-mono text-[10px] text-white/50 sm:hidden">
            {index + 1}/{total}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 text-white/80 hover:text-white"
            onClick={() => setLoop(l => l === "off" ? "all" : l === "all" ? "one" : "off")}
            aria-label={`Loop: ${loop}`}
            title={`Loop: ${loop}`}
          >
            {loop === "one" ? <Repeat1 className="h-4 w-4 text-primary" /> : <Repeat className={cn("h-4 w-4", loop === "all" && "text-primary")} />}
          </Button>

          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-white/80 hover:text-white" onClick={() => setMuted(m => !m)} aria-label={muted ? "Unmute" : "Mute"}>
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>

          <VoiceSettingsPopover
            side="top"
            align="end"
            triggerClassName="text-white/80 hover:text-white"
          />


        </div>
      </div>
    </div>,
    document.body,
  );
}
