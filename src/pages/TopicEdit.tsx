import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useAdmin";
import type { Topic } from "@/hooks/useTopics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BlockEditor, type Block } from "@/components/BlockEditor";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, FileText, History, Lightbulb, List, Loader2, Lock, Maximize2, Minimize2, RotateCcw, Save, Sparkles, Wand2, Zap } from "lucide-react";
import { toast } from "sonner";

type TransformAction = "simplify" | "expand" | "bullets" | "analogy" | "bigger" | "smaller" | "level";
type ProviderType = "google" | "openai" | "groq";

export default function TopicEdit() {
  const { courseSlug, slug } = useParams();
  const nav = useNavigate();
  const { isAdmin, loading: aLoad } = useIsAdmin();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [contentJson, setContentJson] = useState("");
  const [quizJson, setQuizJson] = useState("");
  const [docsUrl, setDocsUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [level, setLevel] = useState<number>(5);
  const [selectedProvider, setSelectedProvider] = useState<ProviderType>("google");
  const [customInstruction, setCustomInstruction] = useState("");
  const [versions, setVersions] = useState<any[]>([]);
  const [vLoading, setVLoading] = useState(false);

  const reload = async () => {
    const { data } = await supabase.from("topics").select("*").eq("slug", slug!).maybeSingle();
    const t = data as any as Topic;
    setTopic(t);
    setContentJson(JSON.stringify(t?.content ?? [], null, 2));
    setQuizJson(JSON.stringify(t?.quiz ?? [], null, 2));
    setLevel((t as any)?.difficulty_level ?? 5);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [slug]);

  if (aLoad) return <div className="container py-20 text-muted-foreground">Loading…</div>;
  if (!isAdmin) return (
    <div className="container max-w-md py-20 text-center">
      <Lock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
      <h1 className="font-display text-2xl font-bold">Admins only</h1>
      <p className="text-muted-foreground mt-2">Only administrators can edit lessons.</p>
      <Button asChild variant="hero" className="mt-4"><Link to={`/course/${courseSlug}/topic/${slug}`}>Back</Link></Button>
    </div>
  );
  if (!topic) return <div className="container py-20 text-muted-foreground">Loading…</div>;

  const save = async () => {
    setSaving(true);
    try {
      const content = JSON.parse(contentJson);
      const quiz = JSON.parse(quizJson);
      // Snapshot previous state to history before update
      await supabase.from("topic_versions").insert({
        topic_id: topic.id,
        title: topic.title,
        summary: topic.summary,
        content: topic.content as any,
        quiz: topic.quiz as any,
        visualization: topic.visualization,
        mindmap: (topic as any).mindmap ?? null,
        note: "auto-save",
      });
      const { error } = await supabase.from("topics").update({
        title: topic.title, summary: topic.summary, content, quiz, difficulty_level: level,
      }).eq("id", topic.id);
      if (error) throw error;
      toast.success("Lesson saved (snapshot taken)");
      nav(`/course/${courseSlug}/topic/${topic.slug}`);
    } catch (e: any) {
      toast.error(e.message || "Save failed — check JSON syntax");
    } finally { setSaving(false); }
  };

  const loadVersions = async () => {
    setVLoading(true);
    const { data } = await supabase.from("topic_versions").select("*").eq("topic_id", topic.id).order("created_at", { ascending: false }).limit(50);
    setVersions(data || []);
    setVLoading(false);
  };

  const restoreVersion = async (v: any) => {
    if (!confirm(`Restore version from ${new Date(v.created_at).toLocaleString()}? Current state will also be snapshotted.`)) return;
    await supabase.from("topic_versions").insert({
      topic_id: topic.id, title: topic.title, summary: topic.summary,
      content: topic.content as any, quiz: topic.quiz as any,
      visualization: topic.visualization, mindmap: (topic as any).mindmap ?? null,
      note: "before-restore",
    });
    const { error } = await supabase.from("topics").update({
      title: v.title, summary: v.summary, content: v.content, quiz: v.quiz,
      visualization: v.visualization, mindmap: v.mindmap,
    }).eq("id", topic.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Restored");
    await reload();
    await loadVersions();
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
      toast.error(e.message || "Import failed");
    } finally { setImporting(false); }
  };

  const generateFresh = async () => {
    setAiBusy("generate");
    try {
      const { data, error } = await supabase.functions.invoke("generate-lesson", { body: { topicId: topic.id, level, provider: selectedProvider } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Fresh lesson generated");
      await reload();
    } catch (e: any) {
      toast.error(e.message || "Generation failed");
    } finally { setAiBusy(null); }
  };

  const transform = async (action: TransformAction, customLevel?: number) => {
    setAiBusy(action);
    try {
      const body: any = { topicId: topic.id, action };
      if (action === "level") body.level = customLevel ?? level;
      if (customInstruction.trim()) body.customInstruction = customInstruction.trim();
      const { data, error } = await supabase.functions.invoke("transform-content", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.content) setContentJson(JSON.stringify(data.content, null, 2));
      toast.success(`Applied: ${action}`);
      setCustomInstruction("");
    } catch (e: any) {
      toast.error(e.message || "Transform failed");
    } finally { setAiBusy(null); }
  };

  const ToolBtn = ({ id, icon: Icon, label }: { id: TransformAction; icon: any; label: string }) => (
    <Button variant="neon" size="sm" disabled={!!aiBusy} onClick={() => transform(id)}>
      {aiBusy === id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      <span className="ml-1">{label}</span>
    </Button>
  );

  return (
    <div className="container max-w-4xl py-10">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to={`/course/${courseSlug}/topic/${topic.slug}`}><ArrowLeft className="h-4 w-4 mr-1" /> Back to lesson</Link>
        </Button>
        <Popover onOpenChange={(o) => o && loadVersions()}>
          <PopoverTrigger asChild>
            <Button variant="neon" size="sm"><History className="h-4 w-4 mr-1" /> History</Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-96 max-h-96 overflow-auto">
            <div className="font-display font-bold mb-2">Saved versions</div>
            {vLoading && <div className="text-xs text-muted-foreground">Loading…</div>}
            {!vLoading && versions.length === 0 && <div className="text-xs text-muted-foreground">No history yet — versions are created on every save.</div>}
            <div className="space-y-2">
              {versions.map(v => (
                <div key={v.id} className="flex items-center justify-between gap-2 border border-border/50 rounded-lg p-2">
                  <div className="text-xs">
                    <div className="font-mono">{new Date(v.created_at).toLocaleString()}</div>
                    <div className="text-muted-foreground">{v.note}</div>
                  </div>
                  <Button size="sm" variant="hero" onClick={() => restoreVersion(v)}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
                  </Button>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

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

        {/* AI Modify Toolbar */}
        <div className="glass rounded-2xl p-5 border border-primary/20">
          <div className="flex items-center gap-2 mb-3">
            <Wand2 className="h-5 w-5 text-primary" />
            <div className="font-display font-bold text-lg">AI Modify</div>
            <span className="text-xs text-muted-foreground ml-auto">Rewrites the content blocks below</span>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <ToolBtn id="simplify" icon={Lightbulb} label="Simplify" />
            <ToolBtn id="expand" icon={Maximize2} label="Add more" />
            <ToolBtn id="smaller" icon={Minimize2} label="Shorten" />
            <ToolBtn id="bigger" icon={Maximize2} label="Make bigger" />
            <ToolBtn id="bullets" icon={List} label="Point-wise" />
            <ToolBtn id="analogy" icon={Lightbulb} label="Add analogy" />
          </div>

          <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end mb-4">
            <div>
              <Label className="text-xs flex justify-between">
                <span>Difficulty level</span>
                <span className="font-mono text-primary">{level}/10 {level <= 3 ? "· beginner" : level <= 6 ? "· intermediate" : "· advanced"}</span>
              </Label>
              <Slider min={1} max={10} step={1} value={[level]} onValueChange={v => setLevel(v[0])} className="mt-2" />
            </div>
            <Button variant="neon" size="sm" disabled={!!aiBusy} onClick={() => transform("level", level)}>
              {aiBusy === "level" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              <span className="ml-1">Apply level</span>
            </Button>
          </div>

          <div>
            <Label className="text-xs">Custom instruction (optional — included with next action)</Label>
            <div className="flex gap-2 mt-1">
              <Input value={customInstruction} onChange={e => setCustomInstruction(e.target.value)} placeholder="e.g. Add a comparison table for 4G vs 5G" />
              <Button variant="hero" size="sm" disabled={!!aiBusy || !customInstruction.trim()} onClick={() => transform("expand")}>
                {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-4 w-4 mr-1" /> Apply</>}
              </Button>
            </div>
          </div>

          <div className="border-t border-border/50 mt-4 pt-4 flex items-center justify-between flex-wrap gap-3">
            <div className="text-xs text-muted-foreground">Replace everything with a fresh AI-generated lesson</div>
            <div className="flex items-center gap-2">
              <div className="w-[120px]">
                <Label htmlFor="topic-provider" className="text-xs">Provider</Label>
                <Select value={selectedProvider} onValueChange={(v) => setSelectedProvider(v as ProviderType)}>
                  <SelectTrigger id="topic-provider" className="h-9 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google">Gemini</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="groq">Groq</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="hero" size="sm" disabled={!!aiBusy} onClick={generateFresh} className="mt-6">
                {aiBusy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-4 w-4 mr-1" /> Regenerate from source</>}
              </Button>
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="font-display font-bold text-lg flex items-center gap-2 mb-1"><FileText className="h-5 w-5 text-primary" /> Import from Google Docs</div>
          <p className="text-xs text-muted-foreground mb-3">Paste a public Google Docs link. AI will fetch and structure it.</p>
          <div className="flex gap-2">
            <Input placeholder="https://docs.google.com/document/d/..." value={docsUrl} onChange={e => setDocsUrl(e.target.value)} />
            <Button onClick={importDoc} variant="neon" disabled={importing}>
              <Sparkles className="h-4 w-4 mr-1" /> {importing ? "Importing…" : "Import"}
            </Button>
          </div>
        </div>

        <div>
          <Label>Content blocks</Label>
          <Tabs defaultValue="editor" className="mt-2">
            <TabsList>
              <TabsTrigger value="editor">Editor</TabsTrigger>
              <TabsTrigger value="json">JSON</TabsTrigger>
            </TabsList>
            <TabsContent value="editor" className="mt-3">
              {(() => {
                let parsed: Block[] = [];
                let parseError: string | null = null;
                try { parsed = JSON.parse(contentJson || "[]"); } catch (e: any) { parseError = e.message; }
                if (parseError) return (
                  <div className="glass rounded-xl p-4 text-sm text-destructive">
                    JSON is invalid — fix it in the JSON tab to use the editor.
                    <div className="font-mono text-xs mt-1 text-muted-foreground">{parseError}</div>
                  </div>
                );
                return (
                  <BlockEditor
                    blocks={parsed}
                    topicId={topic.id}
                    onChange={(b) => setContentJson(JSON.stringify(b, null, 2))}
                  />
                );
              })()}
            </TabsContent>
            <TabsContent value="json" className="mt-3">
              <Textarea rows={14} value={contentJson} onChange={e => setContentJson(e.target.value)} className="font-mono text-xs" />
              <p className="text-xs text-muted-foreground mt-1">Block types: text, highlight, list, timeline, table, flowchart, chart, image, math, code. Use **word** for bold, `word` for golden highlight, and ***word*** for bold red.</p>
            </TabsContent>
          </Tabs>
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
