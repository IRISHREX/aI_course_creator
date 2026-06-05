// @ts-ignore
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

function cleanExtractedText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function textItemsToLines(items: any[]) {
  const rows = new Map<number, Array<{ x: number; text: string }>>();
  for (const item of items) {
    const text = String(item.str || "").trim();
    if (!text) continue;
    const transform = Array.isArray(item.transform) ? item.transform : [];
    const x = Number(transform[4]) || 0;
    const y = Math.round(Number(transform[5]) || 0);
    const row = rows.get(y) || [];
    row.push({ x, text });
    rows.set(y, row);
  }

  return Array.from(rows.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) => row.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "))
    .filter(Boolean);
}

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".md") || file.type === "text/plain") {
    return cleanExtractedText(await file.text());
  }
  if (name.endsWith(".docx")) {
    const mammoth = (await import("mammoth")).default;
    const buf = await file.arrayBuffer();
    const res = await mammoth.extractRawText({ arrayBuffer: buf });
    return cleanExtractedText(res.value);
  }
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    (pdfjs as any).GlobalWorkerOptions.workerSrc = workerSrc;
    const buf = await file.arrayBuffer();
    const pdf = await (pdfjs as any).getDocument({ data: buf }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const lines = textItemsToLines(content.items || []);
      pages.push(`[Page ${i}]\n${lines.join("\n")}`);
    }
    return cleanExtractedText(pages.join("\n\n"));
  }
  throw new Error("Unsupported file type. Use .txt, .md, .pdf or .docx");
}
