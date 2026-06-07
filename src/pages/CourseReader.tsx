import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, FileText, Gauge, ListTree, Maximize2, Minimize2, Pause, Play, SkipBack, SkipForward, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCourseBySlug, type Course } from "@/hooks/useCourses";
import { useTopics, type Topic } from "@/hooks/useTopics";
import { useIsAdmin } from "@/hooks/useAdmin";
import { Mindmap } from "@/components/Mindmap";
import { blockToText } from "@/components/BlockRenderer";

type MindmapData = Parameters<typeof Mindmap>[0]["data"];
type CourseWithMindmap = Course & { mindmap?: MindmapData };
type TopicWithMindmap = Topic & { mindmap?: MindmapData };
type Slide = {
  id: string;
  kind: "course" | "lesson";
  title: string;
  subtitle: string;
  mindmap?: MindmapData;
  text: string;
  topicSlug?: string;
};
type SpeechState = "idle" | "playing" | "paused";

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

  const updateEntry = (slideId: string, value: string) => {
    setEntries((current) => {
      const next = { ...current, [slideId]: value };
      if (storageKey) localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  return { entries, updateEntry };
}

export default function CourseReader() {
  const { courseSlug } = useParams();
  const { course, loading: courseLoading } = useCourseBySlug(courseSlug);
  const { topics, loading: topicsLoading } = useTopics(course?.id);
  const { isAdmin } = useIsAdmin();
  const rootRef = useRef<HTMLDivElement>(null);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const readTokenRef = useRef(0);
  const [slideIndex, setSlideIndex] = useState(0);
  const [autoSlide, setAutoSlide] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [speechState, setSpeechState] = useState<SpeechState>("idle");
  const [pendingRead, setPendingRead] = useState(false);
  const [slidesOpen, setSlidesOpen] = useState(false);
  const [contentOpen, setContentOpen] = useState(false);
  const { entries, updateEntry } = useSlideEntries(course?.id);

  const slides = useMemo<Slide[]>(() => {
    const list: Slide[] = [];
    const courseMindmap = (course as CourseWithMindmap | null)?.mindmap;
    if (course && courseMindmap) {
      list.push({
        id: `course-${course.id}`,
        kind: "course",
        title: course.title,
        subtitle: "Course overview",
        mindmap: courseMindmap,
        text: [course.title, course.description].filter(Boolean).join(". "),
      });
    }
    topics.forEach((topic) => {
      const item = topic as TopicWithMindmap;
      if (!item.mindmap) return;
      list.push({
        id: item.id,
        kind: "lesson",
        title: item.title,
        subtitle: `Unit ${item.unit} - Lesson ${(item.order_index ?? 0) + 1}`,
        mindmap: item.mindmap,
        text: lessonText(item),
        topicSlug: item.slug,
      });
    });
    return list;
  }, [course, topics]);

  const current = slides[Math.min(slideIndex, Math.max(slides.length - 1, 0))];
  const progress = slides.length ? ((slideIndex + 1) / slides.length) * 100 : 0;
  const customEntry = current ? entries[current.id] || "" : "";
  const readText = current ? [customEntry, current.text].filter(Boolean).join(". ") : "";
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

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

  const startReading = useCallback((text: string, onDone?: () => void) => {
    if (!supported || !text.trim()) return;
    const token = readTokenRef.current + 1;
    readTokenRef.current = token;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = speed;
    utter.pitch = 1;
    utter.onend = () => {
      if (readTokenRef.current !== token) return;
      setSpeechState("idle");
      onDone?.();
    };
    utter.onerror = () => {
      if (readTokenRef.current !== token) return;
      setSpeechState("idle");
    };
    utterRef.current = utter;
    window.speechSynthesis.speak(utter);
    setSpeechState("playing");
  }, [speed, supported]);

  const goToSlide = useCallback((index: number, read = true) => {
    const next = Math.min(Math.max(index, 0), Math.max(slides.length - 1, 0));
    stopReading();
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
    if (!current) return;
    if (speechState === "paused") {
      window.speechSynthesis.resume();
      setSpeechState("playing");
      return;
    }
    startReading(readText, () => {
      if (autoSlide && slideIndex < slides.length - 1) goToSlide(slideIndex + 1, true);
    });
  }, [autoSlide, current, goToSlide, readText, slideIndex, slides.length, speechState, startReading]);

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

  if (courseLoading || topicsLoading) return <div className="container py-20 text-muted-foreground">Loading...</div>;
  if (!course) return <div className="container py-20 text-muted-foreground">Course not found.</div>;

  return (
    <div ref={rootRef} className="min-h-screen bg-background px-4 py-4 text-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <div className="overflow-hidden rounded-lg border border-border/70 bg-card/80 shadow-sm">
          <div className="h-1 bg-muted">
            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="flex min-w-0 items-center gap-2">
              <Button asChild variant="ghost" size="icon" title="Back to course" aria-label="Back to course">
                <Link to={`/course/${course.slug}`}><ArrowLeft className="h-4 w-4" /></Link>
              </Button>
              <div className="min-w-0">
                <div className="truncate font-display text-lg font-bold">{course.title}</div>
                <div className="text-xs text-muted-foreground">{slides.length ? `${slideIndex + 1} / ${slides.length}` : "No slides"}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant={autoSlide ? "neon" : "outline"} size="sm" onClick={() => setAutoSlide((value) => !value)}>Auto slide</Button>
              <div className="flex w-44 items-center gap-2 rounded-md border border-border/70 px-2 py-1">
                <Gauge className="h-4 w-4 text-primary" />
                <Slider min={0.6} max={1.8} step={0.05} value={[speed]} onValueChange={(value) => setSpeed(value[0])} />
                <span className="w-10 text-right text-xs font-mono text-primary">{speed.toFixed(2)}x</span>
              </div>
              <Button variant="ghost" size="icon" onClick={toggleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"} aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        <section className="min-h-[calc(100vh-120px)] rounded-lg border border-border/70 bg-card/70 p-4 shadow-sm">
            {current ? (
              <div className="flex h-full flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-mono uppercase tracking-widest text-primary">{current.subtitle}</div>
                    <h1 className="font-display text-2xl font-bold leading-tight sm:text-3xl">{current.title}</h1>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      <span className="rounded-full border border-border/70 bg-background/60 px-2 py-1">{current.mindmap ? "Mind map ready" : "No mind map"}</span>
                      <span className="rounded-full border border-border/70 bg-background/60 px-2 py-1">{autoSlide ? "Auto waits for reading" : "Manual slide mode"}</span>
                      <span className="rounded-full border border-border/70 bg-background/60 px-2 py-1">Arrows change slides</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => setSlidesOpen(true)} title="Slides" aria-label="Slides">
                      <ListTree className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => setContentOpen(true)} title="Slide content" aria-label="Slide content">
                      <FileText className="h-4 w-4" />
                    </Button>
                    {current.topicSlug && (
                      <Button asChild variant="outline" size="icon" title="Open lesson" aria-label="Open lesson">
                        <Link to={`/course/${course.slug}/topic/${current.topicSlug}`}><BookOpen className="h-4 w-4" /></Link>
                      </Button>
                    )}
                    <Button variant="outline" size="icon" onClick={() => goToSlide(slideIndex - 1, true)} disabled={slideIndex <= 0} title="Previous slide" aria-label="Previous slide">
                      <SkipBack className="h-4 w-4" />
                    </Button>
                    {speechState === "playing" ? (
                      <Button variant="neon" size="icon" onClick={pauseReading} title="Pause reading" aria-label="Pause reading"><Pause className="h-4 w-4" /></Button>
                    ) : (
                      <Button variant="neon" size="icon" onClick={playCurrent} title={speechState === "paused" ? "Resume reading" : "Read slide"} aria-label={speechState === "paused" ? "Resume reading" : "Read slide"}><Play className="h-4 w-4" /></Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={stopReading} title="Stop reading" aria-label="Stop reading"><Square className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" onClick={() => goToSlide(slideIndex + 1, true)} disabled={slideIndex >= slides.length - 1} title="Next slide" aria-label="Next slide">
                      <SkipForward className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="min-h-[620px] flex-1 overflow-auto rounded-lg border border-border/70 bg-background/40 p-3 xl:min-h-[720px]">
                  <div className="flex min-h-full items-center justify-center">
                    <div className="w-full max-w-[1280px]">
                      {current.mindmap ? (
                        <Mindmap data={current.mindmap} fitView />
                      ) : (
                        <div className="grid min-h-[560px] place-items-center text-center text-sm text-muted-foreground">
                          No mind map generated for this slide yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid h-[60vh] place-items-center text-muted-foreground">No lessons available.</div>
            )}
          </section>
      </div>

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
                <span className={`block truncate text-[11px] ${index === slideIndex ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{slide.subtitle}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={contentOpen} onOpenChange={setContentOpen}>
        <SheetContent side="right" className="w-[92vw] overflow-hidden p-0 sm:max-w-xl">
          <SheetHeader className="border-b border-border/70 p-5">
            <SheetTitle>Slide Content</SheetTitle>
            <SheetDescription>{current?.subtitle || "Original lesson text"}</SheetDescription>
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
                <p className="whitespace-pre-wrap text-base leading-8 text-foreground/90">{current.text}</p>
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
