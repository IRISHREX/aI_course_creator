import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY") || Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const NODE_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    label: { type: "string" },
    children: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, children: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } }, required: ["id", "label"] } } }, required: ["id", "label"] } },
  },
  required: ["id", "label"],
};

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

    const { courseId, topicId } = await req.json();
    if (!courseId && !topicId) throw new Error("courseId or topicId required");

    let title = "", body = "", target = "course";
    if (topicId) {
      const { data: t } = await admin.from("topics").select("title, summary, content").eq("id", topicId).maybeSingle();
      if (!t) throw new Error("Topic not found");
      title = t.title;
      target = "lesson";
      body = `Lesson title: ${t.title}
Lesson summary: ${t.summary || ""}
Lesson content:
${JSON.stringify(t.content || []).slice(0, 7000)}

Make the root label the lesson title. Use the main ideas from this lesson as branches. Do not create a generic study plan.`;
    } else {
      const { data: c } = await admin.from("courses").select("title, description").eq("id", courseId).maybeSingle();
      const { data: ts } = await admin.from("topics").select("title, summary").eq("course_id", courseId).order("unit").order("order_index");
      title = c?.title || "";
      body = `Course title: ${c?.title || ""}
Course description: ${c?.description || ""}
Lessons:
${(ts || []).map((t: any) => `- ${t.title}: ${t.summary || ""}`).join("\n")}

Make the root label the course title and organize branches by course concepts.`;
    }

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You build educational concept mind maps, not study schedules. Always call the tool with a tree of 4-7 main branches, each with 2-5 sub-branches. Labels short (max 6 words)." },
          { role: "user", content: `Make a ${target} mind map for:\nTitle: ${title}\n\n${body}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "write_mindmap",
            parameters: { type: "object", properties: { mindmap: NODE_SCHEMA }, required: ["mindmap"] },
          },
        }],
        tool_choice: { type: "function", function: { name: "write_mindmap" } },
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }});
    if (r.status === 402) return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }});
    if (!r.ok) throw new Error(`AI error ${r.status}`);

    const j = await r.json();
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("No mindmap returned");
    const parsed = JSON.parse(args);

    if (topicId) await admin.from("topics").update({ mindmap: parsed.mindmap }).eq("id", topicId);
    else await admin.from("courses").update({ mindmap: parsed.mindmap }).eq("id", courseId);

    return new Response(JSON.stringify({ ok: true, mindmap: parsed.mindmap }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }});
  }
});
