import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useCourseBySlug } from "@/hooks/useCourses";
import { useTopics } from "@/hooks/useTopics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Edit3, Lock, Plus, Save, Trash2 } from "lucide-react";

export default function CourseEdit() {
  const { courseSlug } = useParams();
  const { isAdmin, loading: aLoad } = useIsAdmin();
  const { course, loading: cLoad } = useCourseBySlug(courseSlug);
  const { topics } = useTopics(course?.id);
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("");

  useEffect(() => {
    if (course) { setTitle(course.title); setDescription(course.description); setEmoji(course.cover_emoji || "📘"); }
  }, [course]);

  if (aLoad || cLoad) return <div className="container py-20 text-muted-foreground">Loading…</div>;
  if (!isAdmin) return (
    <div className="container max-w-md py-20 text-center">
      <Lock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
      <h1 className="font-display text-2xl font-bold">Admins only</h1>
      <Button asChild variant="hero" className="mt-4"><Link to={`/course/${courseSlug}`}>Back</Link></Button>
    </div>
  );
  if (!course) return <div className="container py-20 text-muted-foreground">Course not found.</div>;

  const saveCourse = async () => {
    const { error } = await supabase.from("courses").update({
      title, description, cover_emoji: emoji,
    }).eq("id", course.id);
    if (error) toast.error(error.message); else toast.success("Course updated");
  };

  const addTopic = async () => {
    const maxOrder = Math.max(0, ...topics.filter(t => t.unit === 1).map(t => t.order_index));
    const slug = `${course.slug}-lesson-${Date.now()}`;
    const { data, error } = await supabase.from("topics").insert({
      course_id: course.id, slug, unit: 1, order_index: maxOrder + 1,
      title: "New Lesson", summary: "Edit this lesson", content: [{ type: "text", value: "Lesson content here." }], quiz: [],
    }).select().maybeSingle();
    if (error) { toast.error(error.message); return; }
    if (data) nav(`/course/${course.slug}/topic/${data.slug}/edit`);
  };

  const deleteTopic = async (id: string, t: string) => {
    if (!confirm(`Delete lesson "${t}"?`)) return;
    const { error } = await supabase.from("topics").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); window.location.reload(); }
  };

  return (
    <div className="container max-w-4xl py-10">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to={`/course/${course.slug}`}><ArrowLeft className="h-4 w-4 mr-1" /> Back to course</Link>
      </Button>

      <h1 className="font-display text-3xl font-bold mb-6">Manage Course</h1>

      <div className="glass rounded-2xl p-6 space-y-4 mb-8">
        <div className="grid sm:grid-cols-[1fr_120px] gap-3">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Emoji</Label>
            <Input value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={2} className="text-center text-xl" />
          </div>
        </div>
        <div>
          <Label>Description</Label>
          <Textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <Button onClick={saveCourse} variant="hero"><Save className="h-4 w-4 mr-1" /> Save course</Button>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-2xl font-bold">Lessons ({topics.length})</h2>
        <Button onClick={addTopic} variant="neon"><Plus className="h-4 w-4 mr-1" /> Add lesson</Button>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs font-mono text-muted-foreground uppercase">
            <tr><th className="text-left p-3">Unit</th><th className="text-left p-3">Title</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {topics.map(t => (
              <tr key={t.id} className="border-t border-border/50">
                <td className="p-3 font-mono">U{t.unit}.{t.order_index}</td>
                <td className="p-3">{t.title}</td>
                <td className="p-3 text-right space-x-1">
                  <Button asChild variant="ghost" size="sm"><Link to={`/course/${course.slug}/topic/${t.slug}/edit`}><Edit3 className="h-4 w-4" /></Link></Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteTopic(t.id, t.title)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
