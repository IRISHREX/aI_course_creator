import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as THREE from "three";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useProgress, type Topic } from "@/hooks/useTopics";
import { useCourseBySlug } from "@/hooks/useCourses";
import { Visualization } from "@/components/Visualization";
import { Button } from "@/components/ui/button";
import { KaraokeReadMode, karaokeSeek } from "@/components/KaraokeReadMode";
import { LessonPYQButton } from "@/components/LessonPYQButton";
import { BlockRenderer, blockToText, countWords } from "@/components/BlockRenderer";
import { paginate, pageReadable } from "@/lib/lessonPaging";
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
        const fresh = data.questions.slice(0, 10);
        await supabase.from("topics").update({ quiz: fresh }).eq("id", topic.id);
        setTopic({ ...topic, quiz: fresh });
        toast.success(`Replaced old MCQs with ${fresh.length} fresh question${fresh.length === 1 ? "" : "s"}`);
      }
    } catch (e: any) { toast.error(e.message || "AI generation failed"); }
    finally { setGenerating(false); }
  };

  const generateMindmap = async () => {
    if (!isAdmin) return;
    setGenMindmap(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-mindmap", { body: { topicId: topic.id, courseId: course?.id } });
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
    <div className="container relative max-w-5xl overflow-hidden px-3 py-6 sm:px-4 sm:py-10">
      <div ref={terrainContainerRef} className="fixed inset-0 -z-20 overflow-hidden pointer-events-none" />
      <div className="mb-5 flex min-w-0 flex-col gap-3 sm:mb-6 md:flex-row md:items-center md:justify-between">
        <Button asChild variant="ghost" size="sm" className="max-w-full justify-start px-2">
          <Link to={linkPrefix} className="min-w-0">
            <ArrowLeft className="h-4 w-4 shrink-0 mr-1" />
            <span className="truncate">{course?.title || "Course"}</span>
          </Link>
        </Button>
        <div className="grid grid-cols-5 gap-1.5 sm:flex sm:items-center sm:gap-2">
          <KaraokeReadMode text={pageText} onWordIndex={setActiveWord} />
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
        </motion.div>
      </div>

      {/* Pagination footer */}
      {pages.length > 1 && (
        <div className="mt-8 flex justify-center">
          <div className="flex flex-wrap items-center gap-3 rounded-full border border-white/15 bg-white/5 px-4 py-3 shadow-2xl shadow-black/10 backdrop-blur-xl">
            <Button
              variant="ghost"
              disabled={pageIdx === 0}
              onClick={() => {
                if (pageIdx === 0) return;
                setPageTurnDirection("prev");
                setPageIdx((p) => p - 1);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="bg-white/10 border border-white/10 text-white/90 hover:bg-white/15 backdrop-blur-xl transition-all duration-300"
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Previous page
            </Button>

            <span className="text-xs font-mono text-muted-foreground px-2">
              {pageIdx + 1} / {pages.length}
            </span>

            <Button
              variant="ghost"
              disabled={pageIdx === pages.length - 1}
              onClick={() => {
                if (pageIdx === pages.length - 1) return;
                setPageTurnDirection("next");
                setPageIdx((p) => p + 1);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="bg-white/10 border border-white/10 text-white/90 hover:bg-white/15 backdrop-blur-xl transition-all duration-300"
            >
              Next page <ArrowRight className="h-4 w-4 ml-1" />
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
                <Sparkles className="h-4 w-4 mr-1" /> {generating ? "Generating..." : "AI: regenerate MCQs"}
              </Button>
            )}
            <Button variant="hero" size="lg" onClick={() => nav(`${linkPrefix}/topic/${topic.slug}/quiz`)}>
              Start quiz <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <div className="mt-8 flex justify-center">
        <div className="flex flex-wrap items-center justify-center gap-4 rounded-full border border-white/10 bg-white/5 px-4 py-3 shadow-2xl shadow-black/10 backdrop-blur-xl">
          {neighbors.prev ? (
            <Button
              asChild
              variant="ghost"
              className="bg-white/10 border border-white/10 text-white/90 hover:bg-white/15 backdrop-blur-xl transition-all duration-300"
            >
              <Link to={`${linkPrefix}/topic/${neighbors.prev.slug}`}><ArrowLeft className="h-4 w-4 mr-1" />{neighbors.prev.title}</Link>
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Start of course</span>
          )}

          {neighbors.next ? (
            <Button
              asChild
              variant="ghost"
              className="bg-white/10 border border-white/10 text-white/90 hover:bg-white/15 backdrop-blur-xl transition-all duration-300"
            >
              <Link to={`${linkPrefix}/topic/${neighbors.next.slug}`}>{neighbors.next.title}<ArrowRight className="h-4 w-4 ml-1" /></Link>
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">End of course</span>
          )}
        </div>
      </div>
    </div>
  );
}
