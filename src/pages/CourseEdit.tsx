import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useCourseBySlug } from "@/hooks/useCourses";
import { useTopics } from "@/hooks/useTopics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Edit3, Loader2, Lock, Plus, Save, Sparkles, Trash2, Zap } from "lucide-react";

export default function CourseEdit() {
  const { courseSlug } = useParams();
  const { isAdmin, loading: aLoad } = useIsAdmin();
  const { course, loading: cLoad } = useCourseBySlug(courseSlug);
  const { topics, setTopics } = useTopics(course?.id);
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("");
  const [generating, setGenerating] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);

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

  const ready = topics.filter(t => (t as any).generation_status === "ready").length;
  const pending = topics.length - ready;
  const pct = topics.length ? Math.round((ready / topics.length) * 100) : 100;

  const refreshTopics = async () => {
    const { data } = await supabase.from("topics").select("*").eq("course_id", course.id).order("unit").order("order_index");
    setTopics((data as any) ?? []);
  };

  const generateOne = async (topicId: string) => {
    setGenerating(topicId);
    try {
      const { data, error } = await supabase.functions.invoke("generate-lesson", { body: { topicId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Lesson generated");
      await refreshTopics();
    } catch (e: any) {
      toast.error(e.message || "Generation failed");
    } finally { setGenerating(null); }
  };

  const generateAllRemaining = async () => {
    setBatchRunning(true);
    const pendingTopics = topics.filter(t => (t as any).generation_status !== "ready");
    for (const t of pendingTopics) {
      try {
        await supabase.functions.invoke("generate-lesson", { body: { topicId: t.id } });
        await refreshTopics();
      } catch (e: any) {
        toast.error(`Failed: ${t.title}`);
      }
    }
    setBatchRunning(false);
    toast.success("Batch generation complete");
  };

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
    if (error) toast.error(error.message); else { toast.success("Deleted"); refreshTopics(); }
  };

  const exportDocx = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("export-course", { body: { courseId: course.id } });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
      else toast.success("Export ready");
    } catch (e: any) { toast.error(e.message || "Export failed"); }
  };

  return (
    <div className="container max-w-4xl py-10">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to={`/course/${course.slug}`}><ArrowLeft className="h-4 w-4 mr-1" /> Back to course</Link>
      </Button>

      <h1 className="font-display text-3xl font-bold mb-6">Manage Course</h1>

      {/* Generation progress */}
      {topics.length > 0 && (
        <div className="glass rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="font-display font-bold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> AI Generation Progress
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {ready} of {topics.length} lessons ready · {pending} pending
              </div>
            </div>
            {pending > 0 && (
              <Button onClick={generateAllRemaining} variant="hero" size="sm" disabled={batchRunning}>
                {batchRunning ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating…</> : <><Zap className="h-4 w-4 mr-1" /> Generate all remaining</>}
              </Button>
            )}
          </div>
          <Progress value={pct} className="h-2" />
        </div>
      )}

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
        <div className="flex gap-2 flex-wrap">
          <Button onClick={saveCourse} variant="hero"><Save className="h-4 w-4 mr-1" /> Save course</Button>
          <Button onClick={exportDocx} variant="neon">Export as .docx</Button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-2xl font-bold">Lessons ({topics.length})</h2>
        <Button onClick={addTopic} variant="neon"><Plus className="h-4 w-4 mr-1" /> Add lesson</Button>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs font-mono text-muted-foreground uppercase">
            <tr>
              <th className="text-left p-3">Unit</th>
              <th className="text-left p-3">Title</th>
              <th className="text-left p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {topics.map(t => {
              const status = (t as any).generation_status || "ready";
              const isReady = status === "ready";
              const isGen = generating === t.id;
              return (
                <tr key={t.id} className="border-t border-border/50">
                  <td className="p-3 font-mono">U{t.unit}.{t.order_index}</td>
                  <td className="p-3">{t.title}</td>
                  <td className="p-3">
                    {isReady ? (
                      <span className="inline-flex items-center gap-1 text-xs text-primary"><CheckCircle2 className="h-3 w-3" /> Ready</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">⏳ Pending</span>
                    )}
                  </td>
                  <td className="p-3 text-right space-x-1 whitespace-nowrap">
                    {!isReady && (
                      <Button variant="neon" size="sm" disabled={isGen || batchRunning} onClick={() => generateOne(t.id)}>
                        {isGen ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-4 w-4 mr-1" /> Generate</>}
                      </Button>
                    )}
                    {isReady && (
                      <Button variant="ghost" size="sm" disabled={isGen} onClick={() => generateOne(t.id)} title="Regenerate">
                        {isGen ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      </Button>
                    )}
                    <Button asChild variant="ghost" size="sm"><Link to={`/course/${course.slug}/topic/${t.slug}/edit`}><Edit3 className="h-4 w-4" /></Link></Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteTopic(t.id, t.title)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
