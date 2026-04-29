import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { useCourses } from "@/hooks/useCourses";
import { useIsAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import { BookOpen, Check, ChevronDown, Plus, Sparkles, Tag, Trash2, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Courses() {
  const { courses, loading, refresh } = useCourses();
  const { isAdmin } = useIsAdmin();
  const [activeTags, setActiveTags] = useState<string[]>([]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    courses.forEach(c => (c.tags || []).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [courses]);

  const filteredCourses = useMemo(() => {
    if (activeTags.length === 0) return courses;
    return courses.filter(c => activeTags.every(t => (c.tags || []).includes(t)));
  }, [courses, activeTags]);

  const toggleTag = (t: string) => {
    setActiveTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const remove = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}" and all its lessons?`)) return;
    const { error } = await supabase.from("courses").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Course deleted"); refresh(); }
  };

  return (
    <div className="container py-12">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
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

      {allTags.length > 0 && (
        <div className="glass rounded-2xl p-4 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="h-4 w-4 text-primary" />
            <div className="text-sm font-display font-bold">Filter by tags</div>
            {activeTags.length > 0 && (
              <button onClick={() => setActiveTags([])} className="ml-auto text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                <X className="h-3 w-3" /> Clear ({activeTags.length})
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allTags.map(t => {
              const active = activeTags.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={`px-3 py-1 rounded-full text-xs border transition-all ${
                    active
                      ? "bg-primary text-primary-foreground border-primary shadow-glow"
                      : "bg-muted/40 text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
                  }`}
                >
                  #{t}
                </button>
              );
            })}
          </div>
          {activeTags.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-3">
              Showing {filteredCourses.length} of {courses.length} courses matching all selected tags.
            </p>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : filteredCourses.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center">
          <BookOpen className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            {courses.length === 0 ? "No courses yet." : "No courses match the selected tags."}
          </p>
          {isAdmin && courses.length === 0 && <Button asChild variant="hero" className="mt-4"><Link to="/admin/upload">Upload first course</Link></Button>}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCourses.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={`/course/${c.slug}`} className="block group">
                <div className="glass rounded-2xl p-6 h-full hover:shadow-glow transition-all border border-border/60 hover:border-primary/60 relative overflow-hidden">
                  <div className="absolute -right-6 -top-6 text-7xl opacity-10 group-hover:opacity-30 transition">{c.cover_emoji || "📡"}</div>
                  <div className="text-4xl mb-4">{c.cover_emoji || "📡"}</div>
                  <h3 className="font-display text-xl font-bold mb-2 group-hover:text-gradient">{c.title}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-3">{c.description}</p>
                  {c.tags && c.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {c.tags.slice(0, 4).map(t => (
                        <span
                          key={t}
                          onClick={(e) => { e.preventDefault(); toggleTag(t); }}
                          className={`px-2 py-0.5 rounded-full text-[10px] border cursor-pointer ${
                            activeTags.includes(t)
                              ? "bg-primary/20 text-primary border-primary/50"
                              : "bg-muted/40 text-muted-foreground border-border hover:border-primary/60"
                          }`}
                        >
                          #{t}
                        </span>
                      ))}
                      {c.tags.length > 4 && <span className="text-[10px] text-muted-foreground">+{c.tags.length - 4}</span>}
                    </div>
                  )}
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
