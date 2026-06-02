import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function cleanPyqText(value: unknown) {
  return String(value ?? "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s*(?:q(?:uestion)?\.?\s*)?\d+[\).:-]\s*/i, "")
    .replace(/^\s*(?:answer|solution)\s*[:.-]\s*/i, "")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) throw new Error("Unauthorized");
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id).in("role", ["admin", "super_admin"]).maybeSingle();
    if (!roleRow) throw new Error("Admin only");

    const { courseId, count = 10 } = await req.json();
    if (!courseId) throw new Error("courseId required");

    const { data: course } = await admin.from("courses").select("title, description, source_text").eq("id", courseId).maybeSingle();
    if (!course) throw new Error("Course not found");
    const { data: topics } = await admin.from("topics").select("id, title, summary, unit, order_index").eq("course_id", courseId).order("unit").order("order_index");
    const topicList = (topics || []).map((t, i) => `${i + 1}. [${t.id}] Unit ${t.unit}: ${t.title} - ${t.summary || ""}`).join("\n").slice(0, 8000);

    const source = (course.source_text || "").slice(0, 12000);

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You produce clean previous-year-style exam questions with concise, structured model answers. Always call the tool." },
          { role: "user", content: `Course: ${course.title}\n${course.description}\n\nLessons:\n${topicList}\n\nMaterial:\n${source}\n\nGenerate ${count} likely previous year exam questions with concise model answers. Mix marks (2/5/10/15). Do not include duplicate numbering inside question text.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "write_pyq",
            parameters: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      question: { type: "string" },
                      answer: { type: "string" },
                      marks: { type: "integer" },
                      year: { type: "integer" },
                    },
                    required: ["question", "answer"],
                  },
                },
              },
              required: ["items"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "write_pyq" } },
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }});
    if (r.status === 402) return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }});
    if (!r.ok) throw new Error(`AI error ${r.status}`);

    const j = await r.json();
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("No PYQ returned");
    const parsed = JSON.parse(args);
    const items = (parsed.items || []).map((it: any, i: number) => ({
      course_id: courseId,
      question: cleanPyqText(it.question),
      answer: cleanPyqText(it.answer),
      marks: it.marks ?? null,
      year: it.year ?? null,
      source: "ai",
      order_index: i,
    })).filter((it: any) => it.question);

    const { data: inserted, error } = await admin.from("course_pyq").insert(items).select("id, question");
    if (error) throw error;

    let tagged = 0;
    if ((inserted || []).length && (topics || []).length) {
      const validPyqIds = new Set(inserted!.map((q: any) => q.id));
      const validTopicIds = new Set((topics || []).map((t: any) => t.id));
      const qList = inserted!.map((q: any, i: number) => `${i + 1}. [${q.id}] ${q.question}`).join("\n").slice(0, 8000);
      const r2 = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "Tag each exam question to the most relevant lessons in the same course. Pick 1-3 lessons per question. Use only the lesson UUIDs provided." },
            { role: "user", content: `LESSONS:\n${topicList}\n\nQUESTIONS:\n${qList}\n\nReturn tagging.` },
          ],
          tools: [{
            type: "function",
            function: {
              name: "tag",
              parameters: {
                type: "object",
                properties: {
                  links: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        pyq_id: { type: "string" },
                        topic_ids: { type: "array", items: { type: "string" } },
                      },
                      required: ["pyq_id", "topic_ids"],
                    },
                  },
                },
                required: ["links"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "tag" } },
        }),
      });
      if (r2.ok) {
        const j2 = await r2.json();
        const args2 = j2.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        if (args2) {
          const parsed2 = JSON.parse(args2);
          const rows: any[] = [];
          for (const link of parsed2.links || []) {
            if (!validPyqIds.has(link.pyq_id)) continue;
            for (const topicId of link.topic_ids || []) {
              if (validTopicIds.has(topicId)) rows.push({ pyq_id: link.pyq_id, topic_id: topicId });
            }
          }
          if (rows.length) {
            const { error: tagError } = await admin.from("pyq_topics").insert(rows);
            if (!tagError) tagged = rows.length;
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, inserted: items.length, tagged }), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }});
  }
});
