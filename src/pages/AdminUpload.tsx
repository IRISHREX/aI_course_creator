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

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
const TOKEN_KEY = "ignouprep.auth.token";

async function apiCall(path: string, init: RequestInit = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers || {}),
  };
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error: any = new Error(data?.error || `API request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

export default function AdminUpload() {
  const { isAdmin, loading } = useIsAdmin();
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("📘");
  const [docsUrl, setDocsUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const [busy, setBusy] = useState(false);

  const [manualTitle, setManualTitle] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualIndex, setManualIndex] = useState("");
  const [manualBusy, setManualBusy] = useState(false);

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

  const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || `course-${Date.now()}`;

  const parseManualIndex = (text: string) => {
    const units: Array<{ unit: number; title: string; lessons: Array<{ title: string; summary: string }> }> = [];
    let currentUnit = { unit: 1, title: "Unit 1", lessons: [] as Array<{ title: string; summary: string }> };
    let unitCount = 0;
    let hasUnitHeading = false;

    text.split(/\r?\n/).forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) return;
      const headingMatch = line.match(/^(?:Unit|Chapter|Section)\s*(\d+)\s*[:\-–—]?\s*(.*)$/i);
      if (headingMatch) {
        if (currentUnit.lessons.length || currentUnit.title !== `Unit ${unitCount + 1}`) units.push(currentUnit);
        const unitNumber = Number(headingMatch[1]) || unitCount + 1;
        currentUnit = { unit: unitNumber, title: headingMatch[2].trim() || `Unit ${unitNumber}`, lessons: [] };
        unitCount = Math.max(unitCount, unitNumber);
        hasUnitHeading = true;
        return;
      }

      const lessonTitle = line.replace(/^[\-\*\u2022]\s*/, "").replace(/^\d+[\.|\)]\s*/, "").trim();
      if (!lessonTitle) return;
      if (!hasUnitHeading && currentUnit.title === `Unit ${unitCount + 1}` && currentUnit.lessons.length === 0) {
        currentUnit.title = `Unit ${unitCount + 1}`;
      }
      currentUnit.lessons.push({ title: lessonTitle, summary: "" });
    });

    if (currentUnit.lessons.length || units.length === 0) units.push(currentUnit);
    return units.map((unit, index) => ({ ...unit, unit: unit.unit || index + 1, title: unit.title || `Unit ${index + 1}` }));
  };

  const createManualCourse = async () => {
    if (!manualTitle.trim()) { toast.error("Course title required"); return; }
    if (!manualDescription.trim()) { toast.error("Course description required"); return; }
    if (!manualIndex.trim()) { toast.error("Course index required"); return; }

    const units = parseManualIndex(manualIndex.trim());
    const lessonCount = units.reduce((sum, u) => sum + u.lessons.length, 0);
    if (lessonCount === 0) { toast.error("Enter at least one lesson in the course index."); return; }

    setManualBusy(true);
    try {
      let candidate = slugify(manualTitle);
      let suffix = 1;
      while (true) {
        try {
          await apiCall(`/courses/${encodeURIComponent(candidate)}`);
          candidate = `${slugify(manualTitle)}-${suffix++}`;
        } catch (e: any) {
          if (e?.status === 404) break;
          throw e;
        }
      }

      const toc = units.map((unit) => ({ unit: unit.unit, title: unit.title, summary: "", lessons: unit.lessons.map((lesson) => ({ title: lesson.title, summary: lesson.summary })) }));
      
      const createdCourseResponse = await apiCall("/courses", {
        method: "POST",
        body: JSON.stringify({
          slug: candidate,
          title: manualTitle.trim(),
          description: manualDescription.trim(),
          coverEmoji: emoji,
          orderIndex: Date.now() % 1000,
          sourceText: manualIndex.trim().slice(0, 200000),
          generationStatus: "ready",
          toc: toc,
        }),
      });
      
      if (!createdCourseResponse?.course) throw new Error("Failed to create course");
      const createdCourse = createdCourseResponse.course;

      const rows: any[] = [];
      units.forEach((unit) => {
        unit.lessons.forEach((lesson, lessonIndex) => {
          const lessonSlug = `${candidate}-${slugify(lesson.title)}`;
          rows.push({
            courseId: createdCourse.id,
            slug: lessonSlug,
            unit: unit.unit,
            orderIndex: lessonIndex,
            title: lesson.title,
            summary: lesson.summary || "",
            content: [],
            quiz: [],
            generationStatus: "ready",
          });
        });
      });

      await apiCall("/topics", {
        method: "POST",
        body: JSON.stringify(rows),
      });

      toast.success(`Course "${manualTitle}" created with ${lessonCount} lesson${lessonCount === 1 ? "" : "s"}.`);
      nav(`/course/${candidate}`);
    } catch (e: any) {
      toast.error(e.message || "Manual creation failed");
    } finally {
      setManualBusy(false);
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
      toast.success(`Course "${title}" created with ${data.topicCount} lessons${data.scannedChunks ? ` after scanning ${data.scannedChunks} chunk${data.scannedChunks === 1 ? "" : "s"}` : ""}`);
      nav(`/course/${data.slug}`);
    } catch (e: any) {
      toast.error(e.message || "Generation failed");
    } finally { setBusy(false); }
  };

  return (
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

      <div className="mt-12 border-t border-border pt-10 space-y-5">
        <div>
          <h2 className="font-display text-2xl font-bold mb-2">Manual course editor</h2>
          <p className="text-muted-foreground">Create a course directly with title, description, and a lesson index outline.</p>
        </div>

        <div className="glass rounded-2xl p-5 space-y-5">
          <div className="grid sm:grid-cols-[1fr_120px] gap-3">
            <div>
              <Label>Course title</Label>
              <Input value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="e.g. Cloud Computing" />
            </div>
            <div>
              <Label>Emoji</Label>
              <Input value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={2} className="text-center text-xl" />
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea rows={3} value={manualDescription} onChange={e => setManualDescription(e.target.value)} placeholder="Write a short course description…" />
          </div>

          <div>
            <Label>Course index</Label>
            <Textarea rows={8} value={manualIndex} onChange={e => setManualIndex(e.target.value)} placeholder="Add lesson titles here, one per line. Use Unit headings like 'Unit 1: Fundamentals' if you want grouping." className="font-mono text-xs" />
            <p className="text-xs text-muted-foreground mt-2">One lesson title per line is enough. Optional unit headers can be used to group lessons.</p>
          </div>

          <Button onClick={createManualCourse} variant="secondary" size="lg" disabled={manualBusy} className="w-full">
            {manualBusy ? <><Sparkles className="h-4 w-4 mr-1 animate-pulse" /> Creating manual course…</> : "Create course manually"}
          </Button>
        </div>
      </div>
    </div>
  );
}
