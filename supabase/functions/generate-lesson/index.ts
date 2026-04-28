import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    const { topicId, level } = await req.json();
    if (!topicId) throw new Error("topicId required");

    const { data: topic } = await admin.from("topics").select("*, courses(title, source_text)").eq("id", topicId).maybeSingle();
    if (!topic) throw new Error("Topic not found");

    const sourceText: string = (topic as any).courses?.source_text || "";
    const courseTitle: string = (topic as any).courses?.title || "";
    const difficulty = Math.max(1, Math.min(10, level || topic.difficulty_level || 5));

    // Try to find the relevant slice of source text for this lesson (keyword match on title words)
    let focused = sourceText;
    if (sourceText.length > 8000) {
      const words = (topic.title + " " + topic.summary).toLowerCase().split(/\W+/).filter(w => w.length > 4);
      const lower = sourceText.toLowerCase();
      let bestIdx = -1;
      for (const w of words) { const i = lower.indexOf(w); if (i !== -1) { bestIdx = i; break; } }
      if (bestIdx !== -1) {
        const start = Math.max(0, bestIdx - 1500);
        focused = sourceText.slice(start, start + 8000);
      } else {
        focused = sourceText.slice(0, 8000);
      }
    }

    const levelGuide = difficulty <= 3 ? "very simple, for beginners, short sentences, use everyday analogies"
      : difficulty <= 6 ? "intermediate, clear explanations, mix of concepts and examples"
      : "advanced, technical depth, precise terminology";

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `You write interactive lesson content. Difficulty level ${difficulty}/10 — ${levelGuide}. Always call the tool.` },
          { role: "user", content: `Course: ${courseTitle}\nLesson: ${topic.title}\nSummary: ${topic.summary}\n\nRelevant material:\n${focused}\n\nWrite 4-7 content blocks (text, list, highlight) and exactly 4 multiple-choice quiz questions (4 options each, exactly one correct). Include at least one analogy or real-world example.` },
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
              required: ["content", "quiz"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "write_lesson" } },
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: "Rate limit — try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }});
    if (r.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }});
    if (!r.ok) throw new Error(`AI error ${r.status}`);

    const j = await r.json();
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI did not return lesson");
    const parsed = JSON.parse(args);

    await admin.from("topics").update({
      content: parsed.content || [],
      quiz: parsed.quiz || [],
      generation_status: "ready",
      difficulty_level: difficulty,
    }).eq("id", topicId);

    // If all topics are ready, mark course ready
    const { data: remaining } = await admin.from("topics").select("id").eq("course_id", topic.course_id).eq("generation_status", "pending");
    if (!remaining || remaining.length === 0) {
      await admin.from("courses").update({ generation_status: "ready" }).eq("id", topic.course_id);
    }

    return new Response(JSON.stringify({ ok: true, remaining: remaining?.length ?? 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
