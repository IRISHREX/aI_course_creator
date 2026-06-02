import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "https://esm.sh/docx@8.5.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\r/g, "")
    .trim();
}

function blockToLines(block: any): string[] {
  if (!block || typeof block !== "object") return [];
  if (block.type === "text") return [cleanText(block.value)];
  if (block.type === "highlight") return [`Key point: ${cleanText(block.value)}`];
  if (block.type === "list") {
    return [
      cleanText(block.title),
      ...(block.items || []).map((it: string) => `- ${cleanText(it)}`),
    ].filter(Boolean);
  }
  if (block.type === "timeline") return (block.items || []).map((it: any) => `${cleanText(it.label)}: ${cleanText(it.desc)}`);
  if (block.type === "table") {
    return [
      cleanText(block.title),
      Array.isArray(block.headers) ? block.headers.map(cleanText).join(" | ") : "",
      ...(block.rows || []).map((row: unknown[]) => Array.isArray(row) ? row.map(cleanText).join(" | ") : cleanText(row)),
    ].filter(Boolean);
  }
  if (block.type === "flowchart") return [cleanText(block.title), cleanText(block.code)].filter(Boolean);
  if (block.type === "chart") {
    return [
      cleanText(block.title || "Chart"),
      ...(block.data || []).map((it: any) => `${cleanText(it.name)}: ${cleanText(it.value)}`),
    ].filter(Boolean);
  }
  if (block.type === "image") return [cleanText(block.caption), cleanText(block.url)].filter(Boolean);
  if (block.type === "math") return [cleanText(block.caption), cleanText(block.value)].filter(Boolean);
  if (block.type === "code") return [cleanText(block.caption || `${block.language || "Code"} example`), cleanText(block.value)].filter(Boolean);
  return [cleanText(block.value || block.title || JSON.stringify(block))].filter(Boolean);
}

function blockToParagraphs(block: any): Paragraph[] {
  if (block?.type === "text") {
    return [new Paragraph({ children: [new TextRun(cleanText(block.value))], spacing: { after: 120 } })];
  }
  if (block?.type === "highlight") {
    return [new Paragraph({ children: [new TextRun({ text: cleanText(block.value), italics: true })], spacing: { after: 120 } })];
  }
  if (block?.type === "list") {
    const ps: Paragraph[] = [];
    if (block.title) ps.push(new Paragraph({ children: [new TextRun({ text: cleanText(block.title), bold: true })], spacing: { after: 60 } }));
    (block.items || []).forEach((it: string) => ps.push(new Paragraph({ children: [new TextRun(`- ${cleanText(it)}`)], spacing: { after: 40 } })));
    return ps;
  }
  if (block?.type === "timeline") {
    return (block.items || []).map((it: any) => new Paragraph({
      children: [new TextRun({ text: `${cleanText(it.label)}: `, bold: true }), new TextRun(cleanText(it.desc))],
      spacing: { after: 60 },
    }));
  }
  return blockToLines(block).map((line) => new Paragraph({ children: [new TextRun(line)], spacing: { after: 80 } }));
}

function wrapText(text: string, maxChars: number) {
  const words = cleanText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

async function makePdf(lines: string[]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;
  const fontSize = 10;
  const lineHeight = 14;
  let page = pdf.addPage();
  let y = page.getHeight() - margin;

  const addLine = (text: string, opts: { bold?: boolean; size?: number } = {}) => {
    const size = opts.size || fontSize;
    if (y < margin) {
      page = pdf.addPage();
      y = page.getHeight() - margin;
    }
    page.drawText(text.slice(0, 120), {
      x: margin,
      y,
      size,
      font: opts.bold ? bold : font,
      color: rgb(0.08, 0.08, 0.08),
    });
    y -= opts.size ? lineHeight + 6 : lineHeight;
  };

  for (const raw of lines) {
    if (!raw) {
      y -= lineHeight / 2;
      continue;
    }
    const heading = raw.startsWith("# ");
    for (const line of wrapText(heading ? raw.slice(2) : raw, heading ? 64 : 90)) {
      addLine(line, { bold: heading, size: heading ? 16 : fontSize });
    }
  }
  return await pdf.saveAsBase64();
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
    const { data: pyqs, error: pErr } = await client.from("course_pyq").select("*").eq("course_id", courseId).order("year", { ascending: false }).order("order_index");
    if (pErr) throw pErr;
    const { data: links } = await client
      .from("pyq_topics")
      .select("pyq_id, topic_id, course_pyq!inner(course_id)")
      .eq("course_pyq.course_id", courseId);

    const topicTitleById = new Map((topics || []).map((t: any) => [t.id, t.title]));
    const pyqTopicMap = new Map<string, string[]>();
    (links || []).forEach((link: any) => {
      const titles = pyqTopicMap.get(link.pyq_id) || [];
      const title = topicTitleById.get(link.topic_id);
      if (title) titles.push(title);
      pyqTopicMap.set(link.pyq_id, titles);
    });

    const children: Paragraph[] = [
      new Paragraph({ children: [new TextRun({ text: cleanText(course.title), bold: true, size: 56 })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
      new Paragraph({ children: [new TextRun({ text: cleanText(course.description), italics: true })], alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
    ];
    const pdfLines: string[] = [`# ${cleanText(course.title)}`, cleanText(course.description), ""];

    let curUnit = -1;
    (topics || []).forEach((t: any) => {
      if (t.unit !== curUnit) {
        curUnit = t.unit;
        children.push(new Paragraph({ children: [new TextRun({ text: `Unit ${t.unit}`, bold: true, size: 36 })], heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }));
        pdfLines.push(`# Unit ${t.unit}`, "");
      }
      children.push(new Paragraph({ children: [new TextRun({ text: `${t.unit}.${t.order_index} ${cleanText(t.title)}`, bold: true, size: 28 })], heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
      pdfLines.push(`# ${t.unit}.${t.order_index} ${cleanText(t.title)}`);
      if (t.summary) {
        children.push(new Paragraph({ children: [new TextRun({ text: cleanText(t.summary), italics: true })], spacing: { after: 120 } }));
        pdfLines.push(cleanText(t.summary));
      }
      (t.content || []).forEach((b: any) => {
        blockToParagraphs(b).forEach((p) => children.push(p));
        pdfLines.push(...blockToLines(b), "");
      });
      if (t.quiz?.length) {
        children.push(new Paragraph({ children: [new TextRun({ text: "Quiz", bold: true })], spacing: { before: 200, after: 80 } }));
        pdfLines.push("Quiz");
        t.quiz.forEach((q: any, qi: number) => {
          const question = cleanText(q.q || q.question);
          children.push(new Paragraph({ children: [new TextRun({ text: `${qi + 1}. ${question}`, bold: true })], spacing: { after: 40 } }));
          pdfLines.push(`${qi + 1}. ${question}`);
          (q.options || []).forEach((opt: string, oi: number) => {
            const correct = oi === q.answer;
            const line = `   ${String.fromCharCode(65 + oi)}. ${cleanText(opt)}${correct ? "  [correct]" : ""}`;
            children.push(new Paragraph({ children: [new TextRun(line)], spacing: { after: 20 } }));
            pdfLines.push(line);
          });
        });
        pdfLines.push("");
      }
    });

    if (pyqs?.length) {
      children.push(new Paragraph({ children: [new TextRun({ text: "Previous Year Questions", bold: true, size: 36 })], heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }));
      pdfLines.push("# Previous Year Questions");
      pyqs.forEach((p: any, pi: number) => {
        const tagged = (pyqTopicMap.get(p.id) || []).join(", ");
        const meta = [p.year, p.marks ? `${p.marks} marks` : "", tagged ? `Lessons: ${tagged}` : ""].filter(Boolean).join(" | ");
        if (meta) {
          children.push(new Paragraph({ children: [new TextRun({ text: meta, italics: true })], spacing: { after: 40 } }));
          pdfLines.push(meta);
        }
        children.push(new Paragraph({ children: [new TextRun({ text: `${pi + 1}. ${cleanText(p.question)}`, bold: true })], spacing: { after: 60 } }));
        pdfLines.push(`${pi + 1}. ${cleanText(p.question)}`);
        if (p.answer) {
          children.push(new Paragraph({ children: [new TextRun(cleanText(p.answer))], spacing: { after: 120 } }));
          pdfLines.push(`Answer: ${cleanText(p.answer)}`, "");
        }
      });
    }

    const doc = new Document({ sections: [{ children }] });
    const docx = await Packer.toBase64String(doc);
    const pdf = await makePdf(pdfLines);

    return new Response(JSON.stringify({ docx, pdf, filename: cleanText(course.slug || "course") }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
