import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SUPPORTED_BLOCK_TYPES = new Set(["text", "list", "highlight", "table", "code", "flowchart", "chart", "image", "math", "timeline"]);

const LESSON_GENERATION_SYSTEM_PROMPT = `You are a structured content generator for an AI learning platform.

Your task is to generate educational lesson content as strict JSON-compatible content blocks.

RULES:
1. The lesson content MUST be a valid JSON array inside the "content" tool field.
2. Each object MUST follow the block schema.
3. Do NOT add explanations outside JSON/tool output.
4. Use only supported block types:
["text", "list", "highlight", "table", "code", "flowchart", "chart", "image", "math", "timeline"]
5. Keep content conceptual, example-driven, and problem-solving oriented.
6. Maintain logical flow:
Intro -> Concept -> Example -> Insight -> Advanced

BLOCK RULES:
- text -> must have "value"
- list -> must have "items" as an array of strings
- highlight -> must have short key insight in "value"
- table -> must have "headers" and "rows"
- code -> must have "value" and "language"
- flowchart -> must have Mermaid syntax in "code", starting with graph TD, graph LR, flowchart TD, etc. Quote labels with punctuation, for example B{"Connectivity (e.g., Wi-Fi)"}.
- timeline -> use "timeline_items" with objects shaped as {"label": "...", "desc": "..."}

STYLE RULES:
- Keep explanations clear and concise.
- Use real-world examples.
- Avoid redundancy.
- Avoid empty fields.
- Keep 8-15 blocks total.`;

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
      ? block.rows
        .filter(Array.isArray)
        .map((row: unknown[]) => row.map(cleanString))
        .filter((row: string[]) => row.some(Boolean))
      : [];
    return headers.length && rows.length ? compact({ type: "table", title, headers, rows }) : null;
  }

  if (block.type === "code") {
    const value = cleanString(block.value ?? block.code);
    const language = cleanString(block.language || "plaintext");
    const caption = cleanString(block.caption);
    return value ? compact({ type: "code", title, language, value, caption }) : null;
  }

  if (block.type === "flowchart") {
    const code = normalizeMermaidFlowchart(block.code || block.value);
    return code ? compact({ type: "flowchart", title, code }) : null;
  }

  if (block.type === "chart") {
    const variant = ["bar", "line", "pie"].includes(block.variant) ? block.variant : "bar";
    const data = Array.isArray(block.data)
      ? block.data
        .map((item: any) => ({ name: cleanString(item?.name), value: Number(item?.value) }))
        .filter((item: any) => item.name && Number.isFinite(item.value))
      : [];
    return data.length ? compact({ type: "chart", title, variant, data }) : null;
  }

  if (block.type === "image") {
    const url = cleanString(block.url);
    const caption = cleanString(block.caption || block.prompt);
    const prompt = cleanString(block.prompt || block.caption);
    return caption || prompt || url ? compact({ type: "image", title, url, caption, prompt }) : null;
  }

  if (block.type === "math") {
    const value = cleanString(block.value);
    const caption = cleanString(block.caption);
    return value ? compact({ type: "math", title, value, display: block.display !== false, caption }) : null;
  }

  if (block.type === "timeline") {
    const rawItems = Array.isArray(block.items) ? block.items : Array.isArray(block.timeline_items) ? block.timeline_items : [];
    const items = rawItems
      .map((item: any) => ({ label: cleanString(item?.label), desc: cleanString(item?.desc) }))
      .filter((item: any) => item.label && item.desc);
    return items.length ? compact({ type: "timeline", title, items }) : null;
  }

  return null;
}

function normalizeLessonContent(content: unknown) {
  if (!Array.isArray(content)) throw new Error("AI lesson content must be a JSON array");
  const blocks = content.map(normalizeLessonBlock).filter(Boolean);
  if (blocks.length < 8 || blocks.length > 15) {
    throw new Error(`AI lesson content must contain 8-15 valid blocks; received ${blocks.length}`);
  }
  return blocks;
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

    const { topicId, level, mode, customInstruction } = await req.json();
    if (!topicId) throw new Error("topicId required");

    const { data: topic } = await admin.from("topics").select("*, courses(title, source_text)").eq("id", topicId).maybeSingle();
    if (!topic) throw new Error("Topic not found");

    const sourceText: string = (topic as any).courses?.source_text || "";
    const courseTitle: string = (topic as any).courses?.title || "";
    const difficulty = Math.max(1, Math.min(10, level || topic.difficulty_level || 5));

    const { data: priorAll } = await admin.from("topics")
      .select("title, summary, order_index, unit, generation_status")
      .eq("course_id", topic.course_id)
      .order("unit").order("order_index");
    const prior = (priorAll || []).filter((t: any) => t.title !== topic.title);
    const priorOutline = prior.slice(0, 30).map((t: any) => `- ${t.unit}.${t.order_index} ${t.title}: ${t.summary}`).join("\n");

    let focused = sourceText;
    if (sourceText.length > 12000) {
      const words = (topic.title + " " + topic.summary).toLowerCase().split(/\W+/).filter((w) => w.length > 4);
      const lower = sourceText.toLowerCase();
      let bestIdx = -1;
      for (const w of words) {
        const i = lower.indexOf(w);
        if (i !== -1) {
          bestIdx = i;
          break;
        }
      }
      if (bestIdx !== -1) {
        const start = Math.max(0, bestIdx - 2000);
        focused = sourceText.slice(start, start + 12000);
      } else {
        focused = sourceText.slice(0, 12000);
      }
    }

    const levelGuide = difficulty <= 3 ? "very simple, beginner-friendly, short sentences, everyday analogies"
      : difficulty <= 6 ? "intermediate, clear, mix concepts and examples"
      : "advanced, technical depth, precise terminology";

    const continueExisting = mode === "continue" && Array.isArray(topic.content) && topic.content.length > 0;
    const existingPreview = continueExisting
      ? "Existing content (do not repeat; continue from here):\n" + JSON.stringify(topic.content).slice(0, 4000)
      : "";

    const userPrompt = `Generate a lesson on: ${topic.title}

Course: ${courseTitle}
Lesson: ${topic.title}
Summary: ${topic.summary}
Difficulty: ${difficulty}/10 - ${levelGuide}

Other lessons in this course (use for context, avoid heavy overlap, build on these):
${priorOutline}

Source material (focus on the parts relevant to THIS lesson):
${focused}

${existingPreview}

${customInstruction ? `Extra instruction from admin: ${customInstruction}\n` : ""}
Follow this structure:
1. Intro (text)
2. Core Concept (text)
3. Key Points (list)
4. Example (text)
5. Insight (highlight)
6. Advanced Concept (text)
7. Example (text)
8. Summary (text)

You may add up to 7 extra supported blocks when they improve the lesson, such as:
- table for comparisons
- code for programming or algorithms
- flowchart for processes; put valid Mermaid flowchart syntax in code, for example:
  graph TD
    A[Start] --> B[Process]
    B --> C[End]
  Quote labels that contain punctuation or parentheses, e.g. B{"Connectivity (e.g., Wi-Fi)"}.
- chart for simple numeric comparisons
- math for formulas
- timeline for historical or sequential topics
- image only when a visual would genuinely help; include caption and prompt, not an empty url

Also write exactly 4 multiple-choice quiz questions (4 options each, exactly one correct).`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `${LESSON_GENERATION_SYSTEM_PROMPT}\nAlways call the write_lesson tool.` },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "write_lesson",
            parameters: {
              type: "object",
              properties: {
                content: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["text", "list", "highlight", "table", "code", "flowchart", "chart", "image", "math", "timeline"] },
                      title: { type: "string" },
                      value: { type: "string" },
                      items: {
                        type: "array",
                        items: { type: "string" },
                      },
                      timeline_items: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: { label: { type: "string" }, desc: { type: "string" } },
                        },
                      },
                      headers: { type: "array", items: { type: "string" } },
                      rows: { type: "array", items: { type: "array", items: { type: "string" } } },
                      code: { type: "string", description: "Mermaid flowchart syntax, e.g. graph TD\\n  A[Start] --> B{\\\"Connectivity (e.g., Wi-Fi)\\\"}" },
                      variant: { type: "string", enum: ["bar", "line", "pie"] },
                      data: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: { name: { type: "string" }, value: { type: "number" } },
                        },
                      },
                      language: { type: "string" },
                      display: { type: "boolean" },
                      caption: { type: "string" },
                      prompt: { type: "string" },
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
          },
        }],
        tool_choice: { type: "function", function: { name: "write_lesson" } },
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: "Rate limit - try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (r.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!r.ok) throw new Error(`AI error ${r.status}`);

    const j = await r.json();
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI did not return lesson");
    const parsed = JSON.parse(args);
    const blocks = normalizeLessonContent(parsed.content || []);

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i] as any;
      if (b.type === "image" && !b.url && b.prompt) {
        try {
          const ir = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-image",
              messages: [{ role: "user", content: `Educational illustration: ${b.prompt}. Clean, clear, suitable for a textbook.` }],
              modalities: ["image", "text"],
            }),
          });
          if (ir.ok) {
            const ij = await ir.json();
            const dataUrl = ij.choices?.[0]?.message?.images?.[0]?.image_url?.url;
            if (dataUrl?.startsWith("data:")) {
              const m = dataUrl.match(/^data:(.+?);base64,(.+)$/);
              if (m) {
                const mime = m[1];
                const ext = mime.split("/")[1] || "png";
                const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
                const path = `${topicId}/${Date.now()}-${i}.${ext}`;
                const up = await admin.storage.from("lesson-images").upload(path, bytes, { contentType: mime, upsert: true });
                if (!up.error) {
                  const { data: pub } = admin.storage.from("lesson-images").getPublicUrl(path);
                  blocks[i] = compact({ ...b, url: pub.publicUrl });
                }
              }
            }
          }
        } catch (e) {
          console.error("Image gen failed for block", i, e);
        }
      }
    }

    const finalContent = continueExisting ? [...(topic.content as any[]), ...blocks] : blocks;
    const finalQuiz = continueExisting ? topic.quiz : (parsed.quiz || []);

    await admin.from("topics").update({
      content: finalContent,
      quiz: finalQuiz,
      generation_status: "ready",
      difficulty_level: difficulty,
    }).eq("id", topicId);

    const { data: remaining } = await admin.from("topics").select("id").eq("course_id", topic.course_id).eq("generation_status", "pending");
    if (!remaining || remaining.length === 0) {
      await admin.from("courses").update({ generation_status: "ready" }).eq("id", topic.course_id);
    }

    return new Response(JSON.stringify({ ok: true, blocks: blocks.length, remaining: remaining?.length ?? 0 }), {
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
