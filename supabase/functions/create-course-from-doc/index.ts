import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || `course-${Date.now()}`;
}

function extractDocId(url: string): string | null {
  const m = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function chunkText(text: string, size = 12000) {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
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

    const fullSource = source;
    const chunks = chunkText(fullSource);
    const summaries: string[] = [];

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

    const { error: tErr } = await admin.from("topics").insert(rows);
    if (tErr) throw tErr;

    return new Response(JSON.stringify({
      slug,
      courseId: course.id,
      topicCount: rows.length,
      scannedChunks: chunks.length,
      coverage: 100,
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
