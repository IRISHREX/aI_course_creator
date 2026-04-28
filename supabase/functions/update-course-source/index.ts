import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function extractDocId(url: string): string | null {
  const m = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) throw new Error("Unauthorized");

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleRow } = await admin.from("user_roles").select("role")
      .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Admin only");

    const { courseId, docsUrl, rawText, resetLessons } = await req.json();
    if (!courseId) throw new Error("courseId required");

    let source = (rawText || "").trim();
    let attempts = 0;
    let lastError = "";
    if (!source && docsUrl) {
      const docId = extractDocId(docsUrl);
      if (!docId) throw new Error("Invalid Google Docs URL");
      // Retry up to 3 times for transient failures
      while (attempts < 3 && !source) {
        attempts++;
        try {
          const res = await fetch(`https://docs.google.com/document/d/${docId}/export?format=txt`);
          if (res.ok) { source = await res.text(); break; }
          lastError = `HTTP ${res.status}`;
        } catch (e) {
          lastError = e instanceof Error ? e.message : "fetch error";
        }
        if (!source) await new Promise(r => setTimeout(r, 800 * attempts));
      }
      if (!source) throw new Error(`Cannot fetch Google Doc after ${attempts} attempts (${lastError}). Make sure it's shared as 'Anyone with the link'.`);
    }
    if (!source) throw new Error("Provide a Google Docs URL or raw text");

    const trimmed = source.slice(0, 200000);
    const { error: uErr } = await admin.from("courses").update({
      source_text: trimmed,
      generation_status: resetLessons ? "generating" : "ready",
    }).eq("id", courseId);
    if (uErr) throw uErr;

    let resetCount = 0;
    if (resetLessons) {
      const { data: topics, error: tErr } = await admin.from("topics")
        .update({ generation_status: "pending", content: [], quiz: [] })
        .eq("course_id", courseId)
        .select("id");
      if (tErr) throw tErr;
      resetCount = topics?.length ?? 0;
    }

    return new Response(JSON.stringify({
      ok: true, sourceLength: trimmed.length, attempts, resetCount,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
