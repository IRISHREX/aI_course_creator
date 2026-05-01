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

    const { topicId, level, mode, customInstruction } = await req.json();
    if (!topicId) throw new Error("topicId required");

    const { data: topic } = await admin.from("topics").select("*, courses(title, source_text)").eq("id", topicId).maybeSingle();
    if (!topic) throw new Error("Topic not found");

    const sourceText: string = (topic as any).courses?.source_text || "";
    const courseTitle: string = (topic as any).courses?.title || "";
    const difficulty = Math.max(1, Math.min(10, level || topic.difficulty_level || 5));

    // Get prior lessons in this course (for context-aware deeper generation)
    const { data: priorAll } = await admin.from("topics")
      .select("title, summary, order_index, unit, generation_status")
      .eq("course_id", topic.course_id)
      .order("unit").order("order_index");
    const prior = (priorAll || []).filter((t: any) => t.title !== topic.title);
    const priorOutline = prior.slice(0, 30).map((t: any) => `- ${t.unit}.${t.order_index} ${t.title}: ${t.summary}`).join("\n");

    // Find best matching slice of source for this lesson
    let focused = sourceText;
    if (sourceText.length > 12000) {
      const words = (topic.title + " " + topic.summary).toLowerCase().split(/\W+/).filter(w => w.length > 4);
      const lower = sourceText.toLowerCase();
      let bestIdx = -1;
      for (const w of words) { const i = lower.indexOf(w); if (i !== -1) { bestIdx = i; break; } }
      if (bestIdx !== -1) {
        const start = Math.max(0, bestIdx - 2000);
        focused = sourceText.slice(start, start + 12000);
      } else {
        focused = sourceText.slice(0, 12000);
      }
    }

    const levelGuide = difficulty <= 3 ? "very simple, beginner-friendly, short sentences, everyday analogies"
      : difficulty <= 6 ? "intermediate, clear, mix concepts and examples, include 1-2 visual blocks"
      : "advanced, technical depth, precise terminology, include diagrams/charts/equations where appropriate";

    const continueExisting = mode === "continue" && Array.isArray(topic.content) && topic.content.length > 0;
    const existingPreview = continueExisting
      ? "Existing content (DO NOT REPEAT — continue from here):\n" + JSON.stringify(topic.content).slice(0, 4000)
      : "";

    const userPrompt = `Course: ${courseTitle}
Lesson: ${topic.title}
Summary: ${topic.summary}
Difficulty: ${difficulty}/10 — ${levelGuide}

Other lessons in this course (use for context, avoid heavy overlap, build on these):
${priorOutline}

Source material (focus on the parts relevant to THIS lesson):
${focused}

${existingPreview}

${customInstruction ? `Extra instruction from admin: ${customInstruction}\n` : ""}
Write 6-12 content blocks for this lesson. Use the most appropriate block types from:
- text (paragraph; use **bold** to emphasise key terms)
- highlight (key takeaway box)
- list (with optional title)
- timeline (label + desc)
- table (headers + rows for comparisons)
- flowchart (mermaid 'graph TD' code for processes)
- chart (bar/line/pie with name+value data)
- math (KaTeX LaTeX for any formulae)
- code (with language for any code samples)
- image (only set caption + a vivid 'prompt' field describing what to generate; leave url empty)

Pick block types that BEST express the content. Lessons about formulas → include math. About processes → include flowchart. About comparisons → include table. About data → include chart. About code/algorithms → include code blocks. Mix at least 3 different block types.

Also write exactly 4 multiple-choice quiz questions (4 options each, exactly one correct).`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You write rich, multimodal lesson content. Use the FULL variety of block types — math, code, tables, charts, flowcharts, images — when they fit. Always call the tool." },
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
                      type: { type: "string", enum: ["text", "highlight", "list", "timeline", "table", "flowchart", "chart", "math", "code", "image"] },
                      value: { type: "string", description: "for text/highlight/math/code blocks" },
                      title: { type: "string" },
                      items: { type: "array", items: { type: "string" }, description: "for list" },
                      timeline_items: {
                        type: "array",
                        items: { type: "object", properties: { label: { type: "string" }, desc: { type: "string" } } },
                        description: "for timeline blocks",
                      },
                      headers: { type: "array", items: { type: "string" }, description: "for table" },
                      rows: { type: "array", items: { type: "array", items: { type: "string" } }, description: "for table" },
                      code: { type: "string", description: "mermaid code for flowchart" },
                      variant: { type: "string", enum: ["bar", "line", "pie"], description: "for chart" },
                      data: {
                        type: "array",
                        items: { type: "object", properties: { name: { type: "string" }, value: { type: "number" } } },
                        description: "for chart",
                      },
                      language: { type: "string", description: "code language e.g. python, javascript" },
                      display: { type: "boolean", description: "math display mode" },
                      caption: { type: "string" },
                      prompt: { type: "string", description: "for image: vivid description for AI image generation" },
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

    // Normalize blocks (timeline_items -> items for timeline, image url empty for now)
    const blocks = (parsed.content || []).map((b: any) => {
      if (b.type === "timeline" && b.timeline_items) return { type: "timeline", items: b.timeline_items };
      if (b.type === "image") return { type: "image", url: b.url || "", caption: b.caption || b.prompt || "", prompt: b.prompt };
      return b;
    });

    // Try to generate images for image blocks (best-effort, non-blocking on individual failure)
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
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
              // upload to storage
              const m = dataUrl.match(/^data:(.+?);base64,(.+)$/);
              if (m) {
                const mime = m[1];
                const ext = mime.split("/")[1] || "png";
                const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
                const path = `${topicId}/${Date.now()}-${i}.${ext}`;
                const up = await admin.storage.from("lesson-images").upload(path, bytes, { contentType: mime, upsert: true });
                if (!up.error) {
                  const { data: pub } = admin.storage.from("lesson-images").getPublicUrl(path);
                  blocks[i] = { ...b, url: pub.publicUrl };
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
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
