import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY") || Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    const { pyqId } = await req.json();
    if (!pyqId) throw new Error("pyqId required");

    const { data: pyq } = await admin.from("course_pyq").select("id, question, marks, course_id").eq("id", pyqId).maybeSingle();
    if (!pyq) throw new Error("PYQ not found");

    // Get tagged topics for context
    const { data: links } = await admin.from("pyq_topics").select("topic_id").eq("pyq_id", pyqId);
    const topicIds = (links || []).map((l: any) => l.topic_id);
    let context = "";
    if (topicIds.length) {
      const { data: ts } = await admin.from("topics").select("title, summary, content").in("id", topicIds);
      context = (ts || []).map(t => `## ${t.title}\n${t.summary}`).join("\n\n").slice(0, 6000);
    } else {
      const { data: course } = await admin.from("courses").select("title, source_text").eq("id", pyq.course_id).maybeSingle();
      context = `${course?.title}\n${(course?.source_text || "").slice(0, 6000)}`;
    }

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You write concise, exam-ready model answers. Use the provided lesson context. Match the depth to the marks." },
          { role: "user", content: `CONTEXT:\n${context}\n\nQUESTION (${pyq.marks || "?"} marks): ${pyq.question}\n\nWrite a model answer.` },
        ],
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (r.status === 402) return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!r.ok) throw new Error(`AI error ${r.status}`);
    const j = await r.json();
    const answer = j.choices?.[0]?.message?.content || "";
    if (!answer) throw new Error("Empty answer");

    const { error } = await admin.from("course_pyq").update({ answer }).eq("id", pyqId);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, answer }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
