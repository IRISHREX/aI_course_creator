import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, FileText, Gauge, ListTree, Maximize2, Minimize2, MonitorOff, MonitorPlay, Orbit, Pause, Play, Settings2, SkipBack, SkipForward, Sparkles, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCourseBySlug } from "@/hooks/useCourses";
import { useTopics, type Topic } from "@/hooks/useTopics";
import { useIsAdmin } from "@/hooks/useAdmin";
import { LessonPresentationSlide } from "@/components/LessonPresentationSlide";
import { blockToText } from "@/components/BlockRenderer";
import { SphericalLoader } from "@/components/SphericalLoader";
import { LessonTerrainBackground } from "@/components/LessonTerrainBackground";
import { ThreeParticleBackground } from "@/components/ThreeParticleBackground";
import ThreePageBackground from "@/components/ThreePageBackground";
import { useCourseSettings, type LessonVisualStyle } from "@/lib/appSettings";
import { hasPresentation, type PresentationSlide } from "@/lib/lessonPresentation";

type TopicWithMindmap = Topic;
type SpeechState = "idle" | "playing" | "paused";
const READER_VOICE_KEY = "signal-reader-voice";

function lessonText(topic: TopicWithMindmap) {
  const body = (topic.content || []).map((block) => blockToText(block)).filter(Boolean).join(" ");
  return [topic.title, topic.summary, body]
    .filter(Boolean)
    .map((part) => String(part).replace(/\s+/g, " ").trim().replace(/[.。]+$/g, ""))
    .filter(Boolean)
    .join(". ")
    .trim();
}

function useSlideEntries(courseId?: string) {
  const storageKey = courseId ? `course-reader-entries:${courseId}` : "";
  const [entries, setEntries] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!storageKey) return;
    try {
      setEntries(JSON.parse(localStorage.getItem(storageKey) || "{}"));
    } catch {
      setEntries({});
    }
  }, [storageKey]);

  const updateEntry = useCallback((slideId: string, value: string) => {
    setEntries((current) => {
      const next = { ...current, [slideId]: value };
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // Ignore storage quota/privacy mode failures; the note still works for this session.
        }
      }
      return next;
    });
  }, [storageKey]);

  return { entries, updateEntry };
}

export default function CourseReader() {
  const { courseSlug } = useParams();
  const { course, loading: courseLoading } = useCourseBySlug(courseSlug);
  const { topics, loading: topicsLoading } = useTopics(course?.id);
  const { isAdmin } = useIsAdmin();
  const [courseSettings, setCourseSettingsValue] = useCourseSettings(course?.id);
  const rootRef = useRef<HTMLDivElement>(null);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const readTokenRef = useRef(0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState(() => {
    try { return localStorage.getItem(READER_VOICE_KEY) || ""; }
    catch { return ""; }
  });
  const [slideIndex, setSlideIndex] = useState(0);
  const [activeItem, setActiveItem] = useState(-1);
  const [slideSequence, setSlideSequence] = useState(0);
  const [autoSlide, setAutoSlide] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [speechState, setSpeechState] = useState<SpeechState>("idle");
  const [pendingRead, setPendingRead] = useState(false);
  const [slidesOpen, setSlidesOpen] = useState(false);
  const [contentOpen, setContentOpen] = useState(false);
  const { entries, updateEntry } = useSlideEntries(course?.id);

  const slides = useMemo<PresentationSlide[]>(
    () => topics.flatMap((topic) => {
      if (hasPresentation(topic.presentation)) return topic.presentation.slides;
      if (!topic.mindmap) return [];
      return [{
        id: `${topic.id}-mindmap`,
        topicId: topic.id,
        topicSlug: topic.slug,
        eyebrow: `Unit ${topic.unit} / Lesson ${(topic.order_index ?? 0) + 1}`,
        title: topic.title,
        layout: "visual" as const,
        bullets: [],
        mindmap: topic.mindmap,
        narration: lessonText(topic),
      }];
    }),
    [topics],
  );

  const current = slides[Math.min(slideIndex, Math.max(slides.length - 1, 0))];
  const progress = slides.length ? ((slideIndex + 1) / slides.length) * 100 : 0;
  const customEntry = current ? entries[current.id] || "" : "";
  const readText = current ? [customEntry, current.narration].filter(Boolean).join(". ") : "";
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const selectedVoice = useMemo(() => voices.find((voice) => voice.voiceURI === voiceURI) || null, [voiceURI, voices]);
  const readerBackground = courseSettings.lessonGraphicsEnabled ? (
    courseSettings.lessonVisualStyle === "particles" ? <ThreeParticleBackground className="fixed opacity-40" /> :
    courseSettings.lessonVisualStyle === "orbit" ? <ThreePageBackground className="fixed opacity-55" /> :
    <LessonTerrainBackground className="fixed opacity-35" />
  ) : null;

  useEffect(() => {
    if (!supported) return;
    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [supported]);

  const updateVoice = (nextVoiceURI: string) => {
    setVoiceURI(nextVoiceURI);
    try { localStorage.setItem(READER_VOICE_KEY, nextVoiceURI); }
    catch { /* ignore private-mode storage errors */ }
  };

  const updateVisualStyle = (lessonVisualStyle: LessonVisualStyle) => {
    setCourseSettingsValue({ ...courseSettings, lessonGraphicsEnabled: true, lessonVisualStyle });
  };

  useEffect(() => {
    if (slideIndex > slides.length - 1) setSlideIndex(Math.max(slides.length - 1, 0));
  }, [slideIndex, slides.length]);

  useEffect(() => {
    const onFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  const stopReading = useCallback(() => {
    if (!supported) return;
    readTokenRef.current += 1;
    window.speechSynthesis.cancel();
    utterRef.current = null;
    setSpeechState("idle");
  }, [supported]);

  useEffect(() => {
    setSlideIndex(0);
    setPendingRead(false);
    stopReading();
  }, [course?.id, stopReading]);

  const startReading = useCallback((text: string, onDone?: () => void) => {
    if (!supported || !text.trim()) return;
    const token = readTokenRef.current + 1;
    readTokenRef.current = token;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    if (selectedVoice) {
      utter.voice = selectedVoice;
      utter.lang = selectedVoice.lang;
    }
    utter.rate = speed;
    utter.pitch = 1;
    const narratedItems = current?.steps || current?.bullets || [];
    const itemOffsets = narratedItems.map((item) => text.toLowerCase().indexOf(item.toLowerCase()));
    utter.onboundary = (event) => {
      if (readTokenRef.current !== token || (event.name && event.name !== "word")) return;
      const charIndex = event.charIndex || 0;
      let nextItem = -1;
      itemOffsets.forEach((offset, index) => {
        if (offset >= 0 && charIndex >= offset) nextItem = index;
      });
      setActiveItem(nextItem);
    };
    utter.onend = () => {
      if (readTokenRef.current !== token) return;
      setSpeechState("idle");
      setActiveItem(-1);
      onDone?.();
    };
    utter.onerror = () => {
      if (readTokenRef.current !== token) return;
      setSpeechState("idle");
    };
    utterRef.current = utter;
    window.speechSynthesis.speak(utter);
    setSpeechState("playing");
  }, [current, selectedVoice, speed, supported]);

  const goToSlide = useCallback((index: number, read = true) => {
    const next = Math.min(Math.max(index, 0), Math.max(slides.length - 1, 0));
    stopReading();
    setActiveItem(-1);
    setSlideSequence((value) => value + 1);
    setSlideIndex(next);
    setPendingRead(read);
  }, [slides.length, stopReading]);

  useEffect(() => {
    if (!pendingRead || !current) return;
    setPendingRead(false);
    startReading(readText, () => {
      if (autoSlide && slideIndex < slides.length - 1) goToSlide(slideIndex + 1, true);
    });
  }, [autoSlide, current, goToSlide, pendingRead, readText, slideIndex, slides.length, startReading]);

  useEffect(() => () => stopReading(), [stopReading]);

  const playCurrent = useCallback(() => {
    if (!current || !supported) return;
    if (speechState === "paused") {
      window.speechSynthesis.resume();
      setSpeechState("playing");
      return;
    }
    startReading(readText, () => {
      if (autoSlide && slideIndex < slides.length - 1) goToSlide(slideIndex + 1, true);
    });
  }, [autoSlide, current, goToSlide, readText, slideIndex, slides.length, speechState, startReading, supported]);

  const pauseReading = useCallback(() => {
    if (!supported) return;
    if (speechState === "playing") {
      window.speechSynthesis.pause();
      setSpeechState("paused");
    } else if (speechState === "paused") {
      window.speechSynthesis.resume();
      setSpeechState("playing");
    }
  }, [speechState, supported]);

  const toggleFullscreen = useCallback(async () => {
    if (!rootRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await rootRef.current.requestFullscreen();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      if (slidesOpen || contentOpen) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToSlide(slideIndex + 1, true);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToSlide(slideIndex - 1, true);
      } else if (event.key === " ") {
        event.preventDefault();
        if (speechState === "playing") pauseReading();
        else playCurrent();
      } else if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        setSlidesOpen(true);
      } else if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        setContentOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [contentOpen, goToSlide, pauseReading, playCurrent, slideIndex, slidesOpen, speechState]);

  if (courseLoading || topicsLoading) return <SphericalLoader className="container py-20" label="Loading reader" />;
  if (!course) return <div className="container py-20 text-muted-foreground">Course not found.</div>;

  return (
    <div ref={rootRef} className="fixed inset-0 z-[100] overflow-hidden bg-[#05070a] text-white">
      {readerBackground}
      <div className="pointer-events-none absolute inset-0 bg-black/45" />
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:48px_48px]" />

      <header className="absolute inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-black/45 px-3 backdrop-blur-xl sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="text-white/75 hover:bg-white/10 hover:text-white" title="Back to course" aria-label="Back to course">
            <Link to={`/course/${course.slug}`}><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white sm:text-base">{course.title}</div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/45">
              <span className={`h-1.5 w-1.5 rounded-full ${speechState === "playing" ? "animate-pulse bg-cyan-300" : "bg-white/30"}`} />
              {speechState === "playing" ? "Narrating" : speechState === "paused" ? "Narration paused" : "Ready"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <div className="mr-1 hidden rounded-md border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-white/70 sm:block">
            {slides.length ? `${String(slideIndex + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}` : "00 / 00"}
          </div>
          <Button variant="ghost" size="icon" className="text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setSlidesOpen(true)} title="Slides" aria-label="Slides">
            <ListTree className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="hidden text-white/70 hover:bg-white/10 hover:text-white sm:inline-flex" onClick={() => setContentOpen(true)} title="Slide content" aria-label="Slide content">
            <FileText className="h-4 w-4" />
          </Button>
          {current?.topicSlug && (
            <Button asChild variant="ghost" size="icon" className="hidden text-white/70 hover:bg-white/10 hover:text-white md:inline-flex" title="Open lesson" aria-label="Open lesson">
              <Link to={`/course/${course.slug}/topic/${current.topicSlug}`}><BookOpen className="h-4 w-4" /></Link>
            </Button>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white/70 hover:bg-white/10 hover:text-white" title="Narration voice settings" aria-label="Narration voice settings">
                <Volume2 className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                <div>
                  <Label className="text-xs">Narration voice</Label>
                  <Select value={voiceURI || "system"} onValueChange={(value) => updateVoice(value === "system" ? "" : value)} disabled={!supported}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="System default" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="system">System default</SelectItem>
                      {voices.map((voice) => (
                        <SelectItem key={voice.voiceURI} value={voice.voiceURI}>
                          {voice.name} ({voice.lang})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="flex justify-between text-xs">
                    <span>Speed</span>
                    <span className="font-mono text-primary">{speed.toFixed(2)}x</span>
                  </Label>
                  <Slider min={0.6} max={1.8} step={0.05} value={[speed]} onValueChange={(value) => setSpeed(value[0])} className="mt-2" />
                </div>
                {!supported && <p className="text-xs text-muted-foreground">Speech synthesis is not supported in this browser.</p>}
              </div>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={courseSettings.lessonGraphicsEnabled ? "text-cyan-300 hover:bg-white/10" : "text-white/45 hover:bg-white/10"}
                title="Presentation background"
                aria-label="Presentation background"
              >
                {courseSettings.lessonGraphicsEnabled ? <MonitorPlay className="h-4 w-4" /> : <MonitorOff className="h-4 w-4" />}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="end">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs">Animated background</Label>
                  <Button type="button" size="sm" variant={courseSettings.lessonGraphicsEnabled ? "neon" : "outline"} onClick={() => setCourseSettingsValue({ ...courseSettings, lessonGraphicsEnabled: !courseSettings.lessonGraphicsEnabled })}>
                    {courseSettings.lessonGraphicsEnabled ? "On" : "Off"}
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: "terrain" as const, label: "Terrain", icon: Sparkles },
                    { value: "particles" as const, label: "Particles", icon: Settings2 },
                    { value: "orbit" as const, label: "Orbit", icon: Orbit },
                  ].map((option) => {
                    const Icon = option.icon;
                    return (
                      <Button key={option.value} type="button" size="sm" variant={courseSettings.lessonVisualStyle === option.value && courseSettings.lessonGraphicsEnabled ? "hero" : "outline"} className="h-auto flex-col gap-1 py-2 text-[11px]" onClick={() => updateVisualStyle(option.value)}>
                        <Icon className="h-4 w-4" />{option.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" className="text-white/70 hover:bg-white/10 hover:text-white" onClick={toggleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"} aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <main className="absolute inset-x-0 bottom-24 top-16 z-10 flex items-center justify-center overflow-auto p-2 sm:p-5 lg:p-7">
        {current ? (
          <div className="w-full max-w-[1320px]" style={{ maxWidth: "min(1320px, calc((100vh - 180px) * 1.7778))" }}>
            <LessonPresentationSlide slide={current} activeItem={activeItem} sequence={slideSequence} />
          </div>
        ) : (
          <div className="grid h-full place-items-center px-6 text-center text-white/55">
            No AI-generated lesson presentations are ready for this course.
          </div>
        )}
      </main>

      <footer className="absolute inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/55 px-3 pb-3 pt-2 backdrop-blur-xl sm:px-6">
        <div className="mx-auto max-w-[1320px]">
          <div className="mb-2 flex items-center gap-3">
            <span className="hidden max-w-[45%] truncate text-xs text-white/55 sm:block">{current?.title || "Presentation"}</span>
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div className="absolute inset-y-0 left-0 bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.8)] transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <span className="font-mono text-[10px] text-white/45">{Math.round(progress)}%</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="hidden items-center gap-2 lg:flex">
              <button
                type="button"
                onClick={() => setAutoSlide((value) => !value)}
                className={`h-8 rounded-md border px-3 text-[11px] font-medium transition ${autoSlide ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-200" : "border-white/10 bg-white/5 text-white/50"}`}
              >
                Auto advance {autoSlide ? "on" : "off"}
              </button>
              <div className="flex w-36 items-center gap-2 text-white/55">
                <Gauge className="h-3.5 w-3.5 text-cyan-300" />
                <Slider min={0.6} max={1.8} step={0.05} value={[speed]} onValueChange={(value) => setSpeed(value[0])} />
                <span className="w-9 text-right font-mono text-[10px]">{speed.toFixed(1)}x</span>
              </div>
            </div>

            <div className="flex flex-1 items-center justify-center gap-1 sm:gap-2 lg:flex-none">
              <Button variant="ghost" size="icon" className="text-white/70 hover:bg-white/10 hover:text-white" onClick={() => goToSlide(slideIndex - 1, true)} disabled={slideIndex <= 0} title="Previous slide" aria-label="Previous slide">
                <SkipBack className="h-5 w-5" />
              </Button>
              {speechState === "playing" ? (
                <Button size="icon" onClick={pauseReading} className="h-12 w-12 rounded-full bg-cyan-300 text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.38)] hover:bg-cyan-200" title="Pause reading" aria-label="Pause reading"><Pause className="h-5 w-5" /></Button>
              ) : (
                <Button size="icon" onClick={playCurrent} className="h-12 w-12 rounded-full bg-cyan-300 text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.38)] hover:bg-cyan-200" title={speechState === "paused" ? "Resume reading" : "Read slide"} aria-label={speechState === "paused" ? "Resume reading" : "Read slide"}><Play className="ml-0.5 h-5 w-5" /></Button>
              )}
              <Button variant="ghost" size="icon" className="text-white/50 hover:bg-white/10 hover:text-white" onClick={stopReading} title="Stop reading" aria-label="Stop reading"><Square className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="text-white/70 hover:bg-white/10 hover:text-white" onClick={() => goToSlide(slideIndex + 1, true)} disabled={slideIndex >= slides.length - 1} title="Next slide" aria-label="Next slide">
                <SkipForward className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex min-w-20 items-center justify-end gap-2">
              <span className={`h-2 w-2 rounded-full ${speechState === "playing" ? "animate-pulse bg-cyan-300" : speechState === "paused" ? "bg-amber-300" : "bg-white/25"}`} />
              <span className="hidden text-[10px] uppercase tracking-wider text-white/45 sm:inline">
                {speechState === "playing" ? "Speaking" : speechState === "paused" ? "Paused" : "Ready"}
              </span>
              <span className="font-mono text-xs text-white/70 sm:hidden">{slideIndex + 1}/{slides.length}</span>
            </div>
          </div>
        </div>
      </footer>

      <Sheet open={slidesOpen} onOpenChange={setSlidesOpen}>
        <SheetContent side="left" className="w-[88vw] overflow-hidden p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border/70 p-5">
            <SheetTitle>Slides</SheetTitle>
            <SheetDescription>{slides.length ? `${slideIndex + 1} of ${slides.length}` : "No slides available"}</SheetDescription>
          </SheetHeader>
          <div className="h-[calc(100vh-100px)] overflow-auto p-3">
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                onClick={() => {
                  goToSlide(index, true);
                  setSlidesOpen(false);
                }}
                className={`mb-1 w-full rounded-md px-3 py-2 text-left text-sm transition ${index === slideIndex ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                <span className="block truncate font-medium">{slide.title}</span>
                <span className={`block truncate text-[11px] ${index === slideIndex ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{slide.eyebrow}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={contentOpen} onOpenChange={setContentOpen}>
        <SheetContent side="right" className="w-[92vw] overflow-hidden p-0 sm:max-w-xl">
          <SheetHeader className="border-b border-border/70 p-5">
            <SheetTitle>Slide Content</SheetTitle>
            <SheetDescription>{current?.eyebrow || "Generated presentation content"}</SheetDescription>
          </SheetHeader>
          <div className="h-[calc(100vh-104px)] overflow-auto p-5">
            {isAdmin && current && (
              <div className="mb-4 rounded-lg border border-border/70 bg-background/50 p-3">
                <Textarea
                  value={customEntry}
                  onChange={(event) => updateEntry(current.id, event.target.value)}
                  placeholder="Custom slide entry"
                  className="min-h-28 resize-y bg-background/70"
                />
              </div>
            )}
            {current ? (
              <>
                {customEntry && <p className="mb-4 rounded-md border border-primary/30 bg-primary/10 p-3 text-sm leading-7">{customEntry}</p>}
                <p className="whitespace-pre-wrap text-base leading-8 text-foreground/90">{current.narration}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No slide selected.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
