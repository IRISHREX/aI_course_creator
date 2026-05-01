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
import { ArrowLeft, CheckCircle2, Edit3, FileText, Loader2, Lock, Plus, RefreshCw, Save, Sparkles, Tag, Trash2, Upload, X, Zap } from "lucide-react";
import { extractTextFromFile } from "@/lib/extractText";

export default function CourseEdit() {
  const { courseSlug } = useParams();
  const { isAdmin, loading: aLoad } = useIsAdmin();
  const { course, loading: cLoad } = useCourseBySlug(courseSlug);
  const { topics, setTopics } = useTopics(course?.id);
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [generating, setGenerating] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [reDocsUrl, setReDocsUrl] = useState("");
  const [reRawText, setReRawText] = useState("");
  const [resetLessons, setResetLessons] = useState(true);
  const [reUploading, setReUploading] = useState(false);

  useEffect(() => {
    if (course) {
      setTitle(course.title); setDescription(course.description); setEmoji(course.cover_emoji || "📘");
      setTags(((course as any).tags as string[]) || []);
    }
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
      title, description, cover_emoji: emoji, tags,
    } as any).eq("id", course.id);
    if (error) toast.error(error.message); else toast.success("Course updated");
  };

  const addTag = () => {
    const v = tagInput.trim().toLowerCase();
    if (!v) return;
    if (tags.includes(v)) { setTagInput(""); return; }
    setTags([...tags, v]);
    setTagInput("");
  };
  const removeTag = (t: string) => setTags(tags.filter(x => x !== t));

  const addTopic = async (opts?: { aiGenerate?: boolean }) => {
    const titleIn = prompt("New lesson title:");
    if (!titleIn) return;
    const summaryIn = prompt("Short summary (optional):") || "";
    const unitIn = Number(prompt("Unit number (e.g. 1):", "1") || 1);
    try {
      const { data, error } = await supabase.functions.invoke("create-topic", {
        body: { courseId: course.id, title: titleIn, summary: summaryIn, unit: unitIn, generate: !!opts?.aiGenerate },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const created = data.topic;
      await refreshTopics();
      if (opts?.aiGenerate && created) {
        toast.info("Generating lesson with AI…");
        await generateOne(created.id);
      } else if (created) {
        nav(`/course/${course.slug}/topic/${created.slug}/edit`);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to add lesson");
    }
  };

  const continueLesson = async (topicId: string) => {
    setGenerating(topicId);
    try {
      const { data, error } = await supabase.functions.invoke("generate-lesson", { body: { topicId, mode: "continue" } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Added ${data.blocks} more blocks`);
      await refreshTopics();
    } catch (e: any) {
      toast.error(e.message || "Continue failed");
    } finally { setGenerating(null); }
  };

  const deleteTopic = async (id: string, t: string) => {
    if (!confirm(`Delete lesson "${t}"?`)) return;
    const { error } = await supabase.from("topics").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); refreshTopics(); }
  };

  const handleReFile = async (file: File) => {
    try {
      toast.info(`Reading ${file.name}…`);
      const text = await extractTextFromFile(file);
      if (!text.trim()) throw new Error("No text extracted");
      setReRawText(text);
      toast.success(`Extracted ${text.length.toLocaleString()} characters`);
    } catch (e: any) {
      toast.error(e.message || "Could not read file");
    }
  };

  const reuploadSource = async () => {
    if (!reDocsUrl.trim() && !reRawText.trim()) { toast.error("Provide a Google Docs URL, paste text, or upload a file"); return; }
    setReUploading(true);
    try {
      const { data, error } = await supabase.functions.invoke("update-course-source", {
        body: {
          courseId: course.id,
          docsUrl: reDocsUrl.trim() || undefined,
          rawText: reRawText.trim() || undefined,
          resetLessons,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Source updated (${data.sourceLength.toLocaleString()} chars${data.attempts > 1 ? `, ${data.attempts} attempts` : ""})`);
      setReDocsUrl(""); setReRawText("");
      await refreshTopics();
      if (resetLessons) {
        toast.info("Re-running generation for all lessons…");
        await generateAllRemaining();
      }
    } catch (e: any) {
      toast.error(e.message || "Re-upload failed");
    } finally { setReUploading(false); }
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
        <div>
          <Label className="flex items-center gap-1"><Tag className="h-3 w-3" /> Tags</Label>
          <div className="flex flex-wrap gap-1.5 mt-2 mb-2 min-h-[28px]">
            {tags.length === 0 && <span className="text-xs text-muted-foreground">No tags yet. Add some below.</span>}
            {tags.map(t => (
              <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs border border-primary/30">
                #{t}
                <button onClick={() => removeTag(t)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
              placeholder="Add a tag and press Enter (e.g. networking, beginner, ignou)"
            />
            <Button type="button" variant="neon" onClick={addTag}><Plus className="h-4 w-4" /></Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Click Save course to persist tag changes.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={saveCourse} variant="hero"><Save className="h-4 w-4 mr-1" /> Save course</Button>
          <Button onClick={exportDocx} variant="neon">Export as .docx</Button>
        </div>
      </div>

      {/* Re-upload source */}
      <div className="glass rounded-2xl p-6 mb-8 border border-primary/20">
        <div className="flex items-center gap-2 mb-1">
          <RefreshCw className="h-5 w-5 text-primary" />
          <div className="font-display font-bold text-lg">Re-upload source</div>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Replace this course's source material. Useful when the original Google Docs upload failed or the document changed. The function retries the fetch up to 3 times.
        </p>

        <Label className="text-xs flex items-center gap-1"><FileText className="h-3 w-3" /> Google Docs URL (shared as "Anyone with the link")</Label>
        <Input value={reDocsUrl} onChange={e => setReDocsUrl(e.target.value)} placeholder="https://docs.google.com/document/d/..." className="mt-1" />

        <div className="my-3 text-center text-xs text-muted-foreground">— or —</div>

        <Label className="text-xs">Upload .txt / .md / .pdf / .docx</Label>
        <Input type="file" accept=".txt,.md,.pdf,.docx" onChange={e => e.target.files?.[0] && handleReFile(e.target.files[0])} className="mt-1" />

        <div className="my-3 text-center text-xs text-muted-foreground">— or —</div>

        <Label className="text-xs">Paste raw text</Label>
        <Textarea rows={5} value={reRawText} onChange={e => setReRawText(e.target.value)} placeholder="Paste new course material here…" className="mt-1 font-mono text-xs" />

        <label className="flex items-center gap-2 mt-4 text-sm cursor-pointer">
          <input type="checkbox" checked={resetLessons} onChange={e => setResetLessons(e.target.checked)} className="h-4 w-4 accent-primary" />
          Reset all lessons and re-run AI generation with the new source
        </label>

        <Button onClick={reuploadSource} variant="hero" disabled={reUploading || batchRunning} className="w-full mt-4">
          {reUploading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Re-uploading…</> : <><Upload className="h-4 w-4 mr-1" /> Re-upload source{resetLessons ? " & regenerate" : ""}</>}
        </Button>
      </div>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-display text-2xl font-bold">Lessons ({topics.length})</h2>
        <div className="flex gap-2">
          <Button onClick={() => addTopic({ aiGenerate: false })} variant="ghost"><Plus className="h-4 w-4 mr-1" /> Empty lesson</Button>
          <Button onClick={() => addTopic({ aiGenerate: true })} variant="hero"><Sparkles className="h-4 w-4 mr-1" /> Add lesson + AI generate</Button>
        </div>
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
              const blockCount = Array.isArray((t as any).content) ? (t as any).content.length : 0;
              return (
                <tr key={t.id} className="border-t border-border/50">
                  <td className="p-3 font-mono">U{t.unit}.{t.order_index}</td>
                  <td className="p-3">
                    {t.title}
                    <div className="text-[10px] text-muted-foreground">{blockCount} blocks</div>
                  </td>
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
                      <>
                        <Button variant="ghost" size="sm" disabled={isGen} onClick={() => continueLesson(t.id)} title="Add more (continue / deeper)">
                          {isGen ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="sm" disabled={isGen} onClick={() => generateOne(t.id)} title="Regenerate from scratch">
                          {isGen ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        </Button>
                      </>
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
