import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useTopics, useProgress } from "@/hooks/useTopics";
import { useCourseBySlug } from "@/hooks/useCourses";
import { useIsAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Sparkles, Download, Edit3, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";

export default function CourseDetail() {
  const { courseSlug } = useParams();
  const { course, loading: cLoad } = useCourseBySlug(courseSlug);
  const { topics, loading } = useTopics(course?.id);
  const { progress } = useProgress();
  const { isAdmin } = useIsAdmin();
  const [downloading, setDownloading] = useState(false);

  if (cLoad || loading) return <div className="container py-20 text-muted-foreground">Loading…</div>;
  if (!course) return <div className="container py-20 text-muted-foreground">Course not found.</div>;

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
    <div className="container py-12">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/courses"><ArrowLeft className="h-4 w-4 mr-1" /> All courses</Link>
      </Button>

      <div className="flex items-start justify-between flex-wrap gap-4 mb-10">
        <div>
          <div className="text-5xl mb-3">{course.cover_emoji}</div>
          <h1 className="font-display text-4xl md:text-5xl font-bold">{course.title}</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">{course.description}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={downloadDocx} variant="neon" disabled={downloading}>
            <Download className="h-4 w-4 mr-1" /> {downloading ? "Building…" : "Download .docx"}
          </Button>
          {isAdmin && (
            <Button asChild variant="hero">
              <Link to={`/course/${course.slug}/edit`}><Edit3 className="h-4 w-4 mr-1" /> Manage</Link>
            </Button>
          )}
        </div>
      </div>

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
    </div>
  );
}
