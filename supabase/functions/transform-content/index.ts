import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PRESETS: Record<string, string> = {
  simplify: "Rewrite the lesson content so a complete beginner can understand. Short sentences. Everyday language. Avoid jargon.",
  expand: "Expand the lesson with more detail, examples, and depth. Keep the same structure but make it richer.",
  bullets: "Convert prose into concise bullet-point lists. Use 'list' blocks with titles and items[].",
  analogy: "Add a real-world analogy block explaining the concept, then keep the original content after it.",
  bigger: "Make the content longer and more thorough. Add sub-points and examples.",
  smaller: "Make the content shorter and more concise. Trim redundant text. Keep the essence.",
  level: "Rewrite the content so it matches the target difficulty level.",
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

    const { topicId, action, level, customInstruction } = await req.json();
    if (!topicId) throw new Error("topicId required");

    const { data: topic } = await admin.from("topics").select("*").eq("id", topicId).maybeSingle();
    if (!topic) throw new Error("Topic not found");

    const preset = PRESETS[action] || "";
    const targetLevel = level ? Math.max(1, Math.min(10, level)) : null;
    const instruction = [
      preset,
      targetLevel ? `Target difficulty level: ${targetLevel}/10.` : "",
      customInstruction || "",
    ].filter(Boolean).join(" ");

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You transform educational lesson content. Preserve correctness. Always call the tool with updated content blocks." },
          { role: "user", content: `Lesson: ${topic.title}\nSummary: ${topic.summary}\nCurrent content:\n${JSON.stringify(topic.content)}\n\nInstruction: ${instruction}\n\nReturn the NEW content blocks (type: text|list|highlight).` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "update_content",
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
              },
              required: ["content"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "update_content" } },
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: "Rate limit — try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }});
    if (r.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }});
    if (!r.ok) throw new Error(`AI error ${r.status}`);

    const j = await r.json();
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI did not return content");
    const parsed = JSON.parse(args);

    const update: any = { content: parsed.content || [] };
    if (targetLevel) update.difficulty_level = targetLevel;
    await admin.from("topics").update(update).eq("id", topicId);

    return new Response(JSON.stringify({ content: parsed.content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
