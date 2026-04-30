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

    const { prompt, topicId } = await req.json();
    if (!prompt) throw new Error("prompt required");

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: `Educational illustration: ${prompt}. Clean, clear, suitable for a textbook.` }],
        modalities: ["image", "text"],
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: "Rate limit — try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }});
    if (r.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }});
    if (!r.ok) throw new Error(`AI error ${r.status}`);

    const j = await r.json();
    const dataUrl: string | undefined = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl) throw new Error("No image returned");

    // Convert data URL to bytes and upload to bucket
    const m = dataUrl.match(/^data:(.+?);base64,(.+)$/);
    if (!m) throw new Error("Bad image format");
    const mime = m[1];
    const ext = mime.split("/")[1] || "png";
    const bin = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
    const path = `${topicId || "ai"}/${Date.now()}.${ext}`;
    const { error: upErr } = await admin.storage.from("lesson-images").upload(path, bin, { contentType: mime, upsert: true });
    if (upErr) throw upErr;
    const { data: pub } = admin.storage.from("lesson-images").getPublicUrl(path);

    return new Response(JSON.stringify({ ok: true, url: pub.publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
