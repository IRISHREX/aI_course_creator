import { type ComponentProps, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { backendApi } from "@/integrations/api/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useProgress, type Topic } from "@/hooks/useTopics";
import { useCourseBySlug } from "@/hooks/useCourses";
import { Visualization } from "@/components/Visualization";
import { Button } from "@/components/ui/button";
import { KaraokeReadMode, karaokeSeek } from "@/components/KaraokeReadMode";
import { LessonPYQButton } from "@/components/LessonPYQButton";
import { BlockRenderer, blockToText, countWords } from "@/components/BlockRenderer";
import { paginate, pageBalanceStats, pageReadable } from "@/lib/lessonPaging";
import { Mindmap } from "@/components/Mindmap";
import { LessonTerrainBackground } from "@/components/LessonTerrainBackground";
import { ArrowLeft, ArrowRight, Edit3, Sparkles, Brain, Loader2, Bookmark, ZoomIn, ZoomOut, ChevronsRight, SearchCheck } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

type MindmapData = ComponentProps<typeof Mindmap>["data"];
type TopicWithMindmap = Topic & { mindmap?: MindmapData };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function TopicPage() {
  const { courseSlug, slug } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { course } = useCourseBySlug(courseSlug);
  const { progress, markViewed } = useProgress();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [neighbors, setNeighbors] = useState<{ prev?: Topic; next?: Topic }>({});
  const [generating, setGenerating] = useState(false);
  const [pageIdx, setPageIdx] = useState(0);
  const [pageTurnDirection, setPageTurnDirection] = useState<"next" | "prev">("next");
  const [activeWord, setActiveWord] = useState<number | null>(null);
  const [genMindmap, setGenMindmap] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);
  const [readerZoom, setReaderZoom] = useState(100);
  const [autoAdvanceRead, setAutoAdvanceRead] = useState(false);

  // Resume from URL hash: #p=2&w=14
  useEffect(() => {
    const h = window.location.hash;
    const m = h.match(/p=(\d+)/);
    if (m) setPageIdx(Math.max(0, parseInt(m[1], 10) - 1));
  }, [slug]);

  useEffect(() => {
    if (!slug || !course?.id) return;
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

  const pages = useMemo(() => paginate(topic?.content || []), [topic?.content]);
  const currentPage = pages[pageIdx];
  const pageText = useMemo(() => currentPage ? pageReadable(currentPage.blocks) : "", [currentPage]);

  // Reset active word on page change
  useEffect(() => { setActiveWord(null); }, [pageIdx]);

  if (!topic) return <div className="container py-20 text-muted-foreground">Loading…</div>;
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

  const linkPrefix = `/course/${courseSlug}`;
  const goPreviousPage = () => {
    if (pageIdx > 0) {
      setPageTurnDirection("prev");
      setPageIdx((p) => p - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (neighbors.prev) nav(`${linkPrefix}/topic/${neighbors.prev.slug}`);
  };
  const goNextPage = () => {
    if (pageIdx < pages.length - 1) {
      setPageTurnDirection("next");
      setPageIdx((p) => p + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (neighbors.next) nav(`${linkPrefix}/topic/${neighbors.next.slug}`);
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

  return (
    <div className="container relative max-w-5xl overflow-hidden px-3 py-6 sm:px-4 sm:py-10">
      <LessonTerrainBackground className="opacity-35" />
      <div className="mb-5 flex min-w-0 flex-col gap-3 sm:mb-6 md:flex-row md:items-center md:justify-between">
        <Button asChild variant="ghost" size="sm" className="max-w-full justify-start px-2">
          <Link to={linkPrefix} className="min-w-0">
            <ArrowLeft className="h-4 w-4 shrink-0 mr-1" />
            <span className="truncate">{course?.title || "Course"}</span>
          </Link>
        </Button>
        <div className="grid grid-cols-6 gap-1.5 sm:flex sm:items-center sm:gap-2">
          <KaraokeReadMode text={pageText} onWordIndex={setActiveWord} onDone={autoAdvanceRead ? goNextPage : undefined} />
          <Button
            variant={autoAdvanceRead ? "neon" : "ghost"}
            size="icon"
            onClick={() => setAutoAdvanceRead((value) => !value)}
            title="Auto next after read mode"
            aria-label="Auto next after read mode"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
          {course && <LessonPYQButton topicId={topic.id} courseId={course.id} />}
          <Button variant="ghost" size="icon" onClick={addBookmark} disabled={bookmarking} title="Bookmark this page" aria-label="Bookmark this page">
            {bookmarking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}
          </Button>
          {isAdmin && (
            <Button asChild variant="neon" size="icon" aria-label="Edit lesson">
              <Link to={`${linkPrefix}/topic/${topic.slug}/edit`}><Edit3 className="h-4 w-4" /></Link>
            </Button>
          )}
        </div>
      </div>

      <div className="mb-5 grid gap-2 rounded-2xl border border-white/10 bg-white/5 p-2 shadow-xl shadow-black/10 backdrop-blur-xl sm:grid-cols-2">
        {neighbors.prev ? (
          <Button
            asChild
            variant="ghost"
            className="min-w-0 justify-start bg-white/10 text-white/90 hover:bg-white/15"
          >
            <Link to={`${linkPrefix}/topic/${neighbors.prev.slug}`} className="min-w-0">
              <ArrowLeft className="mr-2 h-4 w-4 shrink-0" />
              <span className="truncate">Previous lesson: {neighbors.prev.title}</span>
            </Link>
          </Button>
        ) : (
          <div className="flex h-10 items-center rounded-xl px-3 text-sm text-muted-foreground">Start of course</div>
        )}

        {neighbors.next ? (
          <Button
            asChild
            variant="ghost"
            className="min-w-0 justify-start bg-white/10 text-white/90 hover:bg-white/15 sm:justify-end"
          >
            <Link to={`${linkPrefix}/topic/${neighbors.next.slug}`} className="min-w-0">
              <span className="truncate">Next lesson: {neighbors.next.title}</span>
              <ArrowRight className="ml-2 h-4 w-4 shrink-0" />
            </Link>
          </Button>
        ) : (
          <div className="flex h-10 items-center rounded-xl px-3 text-sm text-muted-foreground sm:justify-end">End of course</div>
        )}
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-xs font-mono text-primary tracking-widest mb-2">UNIT {topic.unit} · LESSON {topic.order_index}</div>
        <h1 className="font-display text-2xl font-bold leading-tight sm:text-3xl md:text-5xl">{topic.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base md:text-lg">{topic.summary}</p>
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

      {pages.length > 0 && (
        <>
          <Button
            variant="ghost"
            size="icon"
            disabled={!canGoPrevious}
            onClick={goPreviousPage}
            aria-label={pageIdx > 0 ? "Previous page" : "Previous lesson"}
            className="fixed left-1 top-1/2 z-40 h-11 w-11 -translate-y-1/2 rounded-full border border-white/10 bg-background/25 text-white/55 shadow-lg shadow-black/10 backdrop-blur-md transition hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-15 sm:left-5 sm:h-14 sm:w-14 sm:border-white/15 sm:bg-background/70 sm:text-white/90 sm:shadow-2xl sm:shadow-black/20 sm:backdrop-blur-xl"
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={!canGoNext}
            onClick={goNextPage}
            aria-label={pageIdx < pages.length - 1 ? "Next page" : "Next lesson"}
            className="fixed right-1 top-1/2 z-40 h-11 w-11 -translate-y-1/2 rounded-full border border-white/10 bg-background/25 text-white/55 shadow-lg shadow-black/10 backdrop-blur-md transition hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-15 sm:right-5 sm:h-14 sm:w-14 sm:border-white/15 sm:bg-background/70 sm:text-white/90 sm:shadow-2xl sm:shadow-black/20 sm:backdrop-blur-xl"
          >
            <ArrowRight className="h-6 w-6" />
          </Button>
        </>
      )}

      {/* Render current page with karaoke offsets */}
      <div style={{ fontSize: `${readerZoom}%` }}>
        <motion.div
          key={pageIdx}
          initial={{ opacity: 0, x: pageTurnDirection === "next" ? 30 : -30, rotateY: pageTurnDirection === "next" ? -10 : 10 }}
          animate={{ opacity: 1, x: 0, rotateY: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="space-y-5"
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
                />
              );
            });
          })()}
        </motion.div>
      </div>

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

      {topic.quiz.length > 0 && pageIdx === pages.length - 1 && (
        <div className="mt-6 glass rounded-2xl p-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="font-display font-bold text-xl flex items-center gap-2"><Brain className="h-5 w-5 text-primary" /> Test yourself</div>
            <div className="text-sm text-muted-foreground">{topic.quiz.length} questions · pass with 70%+ {p?.passed && <span className="text-success">· Passed at {p.best_quiz_score}%</span>}</div>
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
