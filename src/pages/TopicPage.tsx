import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useProgress, type Topic } from "@/hooks/useTopics";
import { useCourseBySlug } from "@/hooks/useCourses";
import { Visualization } from "@/components/Visualization";
import { Button } from "@/components/ui/button";
import { KaraokeReadMode, karaokeSeek } from "@/components/KaraokeReadMode";
import { BlockRenderer, blockToText, countWords } from "@/components/BlockRenderer";
import { paginate, pageReadable } from "@/lib/lessonPaging";
import { Mindmap } from "@/components/Mindmap";
import { ArrowLeft, ArrowRight, Edit3, Sparkles, Brain, Loader2, Bookmark, BookmarkCheck } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

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
  const [activeWord, setActiveWord] = useState<number | null>(null);
  const [genMindmap, setGenMindmap] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);

  // Resume from URL hash: #p=2&w=14
  useEffect(() => {
    const h = window.location.hash;
    const m = h.match(/p=(\d+)/);
    if (m) setPageIdx(Math.max(0, parseInt(m[1], 10) - 1));
  }, [slug]);

  useEffect(() => {
    if (!slug || !course?.id) return;
    (async () => {
      const { data: all } = await supabase.from("topics").select("*").eq("course_id", course.id).order("unit").order("order_index");
      const list = (all as any as Topic[]) ?? [];
      const idx = list.findIndex(t => t.slug === slug);
      if (idx >= 0) {
        setTopic(list[idx]);
        setNeighbors({ prev: list[idx - 1], next: list[idx + 1] });
        setPageIdx(0);
      }
    })();
  }, [slug, course?.id]);

  useEffect(() => { if (topic && user) markViewed(topic.id); /* eslint-disable-next-line */ }, [topic?.id, user?.id]);

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
      const { data, error } = await supabase.functions.invoke("generate-quiz", {
        body: { title: topic.title, summary: topic.summary, content: topic.content },
      });
      if (error) throw error;
      if (data?.questions?.length) {
        const merged = [...topic.quiz, ...data.questions];
        await supabase.from("topics").update({ quiz: merged }).eq("id", topic.id);
        setTopic({ ...topic, quiz: merged });
        toast.success(`Added ${data.questions.length} AI questions`);
      }
    } catch (e: any) { toast.error(e.message || "AI generation failed"); }
    finally { setGenerating(false); }
  };

  const generateMindmap = async () => {
    if (!isAdmin) return;
    setGenMindmap(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-mindmap", { body: { topicId: topic.id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setTopic({ ...topic, mindmap: data.mindmap } as any);
      toast.success("Mind map generated");
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setGenMindmap(false); }
  };

  const addBookmark = async () => {
    if (!user) { toast.info("Sign in to bookmark"); return; }
    if (!topic || !course) return;
    setBookmarking(true);
    try {
      const label = window.prompt("Bookmark label (optional):", `${topic.title} — page ${pageIdx + 1}`) || null;
      const { error } = await supabase.from("bookmarks").insert({
        user_id: user.id,
        topic_id: topic.id,
        course_id: course.id,
        page_index: pageIdx,
        word_index: activeWord ?? 0,
        label,
      });
      if (error) throw error;
      toast.success("Bookmarked");
    } catch (e: any) { toast.error(e.message || "Bookmark failed"); }
    finally { setBookmarking(false); }
  };

  const linkPrefix = `/course/${courseSlug}`;

  return (
    <div className="container max-w-5xl py-10">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to={linkPrefix}><ArrowLeft className="h-4 w-4 mr-1" /> {course?.title || "Course"}</Link>
        </Button>
        <div className="flex items-center gap-2">
          <KaraokeReadMode text={pageText} onWordIndex={setActiveWord} />
          <Button variant="ghost" size="sm" onClick={addBookmark} disabled={bookmarking} title="Bookmark this page">
            {bookmarking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}
          </Button>
          {isAdmin && (
            <Button asChild variant="neon" size="sm">
              <Link to={`${linkPrefix}/topic/${topic.slug}/edit`}><Edit3 className="h-4 w-4 mr-1" /> Edit</Link>
            </Button>
          )}
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-xs font-mono text-primary tracking-widest mb-2">UNIT {topic.unit} · LESSON {topic.order_index}</div>
        <h1 className="font-display text-3xl md:text-5xl font-bold">{topic.title}</h1>
        <p className="text-lg text-muted-foreground mt-3">{topic.summary}</p>
      </motion.div>

      <div className="my-8"><Visualization kind={topic.visualization} /></div>

      {/* Pagination header */}
      {pages.length > 1 && (
        <div className="flex items-center justify-between mb-4 glass rounded-xl p-3">
          <div className="text-xs font-mono text-muted-foreground">Page {pageIdx + 1} of {pages.length}</div>
          <div className="flex gap-1">
            {pages.map((_, i) => (
              <button key={i} onClick={() => setPageIdx(i)}
                className={`h-2 w-8 rounded-full transition-colors ${i === pageIdx ? "bg-primary" : "bg-muted hover:bg-primary/40"}`} />
            ))}
          </div>
        </div>
      )}

      {/* Render current page with karaoke offsets */}
      <div className="space-y-5">
        {currentPage && (() => {
          let off = 0;
          return currentPage.blocks.map((b: any, i: number) => {
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
      </div>

      {/* Pagination footer */}
      {pages.length > 1 && (
        <div className="flex items-center justify-between mt-8 gap-2">
          <Button variant="ghost" disabled={pageIdx === 0} onClick={() => { setPageIdx(p => p - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Previous page
          </Button>
          <span className="text-xs font-mono text-muted-foreground">{pageIdx + 1} / {pages.length}</span>
          <Button variant="hero" disabled={pageIdx === pages.length - 1} onClick={() => { setPageIdx(p => p + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            Next page <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
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
                {(topic as any).mindmap ? "Regenerate" : "Generate"} mind map
              </Button>
            )}
          </div>
          {(topic as any).mindmap ? <Mindmap data={(topic as any).mindmap} /> : (
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
                <Sparkles className="h-4 w-4 mr-1" /> {generating ? "Generating…" : "AI: add questions"}
              </Button>
            )}
            <Button variant="hero" size="lg" onClick={() => nav(`${linkPrefix}/topic/${topic.slug}/quiz`)}>
              Start quiz <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <div className="mt-8 flex justify-between gap-4">
        {neighbors.prev ? (
          <Button asChild variant="ghost"><Link to={`${linkPrefix}/topic/${neighbors.prev.slug}`}><ArrowLeft className="h-4 w-4 mr-1" />{neighbors.prev.title}</Link></Button>
        ) : <span />}
        {neighbors.next && (
          <Button asChild variant="ghost"><Link to={`${linkPrefix}/topic/${neighbors.next.slug}`}>{neighbors.next.title}<ArrowRight className="h-4 w-4 ml-1" /></Link></Button>
        )}
      </div>
    </div>
  );
}
