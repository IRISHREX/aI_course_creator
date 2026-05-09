import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileQuestion, Upload, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import ThreeBackground from "@/components/ThreeBackground";

export default function AdminPYQUpload() {
  const { isAdmin, loading } = useIsAdmin();
  const nav = useNavigate();
  const [courses, setCourses] = useState<any[]>([]);
  const [courseId, setCourseId] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && !isAdmin) nav("/"); }, [isAdmin, loading, nav]);
  useEffect(() => {
    supabase.from("courses").select("id,title,slug").order("title").then(({ data }) => setCourses(data || []));
  }, []);

  if (loading) return <div className="container py-20 text-muted-foreground">Loading…</div>;
  if (!isAdmin) return null;

  const handleUpload = async () => {
    if (!file || !courseId) { toast.error("Pick a course and a file"); return; }
    setBusy(true);
    try {
      // Convert to base64
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
      const slug = courses.find(c => c.id === courseId)?.slug;
      if (slug) nav(`/course/${slug}/pyq`);
    } catch (e: any) { toast.error(e.message || "Upload failed"); }
    finally { setBusy(false); }
  };

  return (
    <>
      <ThreeBackground />
      <div className="container max-w-2xl py-10">
      <h1 className="font-display text-3xl font-bold flex items-center gap-2 mb-2">
        <FileQuestion className="h-6 w-6 text-primary" /> Generate PYQs from Doc / Image
      </h1>
      <p className="text-muted-foreground text-sm mb-6">
        Upload a PDF or image of past papers. AI will extract questions, leave answers blank,
        and auto-tag each question to the most relevant lesson(s).
      </p>

      <div className="glass rounded-2xl p-6 space-y-4">
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
          <Label>Year (optional)</Label>
          <Input type="number" placeholder="e.g. 2024" value={year} onChange={e => setYear(e.target.value)} />
        </div>
        <div>
          <Label>File (PDF or image)</Label>
          <Input type="file" accept="application/pdf,image/*"
            onChange={e => setFile(e.target.files?.[0] || null)} />
          {file && <p className="text-xs text-muted-foreground mt-1">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>}
        </div>
        <Button variant="hero" className="w-full" onClick={handleUpload} disabled={busy || !file || !courseId}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
          {busy ? "Extracting…" : "Extract & auto-tag"}
        </Button>
      </div>
    </div>
    </>
  );
}
