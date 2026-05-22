import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useTopics, useProgress } from "@/hooks/useTopics";
import { useCourseBySlug } from "@/hooks/useCourses";
import { useIsAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Sparkles, Download, Edit3, ArrowLeft, BookOpen, Brain, FileQuestion, Loader2, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Mindmap } from "@/components/Mindmap";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export default function CourseDetail() {
  const { courseSlug } = useParams();
  const { course, loading: cLoad } = useCourseBySlug(courseSlug);
  const { topics, loading } = useTopics(course?.id);
  const { progress } = useProgress();
  const { isAdmin } = useIsAdmin();
  const [downloading, setDownloading] = useState(false);
  const [genMM, setGenMM] = useState(false);
  const [mindmap, setMindmap] = useState<any>(null);
  const [pyqCount, setPyqCount] = useState(0);

  useEffect(() => {
    if (!course?.id) return;
    setMindmap((course as any).mindmap || null);
    supabase.from("course_pyq").select("id", { count: "exact", head: true }).eq("course_id", course.id)
      .then(({ count }) => setPyqCount(count || 0));
  }, [course?.id]);

  if (cLoad || loading) return <div className="container py-20 text-muted-foreground">Loading…</div>;
  if (!course) return <div className="container py-20 text-muted-foreground">Course not found.</div>;

  const generateMindmap = async () => {
    setGenMM(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-mindmap", { body: { courseId: course.id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMindmap(data.mindmap);
      toast.success("Course mind map generated");
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setGenMM(false); }
  };

  const byUnit: Record<number, typeof topics> = {};
  topics.forEach(t => { (byUnit[t.unit] ||= []).push(t); });

  const downloadDocx = async () => {
    setDownloading(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-course", {
        body: { courseId: course.id },
      });
      if (error) throw error;
      // Function returns base64 docx
      const bytes = Uint8Array.from(atob(data.docx), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${course.slug}.docx`; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message || "Download failed");
    } finally { setDownloading(false); }
  };

  return (
    <div className="container overflow-hidden px-3 py-8 sm:px-4 sm:py-12">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/courses"><ArrowLeft className="h-4 w-4 mr-1" /> All courses</Link>
      </Button>

      <div className="mb-10">
        <div className="max-w-7xl">
          <div className="mb-3 text-4xl sm:text-5xl">{course.cover_emoji}</div>
          <h1 className="font-display text-2xl font-bold leading-tight sm:text-4xl md:text-5xl">{course.title}</h1>
          <p className="mt-3 max-w-6xl text-sm leading-7 text-muted-foreground sm:text-base md:text-lg md:leading-relaxed">{course.description}</p>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button asChild variant="ghost" size="sm">
            <Link to={`/course/${course.slug}/pyq`}><FileQuestion className="h-4 w-4 mr-1" /> PYQs {pyqCount > 0 && <span className="ml-1 text-xs font-mono text-primary">({pyqCount})</span>}</Link>
          </Button>
          <Button asChild variant="neon" size="sm">
            <Link to={`/course/${course.slug}/quiz`}><Brain className="h-4 w-4 mr-1" /> Full course MCQ</Link>
          </Button>
          <Button onClick={downloadDocx} variant="neon" disabled={downloading}>
            <Download className="h-4 w-4 mr-1" /> {downloading ? "Building…" : "Download .docx"}
          </Button>
          {isAdmin && (
            <>
              <Button asChild variant="hero" className="col-span-2 sm:col-span-1">
                <Link to={`/course/${course.slug}/edit`}><Edit3 className="h-4 w-4 mr-1" /> Manage</Link>
              </Button>
              <Button asChild variant="neon" className="col-span-2 sm:col-span-1">
                <Link to={`/course/${course.slug}/settings`}><Settings2 className="h-4 w-4 mr-1" /> Settings</Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Auto Table of Contents */}
      {topics.length > 0 && (
        <div className="glass mb-8 rounded-xl p-4 sm:rounded-2xl sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="font-display text-base font-bold sm:text-lg">Table of Contents</h2>
            <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">{topics.length} lessons</span>
          </div>
          <ol className="grid gap-x-10 gap-y-1 text-sm sm:grid-cols-2 xl:grid-cols-3">
            {topics.map((t, i) => (
              <li key={t.id} className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] gap-2">
                <span className="font-mono text-xs text-muted-foreground">{t.unit}.{t.order_index}</span>
                <Link to={`/course/${course.slug}/topic/${t.slug}`} className="min-w-0 break-words leading-6 hover:text-primary sm:truncate">{t.title}</Link>
              </li>
            ))}
          </ol>
        </div>
      )}

      {topics.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-muted-foreground">
          No lessons yet. {isAdmin && <Link to={`/course/${course.slug}/edit`} className="text-primary">Add some →</Link>}
        </div>
      ) : (
        <div className="space-y-12">
          {Object.keys(byUnit).map(k => {
            const u = Number(k);
            const items = byUnit[u];
            return (
              <motion.section key={u} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-xl bg-gradient-primary grid place-items-center font-display font-bold text-primary-foreground shadow-glow">{u}</div>
                  <div>
                    <div className="text-xs font-mono text-muted-foreground">UNIT {u}</div>
                    <div className="font-display text-xl font-bold">{items[0]?.title.split(":")[0] || `Unit ${u}`}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {items.map((t) => {
                    const p = progress[t.id];
                    const passed = p?.passed; const viewed = p?.viewed;
                    return (
                      <Link key={t.id} to={`/course/${course.slug}/topic/${t.slug}`} className="group">
                        <motion.div whileHover={{ y: -4, scale: 1.02 }}
                          className={`relative glass rounded-2xl p-4 h-full transition-all ${
                            passed ? "border-success/60 shadow-glow" : viewed ? "border-primary/50" : "hover:border-primary/40"}`}>
                          <div className="flex items-start justify-between mb-2">
                            <div className={`h-9 w-9 rounded-lg grid place-items-center font-mono text-xs ${passed ? "bg-success/20 text-success" : "bg-primary/10 text-primary"}`}>
                              {u}.{t.order_index}
                            </div>
                            {passed ? <CheckCircle2 className="h-5 w-5 text-success animate-pulse-glow" /> :
                             viewed ? <Sparkles className="h-5 w-5 text-primary" /> :
                                      <Circle className="h-5 w-5 text-muted-foreground" />}
                          </div>
                          <div className="font-display font-semibold leading-tight">{t.title}</div>
                          <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{t.summary}</div>
                          {p && <div className="mt-3 text-[10px] font-mono text-muted-foreground">best: <span className={passed ? "text-success" : "text-warning"}>{p.best_quiz_score}%</span></div>}
                        </motion.div>
                      </Link>
                    );
                  })}
                </div>
              </motion.section>
            );
          })}
        </div>
      )}

      {topics.length > 0 && (
        <div className="mt-12 glass rounded-2xl p-6">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="font-display font-bold text-xl flex items-center gap-2"><Brain className="h-5 w-5 text-primary" /> Course Mind Map</div>
            {isAdmin && (
              <Button variant="neon" size="sm" onClick={generateMindmap} disabled={genMM}>
                {genMM ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                {mindmap ? "Regenerate" : "Generate"} mind map
              </Button>
            )}
          </div>
          {mindmap ? <Mindmap data={mindmap} /> : (
            <p className="text-sm text-muted-foreground">No course mind map yet{isAdmin ? " — click generate." : "."}</p>
          )}
        </div>
      )}
    </div>
  );
}
