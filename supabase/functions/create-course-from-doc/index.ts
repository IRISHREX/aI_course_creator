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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    // Verify caller is admin
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
    if (source.startsWith("__FILE__:")) {
      // for binary uploads, just hand the AI the filename + warning to summarize generic outline
      source = `(uploaded file: ${source.split(":")[1]} — please generate a generic course outline based on the title)`;
    }
    if (!source && docsUrl) {
      const docId = extractDocId(docsUrl);
      if (!docId) throw new Error("Invalid Google Docs URL");
      const docRes = await fetch(`https://docs.google.com/document/d/${docId}/export?format=txt`);
      if (!docRes.ok) throw new Error("Cannot fetch Google Doc — share as 'Anyone with the link'.");
      source = await docRes.text();
    }
    if (!source) throw new Error("Provide source text, file, or Google Docs URL");
    source = source.slice(0, 18000);

    // Ask AI to produce a structured course
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a curriculum designer. Convert raw study material into a structured interactive course. Always call the tool." },
          { role: "user", content: `Course title: ${title}\n\nMaterial:\n${source}\n\nProduce a course with:\n- 1-sentence description\n- 6-15 lessons grouped into 2-5 units\n- each lesson: title, 1-line summary, 3-6 content blocks (text/list/highlight), and 4 multiple-choice quiz questions (4 options each, exactly one correct).\nKeep lessons focused and educational.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "create_course",
            description: "Structured course",
            parameters: {
              type: "object",
              properties: {
                description: { type: "string" },
                lessons: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      unit: { type: "integer", minimum: 1 },
                      title: { type: "string" },
                      summary: { type: "string" },
                      content: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            type: { type: "string", enum: ["text", "list", "highlight"] },
                            value: { type: "string" },
                            title: { type: "string" },
                            items: { type: "array", items: { type: "string" } },
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
                            answer: { type: "integer", minimum: 0, maximum: 3 },
                          },
                          required: ["q", "options", "answer"],
                        },
                      },
                    },
                    required: ["unit", "title", "summary", "content", "quiz"],
                  },
                },
              },
              required: ["description", "lessons"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "create_course" } },
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: "Rate limit — try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }});
    if (r.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }});
    if (!r.ok) throw new Error(`AI error ${r.status}: ${await r.text()}`);

    const j = await r.json();
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI did not return structured output");
    const parsed = JSON.parse(args);

    // Create course
    let baseSlug = slugify(title);
    let slug = baseSlug;
    let n = 1;
    while ((await admin.from("courses").select("id").eq("slug", slug).maybeSingle()).data) {
      slug = `${baseSlug}-${++n}`;
    }
    const { data: course, error: cErr } = await admin.from("courses").insert({
      slug, title, description: parsed.description || "", cover_emoji: emoji || "📘",
      order_index: Date.now() % 1000,
    }).select().single();
    if (cErr) throw cErr;

    // Insert lessons with per-unit ordering
    const orderByUnit: Record<number, number> = {};
    const rows = parsed.lessons.map((l: any, i: number) => {
      const unit = Math.max(1, Math.min(10, l.unit || 1));
      orderByUnit[unit] = (orderByUnit[unit] || 0) + 1;
      return {
        course_id: course.id,
        slug: `${slug}-${slugify(l.title)}-${i}`,
        unit, order_index: orderByUnit[unit],
        title: l.title, summary: l.summary,
        content: l.content || [], quiz: l.quiz || [],
      };
    });
    const { error: tErr } = await admin.from("topics").insert(rows);
    if (tErr) throw tErr;

    return new Response(JSON.stringify({ slug, topicCount: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
