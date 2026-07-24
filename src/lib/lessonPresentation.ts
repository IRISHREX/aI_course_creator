export type PresentationLayout =
  | "title"
  | "bullets"
  | "process"
  | "comparison"
  | "timeline"
  | "code"
  | "visual";

export type PresentationSlide = {
  id: string;
  topicId: string;
  topicSlug?: string;
  eyebrow: string;
  title: string;
  layout: PresentationLayout;
  bullets: string[];
  steps?: string[];
  headers?: string[];
  rows?: string[][];
  code?: string;
  language?: string;
  imageUrl?: string;
  caption?: string;
  sourceBlock?: Record<string, unknown>;
  diagramCode?: string;
  mindmap?: unknown;
  narration: string;
};

export function hasPresentation(value: unknown): value is { slides: PresentationSlide[] } {
  if (!value || typeof value !== "object") return false;
  const slides = (value as { slides?: unknown }).slides;
  return Array.isArray(slides) && slides.length > 0;
}

type LessonInput = {
  id: string;
  slug?: string;
  title: string;
  summary?: string;
  unit?: number;
  order_index?: number;
  content?: unknown[];
};

const clean = (value: unknown) => String(value ?? "")
  .replace(/\*\*\*|\*\*|`|\$\$/g, "")
  .replace(/\s+/g, " ")
  .trim();

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const sentences = (value: unknown) => clean(value)
  .split(/(?<=[.!?])\s+/)
  .map((sentence) => sentence.replace(/[.!?]+$/, "").trim())
  .filter((sentence) => sentence.length > 2);

const concise = (value: unknown, limit = 150) => {
  const text = clean(value);
  return text.length <= limit ? text : `${text.slice(0, limit).replace(/\s+\S*$/, "")}...`;
};

const titleFromText = (text: string, fallback: string) => {
  const colonTitle = text.match(/^([^:]{3,64}):\s+/)?.[1];
  if (colonTitle) return colonTitle;
  const first = sentences(text)[0] || fallback;
  const subject = first.match(/^(.{3,48}?)\s+(?:is|are|refers to|means|allows|uses|helps|provides)\b/i)?.[1];
  if (subject) return `Understanding ${subject.replace(/^(the|a|an)\s+/i, "")}`;
  const words = first.split(/\s+/).slice(0, 8).join(" ");
  return words.length > 72 ? fallback : words;
};

const narrationFor = (title: string, items: string[], prefix = "") =>
  [prefix, title, ...items].filter(Boolean).join(". ");

function textSlides(lesson: LessonInput, value: unknown, index: number): PresentationSlide[] {
  const parts = sentences(value);
  if (!parts.length) return [];
  const title = titleFromText(clean(value), `Concept ${index + 1}`);
  const content = parts[0].toLowerCase().startsWith(title.toLowerCase()) ? parts.slice(1) : parts;
  const chunks: string[][] = [];
  for (let offset = 0; offset < content.length; offset += 4) chunks.push(content.slice(offset, offset + 4));
  if (!chunks.length) chunks.push([concise(value)]);
  return chunks.map((bullets, chunkIndex) => ({
    id: `${lesson.id}-text-${index}-${chunkIndex}`,
    topicId: lesson.id,
    topicSlug: lesson.slug,
    eyebrow: `Unit ${lesson.unit ?? 1} / Concept`,
    title: chunkIndex ? `${title} continued` : title,
    layout: "bullets",
    bullets: bullets.map((item) => concise(item)),
    narration: narrationFor(title, bullets),
  }));
}

export function generateLessonSlides(lesson: LessonInput): PresentationSlide[] {
  const label = `Unit ${lesson.unit ?? 1} / Lesson ${(lesson.order_index ?? 0) + 1}`;
  const overview = sentences(lesson.summary).slice(0, 3);
  const slides: PresentationSlide[] = [{
    id: `${lesson.id}-opening`,
    topicId: lesson.id,
    topicSlug: lesson.slug,
    eyebrow: label,
    title: lesson.title,
    layout: "title",
    bullets: overview.length ? overview : ["Explore the key ideas, relationships, and practical takeaways."],
    narration: narrationFor(lesson.title, overview.length ? overview : ["Let us explore this lesson."]),
  }];

  (lesson.content || []).forEach((rawBlock, index) => {
    const block = asRecord(rawBlock);
    const title = concise(block.title || block.caption || `Key concept ${index + 1}`, 70);
    if (block.type === "text") {
      slides.push(...textSlides(lesson, block.value, index));
      return;
    }
    if (block.type === "highlight") {
      const bullets = sentences(block.value).slice(0, 4);
      slides.push({
        id: `${lesson.id}-highlight-${index}`, topicId: lesson.id, topicSlug: lesson.slug,
        eyebrow: `${label} / Key idea`, title: title === `Key concept ${index + 1}` ? "Remember this" : title,
        layout: "visual", bullets, narration: narrationFor(title, bullets, "Key point"),
      });
      return;
    }
    if (block.type === "list") {
      const items = (Array.isArray(block.items) ? block.items : []).map((item: unknown) => concise(item)).filter(Boolean);
      for (let offset = 0; offset < items.length; offset += 6) {
        const bullets = items.slice(offset, offset + 6);
        slides.push({
          id: `${lesson.id}-list-${index}-${offset}`, topicId: lesson.id, topicSlug: lesson.slug,
          eyebrow: label, title: offset ? `${title} continued` : title, layout: "bullets", bullets,
          narration: narrationFor(title, bullets),
        });
      }
      return;
    }
    if (block.type === "flowchart") {
      const rawSteps = Array.isArray(block.steps) ? block.steps : Array.isArray(block.items) ? block.items : [];
      const steps = rawSteps.map((item) => {
        const record = asRecord(item);
        return concise(record.label || record.title || record.desc || item);
      }).filter(Boolean);
      const diagramLabels = String(block.code || "").match(/[{[(]"?([^()[\]{}"]{2,80})"?[\]})]/g)
        ?.map((label) => clean(label.slice(1, -1))).filter(Boolean) || [];
      const narratedSteps = steps.length ? steps : diagramLabels;
      slides.push({
        id: `${lesson.id}-flow-${index}`, topicId: lesson.id, topicSlug: lesson.slug,
        eyebrow: `${label} / Process`, title, layout: "process", bullets: narratedSteps.length ? [] : ["Follow the relationships shown in the diagram."],
        steps: narratedSteps, sourceBlock: block,
        narration: narrationFor(title, narratedSteps, "Follow this process"),
      });
      return;
    }
    if (block.type === "timeline") {
      const items = Array.isArray(block.items) ? block.items : [];
      const steps = items.map((item) => {
        const record = asRecord(item);
        return concise(`${clean(record.label)}: ${clean(record.desc)}`);
      }).filter(Boolean);
      slides.push({
        id: `${lesson.id}-timeline-${index}`, topicId: lesson.id, topicSlug: lesson.slug,
        eyebrow: `${label} / Timeline`, title, layout: "timeline", bullets: [], steps,
        narration: narrationFor(title, steps),
      });
      return;
    }
    if (block.type === "table") {
      const headers = (block.headers || []).map((header: unknown) => concise(header));
      const rows = (block.rows || []).slice(0, 6).map((row: unknown[]) => row.map((cell) => concise(cell, 80)));
      slides.push({
        id: `${lesson.id}-table-${index}`, topicId: lesson.id, topicSlug: lesson.slug,
        eyebrow: `${label} / Comparison`, title, layout: "comparison", bullets: [], headers, rows,
        narration: narrationFor(title, rows.flat()),
      });
      return;
    }
    if (block.type === "code") {
      const bullets = sentences(block.caption).slice(0, 3);
      slides.push({
        id: `${lesson.id}-code-${index}`, topicId: lesson.id, topicSlug: lesson.slug,
        eyebrow: `${label} / Example`, title, layout: "code", bullets,
        code: String(block.value || block.code || ""), language: clean(block.language || "code"),
        narration: narrationFor(title, bullets.length ? bullets : ["Review this example and notice how each part supports the concept."]),
      });
      return;
    }
    if (block.type === "image" || block.type === "chart" || block.type === "math") {
      const bullets = sentences(block.caption || block.value || block.title).slice(0, 4);
      slides.push({
        id: `${lesson.id}-visual-${index}`, topicId: lesson.id, topicSlug: lesson.slug,
        eyebrow: `${label} / Visual`, title, layout: "visual", bullets,
        imageUrl: block.type === "image" ? block.url || block.src : undefined,
        caption: concise(block.caption), sourceBlock: block, narration: narrationFor(title, bullets),
      });
    }
  });

  return slides.filter((slide) => slide.bullets.length || slide.steps?.length || slide.rows?.length || slide.code || slide.imageUrl);
}

export function generateCourseDeck(course: { id: string; title: string; description?: string }, lessons: LessonInput[]) {
  const introBullets = sentences(course.description).slice(0, 3);
  const intro: PresentationSlide = {
    id: `course-${course.id}`,
    topicId: "",
    eyebrow: "Course presentation",
    title: course.title,
    layout: "title",
    bullets: introBullets.length ? introBullets : [`${lessons.length} lessons prepared for guided learning.`],
    narration: narrationFor(course.title, introBullets),
  };
  return [intro, ...lessons.flatMap(generateLessonSlides)];
}
