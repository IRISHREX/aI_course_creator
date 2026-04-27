import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "https://esm.sh/docx@8.5.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function blockToParagraphs(block: any): Paragraph[] {
  if (block.type === "text") {
    return [new Paragraph({ children: [new TextRun(String(block.value || ""))], spacing: { after: 120 } })];
  }
  if (block.type === "highlight") {
    return [new Paragraph({ children: [new TextRun({ text: String(block.value || ""), italics: true })], spacing: { after: 120 } })];
  }
  if (block.type === "list") {
    const ps: Paragraph[] = [];
    if (block.title) ps.push(new Paragraph({ children: [new TextRun({ text: block.title, bold: true })], spacing: { after: 60 } }));
    (block.items || []).forEach((it: string) => ps.push(new Paragraph({ children: [new TextRun(`• ${it}`)], spacing: { after: 40 } })));
    return ps;
  }
  if (block.type === "timeline") {
    return (block.items || []).map((it: any) => new Paragraph({ children: [new TextRun({ text: `${it.label}: `, bold: true }), new TextRun(it.desc || "")], spacing: { after: 60 } }));
  }
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { courseId } = await req.json();
    if (!courseId) throw new Error("courseId required");

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: course, error: cErr } = await client.from("courses").select("*").eq("id", courseId).maybeSingle();
    if (cErr || !course) throw new Error("Course not found");
    const { data: topics, error: tErr } = await client.from("topics").select("*").eq("course_id", courseId).order("unit").order("order_index");
    if (tErr) throw tErr;

    const children: Paragraph[] = [
      new Paragraph({ children: [new TextRun({ text: course.title, bold: true, size: 56 })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
      new Paragraph({ children: [new TextRun({ text: course.description || "", italics: true })], alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
    ];

    let curUnit = -1;
    (topics || []).forEach((t: any, i: number) => {
      if (t.unit !== curUnit) {
        curUnit = t.unit;
        children.push(new Paragraph({ children: [new TextRun({ text: `Unit ${t.unit}`, bold: true, size: 36 })], heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }));
      }
      children.push(new Paragraph({ children: [new TextRun({ text: `${t.unit}.${t.order_index} ${t.title}`, bold: true, size: 28 })], heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
      if (t.summary) children.push(new Paragraph({ children: [new TextRun({ text: t.summary, italics: true })], spacing: { after: 120 } }));
      (t.content || []).forEach((b: any) => blockToParagraphs(b).forEach(p => children.push(p)));
      if (t.quiz?.length) {
        children.push(new Paragraph({ children: [new TextRun({ text: "Quiz", bold: true })], spacing: { before: 200, after: 80 } }));
        t.quiz.forEach((q: any, qi: number) => {
          children.push(new Paragraph({ children: [new TextRun({ text: `${qi + 1}. ${q.q}`, bold: true })], spacing: { after: 40 } }));
          (q.options || []).forEach((opt: string, oi: number) => {
            const correct = oi === q.answer;
            children.push(new Paragraph({ children: [new TextRun(`   ${String.fromCharCode(65 + oi)}. ${opt}${correct ? "  ✓" : ""}`)], spacing: { after: 20 } }));
          });
        });
      }
    });

    const doc = new Document({ sections: [{ children }] });
    const buf = await Packer.toBuffer(doc);
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));

    return new Response(JSON.stringify({ docx: b64, filename: `${course.slug}.docx` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
