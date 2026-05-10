import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { FileJson, FileQuestion, Loader2, Plus, Save, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";

type CourseOption = { id: string; title: string; slug: string };
type TopicOption = { id: string; title: string };
type ManualPyq = {
  question: string;
  answer?: string;
  marks?: number | null;
  year?: number | null;
  source?: string | null;
  topicIds?: string[];
  topicTitle?: string;
  topic?: string;
};

const NONE = "__none__";

export default function AdminPYQUpload() {
  const { isAdmin, loading } = useIsAdmin();
  const nav = useNavigate();
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [courseId, setCourseId] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const [single, setSingle] = useState({ question: "", answer: "", marks: "", source: "manual", topicId: NONE });
  const [bulkText, setBulkText] = useState("");
  const [bulkSource, setBulkSource] = useState("manual-bulk");
  const [bulkTopicId, setBulkTopicId] = useState(NONE);
  const [jsonText, setJsonText] = useState("");
  const [manualBusy, setManualBusy] = useState(false);

  useEffect(() => { if (!loading && !isAdmin) nav("/"); }, [isAdmin, loading, nav]);
  useEffect(() => {
    supabase.from("courses").select("id,title,slug").order("title").then(({ data }) => setCourses((data as CourseOption[]) || []));
  }, []);
  useEffect(() => {
    if (!courseId) {
      setTopics([]);
      return;
    }
    supabase.from("topics").select("id,title").eq("course_id", courseId).order("unit").order("order_index").then(({ data }) => {
      setTopics((data as TopicOption[]) || []);
    });
  }, [courseId]);

  const selectedCourse = courses.find(c => c.id === courseId);
  const topicById = useMemo(() => new Map(topics.map(topic => [topic.id, topic])), [topics]);

  if (loading) return <div className="container py-20 text-muted-foreground">Loading...</div>;
  if (!isAdmin) return null;

  const goToCoursePyq = () => {
    if (selectedCourse?.slug) nav(`/course/${selectedCourse.slug}/pyq`);
  };

  const insertPyqs = async (items: ManualPyq[], fallback: { source: string; topicId?: string; year?: number | null }) => {
    if (!courseId) throw new Error("Select a course first");

    const cleaned = items
      .map((item) => ({
        ...item,
        question: String(item.question || "").trim(),
        answer: String(item.answer || "").trim(),
      }))
      .filter((item) => item.question);

    if (!cleaned.length) throw new Error("Add at least one question");

    const { count } = await supabase.from("course_pyq").select("id", { count: "exact", head: true }).eq("course_id", courseId);
    const topicTitleLookup = new Map(topics.map(topic => [topic.title.trim().toLowerCase(), topic.id]));

    let inserted = 0;
    let tagged = 0;
    for (const [index, item] of cleaned.entries()) {
      const topicIds = new Set<string>();
      (item.topicIds || []).forEach((id) => topicById.has(id) && topicIds.add(id));
      const titleKey = String(item.topicTitle || item.topic || "").trim().toLowerCase();
      if (titleKey && topicTitleLookup.has(titleKey)) topicIds.add(topicTitleLookup.get(titleKey)!);
      if (fallback.topicId && fallback.topicId !== NONE) topicIds.add(fallback.topicId);

      const { data, error } = await supabase.from("course_pyq").insert({
        course_id: courseId,
        question: item.question,
        answer: item.answer || "",
        marks: typeof item.marks === "number" ? item.marks : null,
        year: typeof item.year === "number" ? item.year : fallback.year ?? null,
        source: item.source || fallback.source,
        ingestion_source: item.source || fallback.source,
        order_index: (count || 0) + index,
      }).select("id").single();

      if (error) throw error;
      inserted += 1;

      if (data?.id && topicIds.size) {
        const rows = Array.from(topicIds).map((topicId) => ({ pyq_id: data.id, topic_id: topicId }));
        const { error: linkError } = await supabase.from("pyq_topics").insert(rows as any);
        if (linkError) throw linkError;
        tagged += rows.length;
      }
    }

    return { inserted, tagged };
  };

  const handleUpload = async () => {
    if (!file || !courseId) { toast.error("Pick a course and a file"); return; }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const isImage = file.type.startsWith("image/");
      const { data, error } = await supabase.functions.invoke("ingest-pyq", {
        body: {
          courseId,
          year: year ? Number(year) : null,
          fileBase64: b64,
          mimeType: file.type || (isImage ? "image/png" : "application/pdf"),
          fileName: file.name,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Extracted ${data.inserted} questions, auto-tagged ${data.tagged} lesson links`);
      goToCoursePyq();
    } catch (e: any) { toast.error(e.message || "Upload failed"); }
    finally { setBusy(false); }
  };

  const saveSingle = async () => {
    setManualBusy(true);
    try {
      const result = await insertPyqs([{
        question: single.question,
        answer: single.answer,
        marks: single.marks ? Number(single.marks) : null,
        year: year ? Number(year) : null,
        source: single.source || "manual",
      }], { source: single.source || "manual", topicId: single.topicId, year: year ? Number(year) : null });
      toast.success(`Added ${result.inserted} PYQ`);
      setSingle({ question: "", answer: "", marks: "", source: "manual", topicId: NONE });
    } catch (e: any) { toast.error(e.message || "Could not save PYQ"); }
    finally { setManualBusy(false); }
  };

  const parseBulkText = (text: string): ManualPyq[] => {
    return text
      .split(/\n{2,}|\r?\n/)
      .map((raw) => raw.trim())
      .filter(Boolean)
      .map((line) => {
        const clean = line.replace(/^[-*•]\s*/, "").replace(/^Q(?:uestion)?\s*\d*[\.:)\-]?\s*/i, "").trim();
        const pipe = clean.split("|").map(part => part.trim());
        if (pipe.length >= 3) {
          const [first, second, third, ...rest] = pipe;
          const firstNumber = Number(first);
          const secondNumber = Number(second);
          if (!Number.isNaN(firstNumber) && !Number.isNaN(secondNumber)) {
            return { year: firstNumber, marks: secondNumber, question: third, answer: rest.join(" | "), source: bulkSource };
          }
        }
        const [question, ...answerParts] = clean.split(/\s*(?:::|--)\s*/);
        return { question, answer: answerParts.join(" ").trim(), source: bulkSource };
      });
  };

  const saveBulk = async () => {
    setManualBusy(true);
    try {
      const result = await insertPyqs(parseBulkText(bulkText), {
        source: bulkSource || "manual-bulk",
        topicId: bulkTopicId,
        year: year ? Number(year) : null,
      });
      toast.success(`Added ${result.inserted} PYQs${result.tagged ? ` with ${result.tagged} lesson tag(s)` : ""}`);
      setBulkText("");
    } catch (e: any) { toast.error(e.message || "Bulk save failed"); }
    finally { setManualBusy(false); }
  };

  const normalizeJson = (value: unknown): ManualPyq[] => {
    const payload = Array.isArray(value) ? value : (value as any)?.pyqs || (value as any)?.questions;
    if (!Array.isArray(payload)) throw new Error("JSON must be an array or an object with a pyqs/questions array");
    return payload.map((item: any) => ({
      question: item.question || item.q || item.prompt || "",
      answer: item.answer || item.a || "",
      marks: item.marks == null ? null : Number(item.marks),
      year: item.year == null ? null : Number(item.year),
      source: item.source || item.ingestion_source || "json",
      topicIds: Array.isArray(item.topicIds) ? item.topicIds : Array.isArray(item.topic_ids) ? item.topic_ids : [],
      topicTitle: item.topicTitle || item.topic_title || item.lesson || item.topic,
    }));
  };

  const saveJson = async () => {
    setManualBusy(true);
    try {
      const result = await insertPyqs(normalizeJson(JSON.parse(jsonText)), { source: "json", year: year ? Number(year) : null });
      toast.success(`Imported ${result.inserted} PYQs${result.tagged ? ` with ${result.tagged} lesson tag(s)` : ""}`);
      setJsonText("");
    } catch (e: any) { toast.error(e.message || "JSON import failed"); }
    finally { setManualBusy(false); }
  };

  const loadJsonFile = async (picked: File) => {
    try {
      setJsonText(await picked.text());
      toast.success(`Loaded ${picked.name}`);
    } catch (e: any) {
      toast.error(e.message || "Could not read JSON file");
    }
  };

  return (
    <div className="container max-w-4xl py-10">
      <h1 className="font-display text-3xl font-bold flex items-center gap-2 mb-2">
        <FileQuestion className="h-6 w-6 text-primary" /> Generate PYQs from Doc / Image
      </h1>
      <p className="text-muted-foreground text-sm mb-6">
        Upload a paper for AI extraction, or add questions manually one-by-one, in bulk, or from JSON.
      </p>

      <div className="glass rounded-lg p-5 mb-5">
        <div className="grid gap-4 md:grid-cols-[1fr_160px]">
          <div>
            <Label>Course</Label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
              <SelectContent>
                {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Default year</Label>
            <Input type="number" placeholder="2024" value={year} onChange={e => setYear(e.target.value)} />
          </div>
        </div>
      </div>

      <Tabs defaultValue="ai" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="ai">AI file</TabsTrigger>
          <TabsTrigger value="single">Single manual</TabsTrigger>
          <TabsTrigger value="bulk">Bulk manual</TabsTrigger>
          <TabsTrigger value="json">JSON import</TabsTrigger>
        </TabsList>

        <TabsContent value="ai">
          <div className="glass rounded-lg p-6 space-y-4">
            <div>
              <Label>File (PDF or image)</Label>
              <Input type="file" accept="application/pdf,image/*" onChange={e => setFile(e.target.files?.[0] || null)} />
              {file && <p className="text-xs text-muted-foreground mt-1">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>}
            </div>
            <Button variant="hero" className="w-full" onClick={handleUpload} disabled={busy || !file || !courseId}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {busy ? "Extracting..." : "Extract & auto-tag"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="single">
          <div className="glass rounded-lg p-6 space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_120px_180px]">
              <div>
                <Label>Tagged lesson</Label>
                <Select value={single.topicId} onValueChange={(topicId) => setSingle({ ...single, topicId })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No lesson tag</SelectItem>
                    {topics.map(topic => <SelectItem key={topic.id} value={topic.id}>{topic.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Marks</Label>
                <Input type="number" value={single.marks} onChange={e => setSingle({ ...single, marks: e.target.value })} />
              </div>
              <div>
                <Label>Source</Label>
                <Input value={single.source} onChange={e => setSingle({ ...single, source: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Question</Label>
              <Textarea rows={3} value={single.question} onChange={e => setSingle({ ...single, question: e.target.value })} />
            </div>
            <div>
              <Label>Answer</Label>
              <Textarea rows={5} value={single.answer} onChange={e => setSingle({ ...single, answer: e.target.value })} />
            </div>
            <Button variant="hero" className="w-full" onClick={saveSingle} disabled={manualBusy || !courseId || !single.question.trim()}>
              {manualBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save PYQ
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="bulk">
          <div className="glass rounded-lg p-6 space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_220px]">
              <div>
                <Label>Source</Label>
                <Input value={bulkSource} onChange={e => setBulkSource(e.target.value)} />
              </div>
              <div>
                <Label>Apply lesson tag to all</Label>
                <Select value={bulkTopicId} onValueChange={setBulkTopicId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No lesson tag</SelectItem>
                    {topics.map(topic => <SelectItem key={topic.id} value={topic.id}>{topic.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Bulk questions</Label>
              <Textarea
                rows={12}
                className="font-mono text-xs"
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                placeholder={"One question per line:\nWhat is normalization? :: It reduces redundancy.\n2023 | 5 | Explain TCP/IP layers | Answer text\n\nBlank lines also separate questions."}
              />
            </div>
            <Button variant="hero" className="w-full" onClick={saveBulk} disabled={manualBusy || !courseId || !bulkText.trim()}>
              {manualBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Add bulk PYQs
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="json">
          <div className="glass rounded-lg p-6 space-y-4">
            <div>
              <Label>JSON file</Label>
              <Input type="file" accept="application/json,.json" onChange={e => e.target.files?.[0] && loadJsonFile(e.target.files[0])} />
            </div>
            <div>
              <Label>JSON payload</Label>
              <Textarea
                rows={14}
                className="font-mono text-xs"
                value={jsonText}
                onChange={e => setJsonText(e.target.value)}
                placeholder={'[\n  {\n    "question": "Explain paging.",\n    "answer": "Paging divides memory into fixed-size pages.",\n    "year": 2024,\n    "marks": 5,\n    "topicTitle": "Memory Management"\n  }\n]'}
              />
            </div>
            <Button variant="hero" className="w-full" onClick={saveJson} disabled={manualBusy || !courseId || !jsonText.trim()}>
              {manualBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileJson className="h-4 w-4 mr-2" />}
              Import JSON PYQs
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {selectedCourse && (
        <Button variant="ghost" className="mt-5" onClick={goToCoursePyq}>
          <Upload className="h-4 w-4 mr-2" /> View {selectedCourse.title} PYQs
        </Button>
      )}
    </div>
  );
}
