import { Link, useParams } from "react-router-dom";
import { useTopics, useProgress } from "@/hooks/useTopics";
import { useCourseBySlug } from "@/hooks/useCourses";
import { useAuth } from "@/hooks/useAuth";
import { CheckCircle2, Circle, BarChart3, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import ThreeBackground from "@/components/ThreeBackground";

export default function CoverageBoard() {
  const { courseSlug } = useParams();
  const { course } = useCourseBySlug(courseSlug);
  const { topics } = useTopics(course?.id);
  const { progress } = useProgress();
  const { user } = useAuth();

  const total = topics.length;
  const passed = topics.filter(t => progress[t.id]?.passed).length;
  const viewed = topics.filter(t => progress[t.id]?.viewed).length;
  const pct = total ? Math.round((passed / total) * 100) : 0;

  return (
    <>
      <ThreeBackground />
      <div className="container py-12">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to={`/course/${courseSlug}`}><ArrowLeft className="h-4 w-4 mr-1" /> {course?.title || "Course"}</Link>
      </Button>
      <h1 className="font-display text-4xl md:text-5xl font-bold">Coverage <span className="text-gradient">Board</span></h1>
      <p className="text-muted-foreground mt-2">{course?.title} — track every topic.</p>

      <div className="grid md:grid-cols-3 gap-4 mt-8">
        <div className="glass rounded-2xl p-6">
          <div className="text-xs font-mono text-muted-foreground">TOPICS PASSED</div>
          <div className="font-display text-4xl font-bold text-gradient mt-1">{passed} / {total}</div>
        </div>
        <div className="glass rounded-2xl p-6">
          <div className="text-xs font-mono text-muted-foreground">VIEWED</div>
          <div className="font-display text-4xl font-bold mt-1">{viewed}</div>
        </div>
        <div className="glass rounded-2xl p-6">
          <div className="text-xs font-mono text-muted-foreground">OVERALL</div>
          <div className="font-display text-4xl font-bold mt-1 flex items-center gap-2">{pct}% <BarChart3 className="h-6 w-6 text-primary" /></div>
          <div className="h-2 bg-muted rounded-full mt-3 overflow-hidden">
            <motion.div className="h-full bg-gradient-primary" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} />
          </div>
        </div>
      </div>

      {!user && (
        <div className="mt-6 glass rounded-xl p-4 text-sm text-muted-foreground">
          Sign in to start tracking your progress and unlock the certificate.
        </div>
      )}

      <div className="mt-10 glass rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs font-mono text-muted-foreground uppercase">
            <tr><th className="text-left p-4">#</th><th className="text-left p-4">Topic</th><th className="text-left p-4 hidden md:table-cell">Unit</th><th className="text-left p-4">Status</th><th className="text-left p-4">Best</th><th className="p-4"></th></tr>
          </thead>
          <tbody>
            {topics.map((t, idx) => {
              const p = progress[t.id];
              return (
                <tr key={t.id} className="border-t border-border/50 hover:bg-primary/5 transition">
                  <td className="p-4 font-mono text-muted-foreground">{String(idx + 1).padStart(2, "0")}</td>
                  <td className="p-4 font-medium">{t.title}</td>
                  <td className="p-4 hidden md:table-cell text-muted-foreground">{t.unit}.{t.order_index}</td>
                  <td className="p-4">
                    {p?.passed ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" /> Passed</span>
                    : p?.viewed ? <span className="inline-flex items-center gap-1 text-primary">In progress</span>
                    : <span className="inline-flex items-center gap-1 text-muted-foreground"><Circle className="h-4 w-4" /> Locked</span>}
                  </td>
                  <td className="p-4 font-mono">{p ? `${p.best_quiz_score}%` : "—"}</td>
                  <td className="p-4 text-right"><Link to={`/course/${courseSlug}/topic/${t.slug}`} className="text-primary text-xs">Open →</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}
