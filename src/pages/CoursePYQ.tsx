import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useCourseBySlug } from "@/hooks/useCourses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, Sparkles, Trash2, Loader2, Save, Lock } from "lucide-react";
import { toast } from "sonner";

interface PYQ {
  id?: string; question: string; answer: string;
  marks?: number | null; year?: number | null;
  source?: string | null; order_index: number;
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
  const [yearFilter, setYearFilter] = useState<string>("all");

  const reload = async () => {
    if (!course?.id) return;
    setLoading(true);
    const { data } = await supabase.from("course_pyq").select("*").eq("course_id", course.id).order("year", { ascending: false }).order("order_index");
    setItems((data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [course?.id]);

  if (cLoad || aLoad) return <div className="container py-20 text-muted-foreground">Loading…</div>;
  if (!course) return <div className="container py-20 text-muted-foreground">Course not found.</div>;

  const years = Array.from(new Set(items.map(i => i.year).filter((y): y is number => !!y))).sort((a, b) => b - a);
  const visible = yearFilter === "all" ? items : items.filter(i => String(i.year) === yearFilter);

  const generate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-pyq", { body: { courseId: course.id, count: 10 } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Added ${data.inserted} AI-generated questions`);
      reload();
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setGenerating(false); }
  };

  const addBlank = () => setItems([...items, { question: "", answer: "", order_index: items.length, source: "manual" }]);
  const removeAt = async (i: number) => {
    const it = items[i];
    if (it.id) await supabase.from("course_pyq").delete().eq("id", it.id);
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
          await supabase.from("course_pyq").update({
            question: it.question, answer: it.answer, marks: it.marks, year: it.year, order_index: it.order_index,
          }).eq("id", it.id);
        } else if (it.question.trim()) {
          await supabase.from("course_pyq").insert({
            course_id: course.id, question: it.question, answer: it.answer,
            marks: it.marks ?? null, year: it.year ?? null, order_index: it.order_index, source: it.source || "manual",
          });
        }
      }
      toast.success("Saved");
      reload();
    } catch (e: any) { toast.error(e.message || "Save failed"); }
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

      {years.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <Button size="sm" variant={yearFilter === "all" ? "hero" : "ghost"} onClick={() => setYearFilter("all")}>All years</Button>
          {years.map(y => (
            <Button key={y} size="sm" variant={yearFilter === String(y) ? "hero" : "ghost"} onClick={() => setYearFilter(String(y))}>{y}</Button>
          ))}
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
                    <Label className="text-xs">Answer</Label>
                    <Textarea rows={4} value={it.answer} onChange={e => update(realI, { answer: e.target.value })} />
                  </div>
                ) : (
                  <details>
                    <summary className="cursor-pointer">
                      <span className="text-xs font-mono text-primary mr-2">{it.year || "—"} · {it.marks ? `${it.marks}m` : ""}</span>
                      <span className="font-medium">Q{realI + 1}. {it.question}</span>
                    </summary>
                    <div className="mt-3 text-sm whitespace-pre-wrap text-muted-foreground">{it.answer}</div>
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
