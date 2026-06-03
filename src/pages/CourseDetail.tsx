import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useTopics, useProgress } from "@/hooks/useTopics";
import { useCourseBySlug } from "@/hooks/useCourses";
import { useIsAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CheckCircle2, Circle, Sparkles, Edit3, ArrowLeft, Brain, FileQuestion, Info, Loader2, Settings2, FileText, FileJson, ChevronDown, Download } from "lucide-react";
import { backendApi } from "@/integrations/api/client";
import { Mindmap } from "@/components/Mindmap";
import { toast } from "sonner";
import { type ComponentProps, useEffect, useState } from "react";

type MindmapData = ComponentProps<typeof Mindmap>["data"];
type CourseWithMindmap = NonNullable<ReturnType<typeof useCourseBySlug>["course"]> & {
  mindmap?: MindmapData;
};
type ExportFormat = "docs" | "pdf";
type DownloadFormat = ExportFormat | "mindmaps";
type ExportOptions = {
  includeImages: boolean;
  includeGraphs: boolean;
  includeCode: boolean;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function CourseDetail() {
  const { courseSlug } = useParams();
  const { course, loading: cLoad } = useCourseBySlug(courseSlug);
  const { topics, loading, setTopics } = useTopics(course?.id);
  const { progress } = useProgress();
  const { isAdmin } = useIsAdmin();
  const [exporting, setExporting] = useState<DownloadFormat | null>(null);
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    includeImages: true,
    includeGraphs: true,
    includeCode: true,
  });
  const [genMM, setGenMM] = useState(false);
  const [mindmap, setMindmap] = useState<MindmapData>(null);
  const [selectedLessonMindmaps, setSelectedLessonMindmaps] = useState<string[]>([]);
  const [lessonMindmapSelectionReady, setLessonMindmapSelectionReady] = useState(false);
  const [bulkGeneratingMindmaps, setBulkGeneratingMindmaps] = useState(false);
  const [bulkMindmapProgress, setBulkMindmapProgress] = useState("");
  const [pyqCount, setPyqCount] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);

  useEffect(() => {
    if (!course?.id) return;
    setMindmap((course as CourseWithMindmap).mindmap || null);
    backendApi.from("course_pyq").select("id", { count: "exact", head: true }).eq("course_id", course.id)
      .then(({ count }) => setPyqCount(count || 0));
  }, [course]);

  useEffect(() => {
    setLessonMindmapSelectionReady(false);
    setSelectedLessonMindmaps([]);
  }, [course?.id]);

  useEffect(() => {
    if (!topics.length || lessonMindmapSelectionReady) return;
    setSelectedLessonMindmaps(topics.filter((topic) => !topic.mindmap).map((topic) => topic.id));
    setLessonMindmapSelectionReady(true);
  }, [lessonMindmapSelectionReady, topics]);

  if (cLoad || loading) return <div className="container py-20 text-muted-foreground">Loading…</div>;
  if (!course) return <div className="container py-20 text-muted-foreground">Course not found.</div>;

  const generateMindmap = async () => {
    setGenMM(true);
    try {
      const { data, error } = await backendApi.functions.invoke("generate-mindmap", { body: { courseId: course.id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMindmap(data.mindmap);
      toast.success("Course mind map generated");
    } catch (e: unknown) { toast.error(errorMessage(e, "Failed")); }
    finally { setGenMM(false); }
  };

  const byUnit: Record<number, typeof topics> = {};
  topics.forEach(t => { (byUnit[t.unit] ||= []).push(t); });
  const lessonMindmapsGenerated = topics.filter((topic) => topic.mindmap).length;
  const selectedLessonMindmapCount = selectedLessonMindmaps.length;

  const setExportOption = (key: keyof ExportOptions, value: boolean) => {
    setExportOptions((current) => ({ ...current, [key]: value }));
  };

  const setLessonMindmapSelected = (topicId: string, selected: boolean) => {
    setSelectedLessonMindmaps((current) => selected
      ? Array.from(new Set([...current, topicId]))
      : current.filter((id) => id !== topicId));
  };

  const generateSelectedLessonMindmaps = async () => {
    if (!isAdmin) return;
    const selectedTopics = topics.filter((topic) => selectedLessonMindmaps.includes(topic.id));
    if (!selectedTopics.length) {
      toast.info("Select at least one lesson");
      return;
    }
    setBulkGeneratingMindmaps(true);
    let generated = 0;
    try {
      for (const [index, topic] of selectedTopics.entries()) {
        setBulkMindmapProgress(`${index + 1}/${selectedTopics.length}`);
        const { data, error } = await backendApi.functions.invoke("generate-mindmap", {
          body: { topicId: topic.id, courseId: course.id },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setTopics((current) => current.map((item) => item.id === topic.id ? { ...item, mindmap: data.mindmap } : item));
        generated += 1;
      }
      setSelectedLessonMindmaps([]);
      toast.success(`Generated ${generated} lesson mind map${generated === 1 ? "" : "s"}`);
    } catch (e: unknown) {
      toast.error(errorMessage(e, generated ? `Stopped after ${generated} generated` : "Lesson mind map generation failed"));
    } finally {
      setBulkGeneratingMindmaps(false);
      setBulkMindmapProgress("");
    }
  };

  const downloadBase64 = (base64: string, mime: string, filename: string) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportCourse = async (format: ExportFormat) => {
    setExporting(format);
    try {
      const { data, error } = await backendApi.functions.invoke("export-course", {
        body: { courseId: course.id, options: exportOptions },
      });
      if (error) throw error;
      const baseName = data?.filename || course.slug || "course";
      const docExtension = data?.docExtension || "doc";
      const docMime = data?.docMime || "application/msword";
      if (format === "docs") {
        if (!data?.docx) throw new Error("Google Docs export was not returned");
        downloadBase64(data.docx, docMime, `${baseName}.${docExtension}`);
        toast.success("Downloaded Google Docs file");
      } else {
        if (!data?.pdf) throw new Error("PDF export was not returned");
        downloadBase64(data.pdf, "application/pdf", `${baseName}.pdf`);
        toast.success("Downloaded PDF");
      }
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Download failed"));
    } finally { setExporting(null); }
  };

  const exportCourseMindmaps = async () => {
    setExporting("mindmaps");
    try {
      const { data, error } = await backendApi.functions.invoke("export-course-mindmaps", {
        body: { courseId: course.id },
      });
      if (error) throw error;
      if (!data?.pdf) throw new Error("Mind map PDF export was not returned");
      downloadBase64(data.pdf, "application/pdf", `${data.filename || `${course.slug}-mindmaps`}.pdf`);
      const count = Number(data.count || 0);
      toast.success(count > 0 ? `Downloaded ${count} mind map page${count === 1 ? "" : "s"}` : "Downloaded mind map PDF");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Mind map download failed"));
    } finally { setExporting(null); }
  };

  return (
    <div className="container overflow-hidden px-3 py-8 sm:px-4 sm:py-12">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/courses"><ArrowLeft className="h-4 w-4 mr-1" /> All courses</Link>
      </Button>

      <div className="mb-10">
        <div className="max-w-7xl">
          <div className="mb-3 text-4xl sm:text-5xl">{course.cover_emoji}</div>
          <h1 className="font-display text-2xl font-bold leading-tight sm:text-4xl md:text-5xl">{course.title}</h1>
          <p className="mt-3 max-w-6xl text-sm leading-7 text-muted-foreground sm:text-base md:text-lg md:leading-relaxed">{course.description}</p>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button asChild variant="ghost" size="sm">
            <Link to={`/course/${course.slug}/pyq`}><FileQuestion className="h-4 w-4 mr-1" /> PYQs {pyqCount > 0 && <span className="ml-1 text-xs font-mono text-primary">({pyqCount})</span>}</Link>
          </Button>
          <Button asChild variant="neon" size="sm">
            <Link to={`/course/${course.slug}/quiz`}><Brain className="h-4 w-4 mr-1" /> Full course MCQ</Link>
          </Button>
          <Button onClick={() => exportCourse("docs")} variant="neon" disabled={Boolean(exporting)}>
            {exporting === "docs" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
            Google Docs
          </Button>
          <Button onClick={() => exportCourse("pdf")} variant="neon" disabled={Boolean(exporting)}>
            {exporting === "pdf" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileJson className="h-4 w-4 mr-1" />}
            PDF
          </Button>
          <Button onClick={exportCourseMindmaps} variant="neon" disabled={Boolean(exporting)}>
            {exporting === "mindmaps" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            Mind maps PDF
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="neon" disabled={Boolean(exporting)} className="gap-1">
                <Settings2 className="h-4 w-4" />
                Export options
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Include content</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={exportOptions.includeImages}
                onCheckedChange={(checked) => setExportOption("includeImages", Boolean(checked))}
                onSelect={(event) => event.preventDefault()}
              >
                Images
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={exportOptions.includeGraphs}
                onCheckedChange={(checked) => setExportOption("includeGraphs", Boolean(checked))}
                onSelect={(event) => event.preventDefault()}
              >
                Graphs and charts
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={exportOptions.includeCode}
                onCheckedChange={(checked) => setExportOption("includeCode", Boolean(checked))}
                onSelect={(event) => event.preventDefault()}
              >
                Code blocks
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {isAdmin && (
            <>
              <Button asChild variant="hero" className="col-span-2 sm:col-span-1">
                <Link to={`/course/${course.slug}/edit`}><Edit3 className="h-4 w-4 mr-1" /> Manage</Link>
              </Button>
              <Button asChild variant="neon" className="col-span-2 sm:col-span-1">
                <Link to={`/course/${course.slug}/settings`}><Settings2 className="h-4 w-4 mr-1" /> Settings</Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Auto Table of Contents */}
      {topics.length > 0 && (
        <div className="glass mb-8 rounded-xl p-4 sm:rounded-2xl sm:p-5">
          <button
            type="button"
            onClick={() => setTocOpen((open) => !open)}
            aria-expanded={tocOpen}
            aria-controls="course-table-of-content"
            className="flex w-full items-center gap-2 rounded-lg text-left transition hover:text-primary"
          >
            <Info className="h-5 w-5 shrink-0 text-primary" />
            <span className="font-display text-base font-bold sm:text-lg">Table of content</span>
            <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">{topics.length} lessons</span>
          </button>
          {tocOpen && (
            <ol id="course-table-of-content" className="mt-4 grid gap-x-10 gap-y-1 border-t border-border/60 pt-4 text-sm sm:grid-cols-2 xl:grid-cols-3">
              {topics.map((t) => (
                <li key={t.id} className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{t.unit}.{t.order_index}</span>
                  <Link to={`/course/${course.slug}/topic/${t.slug}`} className="min-w-0 break-words leading-6 hover:text-primary sm:truncate">{t.title}</Link>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {topics.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-muted-foreground">
          No lessons yet. {isAdmin && <Link to={`/course/${course.slug}/edit`} className="text-primary">Add some →</Link>}
        </div>
      ) : (
        <div className="space-y-12">
          {Object.keys(byUnit).map(k => {
            const u = Number(k);
            const items = byUnit[u];
            return (
              <motion.section key={u} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-xl bg-gradient-primary grid place-items-center font-display font-bold text-primary-foreground shadow-glow">{u}</div>
                  <div>
                    <div className="text-xs font-mono text-muted-foreground">UNIT {u}</div>
                    <div className="font-display text-xl font-bold">{items[0]?.title.split(":")[0] || `Unit ${u}`}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {items.map((t) => {
                    const p = progress[t.id];
                    const passed = p?.passed; const viewed = p?.viewed;
                    return (
                      <Link key={t.id} to={`/course/${course.slug}/topic/${t.slug}`} className="group">
                        <motion.div whileHover={{ y: -4, scale: 1.02 }}
                          className={`relative glass rounded-2xl p-4 h-full transition-all ${
                            passed ? "border-success/60 shadow-glow" : viewed ? "border-primary/50" : "hover:border-primary/40"}`}>
                          <div className="flex items-start justify-between mb-2">
                            <div className={`h-9 w-9 rounded-lg grid place-items-center font-mono text-xs ${passed ? "bg-success/20 text-success" : "bg-primary/10 text-primary"}`}>
                              {u}.{t.order_index}
                            </div>
                            {passed ? <CheckCircle2 className="h-5 w-5 text-success animate-pulse-glow" /> :
                             viewed ? <Sparkles className="h-5 w-5 text-primary" /> :
                                      <Circle className="h-5 w-5 text-muted-foreground" />}
                          </div>
                          <div className="font-display font-semibold leading-tight">{t.title}</div>
                          <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{t.summary}</div>
                          {p && <div className="mt-3 text-[10px] font-mono text-muted-foreground">best: <span className={passed ? "text-success" : "text-warning"}>{p.best_quiz_score}%</span></div>}
                        </motion.div>
                      </Link>
                    );
                  })}
                </div>
              </motion.section>
            );
          })}
        </div>
      )}

      {topics.length > 0 && (
        <div className="mt-12 glass rounded-2xl p-6">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="font-display font-bold text-xl flex items-center gap-2"><Brain className="h-5 w-5 text-primary" /> Course Mind Map</div>
            {isAdmin && (
              <div className="flex flex-wrap gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="neon" size="sm" disabled={bulkGeneratingMindmaps} className="gap-1">
                      <Brain className="h-4 w-4" />
                      Lesson mind maps
                      <span className="font-mono text-xs">({selectedLessonMindmapCount})</span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-96 w-80 overflow-auto">
                    <DropdownMenuLabel>{lessonMindmapsGenerated}/{topics.length} generated</DropdownMenuLabel>
                    <div className="grid grid-cols-3 gap-1 px-2 pb-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => setSelectedLessonMindmaps(topics.filter((topic) => !topic.mindmap).map((topic) => topic.id))}
                      >
                        Missing
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => setSelectedLessonMindmaps(topics.map((topic) => topic.id))}
                      >
                        All
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => setSelectedLessonMindmaps([])}
                      >
                        Clear
                      </Button>
                    </div>
                    {topics.map((topic) => (
                      <DropdownMenuCheckboxItem
                        key={topic.id}
                        checked={selectedLessonMindmaps.includes(topic.id)}
                        onCheckedChange={(checked) => setLessonMindmapSelected(topic.id, Boolean(checked))}
                        onSelect={(event) => event.preventDefault()}
                        className="items-start gap-2"
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{topic.unit}.{topic.order_index} {topic.title}</span>
                          <span className="block text-[10px] text-muted-foreground">{topic.mindmap ? "Generated" : "Not generated"}</span>
                        </span>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="neon" size="sm" onClick={generateSelectedLessonMindmaps} disabled={bulkGeneratingMindmaps || !selectedLessonMindmapCount}>
                  {bulkGeneratingMindmaps ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                  {bulkGeneratingMindmaps ? `Generating ${bulkMindmapProgress}` : "Generate selected"}
                </Button>
                <Button variant="neon" size="sm" onClick={generateMindmap} disabled={genMM}>
                  {genMM ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                  {mindmap ? "Regenerate" : "Generate"} mind map
                </Button>
              </div>
            )}
          </div>
          {mindmap ? <Mindmap data={mindmap} /> : (
            <p className="text-sm text-muted-foreground">No course mind map yet{isAdmin ? " — click generate." : "."}</p>
          )}
        </div>
      )}
    </div>
  );
}
