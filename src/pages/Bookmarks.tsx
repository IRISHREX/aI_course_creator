import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { backendApi } from "@/integrations/api/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Bookmark, Trash2, Loader2, Lock, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface BookmarkRow {
  id: string;
  topic_id: string;
  course_id: string;
  page_index: number;
  word_index: number;
  label: string | null;
  created_at: string;
  topic?: { id: string; slug: string; title: string };
  course?: { id: string; slug: string; title: string };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function Bookmarks() {
  const { user, loading: aLoad } = useAuth();
  const [items, setItems] = useState<BookmarkRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setItems([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data: bms, error } = await backendApi.from("bookmarks").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (bms || []) as BookmarkRow[];
      if (rows.length) {
        const tIds = Array.from(new Set(rows.map(r => r.topic_id)));
        const cIds = Array.from(new Set(rows.map(r => r.course_id)));
        const [{ data: topics, error: topicError }, { data: courses, error: courseError }] = await Promise.all([
          backendApi.from("topics").select("id, slug, title").in("id", tIds),
          backendApi.from("courses").select("id, slug, title").in("id", cIds),
        ]);
        if (topicError) throw topicError;
        if (courseError) throw courseError;
        const tMap = new Map(((topics || []) as NonNullable<BookmarkRow["topic"]>[]).map(t => [t.id, t]));
        const cMap = new Map(((courses || []) as NonNullable<BookmarkRow["course"]>[]).map(c => [c.id, c]));
        setItems(rows.map(r => ({ ...r, topic: tMap.get(r.topic_id), course: cMap.get(r.course_id) })));
      } else {
        setItems([]);
      }
    } catch (error) {
      toast.error(errorMessage(error, "Could not load bookmarks"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const remove = async (id: string) => {
    const { error } = await backendApi.from("bookmarks").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Removed"); void refresh(); }
  };

  if (aLoad) return <div className="container py-20 text-muted-foreground">Loading…</div>;
  if (!user) return (
    <div className="container max-w-md py-20 text-center">
      <Lock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
      <h1 className="font-display text-2xl font-bold">Sign in</h1>
      <p className="text-muted-foreground mt-2">You need an account to save bookmarks.</p>
      <Button asChild variant="hero" className="mt-4"><Link to="/auth">Sign in</Link></Button>
    </div>
  );

  return (
    <div className="container max-w-3xl py-10">
      <h1 className="font-display text-3xl font-bold flex items-center gap-2 mb-6">
        <Bookmark className="h-7 w-7 text-primary" /> My Bookmarks
      </h1>
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> :
       items.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-muted-foreground">
          No bookmarks yet. Use the bookmark button while reading any lesson.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(b => (
            <div key={b.id} className="glass rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display font-semibold truncate">{b.label || b.topic?.title || "Bookmark"}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {b.course?.title} · {b.topic?.title} · page {b.page_index + 1}
                  {b.word_index > 0 && ` · word ${b.word_index + 1}`}
                </div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">{new Date(b.created_at).toLocaleString()}</div>
              </div>
              <div className="flex gap-1 flex-none">
                {b.course && b.topic && (
                  <Button asChild variant="hero" size="sm">
                    <Link to={`/course/${b.course.slug}/topic/${b.topic.slug}#p=${b.page_index + 1}&w=${b.word_index}`}>
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Resume
                    </Link>
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => remove(b.id)} title="Remove">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
