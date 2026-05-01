import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || `lesson-${Date.now()}`;
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
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Admin only");

    const { courseId, title, summary, unit, generate } = await req.json();
    if (!courseId || !title) throw new Error("courseId and title required");

    const { data: course } = await admin.from("courses").select("slug, title").eq("id", courseId).maybeSingle();
    if (!course) throw new Error("Course not found");

    const u = Math.max(1, Math.min(20, unit || 1));
    const { data: existingInUnit } = await admin.from("topics").select("order_index").eq("course_id", courseId).eq("unit", u).order("order_index", { ascending: false }).limit(1);
    const nextOrder = (existingInUnit?.[0]?.order_index || 0) + 1;

    let baseSlug = `${course.slug}-${slugify(title)}`;
    let slug = baseSlug;
    let n = 1;
    while ((await admin.from("topics").select("id").eq("slug", slug).maybeSingle()).data) {
      slug = `${baseSlug}-${++n}`;
    }

    const { data: created, error } = await admin.from("topics").insert({
      course_id: courseId,
      slug, unit: u, order_index: nextOrder,
      title, summary: summary || "",
      content: [], quiz: [],
      generation_status: generate ? "pending" : "ready",
    }).select().single();
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, topic: created }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
