import { useCallback, useEffect, useState } from "react";
import { backendApi } from "@/integrations/api/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FileQuestion, Loader2, Sparkles } from "lucide-react";
import { useIsAdmin } from "@/hooks/useAdmin";
import { toast } from "sonner";

interface PYQ {
  id: string; question: string; answer: string;
  marks: number | null; year: number | null;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export const LessonPYQButton = ({ topicId, courseId }: { topicId: string; courseId: string }) => {
  const { isAdmin } = useIsAdmin();
  const [items, setItems] = useState<PYQ[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [genIdx, setGenIdx] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await backendApi
        .from("pyq_topics")
        .select("course_pyq!inner(id, course_id, question, answer, marks, year)")
        .eq("topic_id", topicId)
        .eq("course_pyq.course_id", courseId);
      if (error) throw error;
      setItems(((data as { course_pyq?: PYQ }[]) || []).map(r => r.course_pyq).filter((item): item is PYQ => Boolean(item)));
    } catch (error) {
      toast.error(errorMessage(error, "Could not load PYQs"));
    } finally {
      setLoading(false);
    }
  }, [courseId, topicId]);
  useEffect(() => { if (open) void load(); }, [load, open]);

  const generateAnswer = async (pyq: PYQ) => {
    setGenIdx(pyq.id);
    try {
      const { data, error } = await backendApi.functions.invoke("generate-pyq-answer", {
        body: { pyqId: pyq.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Answer generated");
      void load();
    } catch (error) { toast.error(errorMessage(error, "Failed")); }
    finally { setGenIdx(null); }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="px-2 sm:px-3">
          <FileQuestion className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">PYQ</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-h-[70vh] w-[calc(100vw-1.5rem)] max-w-[420px] overflow-y-auto" align="end">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            No PYQs tagged to this lesson yet.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{items.length} PYQ{items.length === 1 ? "" : "s"} for this lesson</div>
            {items.map((it, i) => (
              <details key={it.id} className="rounded-lg border border-border/50 p-3" open={i === 0}>
                <summary className="cursor-pointer text-sm">
                  <span className="text-xs font-mono text-primary mr-2">{it.year || "—"} {it.marks ? `· ${it.marks}m` : ""}</span>
                  {it.question}
                </summary>
                <div className="mt-2 text-sm">
                  {it.answer ? (
                    <div className="whitespace-pre-wrap text-muted-foreground">{it.answer}</div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground italic">No answer yet.</span>
                      {isAdmin && (
                        <Button size="sm" variant="neon" onClick={() => generateAnswer(it)} disabled={genIdx === it.id}>
                          {genIdx === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                          AI answer
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
