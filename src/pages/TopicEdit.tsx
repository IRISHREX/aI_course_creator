import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Topic } from "@/hooks/useTopics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, FileText, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function TopicEdit() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [contentJson, setContentJson] = useState("");
  const [quizJson, setQuizJson] = useState("");
  const [docsUrl, setDocsUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("topics").select("*").eq("slug", slug!).maybeSingle().then(({ data }) => {
      const t = data as any as Topic;
      setTopic(t);
      setContentJson(JSON.stringify(t?.content ?? [], null, 2));
      setQuizJson(JSON.stringify(t?.quiz ?? [], null, 2));
    });
  }, [slug]);

  if (!user) return (
    <div className="container max-w-md py-20 text-center">
      <p className="text-muted-foreground">Sign in to edit lessons.</p>
      <Button asChild variant="hero" className="mt-4"><Link to="/auth">Sign in</Link></Button>
    </div>
  );
  if (!topic) return <div className="container py-20 text-muted-foreground">Loading…</div>;

  const save = async () => {
    setSaving(true);
    try {
      const content = JSON.parse(contentJson);
      const quiz = JSON.parse(quizJson);
      const { error } = await supabase.from("topics").update({
        title: topic.title, summary: topic.summary, content, quiz,
      }).eq("id", topic.id);
      if (error) throw error;
      toast.success("Lesson saved");
      nav(`/topic/${topic.slug}`);
    } catch (e: any) {
      toast.error(e.message || "Save failed — check JSON syntax");
    } finally { setSaving(false); }
  };

  const importDoc = async () => {
    if (!docsUrl.trim()) { toast.error("Paste a Google Docs share URL"); return; }
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-doc", { body: { url: docsUrl } });
      if (error) throw error;
      if (data?.content) {
        setContentJson(JSON.stringify(data.content, null, 2));
        if (data.summary) setTopic({ ...topic, summary: data.summary });
        toast.success("Imported and structured by AI");
      }
    } catch (e: any) {
      toast.error(e.message || "Import failed. Make sure the doc is shared as 'Anyone with the link'.");
    } finally { setImporting(false); }
  };

  return (
    <div className="container max-w-4xl py-10">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to={`/topic/${topic.slug}`}><ArrowLeft className="h-4 w-4 mr-1" /> Back to lesson</Link>
      </Button>

      <h1 className="font-display text-3xl font-bold mb-6">Edit Lesson</h1>

      <div className="space-y-5">
        <div>
          <Label>Title</Label>
          <Input value={topic.title} onChange={e => setTopic({ ...topic, title: e.target.value })} />
        </div>
        <div>
          <Label>Summary</Label>
          <Textarea rows={2} value={topic.summary} onChange={e => setTopic({ ...topic, summary: e.target.value })} />
        </div>

        {/* Google Docs import */}
        <div className="glass rounded-2xl p-5">
          <div className="font-display font-bold text-lg flex items-center gap-2 mb-1"><FileText className="h-5 w-5 text-primary" /> Import from Google Docs</div>
          <p className="text-xs text-muted-foreground mb-3">Paste a public Google Docs link. AI will fetch and structure it into lesson content.</p>
          <div className="flex gap-2">
            <Input placeholder="https://docs.google.com/document/d/..." value={docsUrl} onChange={e => setDocsUrl(e.target.value)} />
            <Button onClick={importDoc} variant="neon" disabled={importing}>
              <Sparkles className="h-4 w-4 mr-1" /> {importing ? "Importing…" : "Import"}
            </Button>
          </div>
        </div>

        <div>
          <Label>Content (JSON blocks: text, list, highlight, timeline)</Label>
          <Textarea rows={12} value={contentJson} onChange={e => setContentJson(e.target.value)} className="font-mono text-xs" />
        </div>

        <div>
          <Label>Quiz (JSON: array of {"{q, options[], answer}"})</Label>
          <Textarea rows={10} value={quizJson} onChange={e => setQuizJson(e.target.value)} className="font-mono text-xs" />
        </div>

        <Button onClick={save} variant="hero" size="lg" disabled={saving}>
          <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save lesson"}
        </Button>
      </div>
    </div>
  );
}
