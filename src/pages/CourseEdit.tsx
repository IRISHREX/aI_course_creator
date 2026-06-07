import { useEffect, useState, type ComponentProps, type DragEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useCourseBySlug } from "@/hooks/useCourses";
import { useTopics } from "@/hooks/useTopics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { backendApi } from "@/integrations/api/client";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, CheckSquare, Download, Edit3, FileJson, FileText, GripVertical, Languages, Layers3, Loader2, Lock, Plus, RefreshCw, Save, SearchCheck, Settings, Sparkles, Square, Tag, Trash2, Upload, X, Zap } from "lucide-react";
import { extractTextFromFile } from "@/lib/extractText";
import { LESSON_LANGUAGES, languageByCode, normalizeTranslations } from "@/lib/lessonLanguages";

type BulkLessonInput = { unit: number; title: string; summary: string };
type ExportOptions = {
  includeImages: boolean;
  includeGraphs: boolean;
  includeCode: boolean;
};

type DuplicateScanItem = {
  topicId: string;
  blockIndex: number;
  role: "keep" | "delete";
  note?: string;
};

type DuplicateScanGroup = {
  id: string;
  concept: string;
  reason?: string;
  items: DuplicateScanItem[];
};

const blockPreview = (block: any) => {
  if (!block || typeof block !== "object") return "";
  const parts = [
    block.title,
    block.value,
    block.caption,
    Array.isArray(block.items) ? block.items.map((item: any) => typeof item === "string" ? item : [item?.label, item?.desc].filter(Boolean).join(": ")).join(" ") : "",
  ];
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 180);
};

function ToolButton({
  label,
  children,
  ...props
}: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={label} title={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export default function CourseEdit() {
  const { courseSlug } = useParams();
  const { isAdmin, loading: aLoad } = useIsAdmin();
  const { course, loading: cLoad } = useCourseBySlug(courseSlug);
  const { topics, setTopics } = useTopics(course?.id);
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [generating, setGenerating] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [reDocsUrl, setReDocsUrl] = useState("");
  const [reRawText, setReRawText] = useState("");
  const [resetLessons, setResetLessons] = useState(true);
  const [reUploading, setReUploading] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<"outline" | "json">("outline");
  const [bulkText, setBulkText] = useState("");
  const [bulkJson, setBulkJson] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportDrawerOpen, setExportDrawerOpen] = useState(false);
  const [translationLanguage, setTranslationLanguage] = useState("bn");
  const [translatingCourse, setTranslatingCourse] = useState(false);
  const [translationPrompt, setTranslationPrompt] = useState("");
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    includeImages: true,
    includeGraphs: true,
    includeCode: true,
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [duplicateSelectedUnits, setDuplicateSelectedUnits] = useState<number[]>([]);
  const [duplicateScanning, setDuplicateScanning] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateScanGroup[]>([]);
  const [duplicateDeleting, setDuplicateDeleting] = useState<string | null>(null);
  const [draggingTopicId, setDraggingTopicId] = useState<string | null>(null);
  const [dragOverTopicId, setDragOverTopicId] = useState<string | null>(null);
  const duplicateUnitFallback = Array.from(new Set(topics.map(t => Number(t.unit)).filter(Number.isFinite))).sort((a, b) => a - b)[0] || 1;
  const units = Array.from(new Set(topics.map(t => Number(t.unit)).filter(Number.isFinite))).sort((a, b) => a - b);
  const selectedDuplicateUnits = duplicateSelectedUnits.length ? duplicateSelectedUnits : [duplicateUnitFallback];
  const activeDuplicateUnit = selectedDuplicateUnits[0];

  useEffect(() => {
    if (course) {
      setTitle(course.title); setDescription(course.description); setEmoji(course.cover_emoji || "📘");
      setTags(((course as any).tags as string[]) || []);
    }
  }, [course]);

  if (aLoad || cLoad) return <div className="container py-20 text-muted-foreground">Loading…</div>;
  if (!isAdmin) return (
    <div className="container max-w-md py-20 text-center">
      <Lock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
      <h1 className="font-display text-2xl font-bold">Admins only</h1>
      <Button asChild variant="hero" className="mt-4"><Link to={`/course/${courseSlug}`}>Back</Link></Button>
    </div>
  );
  if (!course) return <div className="container py-20 text-muted-foreground">Course not found.</div>;

  const ready = topics.filter(t => (t as any).generation_status === "ready").length;
  const pending = topics.length - ready;
  const pct = topics.length ? Math.round((ready / topics.length) * 100) : 100;
  const selectedTopics = topics.filter((topic) => selectedIds.includes(topic.id));
  const allSelected = topics.length > 0 && selectedIds.length === topics.length;
  const selectedLanguage = languageByCode(translationLanguage);
  const translatedCount = topics.filter((topic) => normalizeTranslations((topic as any).translations).some((item) => item.languageCode === translationLanguage)).length;
  const missingTranslationCount = Math.max(0, topics.length - translatedCount);
  const nextUnitNumber = units.length + 1;

  const refreshTopics = async () => {
    const { data } = await backendApi.from("topics").select("*").eq("course_id", course.id).order("unit").order("order_index");
    const nextTopics = (data as any) ?? [];
    setTopics(nextTopics);
    return nextTopics;
  };

  const scanDuplicateConcepts = async () => {
    setDuplicateScanning(true);
    setDuplicateGroups([]);
    try {
      const { data, error } = await backendApi.functions.invoke("scan-lesson-duplicates", {
        body: { courseId: course.id, units: selectedDuplicateUnits },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDuplicateGroups(data?.groups || []);
      if ((data?.groups || []).length) toast.success(`Found ${data.groups.length} repeated concept group${data.groups.length === 1 ? "" : "s"}`);
      else toast.info("No repeated concept explanations found in the selected units");
    } catch (e: any) {
      toast.error(e.message || "Duplicate scan failed");
    } finally {
      setDuplicateScanning(false);
    }
  };

  const removeDuplicateItemsFromState = (items: DuplicateScanItem[]) => {
    const keys = new Set(items.map(item => `${item.topicId}:${item.blockIndex}`));
    setDuplicateGroups(groups => groups
      .map(group => ({ ...group, items: group.items.filter(item => !keys.has(`${item.topicId}:${item.blockIndex}`)) }))
      .filter(group => group.items.some(item => item.role === "delete")));
  };

  const toggleDuplicateUnit = (unit: number) => {
    setDuplicateGroups([]);
    setDuplicateSelectedUnits((prev) => {
      const next = prev.includes(unit) ? prev.filter((u) => u !== unit) : [...prev, unit];
      return next.length ? next : [unit];
    });
  };

  const selectAllDuplicateUnits = () => {
    setDuplicateGroups([]);
    setDuplicateSelectedUnits(units.length ? units : [duplicateUnitFallback]);
  };

  const toggleDuplicateItemRole = (groupId: string, topicId: string, blockIndex: number, role: DuplicateScanItem["role"]) => {
    setDuplicateGroups((groups) => groups.map((group) => {
      if (group.id !== groupId) return group;
      return {
        ...group,
        items: group.items.map((item) => item.topicId === topicId && item.blockIndex === blockIndex ? { ...item, role } : item),
      };
    }));
  };

  const deleteDuplicateBlocks = async (items: DuplicateScanItem[], label = "duplicate block") => {
    const deleteItems = items.filter(item => item.role === "delete");
    if (!deleteItems.length) return;
    setDuplicateDeleting(label);
    try {
      const byTopic = new Map<string, number[]>();
      for (const item of deleteItems) byTopic.set(item.topicId, [...(byTopic.get(item.topicId) || []), item.blockIndex]);
      for (const [topicId, indexes] of byTopic) {
        const target = topics.find(t => t.id === topicId);
        if (!target || !Array.isArray((target as any).content)) continue;
        const removeIndexes = new Set(indexes);
        const nextContent = ((target as any).content as any[]).filter((_, index) => !removeIndexes.has(index));
        const { error } = await backendApi.from("topics").update({ content: nextContent } as any).eq("id", topicId);
        if (error) throw error;
      }
      removeDuplicateItemsFromState(deleteItems);
      await refreshTopics();
      toast.success(`Deleted ${deleteItems.length} repeated content block${deleteItems.length === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error(e.message || "Could not delete repeated content");
    } finally {
      setDuplicateDeleting(null);
    }
  };

  const sortedTopics = [...topics].sort((a, b) => a.unit === b.unit ? a.order_index - b.order_index : a.unit - b.unit);

  const serializeTopics = (sourceTopics: typeof topics) => {
    const unitMap = new Map<number, number>();
    const nextOrderByUnit = new Map<number, number>();

    return sourceTopics.map((topic) => {
      const rawUnit = Number.isFinite(Number(topic.unit)) && Number(topic.unit) > 0 ? Number(topic.unit) : 1;
      if (!unitMap.has(rawUnit)) unitMap.set(rawUnit, unitMap.size + 1);
      const unit = unitMap.get(rawUnit)!;
      const orderIndex = nextOrderByUnit.get(unit) ?? 0;
      nextOrderByUnit.set(unit, orderIndex + 1);
      return { ...topic, unit, order_index: orderIndex };
    });
  };

  const persistSerializedTopics = async (orderedTopics: typeof topics, message = "Lesson order updated") => {
    const serialized = serializeTopics(orderedTopics);
    setTopics(serialized);
    const updates = serialized
      .filter((topic) => {
        const before = topics.find((item) => item.id === topic.id);
        return !before || before.unit !== topic.unit || before.order_index !== topic.order_index;
      })
      .map((topic) => backendApi.from("topics").update({ unit: topic.unit, order_index: topic.order_index } as any).eq("id", topic.id).then(({ error }) => {
        if (error) throw error;
      }));
    await Promise.all(updates);
    await refreshTopics();
    if (updates.length) toast.success(message);
    else toast.info("Lessons are already serialized");
  };

  const resequenceTopics = async (sourceTopics = topics, removedIds: string[] = [], message = "Lessons reserialized") => {
    const removed = new Set(removedIds);
    const nextTopics = sourceTopics
      .filter((topic) => !removed.has(topic.id))
      .sort((a, b) => a.unit === b.unit ? a.order_index - b.order_index : a.unit - b.unit);
    await persistSerializedTopics(nextTopics, message);
  };

  const handleSerializeLessons = async () => {
    setBulkBusy(true);
    try {
      await resequenceTopics(topics, [], "Lessons reserialized");
    } catch (e: any) {
      toast.error(e.message || "Could not reserialize lessons");
    } finally {
      setBulkBusy(false);
    }
  };

  const handleLessonDragStart = (event: DragEvent<HTMLButtonElement>, topicId: string) => {
    setDraggingTopicId(topicId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", topicId);
  };

  const handleLessonDragOver = (event: DragEvent<HTMLTableRowElement>, topicId: string) => {
    if (bulkBusy || !draggingTopicId || draggingTopicId === topicId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverTopicId(topicId);
  };

  const handleLessonDrop = async (event: DragEvent<HTMLTableRowElement>, targetTopicId: string) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain") || draggingTopicId;
    setDraggingTopicId(null);
    setDragOverTopicId(null);
    if (!sourceId || sourceId === targetTopicId) return;

    const sourceTopic = sortedTopics.find((topic) => topic.id === sourceId);
    const targetTopic = sortedTopics.find((topic) => topic.id === targetTopicId);
    if (!sourceTopic || !targetTopic) return;

    const withoutSource = sortedTopics.filter((topic) => topic.id !== sourceId);
    const targetIndex = withoutSource.findIndex((topic) => topic.id === targetTopicId);
    if (targetIndex < 0) return;
    const movedTopic = { ...sourceTopic, unit: targetTopic.unit };
    const ordered = [
      ...withoutSource.slice(0, targetIndex),
      movedTopic,
      ...withoutSource.slice(targetIndex),
    ];

    setBulkBusy(true);
    try {
      await persistSerializedTopics(ordered, "Lesson moved and reserialized");
    } catch (e: any) {
      toast.error(e.message || "Could not move lesson");
      await refreshTopics();
    } finally {
      setBulkBusy(false);
    }
  };

  const generateOne = async (topicId: string) => {
    setGenerating(topicId);
    try {
      const { data, error } = await backendApi.functions.invoke("generate-lesson", { body: { topicId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Lesson generated");
      await refreshTopics();
    } catch (e: any) {
      toast.error(e.message || "Generation failed");
    } finally { setGenerating(null); }
  };

  const generateTopicBatch = async (items: typeof topics, successMessage: string) => {
    setBatchRunning(true);
    let completed = 0;
    for (const t of items) {
      try {
        const { data, error } = await backendApi.functions.invoke("generate-lesson", { body: { topicId: t.id } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        completed += 1;
      } catch (e: any) {
        const message = e.message || "";
        if (message.includes("AI generation paused") || message.includes("API key") || message.includes("limit exceeded")) {
          toast.error(message);
          break;
        }
        toast.error(`Failed: ${t.title}`);
      }
    }
    setBatchRunning(false);
    if (completed) {
      await refreshTopics();
      toast.success(successMessage);
    } else {
      toast.info("No lessons were generated");
    }
  };

  const generateAllRemaining = async (sourceTopics = topics) => {
    await generateTopicBatch(sourceTopics.filter(t => (t as any).generation_status !== "ready"), "Batch generation complete");
  };

  const generateSelected = async () => {
    if (!selectedTopics.length) return;
    await generateTopicBatch(selectedTopics, `Generated ${selectedTopics.length} selected lesson${selectedTopics.length === 1 ? "" : "s"}`);
  };

  const hasTranslation = (topic: typeof topics[number], languageCode = translationLanguage) =>
    normalizeTranslations((topic as any).translations).some((item) => item.languageCode === languageCode);

  const translateTopicBatch = async (items: typeof topics, successMessage: string) => {
    if (translationLanguage === "en") {
      toast.error("Choose a non-English language");
      return;
    }
    if (!items.length) {
      toast.info("No lessons selected for this language");
      return;
    }

    setTranslatingCourse(true);
    let completed = 0;
    try {
      for (const topic of items) {
        try {
          const { data, error } = await backendApi.functions.invoke("translate-lesson", {
            body: {
              topicId: topic.id,
              languageCode: selectedLanguage.code,
              languageName: selectedLanguage.label,
              dir: selectedLanguage.dir || "ltr",
              customInstruction: translationPrompt.trim() || undefined,
            },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          completed += 1;
        } catch (e: any) {
          const message = e.message || "";
          if (message.includes("AI generation paused") || message.includes("API key") || message.includes("limit exceeded")) {
            toast.error(message);
            break;
          }
          toast.error(`Language failed: ${topic.title}`);
        }
      }
      if (completed) {
        await refreshTopics();
        toast.success(successMessage);
      }
      else toast.info("No language versions were generated");
    } finally {
      setTranslatingCourse(false);
    }
  };

  const translateSelectedLessons = async () => {
    await translateTopicBatch(selectedTopics, `Generated ${selectedLanguage.label} for ${selectedTopics.length} selected lesson${selectedTopics.length === 1 ? "" : "s"}`);
  };

  const translateMissingLessons = async () => {
    const missing = topics.filter((topic) => !hasTranslation(topic));
    await translateTopicBatch(missing, `Generated missing ${selectedLanguage.label} lesson versions`);
  };

  const editTopicMeta = async (topic: typeof topics[number]) => {
    const unitText = window.prompt("Unit number:", String(topic.unit));
    if (unitText === null) return;
    const orderText = window.prompt("Lesson index in this unit (0 for unit overview):", String(topic.order_index));
    if (orderText === null) return;
    const titleText = window.prompt("Lesson or unit title:", topic.title);
    if (titleText === null) return;
    const summaryText = window.prompt("Short summary:", topic.summary || "");
    if (summaryText === null) return;

    const unit = Number(unitText);
    const orderIndex = Number(orderText);
    if (!Number.isInteger(unit) || unit < 1) { toast.error("Unit must be a positive whole number"); return; }
    if (!Number.isInteger(orderIndex) || orderIndex < 0) { toast.error("Lesson index must be 0 or higher"); return; }
    if (!titleText.trim()) { toast.error("Title is required"); return; }

    const { error } = await backendApi.from("topics").update({
      unit,
      order_index: orderIndex,
      title: titleText.trim(),
      summary: summaryText.trim(),
    } as any).eq("id", topic.id);
    if (error) toast.error(error.message);
    else {
      toast.success(orderIndex === 0 ? "Unit title updated" : "Lesson indexing updated");
      const nextTopics = await refreshTopics();
      await resequenceTopics(nextTopics, [], "Lessons reserialized");
    }
  };

  const saveCourse = async () => {
    const { error } = await backendApi.from("courses").update({
      title, description, cover_emoji: emoji, tags,
    } as any).eq("id", course.id);
    if (error) toast.error(error.message); else toast.success("Course updated");
  };

  const addTag = () => {
    const v = tagInput.trim().toLowerCase();
    if (!v) return;
    if (tags.includes(v)) { setTagInput(""); return; }
    setTags([...tags, v]);
    setTagInput("");
  };
  const removeTag = (t: string) => setTags(tags.filter(x => x !== t));

  const addTopic = async (opts?: { aiGenerate?: boolean }) => {
    const titleIn = prompt("New lesson title:");
    if (!titleIn) return;
    const summaryIn = prompt("Short summary (optional):") || "";
    const unitIn = Number(prompt("Unit number:", String(nextUnitNumber)) || nextUnitNumber);
    try {
      const { data, error } = await backendApi.functions.invoke("create-topic", {
        body: { courseId: course.id, title: titleIn, summary: summaryIn, unit: unitIn, generate: !!opts?.aiGenerate },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const created = data.topic;
      const nextTopics = await refreshTopics();
      await resequenceTopics(nextTopics, [], "Lesson added and order updated");
      if (opts?.aiGenerate && created) {
        toast.info("Generating lesson with AI…");
        await generateOne(created.id);
      } else if (created) {
        nav(`/course/${course.slug}/topic/${created.slug}/edit`);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to add lesson");
    }
  };

  const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || `lesson-${Date.now()}`;

  const parseBulkLessons = (text: string): BulkLessonInput[] => {
    const rows: BulkLessonInput[] = [];
    let unit = 1;

    text.split(/\r?\n/).forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) return;

      const unitMatch = line.match(/^(?:unit|chapter|section)\s*(\d+)\s*[:\-–—]?\s*(.*)$/i);
      if (unitMatch) {
        unit = Number(unitMatch[1]) || unit;
        return;
      }

      const clean = line.replace(/^[-*•]\s*/, "").replace(/^\d+[\.)]\s*/, "").trim();
      const [titlePart, ...summaryParts] = clean.split(/\s*(?:::|--)\s*/);
      const title = titlePart?.trim();
      if (title) rows.push({ unit, title, summary: summaryParts.join(" ").trim() });
    });

    return rows;
  };

  const readJsonString = (value: unknown) => typeof value === "string" ? value : value == null ? "" : String(value);

  const parseBulkJson = (text: string): BulkLessonInput[] => {
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error("Bulk lesson JSON is not valid");
    }

    const root = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
    const rawUnits = Array.isArray(root.units) ? root.units : Array.isArray(root.toc) ? root.toc : [];
    const rawFlat = Array.isArray(root.lessons) ? root.lessons : Array.isArray(root.topics) ? root.topics : Array.isArray(payload) ? payload : [];

    if (rawUnits.length) {
      return rawUnits.flatMap((rawUnit, unitIndex) => {
        const unitObj = rawUnit && typeof rawUnit === "object" && !Array.isArray(rawUnit) ? rawUnit as Record<string, unknown> : {};
        const unit = Number(unitObj.unit) || unitIndex + 1;
        const rawLessons = Array.isArray(unitObj.lessons) ? unitObj.lessons : Array.isArray(unitObj.topics) ? unitObj.topics : [];
        return rawLessons.map((rawLesson): BulkLessonInput => {
          const lessonObj = rawLesson && typeof rawLesson === "object" && !Array.isArray(rawLesson) ? rawLesson as Record<string, unknown> : {};
          return {
            unit,
            title: (typeof rawLesson === "string" ? rawLesson : readJsonString(lessonObj.title)).trim(),
            summary: (typeof rawLesson === "string" ? "" : readJsonString(lessonObj.summary)).trim(),
          };
        });
      }).filter((lesson) => lesson.title);
    }

    return rawFlat.map((rawLesson): BulkLessonInput => {
      const lessonObj = rawLesson && typeof rawLesson === "object" && !Array.isArray(rawLesson) ? rawLesson as Record<string, unknown> : {};
      return {
        unit: Number(lessonObj.unit) || 1,
        title: (typeof rawLesson === "string" ? rawLesson : readJsonString(lessonObj.title)).trim(),
        summary: (typeof rawLesson === "string" ? "" : readJsonString(lessonObj.summary)).trim(),
      };
    }).filter((lesson) => lesson.title);
  };

  const createBulkLessons = async () => {
    let parsed: BulkLessonInput[];
    try {
      parsed = bulkMode === "json" ? parseBulkJson(bulkJson.trim()) : parseBulkLessons(bulkText.trim());
    } catch (e: any) {
      toast.error(e.message || "Could not read lesson input");
      return;
    }

    if (!parsed.length) {
      toast.error("Add at least one lesson title");
      return;
    }

    setBulkBusy(true);
    try {
      const existingByUnit = topics.reduce<Record<number, number>>((acc, topic) => {
        acc[topic.unit] = Math.max(acc[topic.unit] ?? -1, topic.order_index ?? -1);
        return acc;
      }, {});
      const nextByUnit = { ...existingByUnit };
      const seenSlugs = new Set(topics.map((topic) => topic.slug));

      const rows = parsed.map((lesson, index) => {
        const base = `${course.slug}-${slugify(lesson.title)}`;
        let slug = base;
        let suffix = 2;
        while (seenSlugs.has(slug)) slug = `${base}-${suffix++}`;
        seenSlugs.add(slug);
        nextByUnit[lesson.unit] = (nextByUnit[lesson.unit] ?? -1) + 1;

        return {
          course_id: course.id,
          slug,
          unit: lesson.unit,
          order_index: nextByUnit[lesson.unit],
          title: lesson.title,
          summary: lesson.summary,
          content: [],
          quiz: [],
          generation_status: "ready",
        };
      });

      const { error } = await backendApi.from("topics").insert(rows as any);
      if (error) throw error;
      toast.success(`Added ${rows.length} lesson${rows.length === 1 ? "" : "s"}`);
      setBulkText("");
      setBulkJson("");
      setBulkOpen(false);
      const nextTopics = await refreshTopics();
      await resequenceTopics(nextTopics, [], "Lessons added and reserialized");
    } catch (e: any) {
      toast.error(e.message || "Bulk lesson creation failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const deleteTopic = async (id: string, t: string) => {
    if (!confirm(`Delete lesson "${t}"?`)) return;
    const { error } = await backendApi.from("topics").delete().eq("id", id);
    if (error) toast.error(error.message); else {
      await resequenceTopics(topics, [id]);
      setSelectedIds((ids) => ids.filter((selectedId) => selectedId !== id));
      toast.success("Deleted");
      refreshTopics();
    }
  };

  const deleteSelected = async () => {
    if (!selectedTopics.length) return;
    if (!confirm(`Delete ${selectedTopics.length} selected lesson${selectedTopics.length === 1 ? "" : "s"}?`)) return;
    setBulkBusy(true);
    try {
      for (const topic of selectedTopics) {
        const { error } = await backendApi.from("topics").delete().eq("id", topic.id);
        if (error) throw error;
      }
      await resequenceTopics(topics, selectedTopics.map((topic) => topic.id));
      setSelectedIds([]);
      toast.success(`Deleted ${selectedTopics.length} lesson${selectedTopics.length === 1 ? "" : "s"}`);
      await refreshTopics();
    } catch (e: any) {
      toast.error(e.message || "Bulk delete failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const toggleSelection = (topicId: string) => {
    setSelectedIds((ids) => ids.includes(topicId) ? ids.filter((id) => id !== topicId) : [...ids, topicId]);
  };

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : topics.map((topic) => topic.id));
  };

  const handleReFile = async (file: File) => {
    try {
      toast.info(`Reading ${file.name}…`);
      const text = await extractTextFromFile(file);
      if (!text.trim()) throw new Error("No text extracted");
      setReRawText(text);
      toast.success(`Extracted ${text.length.toLocaleString()} characters`);
    } catch (e: any) {
      toast.error(e.message || "Could not read file");
    }
  };

  const reuploadSource = async () => {
    if (!reDocsUrl.trim() && !reRawText.trim()) { toast.error("Provide a Google Docs URL, paste text, or upload a file"); return; }
    setReUploading(true);
    try {
      const { data, error } = await backendApi.functions.invoke("update-course-source", {
        body: {
          courseId: course.id,
          docsUrl: reDocsUrl.trim() || undefined,
          rawText: reRawText.trim() || undefined,
          resetLessons,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Source updated (${data.sourceLength.toLocaleString()} chars${data.attempts > 1 ? `, ${data.attempts} attempts` : ""})`);
      setReDocsUrl(""); setReRawText("");
      const nextTopics = await refreshTopics();
      if (resetLessons) {
        toast.info("Re-running generation for all lessons…");
        await generateAllRemaining(nextTopics);
      }
    } catch (e: any) {
      toast.error(e.message || "Re-upload failed");
    } finally { setReUploading(false); }
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

  const setExportOption = (key: keyof ExportOptions, value: boolean) => {
    setExportOptions((current) => ({ ...current, [key]: value }));
  };

  const exportCourse = async (format: "docs" | "pdf") => {
    setExporting(true);
    try {
      const { data, error } = await backendApi.functions.invoke("export-course", { body: { courseId: course.id, options: exportOptions } });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      } else {
        const baseName = data?.filename || course.slug || "course";
        const docExtension = data?.docExtension || "docx";
        const docMime = data?.docMime || "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        if (format === "docs") {
          if (!data?.docx) throw new Error("Docs export was not returned");
          downloadBase64(data.docx, docMime, `${baseName}.${docExtension}`);
          toast.success("Downloaded Google Docs file");
        } else {
          if (!data?.pdf) throw new Error("PDF export was not returned");
          downloadBase64(data.pdf, "application/pdf", `${baseName}.pdf`);
          toast.success("Downloaded PDF");
        }
        setExportDrawerOpen(false);
      }
    } catch (e: any) { toast.error(e.message || "Export failed"); }
    finally { setExporting(false); }
  };

  return (
    <div className="container max-w-4xl py-10">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to={`/course/${course.slug}`}><ArrowLeft className="h-4 w-4 mr-1" /> Back to course</Link>
      </Button>

      <div className="mb-6 rounded-3xl border border-border/70 bg-background/80 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold">Manage Course</h1>
              <p className="text-sm text-muted-foreground mt-1">Quick access to upload source, generate lessons, and clean duplicates.</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Button asChild variant="outline" size="sm" className="justify-start gap-2">
            <a href="#reupload-source"><Upload className="h-4 w-4" /> Upload source</a>
          </Button>
          <Button asChild variant="outline" size="sm" className="justify-start gap-2">
            <a href="#duplicate-cleanup"><SearchCheck className="h-4 w-4" /> Duplicate cleanup</a>
          </Button>
          <Button asChild variant="outline" size="sm" className="justify-start gap-2">
            <a href="#lesson-generation"><Sparkles className="h-4 w-4" /> Generate lessons</a>
          </Button>
          <Button variant="outline" size="sm" className="justify-start gap-2" onClick={() => setBulkOpen(true)}>
            <FileText className="h-4 w-4" /> Bulk lesson input
          </Button>
          <Button asChild variant="outline" size="sm" className="justify-start gap-2">
            <Link to={`/course/${course.slug}/settings`}><Edit3 className="h-4 w-4" /> Course settings</Link>
          </Button>
        </div>
      </div>

      {/* Generation progress */}
      {topics.length > 0 && (
        <div className="glass rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="font-display font-bold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> AI Generation Progress
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {ready} of {topics.length} lessons ready · {pending} pending
              </div>
            </div>
            {pending > 0 && (
              <Button onClick={generateAllRemaining} variant="hero" size="sm" disabled={batchRunning}>
                {batchRunning ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating…</> : <><Zap className="h-4 w-4 mr-1" /> Generate all remaining</>}
              </Button>
            )}
          </div>
          <Progress value={pct} className="h-2" />
        </div>
      )}

      {topics.length > 0 && (
        <div id="duplicate-cleanup" className="glass rounded-2xl p-5 mb-6 border border-primary/20">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <div>
              <div className="font-display font-bold flex items-center gap-2">
                <SearchCheck className="h-4 w-4 text-primary" /> Duplicate concept cleanup
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Compare repeated explanations across units and select which blocks to keep or delete.
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium">Compare units:</span>
                <Button variant={selectedDuplicateUnits.length === units.length ? "secondary" : "outline"} size="sm" onClick={selectAllDuplicateUnits} disabled={!units.length}>
                  All
                </Button>
                {units.map((unit) => (
                  <Button
                    key={unit}
                    variant={selectedDuplicateUnits.includes(unit) ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => toggleDuplicateUnit(unit)}
                  >
                    {unit}
                  </Button>
                ))}
              </div>
              <Button onClick={scanDuplicateConcepts} variant="hero" size="sm" disabled={duplicateScanning}>
                {duplicateScanning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                Scan selected units
              </Button>
            </div>
          </div>

          {duplicateGroups.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs text-muted-foreground">{duplicateGroups.length} repeated concept group{duplicateGroups.length === 1 ? "" : "s"} marked</div>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={!!duplicateDeleting}
                  onClick={() => {
                    if (confirm("Delete all AI-marked duplicate blocks? Kept blocks will remain.")) {
                      deleteDuplicateBlocks(duplicateGroups.flatMap(group => group.items), "all");
                    }
                  }}
                >
                  {duplicateDeleting === "all" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                  Accept all deletions
                </Button>
              </div>

              {duplicateGroups.map(group => (
                <div key={group.id} className="rounded-xl border border-border/60 bg-background/40 p-3">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="font-medium text-sm">{group.concept}</div>
                      {group.reason && <div className="text-xs text-muted-foreground mt-0.5">{group.reason}</div>}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!!duplicateDeleting}
                      onClick={() => deleteDuplicateBlocks(group.items, group.id)}
                      title="Accept this group and delete marked repeats"
                    >
                      {duplicateDeleting === group.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {group.items.map(item => {
                      const lesson = topics.find(t => t.id === item.topicId);
                      const block = lesson && Array.isArray((lesson as any).content) ? (lesson as any).content[item.blockIndex] : null;
                      return (
                        <div key={`${item.topicId}-${item.blockIndex}`} className={`rounded-lg border p-2 ${item.role === "delete" ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-mono">
                              {lesson ? `${lesson.unit}.${lesson.order_index} ${lesson.title}` : "Missing lesson"} · block {item.blockIndex + 1}
                            </div>
                            <span className={`text-[10px] uppercase tracking-wide ${item.role === "delete" ? "text-destructive" : "text-primary"}`}>
                              {item.role === "delete" ? "Delete" : "Keep"}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">{blockPreview(block) || item.note || "No preview available"}</div>
                          {item.note && <div className="text-[10px] text-muted-foreground mt-1">{item.note}</div>}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <ToolButton
                              label={item.role === "keep" ? "Kept" : "Keep this block"}
                              variant={item.role === "keep" ? "secondary" : "outline"}
                              size="icon"
                              onClick={() => toggleDuplicateItemRole(group.id, item.topicId, item.blockIndex, "keep")}
                              disabled={!!duplicateDeleting}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </ToolButton>
                            <ToolButton
                              label={item.role === "delete" ? "Marked for delete" : "Mark this block for deletion"}
                              variant={item.role === "delete" ? "destructive" : "outline"}
                              size="icon"
                              onClick={() => toggleDuplicateItemRole(group.id, item.topicId, item.blockIndex, "delete")}
                              disabled={!!duplicateDeleting}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </ToolButton>
                            {item.role === "delete" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-destructive"
                                disabled={!!duplicateDeleting}
                                onClick={() => deleteDuplicateBlocks([item], `${item.topicId}:${item.blockIndex}`)}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete now
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="glass rounded-2xl p-6 space-y-4 mb-8">
        <div className="grid sm:grid-cols-[1fr_120px] gap-3">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Emoji</Label>
            <Input value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={2} className="text-center text-xl" />
          </div>
        </div>
        <div>
          <Label>Description</Label>
          <Textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div>
          <Label className="flex items-center gap-1"><Tag className="h-3 w-3" /> Tags</Label>
          <div className="flex flex-wrap gap-1.5 mt-2 mb-2 min-h-[28px]">
            {tags.length === 0 && <span className="text-xs text-muted-foreground">No tags yet. Add some below.</span>}
            {tags.map(t => (
              <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs border border-primary/30">
                #{t}
                <button onClick={() => removeTag(t)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
              placeholder="Add a tag and press Enter (e.g. networking, beginner, ignou)"
            />
            <Button type="button" variant="neon" onClick={addTag}><Plus className="h-4 w-4" /></Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Click Save course to persist tag changes.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={saveCourse} variant="hero"><Save className="h-4 w-4 mr-1" /> Save course</Button>
          <Drawer open={exportDrawerOpen} onOpenChange={setExportDrawerOpen}>
            <DrawerTrigger asChild>
              <Button variant="neon" aria-label="Download course" title="Download course">
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <div className="mx-auto w-full max-w-md p-4">
                <DrawerHeader className="px-0 text-left">
                  <DrawerTitle>Download course</DrawerTitle>
                  <DrawerDescription>
                    Export all lesson content, quizzes, and tagged PYQs.
                  </DrawerDescription>
                </DrawerHeader>
                <div className="grid gap-3 pb-3">
                  <div className="grid gap-3 rounded-md border border-border/70 p-3">
                    <Label className="text-xs font-semibold">Include content</Label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={exportOptions.includeImages} onCheckedChange={(checked) => setExportOption("includeImages", Boolean(checked))} />
                      Images
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={exportOptions.includeGraphs} onCheckedChange={(checked) => setExportOption("includeGraphs", Boolean(checked))} />
                      Graphs and charts
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={exportOptions.includeCode} onCheckedChange={(checked) => setExportOption("includeCode", Boolean(checked))} />
                      Code blocks
                    </label>
                  </div>
                  <Button onClick={() => exportCourse("docs")} variant="hero" disabled={exporting} className="justify-start gap-2">
                    {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    Download as Google Docs
                  </Button>
                  <Button onClick={() => exportCourse("pdf")} variant="outline" disabled={exporting} className="justify-start gap-2">
                    {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />}
                    Download as PDF
                  </Button>
                </div>
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </div>

      {/* Re-upload source */}
      <div id="reupload-source" className="glass rounded-2xl p-6 mb-8 border border-primary/20">
        <div className="flex items-center gap-2 mb-1">
          <RefreshCw className="h-5 w-5 text-primary" />
          <div className="font-display font-bold text-lg">Re-upload source</div>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Replace this course's source material. Useful when the original Google Docs upload failed or the document changed. The function retries the fetch up to 3 times.
        </p>

        <Label className="text-xs flex items-center gap-1"><FileText className="h-3 w-3" /> Google Docs URL (shared as "Anyone with the link")</Label>
        <Input value={reDocsUrl} onChange={e => setReDocsUrl(e.target.value)} placeholder="https://docs.google.com/document/d/..." className="mt-1" />

        <div className="my-3 text-center text-xs text-muted-foreground">— or —</div>

        <Label className="text-xs">Upload .txt / .md / .pdf / .docx</Label>
        <Input type="file" accept=".txt,.md,.pdf,.docx" onChange={e => e.target.files?.[0] && handleReFile(e.target.files[0])} className="mt-1" />

        <div className="my-3 text-center text-xs text-muted-foreground">— or —</div>

        <Label className="text-xs">Paste raw text</Label>
        <Textarea rows={5} value={reRawText} onChange={e => setReRawText(e.target.value)} placeholder="Paste new course material here…" className="mt-1 font-mono text-xs" />

        <label className="flex items-center gap-2 mt-4 text-sm cursor-pointer">
          <input type="checkbox" checked={resetLessons} onChange={e => setResetLessons(e.target.checked)} className="h-4 w-4 accent-primary" />
          Reset all lessons and re-run AI generation with the new source
        </label>

        <Button onClick={reuploadSource} variant="hero" disabled={reUploading || batchRunning} className="w-full mt-4">
          {reUploading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Re-uploading…</> : <><Upload className="h-4 w-4 mr-1" /> Re-upload source{resetLessons ? " & regenerate" : ""}</>}
        </Button>
      </div>

      {topics.length > 0 && (
        <div className="glass rounded-2xl p-5 mb-6 border border-primary/20">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="font-display font-bold flex items-center gap-2">
                <Languages className="h-4 w-4 text-primary" /> Course language generation
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {translatedCount} of {topics.length} lessons have {selectedLanguage.label} language · {missingTranslationCount} missing
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={translationLanguage} onValueChange={setTranslationLanguage}>
                <SelectTrigger className="w-[190px]">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  {LESSON_LANGUAGES.filter((language) => language.code !== "en").map((language) => (
                    <SelectItem key={language.code} value={language.code}>
                      {language.label} - {language.nativeLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={translateMissingLessons}
                disabled={!missingTranslationCount || translatingCourse || batchRunning || bulkBusy}
              >
                {translatingCourse ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Languages className="h-4 w-4 mr-1" />}
                Generate missing
              </Button>
              <Button
                variant="hero"
                size="sm"
                onClick={translateSelectedLessons}
                disabled={!selectedTopics.length || translatingCourse || batchRunning || bulkBusy}
              >
                {translatingCourse ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                Generate selected
              </Button>
            </div>
          </div>
          <div className="mt-3">
            <Label className="text-xs">Optional language instruction</Label>
            <Textarea
              rows={2}
              value={translationPrompt}
              onChange={(e) => setTranslationPrompt(e.target.value)}
              placeholder="Example: keep key technical terms in English with translated explanations"
              className="mt-1 text-xs"
            />
          </div>
        </div>
      )}

      <div id="lesson-generation" className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">Lessons ({topics.length})</h2>
          <div className="text-xs text-muted-foreground mt-1">
            {selectedIds.length ? `${selectedIds.length} selected` : "Use the grip handle to reorder lessons"}
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/50 p-1.5">
          <ToolButton label={allSelected ? "Clear selection" : "Select all lessons"} onClick={toggleSelectAll} variant="ghost" size="icon">
            {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          </ToolButton>
          <ToolButton label="Bulk lesson input" onClick={() => setBulkOpen(true)} variant="ghost" size="icon">
            <Layers3 className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Reserialize lessons" onClick={handleSerializeLessons} variant="ghost" size="icon" disabled={bulkBusy}>
            {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </ToolButton>
          <ToolButton label="Add empty lesson" onClick={() => addTopic({ aiGenerate: false })} variant="ghost" size="icon">
            <Plus className="h-4 w-4" />
          </ToolButton>
          <div className="mx-1 h-6 w-px bg-border" />
          <ToolButton label={selectedIds.length ? `Generate selected (${selectedIds.length})` : "Select lessons to generate"} onClick={generateSelected} variant="neon" size="icon" disabled={!selectedIds.length || batchRunning || bulkBusy}>
            {batchRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          </ToolButton>
          <ToolButton label={selectedIds.length ? `Delete selected (${selectedIds.length})` : "Select lessons to delete"} onClick={deleteSelected} variant="destructive" size="icon" disabled={!selectedIds.length || batchRunning || bulkBusy}>
            <Trash2 className="h-4 w-4" />
          </ToolButton>
        </div>
      </div>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bulk lesson input</DialogTitle>
            <DialogDescription>
              Paste one lesson per line. Use unit headings like "Unit 2: Networks"; add summaries with "::" or "--".
            </DialogDescription>
          </DialogHeader>
          <Tabs value={bulkMode} onValueChange={(value) => setBulkMode(value as "outline" | "json")}>
            <TabsList>
              <TabsTrigger value="outline">Outline</TabsTrigger>
              <TabsTrigger value="json">JSON</TabsTrigger>
            </TabsList>
            <TabsContent value="outline" className="mt-3">
              <Textarea
                rows={12}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                className="font-mono text-xs"
                placeholder={"Unit 1: Fundamentals\n1. Introduction :: Overview and outcomes\n2. Core concepts\n\nUnit 2: Practice\n- Worked examples -- Step-by-step cases"}
              />
            </TabsContent>
            <TabsContent value="json" className="mt-3">
              <Textarea
                rows={12}
                value={bulkJson}
                onChange={(e) => setBulkJson(e.target.value)}
                className="font-mono text-xs"
                placeholder='{"units":[{"unit":1,"lessons":[{"title":"Introduction","summary":"Overview"}]},{"unit":2,"lessons":["Practice cases"]}]}'
              />
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkOpen(false)} disabled={bulkBusy}>Cancel</Button>
            <Button variant="hero" onClick={createBulkLessons} disabled={bulkBusy}>
              {bulkBusy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : bulkMode === "json" ? <FileJson className="h-4 w-4 mr-1" /> : <Layers3 className="h-4 w-4 mr-1" />}
              Add lessons
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs font-mono text-muted-foreground uppercase">
            <tr>
              <th className="p-3 w-10"></th>
              <th className="text-left p-3 w-10">
                <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Select all lessons" />
              </th>
              <th className="text-left p-3">Unit</th>
              <th className="text-left p-3">Title</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Language</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {sortedTopics.map(t => {
              const status = (t as any).generation_status || "ready";
              const isReady = status === "ready";
              const isGen = generating === t.id;
              const blockCount = Array.isArray((t as any).content) ? (t as any).content.length : 0;
              const translated = hasTranslation(t);
              return (
                <tr
                  key={t.id}
                  onDragOver={(event) => handleLessonDragOver(event, t.id)}
                  onDrop={(event) => handleLessonDrop(event, t.id)}
                  onDragLeave={() => setDragOverTopicId((id) => id === t.id ? null : id)}
                  className={`border-t border-border/50 transition ${draggingTopicId === t.id ? "opacity-45" : dragOverTopicId === t.id ? "bg-primary/10 ring-1 ring-inset ring-primary/30" : "hover:bg-muted/20"}`}
                >
                  <td className="p-3 pr-0 align-middle">
                    <button
                      type="button"
                      draggable={!bulkBusy}
                      onDragStart={(event) => handleLessonDragStart(event, t.id)}
                      onDragEnd={() => {
                        setDraggingTopicId(null);
                        setDragOverTopicId(null);
                      }}
                      className="inline-flex h-8 w-8 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-primary active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
                      title="Drag to reorder"
                      aria-label={`Drag ${t.title} to reorder`}
                      disabled={bulkBusy}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                  </td>
                  <td className="p-3">
                    <Checkbox checked={selectedIds.includes(t.id)} onCheckedChange={() => toggleSelection(t.id)} aria-label={`Select ${t.title}`} />
                  </td>
                  <td className="p-3 font-mono">{t.unit}.{t.order_index}</td>
                  <td className="p-3">
                    {t.title}
                    <div className="text-[10px] text-muted-foreground">{blockCount} blocks</div>
                  </td>
                  <td className="p-3">
                    {isReady ? (
                      <span className="inline-flex items-center gap-1 text-xs text-primary"><CheckCircle2 className="h-3 w-3" /> Ready</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">⏳ Pending</span>
                    )}
                  </td>
                  <td className="p-3">
                    {translated ? (
                      <span className="inline-flex items-center gap-1 text-xs text-primary"><CheckCircle2 className="h-3 w-3" /> {selectedLanguage.label}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">Missing</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 p-1">
                      <ToolButton label={isReady ? "Regenerate lesson with AI" : "Generate lesson with AI"} variant="ghost" size="icon" disabled={isGen || batchRunning} onClick={() => generateOne(t.id)}>
                        {isGen ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      </ToolButton>
                      <ToolButton label="Edit unit, index, title, and summary" variant="ghost" size="icon" onClick={() => editTopicMeta(t)}>
                        <SearchCheck className="h-4 w-4" />
                      </ToolButton>
                      <ToolButton label="Edit lesson" asChild variant="ghost" size="icon">
                        <Link to={`/course/${course.slug}/topic/${t.slug}/edit`}><Edit3 className="h-4 w-4" /></Link>
                      </ToolButton>
                      <ToolButton label="Delete lesson" variant="ghost" size="icon" onClick={() => deleteTopic(t.id, t.title)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </ToolButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
