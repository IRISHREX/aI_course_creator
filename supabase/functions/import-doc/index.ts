import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

function extractDocId(url: string): string | null {
  const m = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");
    const { url } = await req.json();
    const docId = extractDocId(url || "");
    if (!docId) throw new Error("Invalid Google Docs URL");

    // Fetch as plain text using export endpoint (works for publicly-shared docs)
    const docRes = await fetch(`https://docs.google.com/document/d/${docId}/export?format=txt`);
    if (!docRes.ok) throw new Error("Cannot fetch doc — make sure it's shared as 'Anyone with the link'.");
    const raw = (await docRes.text()).slice(0, 8000);

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You convert raw lesson notes into structured lesson blocks for a learning platform. Always call the tool." },
          { role: "user", content: `Convert the following notes into 3-6 blocks. Block types allowed: text (value), list (title, items[]), highlight (value), timeline (items: [{label, desc}]). Also produce a one-sentence summary.\n\nNOTES:\n${raw}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "structure",
            description: "Return structured lesson",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string" },
                content: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["text", "list", "highlight", "timeline"] },
                      value: { type: "string" },
                      title: { type: "string" },
                      items: { type: "array", items: {} },
                    },
                    required: ["type"],
                    additionalProperties: true,
                  },
                },
              },
              required: ["summary", "content"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "structure" } },
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: "Rate limit — try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }});
    if (r.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }});
    if (!r.ok) throw new Error(`AI error ${r.status}`);
    const j = await r.json();
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : { content: [], summary: "" };
    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
