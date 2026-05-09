import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY") || Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || `course-${Date.now()}`;
}

function extractDocId(url: string): string | null {
  const m = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

const SUPPORTED_BLOCK_TYPES = new Set(["text", "list", "highlight", "table", "code", "flowchart", "chart", "image", "math", "timeline"]);

function chunkText(text: string, size = 20000) {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === undefined || entry === null) return false;
      if (typeof entry === "string") return entry.trim().length > 0;
      if (Array.isArray(entry)) return entry.length > 0;
      return true;
    }),
  ) as T;
}

function normalizeMermaidFlowchart(value: unknown): string {
  const code = cleanString(value);
  if (!code) return "";
  const mermaidCode = /^(graph|flowchart)\s+(TD|TB|BT|LR|RL)\b/i.test(code) ? code : /^[A-Za-z0-9_ -]+(-->|---|==>|-.->)/.test(code) ? `graph TD\n  ${code}` : "";
  if (!mermaidCode) return "";
  return mermaidCode.replace(/\b([A-Za-z][\w-]*)\s*([\[{])([^"{}\[\]\n]+)([\]}])/g, (_match, id, open, label, close) => {
    const safeLabel = String(label).replace(/\s+/g, " ").trim().replace(/"/g, "'");
    return `${id}${open}"${safeLabel}"${close}`;
  });
}

function normalizeLessonBlock(block: any) {
  if (!block || typeof block !== "object" || !SUPPORTED_BLOCK_TYPES.has(block.type)) return null;

  const title = cleanString(block.title);

  if (block.type === "text") {
    const value = cleanString(block.value ?? block.text);
    return value ? compact({ type: "text", title, value }) : null;
  }

  if (block.type === "highlight") {
    const value = cleanString(block.value);
    return value ? { type: "highlight", value } : null;
  }

  if (block.type === "list") {
    const items = Array.isArray(block.items) ? block.items.map(cleanString).filter(Boolean) : [];
    return items.length ? compact({ type: "list", title, items }) : null;
  }

  if (block.type === "table") {
    const headers = Array.isArray(block.headers) ? block.headers.map(cleanString).filter(Boolean) : [];
    const rows = Array.isArray(block.rows)
      ? block.rows.filter(Array.isArray).map((row: unknown[]) => row.map(cleanString)).filter((row: string[]) => row.some(Boolean))
      : [];
    return headers.length && rows.length ? compact({ type: "table", title, headers, rows }) : null;
  }

  if (block.type === "code") {
    const value = cleanString(block.value ?? block.code);
    const language = cleanString(block.language || "plaintext");
    return value ? compact({ type: "code", title, language, value }) : null;
  }

  if (block.type === "flowchart") {
    const code = normalizeMermaidFlowchart(block.code || block.value);
    return code ? compact({ type: "flowchart", title, code }) : null;
  }

  if (block.type === "chart") {
    const variant = ["bar", "line", "pie"].includes(block.variant) ? block.variant : "bar";
    const data = Array.isArray(block.data)
      ? block.data.map((item: any) => ({ name: cleanString(item?.name), value: Number(item?.value) })).filter((item: any) => item.name && Number.isFinite(item.value))
      : [];
    return data.length ? compact({ type: "chart", title, variant, data }) : null;
  }

  if (block.type === "math") {
    const value = cleanString(block.value);
    return value ? compact({ type: "math", title, value, display: block.display !== false }) : null;
  }

  if (block.type === "timeline") {
    const rawItems = Array.isArray(block.items) ? block.items : Array.isArray(block.timeline_items) ? block.timeline_items : [];
    const items = rawItems.map((item: any) => ({ label: cleanString(item?.label), desc: cleanString(item?.desc) })).filter((item: any) => item.label && item.desc);
    return items.length ? compact({ type: "timeline", title, items }) : null;
  }

  return null;
}

function normalizeLessonContent(content: unknown) {
  if (!Array.isArray(content)) throw new Error("AI lesson content must be a JSON array");
  const blocks = content.map(normalizeLessonBlock).filter(Boolean);
  if (blocks.length < 6) throw new Error(`AI lesson content must contain at least 6 valid blocks; received ${blocks.length}`);
  return blocks.slice(0, 12);
}

function normalizeQuiz(quiz: unknown) {
  if (!Array.isArray(quiz)) return [];
  return quiz.map((item: any) => {
    const q = cleanString(item?.q ?? item?.question);
    const options = Array.isArray(item?.options) ? item.options.map(cleanString).filter(Boolean).slice(0, 4) : [];
    const answer = Number(item?.answer);
    return q && options.length === 4 && Number.isInteger(answer) && answer >= 0 && answer < 4
      ? { q, options, answer }
      : null;
  }).filter(Boolean).slice(0, 4);
}

function focusSource(sourceText: string, title: string, summary: string) {
  if (sourceText.length <= 10000) return sourceText;
  const words = `${title} ${summary}`.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  const lower = sourceText.toLowerCase();
  let bestIdx = -1;
  for (const word of words) {
    const idx = lower.indexOf(word);
    if (idx !== -1) {
      bestIdx = idx;
      break;
    }
  }
  if (bestIdx === -1) return sourceText.slice(0, 10000);
  return sourceText.slice(Math.max(0, bestIdx - 1800), Math.max(0, bestIdx - 1800) + 10000);
}

async function generateLesson(topic: any, courseTitle: string, courseOutline: string, sourceText: string) {
  const focused = focusSource(sourceText, topic.title, topic.summary || "");
  const result = await callTool(
    "write_lesson",
    `You generate concise lesson content. Return strict JSON-compatible blocks and quiz.
Use 6-10 compact blocks. Prefer text/list/highlight/table/flowchart. Do not create image blocks.
Supported block types: text, list, highlight, table, code, flowchart, chart, math, timeline.`,
    `Course: ${courseTitle}
Lesson: ${topic.unit}.${topic.order_index} ${topic.title}
Summary: ${topic.summary || ""}

Course outline:
${courseOutline}

Relevant source excerpt:
${focused}

Generate a complete but concise lesson and exactly 4 multiple-choice quiz questions.
Avoid repeating other lesson summaries. Keep token use low.`,
    {
      type: "object",
      properties: {
        content: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["text", "list", "highlight", "table", "code", "flowchart", "chart", "math", "timeline"] },
              title: { type: "string" },
              value: { type: "string" },
              items: { type: "array", items: { type: "string" } },
              timeline_items: {
                type: "array",
                items: { type: "object", properties: { label: { type: "string" }, desc: { type: "string" } } },
              },
              headers: { type: "array", items: { type: "string" } },
              rows: { type: "array", items: { type: "array", items: { type: "string" } } },
              code: { type: "string" },
              variant: { type: "string", enum: ["bar", "line", "pie"] },
              data: {
                type: "array",
                items: { type: "object", properties: { name: { type: "string" }, value: { type: "number" } } },
              },
              language: { type: "string" },
              display: { type: "boolean" },
            },
            required: ["type"],
          },
        },
        quiz: {
          type: "array",
          items: {
            type: "object",
            properties: {
              q: { type: "string" },
              options: { type: "array", items: { type: "string" } },
              answer: { type: "integer" },
            },
            required: ["q", "options", "answer"],
          },
        },
      },
      required: ["content", "quiz"],
    },
  );

  return {
    content: normalizeLessonContent(result.content || []),
    quiz: normalizeQuiz(result.quiz || []),
  };
}

async function callTool(name: string, system: string, user: string, parameters: any) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: `${system}\nAlways call the ${name} tool. Do not write prose outside the tool.` },
        { role: "user", content: user },
      ],
      tools: [{ type: "function", function: { name, parameters } }],
      tool_choice: { type: "function", function: { name } },
    }),
  });
  if (r.status === 429) throw new Error("Rate limit - try again shortly.");
  if (r.status === 402) throw new Error("AI credits exhausted.");
  if (!r.ok) throw new Error(`AI error ${r.status}: ${await r.text()}`);

  const j = await r.json();
  const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI did not return structured output");
  return JSON.parse(args);
}

function normalizeOutline(result: any) {
  const units = Array.isArray(result?.units) ? result.units : [];
  return {
    description: String(result?.description || "").replace(/\s+/g, " ").trim().slice(0, 1000),
    units: units.map((unit: any, index: number) => ({
      unit: Math.max(1, Math.min(20, Number(unit.unit) || index + 1)),
      title: String(unit.title || `Unit ${index + 1}`).trim(),
      summary: String(unit.summary || "").trim(),
      lessons: Array.isArray(unit.lessons)
        ? unit.lessons.map((lesson: any) => ({
          title: String(lesson.title || "").trim(),
          summary: String(lesson.summary || "").trim(),
        })).filter((lesson: any) => lesson.title)
        : [],
    })).filter((unit: any) => unit.title),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) throw new Error("Unauthorized");

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Admin only");

    const { title, emoji, docsUrl, rawText } = await req.json();
    if (!title) throw new Error("title required");

    let source = (rawText || "").trim();
    if (!source && docsUrl) {
      const docId = extractDocId(docsUrl);
      if (!docId) throw new Error("Invalid Google Docs URL");
      const docRes = await fetch(`https://docs.google.com/document/d/${docId}/export?format=txt`);
      if (!docRes.ok) throw new Error("Cannot fetch Google Doc - share as 'Anyone with the link'.");
      source = await docRes.text();
    }
    if (!source) throw new Error("Provide source text or Google Docs URL");

    const fullSource = source.replace(/\s+/g, " ").trim();
    const chunks = chunkText(fullSource);
    const summaries: string[] = [];

    if (chunks.length === 1) {
      summaries.push(`Full source: ${chunks[0].slice(0, 18000)}`);
    } else {
      for (let i = 0; i < chunks.length; i++) {
        const scan = await callTool(
          "scan_chunk",
          "You scan course source material. Return a concise but complete coverage summary for this chunk.",
          `Course title: ${title}
Chunk ${i + 1} of ${chunks.length}

${chunks[i]}`,
          {
            type: "object",
            properties: {
              summary: { type: "string" },
              topics: { type: "array", items: { type: "string" } },
            },
            required: ["summary", "topics"],
          },
        );
        summaries.push(`Chunk ${i + 1}: ${scan.summary || ""}\nTopics: ${Array.isArray(scan.topics) ? scan.topics.join("; ") : ""}`);
      }
    }

    const outline = normalizeOutline(await callTool(
      "create_course_map",
      "You are a curriculum designer. Build a complete course map from whole-document scan summaries. Cover all major topics without repetition.",
      `Course title: ${title}

Whole-document scan:
${summaries.join("\n\n")}

Create:
- 1 concise course description.
- 2-6 broad units when possible.
- For every unit, create one overview lesson that will be numbered x.0.
- For every unit, create 1-6 sub-lessons that will be numbered x.1, x.2, etc.
- Lesson titles must be specific and collectively cover the source.`,
      {
        type: "object",
        properties: {
          description: { type: "string" },
          units: {
            type: "array",
            items: {
              type: "object",
              properties: {
                unit: { type: "integer", minimum: 1 },
                title: { type: "string" },
                summary: { type: "string" },
                lessons: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      summary: { type: "string" },
                    },
                    required: ["title", "summary"],
                  },
                },
              },
              required: ["unit", "title", "summary", "lessons"],
            },
          },
        },
        required: ["description", "units"],
      },
    ));

    if (!outline.units.length) throw new Error("AI did not produce a course map");

    let baseSlug = slugify(title);
    let slug = baseSlug;
    let n = 1;
    while ((await admin.from("courses").select("id").eq("slug", slug).maybeSingle()).data) {
      slug = `${baseSlug}-${++n}`;
    }

    const { data: course, error: cErr } = await admin.from("courses").insert({
      slug,
      title,
      description: outline.description || title,
      cover_emoji: emoji || "📘",
      order_index: Date.now() % 1000,
      source_text: fullSource.slice(0, 200000),
      generation_status: "generating",
      toc: outline.units,
    }).select().single();
    if (cErr) throw cErr;

    const rows: any[] = [];
    for (const unit of outline.units) {
      rows.push({
        course_id: course.id,
        slug: `${slug}-${slugify(unit.title)}-0`,
        unit: unit.unit,
        order_index: 0,
        title: unit.title,
        summary: unit.summary,
        content: [],
        quiz: [],
        generation_status: "pending",
      });

      unit.lessons.forEach((lesson: any, index: number) => {
        rows.push({
          course_id: course.id,
          slug: `${slug}-${slugify(lesson.title)}-${index + 1}`,
          unit: unit.unit,
          order_index: index + 1,
          title: lesson.title,
          summary: lesson.summary,
          content: [],
          quiz: [],
          generation_status: "pending",
        });
      });
    }

    const { data: createdTopics, error: tErr } = await admin.from("topics").insert(rows).select("*");
    if (tErr) throw tErr;

    const courseOutline = rows.map((row) => `- ${row.unit}.${row.order_index} ${row.title}: ${row.summary || ""}`).join("\n");
    let generatedCount = 0;
    let failedLesson: { title: string; error: string } | null = null;

    for (const topic of createdTopics || []) {
      try {
        const lesson = await generateLesson(topic, title, courseOutline, fullSource);
        await admin.from("topics").update({
          content: lesson.content,
          quiz: lesson.quiz,
          generation_status: "ready",
        }).eq("id", topic.id);
        generatedCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Lesson generation failed";
        failedLesson = { title: topic.title, error: message };
        await admin.from("topics").update({ generation_status: "failed" }).eq("id", topic.id);
        break;
      }
    }

    const finalStatus = failedLesson ? "partial" : "ready";
    await admin.from("courses").update({ generation_status: finalStatus }).eq("id", course.id);

    return new Response(JSON.stringify({
      slug,
      courseId: course.id,
      topicCount: rows.length,
      generatedCount,
      failedLesson,
      scannedChunks: chunks.length,
      coverage: 100,
      partial: !!failedLesson,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
