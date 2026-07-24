import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { backendApi } from "@/integrations/api/client";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useCourseBySlug } from "@/hooks/useCourses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, Sparkles, Trash2, Loader2, Save, Lock, Tag, FileQuestion } from "lucide-react";
import { toast } from "sonner";

interface PYQ {
  id?: string; question: string; answer: string;
  marks?: number | null; year?: number | null;
  source?: string | null; order_index: number;
  topic_ids?: string[];
}

type PyqTopicLink = { pyq_id: string; topic_id: string };
type TopicOption = { id: string; title: string };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function CoursePYQ() {
  const { courseSlug } = useParams();
  const nav = useNavigate();
  const { course, loading: cLoad } = useCourseBySlug(courseSlug);
  const { isAdmin, loading: aLoad } = useIsAdmin();
  const [items, setItems] = useState<PYQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [topics, setTopics] = useState<TopicOption[]>([]);

  const reload = useCallback(async () => {
    if (!course?.id) return;
    setLoading(true);
    try {
      const [{ data: pyqs, error: pyqError }, { data: links, error: linkError }, { data: ts, error: topicError }] = await Promise.all([
        backendApi.from("course_pyq").select("*").eq("course_id", course.id).order("year", { ascending: false }).order("order_index"),
        backendApi.from("pyq_topics").select("pyq_id, topic_id, course_pyq!inner(course_id)").eq("course_pyq.course_id", course.id),
        backendApi.from("topics").select("id, title").eq("course_id", course.id).order("unit").order("order_index"),
      ]);
      if (pyqError) throw pyqError;
      if (linkError) throw linkError;
      if (topicError) throw topicError;
      const linkMap = new Map<string, string[]>();
      ((links || []) as PyqTopicLink[]).forEach((link) => {
        const arr = linkMap.get(link.pyq_id) || [];
        arr.push(link.topic_id);
        linkMap.set(link.pyq_id, arr);
      });
      setItems(((pyqs as PYQ[]) || []).map(p => ({ ...p, topic_ids: p.id ? linkMap.get(p.id) || [] : [] })));
      setTopics((ts as TopicOption[]) || []);
    } catch (error) {
      toast.error(errorMessage(error, "Could not load questions"));
    } finally {
      setLoading(false);
    }
  }, [course?.id]);
  useEffect(() => { void reload(); }, [reload]);

  if (cLoad || aLoad) return <div className="container py-20 text-muted-foreground">Loading…</div>;
  if (!course) return <div className="container py-20 text-muted-foreground">Course not found.</div>;

  const years = Array.from(new Set(items.map(i => i.year).filter((y): y is number => !!y))).sort((a, b) => b - a);
  const visible = items
    .filter(i => yearFilter === "all" || String(i.year) === yearFilter)
    .filter(i => topicFilter === "all" || (i.topic_ids || []).includes(topicFilter));

  const toggleTag = async (pyqId: string, topicId: string, on: boolean) => {
    if (!isAdmin) return;
    try {
      const { error } = on
        ? await backendApi.from("pyq_topics").insert({ pyq_id: pyqId, topic_id: topicId })
        : await backendApi.from("pyq_topics").delete().eq("pyq_id", pyqId).eq("topic_id", topicId);
      if (error) throw error;
      await reload();
    } catch (error) {
      toast.error(errorMessage(error, "Could not update lesson tag"));
    }
  };

  const genAnswer = async (pyqId: string) => {
    setAnsweringId(pyqId);
    try {
      const { data, error } = await backendApi.functions.invoke("generate-pyq-answer", { body: { pyqId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Answer generated");
      await reload();
    } catch (error) { toast.error(errorMessage(error, "Failed")); }
    finally { setAnsweringId(null); }
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await backendApi.functions.invoke("generate-pyq", { body: { courseId: course.id, count: 10 } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Added ${data.inserted} AI-generated questions${data.tagged ? ` with ${data.tagged} lesson tag(s)` : ""}`);
      await reload();
    } catch (error) { toast.error(errorMessage(error, "Failed")); }
    finally { setGenerating(false); }
  };

  const addBlank = () => setItems([...items, { question: "", answer: "", order_index: items.length, source: "manual" }]);
  const removeAt = async (i: number) => {
    const it = items[i];
    if (it.id) {
      const { error } = await backendApi.from("course_pyq").delete().eq("id", it.id);
      if (error) { toast.error(error.message); return; }
    }
    setItems(items.filter((_, j) => j !== i));
  };
  const update = (i: number, patch: Partial<PYQ>) => {
    const next = [...items]; next[i] = { ...next[i], ...patch }; setItems(next);
  };

  const saveAll = async () => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      for (const it of items) {
        if (it.id) {
          await backendApi.from("course_pyq").update({
            question: it.question, answer: it.answer, marks: it.marks, year: it.year, order_index: it.order_index,
          }).eq("id", it.id);
        } else if (it.question.trim()) {
          await backendApi.from("course_pyq").insert({
            course_id: course.id, question: it.question, answer: it.answer,
            marks: it.marks ?? null, year: it.year ?? null, order_index: it.order_index, source: it.source || "manual",
          });
        }
      }
      toast.success("Saved");
      await reload();
    } catch (error) { toast.error(errorMessage(error, "Save failed")); }
    finally { setSaving(false); }
  };

  return (
    <div className="container max-w-4xl py-10">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to={`/course/${courseSlug}`}><ArrowLeft className="h-4 w-4 mr-1" /> {course.title}</Link>
      </Button>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Previous Year Questions</h1>
          <p className="text-muted-foreground text-sm">{items.length} question{items.length === 1 ? "" : "s"} · {course.title}</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="neon" size="sm" onClick={generate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />} AI generate
            </Button>
            <Button variant="ghost" size="sm" onClick={addBlank}><Plus className="h-4 w-4 mr-1" /> Add blank</Button>
            <Button variant="hero" size="sm" onClick={saveAll} disabled={saving}><Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save all"}</Button>
          </div>
        )}
      </div>

      {(years.length > 0 || topics.length > 0) && (
        <div className="space-y-2 mb-4">
          {years.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant={yearFilter === "all" ? "hero" : "ghost"} onClick={() => setYearFilter("all")}>All years</Button>
              {years.map(y => (
                <Button key={y} size="sm" variant={yearFilter === String(y) ? "hero" : "ghost"} onClick={() => setYearFilter(String(y))}>{y}</Button>
              ))}
            </div>
          )}
          {topics.length > 0 && (
            <div className="flex gap-2 flex-wrap items-center">
              <Tag className="h-3 w-3 text-muted-foreground" />
              <Button size="sm" variant={topicFilter === "all" ? "hero" : "ghost"} onClick={() => setTopicFilter("all")}>All lessons</Button>
              {topics.map(t => (
                <Button key={t.id} size="sm" variant={topicFilter === t.id ? "hero" : "ghost"} onClick={() => setTopicFilter(t.id)}>{t.title}</Button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-muted-foreground">
          No questions yet.{isAdmin && " Click AI generate or add blank."}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((it, i) => {
            const realI = items.indexOf(it);
            return (
              <div key={it.id || `n${i}`} className="glass rounded-2xl p-4">
                {isAdmin ? (
                  <div className="space-y-2">
                    <div className="flex gap-2 items-center">
                      <Input className="w-24" type="number" placeholder="Year" value={it.year ?? ""} onChange={e => update(realI, { year: e.target.value ? Number(e.target.value) : null })} />
                      <Input className="w-24" type="number" placeholder="Marks" value={it.marks ?? ""} onChange={e => update(realI, { marks: e.target.value ? Number(e.target.value) : null })} />
                      <span className="text-xs text-muted-foreground ml-auto">{it.source}</span>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => removeAt(realI)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                    <Label className="text-xs">Question</Label>
                    <Textarea rows={2} value={it.question} onChange={e => update(realI, { question: e.target.value })} />
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs">Answer</Label>
                      {it.id && !it.answer && (
                        <Button size="sm" variant="neon" onClick={() => genAnswer(it.id!)} disabled={answeringId === it.id}>
                          {answeringId === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />} Generate AI answer
                        </Button>
                      )}
                    </div>
                    <Textarea rows={4} value={it.answer} onChange={e => update(realI, { answer: e.target.value })} />
                    {it.id && topics.length > 0 && (
                      <div>
                        <Label className="text-xs flex items-center gap-1 mb-1"><Tag className="h-3 w-3" /> Tagged lessons</Label>
                        <div className="flex flex-wrap gap-1">
                          {topics.map(t => {
                            const on = (it.topic_ids || []).includes(t.id);
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => toggleTag(it.id!, t.id, !on)}
                                className={`text-[11px] px-2 py-0.5 rounded-full border transition ${on ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                              >
                                {t.title}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <details>
                    <summary className="cursor-pointer">
                      <span className="text-xs font-mono text-primary mr-2">{it.year || "—"} · {it.marks ? `${it.marks}m` : ""}</span>
                      <span className="font-medium">Q{realI + 1}. {it.question}</span>
                    </summary>
                    <div className="mt-3 text-sm whitespace-pre-wrap text-muted-foreground">{it.answer || <span className="italic">No answer yet.</span>}</div>
                    {(it.topic_ids || []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(it.topic_ids || []).map(tid => {
                          const t = topics.find(x => x.id === tid);
                          if (!t) return null;
                          return <span key={tid} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">{t.title}</span>;
                        })}
                      </div>
                    )}
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!isAdmin && items.length === 0 && (
        <div className="mt-6 text-center text-xs text-muted-foreground flex items-center gap-1 justify-center">
          <Lock className="h-3 w-3" /> Only admins can add questions.
        </div>
      )}
    </div>
  );
}
