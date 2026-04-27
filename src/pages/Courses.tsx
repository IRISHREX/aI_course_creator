import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useCourses } from "@/hooks/useCourses";
import { useIsAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import { BookOpen, Plus, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Courses() {
  const { courses, loading, refresh } = useCourses();
  const { isAdmin } = useIsAdmin();

  const remove = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}" and all its lessons?`)) return;
    const { error } = await supabase.from("courses").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Course deleted"); refresh(); }
  };

  return (
    <div className="container py-12">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
        <div>
          <div className="text-xs font-mono text-primary tracking-widest mb-2">SIGNAL ACADEMY</div>
          <h1 className="font-display text-4xl md:text-5xl font-bold">All <span className="text-gradient">Courses</span></h1>
          <p className="text-muted-foreground mt-2">Pick a course to start learning. Each lesson includes visualizations & quizzes.</p>
        </div>
        {isAdmin && (
          <Button asChild variant="hero">
            <Link to="/admin/upload"><Plus className="h-4 w-4 mr-1" /> Upload course</Link>
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : courses.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center">
          <BookOpen className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No courses yet.</p>
          {isAdmin && <Button asChild variant="hero" className="mt-4"><Link to="/admin/upload">Upload first course</Link></Button>}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {courses.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={`/course/${c.slug}`} className="block group">
                <div className="glass rounded-2xl p-6 h-full hover:shadow-glow transition-all border border-border/60 hover:border-primary/60 relative overflow-hidden">
                  <div className="absolute -right-6 -top-6 text-7xl opacity-10 group-hover:opacity-30 transition">{c.cover_emoji || "📡"}</div>
                  <div className="text-4xl mb-4">{c.cover_emoji || "📡"}</div>
                  <h3 className="font-display text-xl font-bold mb-2 group-hover:text-gradient">{c.title}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-3">{c.description}</p>
                  <div className="mt-5 flex items-center justify-between">
                    <span className="text-xs font-mono text-primary inline-flex items-center gap-1"><Sparkles className="h-3 w-3" /> Open course →</span>
                    {isAdmin && (
                      <button onClick={(e) => { e.preventDefault(); remove(c.id, c.title); }}
                        className="text-muted-foreground hover:text-destructive p-1">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
