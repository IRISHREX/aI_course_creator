import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, FileText, Sparkles, Upload, Lock } from "lucide-react";
import { extractTextFromFile } from "@/lib/extractText";
import ThreeBackground from "@/components/ThreeBackground";

export default function AdminUpload() {
  const { isAdmin, loading } = useIsAdmin();
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("📘");
  const [docsUrl, setDocsUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="container py-20 text-muted-foreground">Loading…</div>;
  if (!isAdmin) return (
    <div className="container max-w-md py-20 text-center">
      <Lock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
      <h1 className="font-display text-2xl font-bold">Admins only</h1>
      <p className="text-muted-foreground mt-2">Only administrators can upload courses.</p>
      <Button asChild variant="hero" className="mt-4"><Link to="/courses">Back</Link></Button>
    </div>
  );

  const handleFile = async (file: File) => {
    try {
      toast.info(`Reading ${file.name}…`);
      const text = await extractTextFromFile(file);
      if (!text.trim()) throw new Error("No text extracted");
      setRawText(text);
      toast.success(`Extracted ${text.length.toLocaleString()} characters from ${file.name}`);
    } catch (e: any) {
      toast.error(e.message || "Could not read file");
    }
  };

  const generate = async () => {
    if (!title.trim()) { toast.error("Course title required"); return; }
    if (!docsUrl.trim() && !rawText.trim()) { toast.error("Provide a Google Docs URL, paste text, or upload a file"); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-course-from-doc", {
        body: { title, emoji, docsUrl: docsUrl.trim() || undefined, rawText: rawText.trim() || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const generated = Number(data.generatedCount || 0);
      const total = Number(data.topicCount || 0);
      if (data.partial) {
        toast.warning(`Course created. Generated ${generated}/${total} lessons before stopping at "${data.failedLesson?.title || "a lesson"}".`);
      } else {
        toast.success(`Course "${title}" created with ${generated || total} generated lessons${data.scannedChunks ? ` after scanning ${data.scannedChunks} chunk${data.scannedChunks === 1 ? "" : "s"}` : ""}`);
      }
      nav(`/course/${data.slug}`);
    } catch (e: any) {
      toast.error(e.message || "Generation failed");
    } finally { setBusy(false); }
  };

  return (
    <>
      <ThreeBackground />
      <div className="container max-w-3xl py-10">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/courses"><ArrowLeft className="h-4 w-4 mr-1" /> Courses</Link>
      </Button>
      <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">Upload <span className="text-gradient">New Course</span></h1>
      <p className="text-muted-foreground mb-8">AI will read your document and structure it into lessons, quizzes, and visualizations.</p>

      <div className="space-y-5">
        <div className="grid sm:grid-cols-[1fr_120px] gap-3">
          <div>
            <Label>Course title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Cloud Computing" />
          </div>
          <div>
            <Label>Emoji</Label>
            <Input value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={2} className="text-center text-xl" />
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="font-display font-bold flex items-center gap-2 mb-3"><FileText className="h-4 w-4 text-primary" /> Source material</div>

          <Label className="text-xs">Option A — Google Docs URL (shared as "Anyone with the link")</Label>
          <Input value={docsUrl} onChange={e => setDocsUrl(e.target.value)} placeholder="https://docs.google.com/document/d/..." className="mt-1" />

          <div className="my-4 text-center text-xs text-muted-foreground">— or —</div>

          <Label className="text-xs">Option B — Upload .txt / .md / .pdf</Label>
          <Input type="file" accept=".txt,.md,.pdf,.docx" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} className="mt-1" />

          <div className="my-4 text-center text-xs text-muted-foreground">— or —</div>

          <Label className="text-xs">Option C — Paste raw text</Label>
          <Textarea rows={8} value={rawText.startsWith("__FILE__") ? "[file attached]" : rawText} onChange={e => setRawText(e.target.value)} placeholder="Paste your course material here…" className="mt-1 font-mono text-xs" />
        </div>

        <Button onClick={generate} variant="hero" size="lg" disabled={busy} className="w-full">
          {busy ? <><Sparkles className="h-4 w-4 mr-1 animate-pulse" /> AI is structuring your course…</> : <><Upload className="h-4 w-4 mr-1" /> Generate course with AI</>}
        </Button>
      </div>
    </div>
    </>
  );
}
