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

    const { courseId, year, fileBase64, mimeType, fileName } = await req.json();
    if (!courseId || !fileBase64 || !mimeType) throw new Error("courseId, fileBase64, mimeType required");

    // Get course + topics for auto-tagging
    const { data: course } = await admin.from("courses").select("id, title").eq("id", courseId).maybeSingle();
    if (!course) throw new Error("Course not found");
    const { data: topics } = await admin.from("topics").select("id, title, summary, order_index, unit").eq("course_id", courseId).order("unit").order("order_index");
    const topicList = (topics || []).map((t, i) => `${i + 1}. [${t.id}] ${t.title} — ${t.summary || ""}`).join("\n").slice(0, 8000);

    // Step 1: Extract questions using vision/PDF input
    const isImage = mimeType.startsWith("image/");
    const dataUrl = `data:${mimeType};base64,${fileBase64}`;

    const userContent: any[] = [
      { type: "text", text: `Extract ALL exam questions from this ${isImage ? "image" : "document"}. Ignore answer keys / model answers. For each question, capture: question text (verbatim), marks if shown, year if shown.${year ? ` Default year: ${year}.` : ""}` },
    ];
    if (isImage) {
      userContent.push({ type: "image_url", image_url: { url: dataUrl } });
    } else {
      // For PDFs, Gemini supports inline PDF via file_data. We pass it as image_url with PDF mime — most gateways accept it.
      userContent.push({ type: "image_url", image_url: { url: dataUrl } });
    }

    const r1 = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You extract exam questions exactly as written. Always call the tool." },
          { role: "user", content: userContent },
        ],
        tools: [{
          type: "function",
          function: {
            name: "save_questions",
            parameters: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      question: { type: "string" },
                      marks: { type: "integer" },
                      year: { type: "integer" },
                    },
                    required: ["question"],
                  },
                },
              },
              required: ["items"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "save_questions" } },
      }),
    });
    if (r1.status === 429) return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (r1.status === 402) return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!r1.ok) throw new Error(`Extraction failed ${r1.status}: ${await r1.text()}`);
    const j1 = await r1.json();
    const args1 = j1.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args1) throw new Error("No questions extracted");
    const extracted = JSON.parse(args1).items || [];
    if (extracted.length === 0) throw new Error("No questions found in file");

    // Insert PYQs
    const toInsert = extracted.map((it: any, i: number) => ({
      course_id: courseId,
      question: it.question,
      answer: "",
      marks: it.marks ?? null,
      year: it.year ?? year ?? null,
      source: "ai",
      ingestion_source: isImage ? "image" : "doc",
      order_index: i,
    }));
    const { data: inserted, error: insErr } = await admin.from("course_pyq").insert(toInsert).select("id, question");
    if (insErr) throw insErr;

    // Step 2: Auto-tag each question to topics (if topics exist)
    let taggedLinks = 0;
    if ((inserted || []).length && (topics || []).length) {
      const qList = inserted!.map((q, i) => `${i + 1}. [${q.id}] ${q.question}`).join("\n").slice(0, 8000);
      const r2 = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "Tag each exam question to the most relevant lessons. Pick 1-3 lessons per question. Use the lesson UUIDs provided." },
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
          const links = JSON.parse(args2).links || [];
          const validTopicIds = new Set((topics || []).map(t => t.id));
          const validPyqIds = new Set(inserted!.map(p => p.id));
          const rows: any[] = [];
          for (const link of links) {
            if (!validPyqIds.has(link.pyq_id)) continue;
            for (const tid of link.topic_ids || []) {
              if (validTopicIds.has(tid)) rows.push({ pyq_id: link.pyq_id, topic_id: tid });
            }
          }
          if (rows.length) {
            const { error: tagErr } = await admin.from("pyq_topics").insert(rows);
            if (!tagErr) taggedLinks = rows.length;
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, inserted: inserted!.length, tagged: taggedLinks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ingest-pyq error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
