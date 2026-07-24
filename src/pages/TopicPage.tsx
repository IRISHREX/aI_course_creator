import { type ComponentProps, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { backendApi } from "@/integrations/api/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useProgress, type Topic } from "@/hooks/useTopics";
import { useCourseBySlug } from "@/hooks/useCourses";
import { useCourseSettings } from "@/lib/appSettings";
import { Visualization } from "@/components/Visualization";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { KaraokeReadMode, karaokeSeek, type KaraokeReadModeHandle } from "@/components/KaraokeReadMode";
import { LessonPYQButton } from "@/components/LessonPYQButton";
import { BlockRenderer, blockToText, countWords } from "@/components/BlockRenderer";
import { paginate, pageBalanceStats, pageReadable } from "@/lib/lessonPaging";
import { Mindmap } from "@/components/Mindmap";
import { ArrowLeft, ArrowRight, Edit3, Sparkles, Brain, Loader2, Bookmark, ZoomIn, ZoomOut, Play } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { PlayMode } from "@/components/PlayMode";

export default function TopicPage() {
  const { courseSlug, slug } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { course } = useCourseBySlug(courseSlug);
  const [courseSettings, setCourseSettingsValue] = useCourseSettings(course?.id);
  const { progress, markViewed } = useProgress();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [neighbors, setNeighbors] = useState<{ prev?: Topic; next?: Topic }>({});
  const [generating, setGenerating] = useState(false);
  const [pageIdx, setPageIdx] = useState(0);
  const [pageTurnDirection, setPageTurnDirection] = useState<"next" | "prev">("next");
  const [activeWord, setActiveWord] = useState<number | null>(null);
  const [genMindmap, setGenMindmap] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [generatingLanguage, setGeneratingLanguage] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);
  const [readerZoom, setReaderZoom] = useState(100);
  const [playOpen, setPlayOpen] = useState(false);
  const terrainContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let animationId: number | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let cleanupResize: (() => void) | null = null;
    let mounted = true;

    const container = terrainContainerRef.current;
    if (!container) return;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.zIndex = "-1";
    renderer.domElement.style.pointerEvents = "none";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(25, window.innerWidth / window.innerHeight, 0.01, 1000);
    camera.position.set(0, 2, 15);
    scene.fog = new THREE.Fog(0x000000, 0, 45);

    const ambientLight = new THREE.AmbientLight(0x202020);
    scene.add(ambientLight);
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 5);
    directionalLight1.position.set(0.5, 0.0, 2);
    scene.add(directionalLight1);
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight2.position.set(-0.5, -0.5, -2);
    scene.add(directionalLight2);

    const width = 40;
    const height = 40;
    const segments = 120;
    const geometry = new THREE.PlaneGeometry(width, height, segments, segments);
    const positions = geometry.attributes.position;

    const noise = (x: number, y: number) => {
      const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      return n - Math.floor(n);
    };

    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const value = noise(x * 0.3, y * 0.3) * 2.5;
      positions.setZ(i, value);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -2;
    scene.add(mesh);

    const onRenderFcts: Array<(delta: number) => void> = [];
    onRenderFcts.push((delta) => { mesh.rotation.z += 0.2 * delta; });
    onRenderFcts.push(() => { if (renderer) renderer.render(scene, camera); });

    cleanupResize = () => {
      if (!renderer) return;
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", cleanupResize);

    const animate = (nowMsec: number) => {
      if (!mounted) return;
      animationId = requestAnimationFrame(animate);
      const lastTimeMsec = (animate as any).lastTimeMsec || (nowMsec - 1000 / 60);
      const deltaMsec = Math.min(200, nowMsec - lastTimeMsec);
      (animate as any).lastTimeMsec = nowMsec;
      onRenderFcts.forEach((fn) => fn(deltaMsec / 1000));
    };
    animationId = requestAnimationFrame(animate);

    return () => {
      mounted = false;
      if (animationId) cancelAnimationFrame(animationId);
      window.removeEventListener("resize", cleanupResize!);
      if (renderer?.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      geometry.dispose();
      material.dispose();
      renderer?.dispose();
    };
  }, [slug]);

  // Resume from URL hash: #p=2&w=14
  useEffect(() => {
    const h = window.location.hash;
    const m = h.match(/p=(\d+)/);
    if (m) setPageIdx(Math.max(0, parseInt(m[1], 10) - 1));
  }, [slug]);

  useEffect(() => {
    if (!slug || !course?.id) return;
    setTopic(null);
    setNeighbors({});
    (async () => {
      const { data: all } = await backendApi.from("topics").select("*").eq("course_id", course.id).order("unit").order("order_index");
      const list = (all as unknown as Topic[]) ?? [];
      const idx = list.findIndex(t => t.slug === slug);
      if (idx >= 0) {
        setTopic(list[idx]);
        setNeighbors({ prev: list[idx - 1], next: list[idx + 1] });
        setPageIdx(0);
      }
    })();
  }, [slug, course?.id]);

  // markViewed is intentionally keyed to identity changes, not every progress refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (topic && user) markViewed(topic.id); }, [topic?.id, user?.id]);

  const translations = useMemo(() => normalizeTranslations(topic?.translations), [topic?.translations]);
  const activeTranslation = useMemo(
    () => translations.find((translation) => translation.languageCode === selectedLanguage) || null,
    [selectedLanguage, translations],
  );
  const displayTopic = activeTranslation ? {
    title: activeTranslation.title,
    summary: activeTranslation.summary,
    content: activeTranslation.content,
    quiz: activeTranslation.quiz?.length ? activeTranslation.quiz : topic?.quiz || [],
    dir: activeTranslation.dir || languageByCode(selectedLanguage).dir || "ltr",
  } : {
    title: topic?.title || "",
    summary: topic?.summary || "",
    content: topic?.content || [],
    quiz: topic?.quiz || [],
    dir: "ltr" as const,
  };
  const pages = useMemo(() => paginate(displayTopic.content || []), [displayTopic.content]);
  const currentPage = pages[pageIdx];
  const pageText = useMemo(() => currentPage ? pageReadable(currentPage.blocks) : "", [currentPage]);

  // Reset active word on page change
  useEffect(() => { setActiveWord(null); }, [pageIdx]);
  useEffect(() => { setPageIdx(0); }, [selectedLanguage]);
  useEffect(() => {
    if (pages.length && pageIdx > pages.length - 1) setPageIdx(pages.length - 1);
  }, [pageIdx, pages.length]);

  const linkPrefix = `/course/${courseSlug}`;
  const goPreviousPage = useCallback(() => {
    if (pageIdx > 0) {
      playLessonSound("page", courseSettings.lessonSoundsEnabled);
      setPageTurnDirection("prev");
      setPageIdx((p) => p - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (neighbors.prev) nav(`${linkPrefix}/topic/${neighbors.prev.slug}`);
  }, [courseSettings.lessonSoundsEnabled, linkPrefix, nav, neighbors.prev, pageIdx]);
  const goNextPage = useCallback(() => {
    if (pageIdx < pages.length - 1) {
      playLessonSound("page", courseSettings.lessonSoundsEnabled);
      setPageTurnDirection("next");
      setPageIdx((p) => p + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (neighbors.next) nav(`${linkPrefix}/topic/${neighbors.next.slug}`);
  }, [courseSettings.lessonSoundsEnabled, linkPrefix, nav, neighbors.next, pageIdx, pages.length]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        setAutoScrollRead((value) => {
          const next = !value;
          toast.info(`Auto scroll ${next ? "on" : "off"}`);
          return next;
        });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "i") {
        event.preventDefault();
        readerRef.current?.toggleRead();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNextPage();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPreviousPage();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNextPage, goPreviousPage]);

  if (!topic) return <SphericalLoader className="container py-20" label="Loading lesson" />;
  const p = progress[topic.id];

  const generateExtraQuiz = async () => {
    if (!isAdmin) return;
    setGenerating(true);
    try {
      const { data, error } = await backendApi.functions.invoke("generate-quiz", {
        body: { title: topic.title, summary: topic.summary, content: topic.content },
      });
      if (error) throw error;
      if (data?.questions?.length) {
        const fresh = data.questions.slice(0, 10);
        await backendApi.from("topics").update({ quiz: fresh }).eq("id", topic.id);
        setTopic({ ...topic, quiz: fresh });
        toast.success(`Replaced old MCQs with ${fresh.length} fresh question${fresh.length === 1 ? "" : "s"}`);
      }
    } catch (e: unknown) { toast.error(errorMessage(e, "AI generation failed")); }
    finally { setGenerating(false); }
  };

  const generateMindmap = async () => {
    if (!isAdmin) return;
    setGenMindmap(true);
    try {
      const { data, error } = await backendApi.functions.invoke("generate-mindmap", { body: { topicId: topic.id, courseId: course?.id } });
      if (error) throw error;
      if (data?.removed) {
        setTopic({ ...topic, mindmap: null } as TopicWithMindmap);
        throw new Error(data.error || "Invalid mind map was discarded");
      }
      if (data?.error) throw new Error(data.error);
      setTopic({ ...topic, mindmap: data.mindmap } as TopicWithMindmap);
      toast.success("Mind map generated");
    } catch (e: unknown) { toast.error(errorMessage(e, "Failed")); }
    finally { setGenMindmap(false); }
  };

  const generateLanguageVersion = async () => {
    if (!isAdmin || !topic || selectedLanguage === "en") return;
    const language = languageByCode(selectedLanguage);
    setGeneratingLanguage(true);
    try {
      const { data, error } = await backendApi.functions.invoke("translate-lesson", {
        body: {
          topicId: topic.id,
          languageCode: language.code,
          languageName: language.label,
          dir: language.dir || "ltr",
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setTopic({
        ...topic,
        translations: data.translations || [...translations.filter((item) => item.languageCode !== language.code), data.translation],
      });
      toast.success(`${language.label} lesson version generated`);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Translation failed"));
    } finally {
      setGeneratingLanguage(false);
    }
  };

  const addBookmark = async () => {
    if (!user) { toast.info("Sign in to bookmark"); return; }
    if (!topic || !course) return;
    setBookmarking(true);
    try {
      const label = window.prompt("Bookmark label (optional):", `${topic.title} — page ${pageIdx + 1}`) || null;
      const { error } = await backendApi.from("bookmarks").insert({
        user_id: user.id,
        topic_id: topic.id,
        course_id: course.id,
        page_index: pageIdx,
        word_index: activeWord ?? 0,
        label,
      });
      if (error) throw error;
      toast.success("Bookmarked");
    } catch (e: unknown) { toast.error(errorMessage(e, "Bookmark failed")); }
    finally { setBookmarking(false); }
  };

  const saveFlowchartCode = async (block: any, code: string) => {
    if (!topic) return;
    if (activeTranslation) {
      const nextContent = activeTranslation.content.map((item) => item === block || (item?.type === "flowchart" && item?.code === block?.code && item?.title === block?.title) ? { ...item, code } : item);
      const nextTranslations = translations.map((translation) =>
        translation.languageCode === activeTranslation.languageCode ? { ...translation, content: nextContent } : translation
      );
      await backendApi.from("topics").update({ translations: nextTranslations } as any).eq("id", topic.id);
      setTopic({ ...topic, translations: nextTranslations } as any);
      return;
    }

    const nextContent = (topic.content || []).map((item) => item === block || (item?.type === "flowchart" && item?.code === block?.code && item?.title === block?.title) ? { ...item, code } : item);
    await backendApi.from("topics").update({ content: nextContent } as any).eq("id", topic.id);
    setTopic({ ...topic, content: nextContent });
  };

  const repairFlowchart = async (block: any, mermaidError: string) => {
    if (!isAdmin || !topic) return;
    try {
      const { data, error } = await backendApi.functions.invoke("repair-mermaid", {
        body: {
          code: block?.code,
          title: block?.title,
          error: mermaidError,
          lessonTitle: displayTopic.title || topic.title,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await saveFlowchartCode(block, data.code);
      toast.success("Graph repaired");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Graph repair failed"));
    }
  };

  const manualFixFlowchart = async (block: any) => {
    if (!isAdmin) return;
    const nextCode = window.prompt("Paste valid Mermaid flowchart syntax:", block?.code || "graph TD\n  A[Start] --> B[End]");
    if (nextCode === null) return;
    if (!nextCode.trim()) {
      toast.error("Mermaid code cannot be empty");
      return;
    }
    try {
      await saveFlowchartCode(block, nextCode.trim());
      toast.success("Graph updated");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Graph update failed"));
    }
  };

  const canGoPrevious = pageIdx > 0 || Boolean(neighbors.prev);
  const canGoNext = pageIdx < pages.length - 1 || Boolean(neighbors.next);
  const detectPageBalance = () => {
    const stats = pageBalanceStats(pages);
    if (stats.pages <= 1) {
      toast.info("Single page lesson; no balancing needed");
      return;
    }
    const balanced = stats.spread <= 120;
    const message = `${balanced ? "Pages look balanced" : "Balanced split applied"}: ${stats.pages} pages, ${stats.min}-${stats.max} words each`;
    if (balanced) toast.success(message);
    else toast.info(message);
  };

  const isInteractiveTarget = (target: EventTarget | null) => {
    const element = target as HTMLElement | null;
    return Boolean(element?.closest("button, a, input, textarea, select, [role='button'], [contenteditable='true']"));
  };

  const toggleReaderPause = () => readerRef.current?.togglePause();

  const handleReaderDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(event.target)) return;
    toggleReaderPause();
  };

  const handleReaderMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(event.target)) return;
    mouseStrokeRef.current = { x: event.clientX, y: event.clientY, count: mouseStrokeRef.current.count, lastAt: mouseStrokeRef.current.lastAt, dragging: true };
  };

  const handleReaderMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const stroke = mouseStrokeRef.current;
    if (!stroke.dragging || isInteractiveTarget(event.target)) return;
    const dx = event.clientX - stroke.x;
    const dy = event.clientY - stroke.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 90) return;
    const now = Date.now();
    stroke.count = now - stroke.lastAt < 900 ? stroke.count + 1 : 1;
    stroke.lastAt = now;
    stroke.x = event.clientX;
    stroke.y = event.clientY;
    if (stroke.count >= 2) {
      stroke.count = 0;
      toggleReaderPause();
    }
  };

  const handleReaderMouseUp = () => {
    mouseStrokeRef.current.dragging = false;
  };

  const updateCourseExperience = (patch: Partial<typeof courseSettings>) => {
    const next = { ...courseSettings, ...patch };
    setCourseSettingsValue(next);
    playLessonSound("tap", next.lessonSoundsEnabled);
  };

  const lessonGraphicsOn = courseSettings.threeDEnabled && courseSettings.lessonGraphicsEnabled;
  const lessonBackground =
    !lessonGraphicsOn ? null :
    courseSettings.lessonVisualStyle === "particles" ? <ThreeParticleBackground className="fixed opacity-45" /> :
    courseSettings.lessonVisualStyle === "orbit" ? <ThreePageBackground className="fixed opacity-60" /> :
    <LessonTerrainBackground className="opacity-35" />;

  return (
    <div className="container relative max-w-5xl overflow-hidden px-3 py-6 sm:px-4 sm:py-10">
      <div ref={terrainContainerRef} className="fixed inset-0 -z-20 overflow-hidden pointer-events-none" />
      <div className="mb-5 flex min-w-0 flex-col gap-3 sm:mb-6 md:flex-row md:items-center md:justify-between">
        <Button asChild variant="ghost" size="sm" className="max-w-full justify-start px-2 rounded-full">
          <Link to={linkPrefix} className="min-w-0">
            <ArrowLeft className="h-4 w-4 shrink-0 mr-1" />
            <span className="truncate">{course?.title || "Course"}</span>
          </Link>
        </Button>
        <div className="toolbar-pill self-start md:self-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPlayOpen(true)}
            className="h-8 rounded-full px-3 text-primary hover:bg-primary/10"
            title="Enter cinema play mode"
          >
            <Play className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Play</span>
          </Button>
          <div className="h-4 w-px bg-border/60 mx-0.5" />
          <KaraokeReadMode text={pageText} onWordIndex={setActiveWord} />
          {course && <LessonPYQButton topicId={topic.id} courseId={course.id} />}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={addBookmark} disabled={bookmarking} title="Bookmark this page" aria-label="Bookmark this page">
            {bookmarking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}
          </Button>
          {isAdmin && (
            <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/10" aria-label="Edit lesson">
              <Link to={`${linkPrefix}/topic/${topic.slug}/edit`}><Edit3 className="h-4 w-4" /></Link>
            </Button>
          )}
          {selectedLanguage !== "en" && !activeTranslation && isAdmin && (
            <ToolButton label={`Generate ${languageByCode(selectedLanguage).label} version`} variant="neon" size="icon" onClick={generateLanguageVersion} disabled={generatingLanguage}>
              {generatingLanguage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            </ToolButton>
          )}
        </div>
        {selectedLanguage !== "en" && !activeTranslation && (
          <div className="mt-2 text-xs text-muted-foreground">{languageByCode(selectedLanguage).label} version is not generated yet.</div>
        )}
      </div>

      <div className="mb-5 grid gap-2 rounded-2xl border border-white/10 bg-white/5 p-2 shadow-xl shadow-black/10 backdrop-blur-xl sm:grid-cols-2">
        {neighbors.prev ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => nav(`${linkPrefix}/topic/${neighbors.prev!.slug}`)}
            className="min-w-0 justify-start bg-white/10 text-white/90 hover:bg-white/15"
          >
              <ArrowLeft className="mr-2 h-4 w-4 shrink-0" />
              <span className="truncate">Previous lesson: {neighbors.prev.title}</span>
          </Button>
        ) : (
          <div className="flex h-10 items-center rounded-xl px-3 text-sm text-muted-foreground">Start of course</div>
        )}

        {neighbors.next ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => nav(`${linkPrefix}/topic/${neighbors.next!.slug}`)}
            className="min-w-0 justify-start bg-white/10 text-white/90 hover:bg-white/15 sm:justify-end"
          >
              <span className="truncate">Next lesson: {neighbors.next.title}</span>
              <ArrowRight className="ml-2 h-4 w-4 shrink-0" />
          </Button>
        ) : (
          <div className="flex h-10 items-center rounded-xl px-3 text-sm text-muted-foreground sm:justify-end">End of course</div>
        )}
      </div>

      <PlayMode
        open={playOpen}
        onClose={() => setPlayOpen(false)}
        title={topic.title}
        subtitle={topic.summary}
        blocks={topic.content || []}
        startPage={pageIdx}
      />

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-xs font-mono text-primary tracking-widest mb-2">UNIT {topic.unit} · LESSON {topic.order_index}</div>
        <div className="flex max-w-5xl items-start gap-2">
          <h1 className="font-display text-2xl font-bold leading-tight sm:text-3xl md:text-5xl">{displayTopic.title}</h1>
          {displayTopic.summary && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-1 h-8 w-8 flex-none rounded-full text-muted-foreground hover:text-primary sm:mt-2 md:mt-3"
                  aria-label="Lesson description"
                  title="Lesson description"
                >
                  <Info className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" side="bottom" className="w-[min(28rem,calc(100vw-2rem))] text-sm leading-6 text-muted-foreground">
                {displayTopic.summary}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </motion.div>

      <div className="my-5 sm:my-8"><Visualization kind={topic.visualization} /></div>

      {/* Pagination header */}
      {pages.length > 1 && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl p-3 glass">
          <div className="text-xs font-mono text-muted-foreground">Page {pageIdx + 1} of {pages.length}</div>
          <div className="flex items-center gap-3">
            <div className="hidden min-w-0 gap-1 sm:flex">
              {pages.map((_, i) => (
                <button key={i} onClick={() => setPageIdx(i)}
                  className={`h-2 w-5 rounded-full transition-colors sm:w-8 ${i === pageIdx ? "bg-primary" : "bg-muted hover:bg-primary/40"}`} />
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-md border border-border/60 bg-background/40 p-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={detectPageBalance} aria-label="Detect page balance" title="Detect page balance">
                <SearchCheck className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setReaderZoom((z) => Math.max(85, z - 10))} aria-label="Zoom out">
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="w-8 text-center font-mono text-[10px] text-muted-foreground">{readerZoom}%</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setReaderZoom((z) => Math.min(130, z + 10))} aria-label="Zoom in">
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Render current page with karaoke offsets + swipe gestures */}
      <div
        style={{ fontSize: `${readerZoom}%` }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          (window as any).__lessonSwipe = { x: t.clientX, y: t.clientY, t: Date.now() };
        }}
        onTouchEnd={(e) => {
          const s = (window as any).__lessonSwipe;
          if (!s) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - s.x;
          const dy = t.clientY - s.y;
          (window as any).__lessonSwipe = null;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - s.t < 600) {
            if (dx < 0 && pageIdx < pages.length - 1) {
              setPageTurnDirection("next");
              setPageIdx((p) => p + 1);
              window.scrollTo({ top: 0, behavior: "smooth" });
            } else if (dx > 0 && pageIdx > 0) {
              setPageTurnDirection("prev");
              setPageIdx((p) => p - 1);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }
        }}
      >
        <motion.div
          key={pageIdx}
          initial={{ opacity: 0, x: pageTurnDirection === "next" ? 30 : -30, rotateY: pageTurnDirection === "next" ? -10 : 10 }}
          animate={{ opacity: 1, x: 0, rotateY: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="space-y-5 pb-24 sm:pb-0"
        >
          {currentPage && (() => {
            let off = 0;
            return currentPage.blocks.map((b: unknown, i: number) => {
              const wo = off;
              off += countWords(blockToText(b));
              return (
                <BlockRenderer
                  key={i}
                  block={b}
                  wordOffset={wo}
                  activeWordIndex={activeWord}
                  onWordClick={(idx) => karaokeSeek(idx)}
                  isAdmin={isAdmin}
                  onRepairFlowchart={repairFlowchart}
                  onManualFixFlowchart={manualFixFlowchart}
                />
              );
            });
          })()}
        </motion.div>
      </div>

      {/* Pagination footer — sticky thumb-safe on mobile, inline on desktop */}
      {pages.length > 1 && (
        <div
          className="fixed inset-x-0 z-30 flex justify-center pointer-events-none sm:static sm:mt-8"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
        >
          <div className="pointer-events-auto toolbar-pill px-2 py-1.5 gap-1">
            <Button
              variant="ghost"
              size="icon"
              disabled={pageIdx === 0}
              onClick={() => {
                if (pageIdx === 0) return;
                setPageTurnDirection("prev");
                setPageIdx((p) => p - 1);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="h-11 w-11 sm:h-9 sm:w-auto sm:px-3"
              aria-label="Previous page"
            >
              <ArrowLeft className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-1" />
              <span className="hidden sm:inline text-sm">Prev</span>
            </Button>

            <span className="px-2 text-xs font-mono text-muted-foreground tabular-nums">
              {pageIdx + 1} / {pages.length}
            </span>

            <Button
              variant="ghost"
              size="icon"
              disabled={pageIdx === pages.length - 1}
              onClick={() => {
                if (pageIdx === pages.length - 1) return;
                setPageTurnDirection("next");
                setPageIdx((p) => p + 1);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="h-11 w-11 sm:h-9 sm:w-auto sm:px-3"
              aria-label="Next page"
            >
              <span className="hidden sm:inline text-sm">Next</span>
              <ArrowRight className="h-5 w-5 sm:h-4 sm:w-4 sm:ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Mindmap (only on last page) */}
      {pageIdx === pages.length - 1 && (
        <div className="mt-10 glass rounded-2xl p-6">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="font-display font-bold text-xl flex items-center gap-2"><Brain className="h-5 w-5 text-primary" /> Lesson Mind Map</div>
            {isAdmin && (
              <Button variant="neon" size="sm" onClick={generateMindmap} disabled={genMindmap}>
                {genMindmap ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                {(topic as TopicWithMindmap).mindmap ? "Regenerate" : "Generate"} mind map
              </Button>
            )}
          </div>
          {(topic as TopicWithMindmap).mindmap ? <Mindmap data={(topic as TopicWithMindmap).mindmap} /> : (
            <p className="text-sm text-muted-foreground">No mind map yet{isAdmin ? " — click generate." : "."}</p>
          )}
        </div>
      )}

      {displayTopic.quiz.length > 0 && pageIdx === pages.length - 1 && (
        <div className="mt-6 glass rounded-2xl p-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="font-display font-bold text-xl flex items-center gap-2"><Brain className="h-5 w-5 text-primary" /> Test yourself</div>
            <div className="text-sm text-muted-foreground">{displayTopic.quiz.length} questions · pass with 70%+ {p?.passed && <span className="text-success">· Passed at {p.best_quiz_score}%</span>}</div>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button variant="neon" size="sm" onClick={generateExtraQuiz} disabled={generating}>
                <Sparkles className="h-4 w-4 mr-1" /> {generating ? "Generating..." : "AI: regenerate MCQs"}
              </Button>
            )}
            <Button variant="hero" size="lg" onClick={() => nav(`${linkPrefix}/topic/${topic.slug}/quiz`)}>
              Start quiz <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}
