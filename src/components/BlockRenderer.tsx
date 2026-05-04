import { motion } from "framer-motion";
import { Sparkles, Copy, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { MermaidDiagram } from "./Mindmap";
import { Bar, BarChart, CartesianGrid, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { BlockMath, InlineMath } from "react-katex";
import "katex/dist/katex.min.css";
import { codeToHtml } from "shiki";
import { Button } from "./ui/button";

const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--destructive))"];

interface Props {
  block: any;
  wordOffset?: number;
  activeWordIndex?: number | null;
  onWordClick?: (idx: number) => void;
  text?: string;
}

/**
 * Parse inline formatting markers and return a plain string plus formatting spans.
 * Supported markers:
 *   `text` -> golden highlight
 *   **text** -> bold
 *   ***text*** -> bold red
 */
function parseFormatting(value: string) {
  const spans: Array<{ start: number; end: number; type: "bold" | "gold" | "red" }> = [];
  let stripped = "";
  let i = 0;

  while (i < value.length) {
    if (value.startsWith("***", i)) {
      const end = value.indexOf("***", i + 3);
      if (end !== -1) {
        const inner = value.slice(i + 3, end);
        const start = stripped.length;
        stripped += inner;
        spans.push({ start, end: stripped.length, type: "red" });
        i = end + 3;
        continue;
      }
    }

    if (value[i] === "`") {
      const end = value.indexOf("`", i + 1);
      if (end !== -1) {
        const inner = value.slice(i + 1, end);
        const start = stripped.length;
        stripped += inner;
        spans.push({ start, end: stripped.length, type: "gold" });
        i = end + 1;
        continue;
      }
    }

    if (value.startsWith("**", i)) {
      const end = value.indexOf("**", i + 2);
      if (end !== -1) {
        const inner = value.slice(i + 2, end);
        const start = stripped.length;
        stripped += inner;
        spans.push({ start, end: stripped.length, type: "bold" });
        i = end + 2;
        continue;
      }
    }

    stripped += value[i];
    i++;
  }

  return { stripped, spans };
}

function stripFormatting(s: string): string {
  return parseFormatting(s).stripped;
}

/**
 * Render text with **bold** markers expanded, while assigning per-word data-w indices
 * starting at baseIndex. Each whitespace-separated token = one word index, regardless of bold.
 */
function HighlightedText({ value, baseIndex, activeIndex, onWordClick, className = "" }:
  { value: string; baseIndex: number; activeIndex: number | null | undefined; onWordClick?: (i: number) => void; className?: string }) {
  const { stripped, spans } = parseFormatting(value);
  const hasFormat = (pos: number, type: "bold" | "gold" | "red") => spans.some(span => span.type === type && pos >= span.start && pos < span.end);

  // Walk stripped string, alternating words/whitespace. Assign word indices.
  const out: React.ReactNode[] = [];
  const re = /(\s+|\S+)/g;
  let m: RegExpExecArray | null;
  let wordI = 0;
  let key = 0;
  while ((m = re.exec(stripped))) {
    const tok = m[0];
    const start = m.index;
    if (/^\s+$/.test(tok)) {
      out.push(<span key={`s${key++}`}>{tok}</span>);
    } else {
      const idx = baseIndex + wordI;
      const active = activeIndex === idx;
      const hasRed = Array.from({ length: tok.length }, (_, k) => hasFormat(start + k, "red")).some(Boolean);
      const hasGold = Array.from({ length: tok.length }, (_, k) => hasFormat(start + k, "gold")).some(Boolean);
      const hasBold = Array.from({ length: tok.length }, (_, k) => hasFormat(start + k, "bold")).some(Boolean);
      const formatClass = !active
        ? hasRed
          ? "font-semibold text-rose-600"
          : hasGold
            ? "font-semibold bg-amber-200/80 text-amber-950"
            : hasBold
              ? "font-semibold"
              : ""
        : "";
      out.push(
        <span
          key={`w${key++}`}
          data-w={idx}
          onClick={() => onWordClick?.(idx)}
          className={`cursor-pointer rounded px-0.5 transition-colors ${active ? "bg-primary text-primary-foreground" : "hover:bg-primary/15"} ${formatClass}`}
        >
          {tok}
        </span>
      );
      wordI++;
    }
  }
  return <span className={className}>{out}</span>;
}

export function countWords(s: string): number {
  return (stripFormatting(s).match(/\S+/g) || []).length;
}

export function blockToText(b: any): string {
  if (!b) return "";
  if (b.type === "text") return stripFormatting(b.value || "");
  if (b.type === "highlight") return "Key point. " + stripFormatting(b.value || "");
  if (b.type === "list") {
    const head = b.title ? stripFormatting(b.title) + "." : "";
    const items = (b.items || []).map((it: string, i: number) => `${i + 1}. ${stripFormatting(it)}`).join(". ");
    return [head, items].filter(Boolean).join(" ");
  }
  if (b.type === "timeline") {
    return (b.items || []).map((it: any) => `${it.label}: ${it.desc}`).join(". ");
  }
  if (b.type === "table") {
    const header = (b.headers || []).join(", ");
    const rows = (b.rows || []).map((r: string[]) => r.join(", ")).join(". ");
    return [header, rows].filter(Boolean).join(". ");
  }
  if (b.type === "flowchart") return b.title || "Diagram.";
  if (b.type === "chart") return b.title || "Chart.";
  if (b.type === "image") return b.caption || "";
  if (b.type === "math") return b.caption || "Equation.";
  if (b.type === "code") return b.caption || "Code example.";
  return "";
}

function CodeBlock({ language, value, caption }: { language: string; value: string; caption?: string }) {
  const [html, setHtml] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const out = await codeToHtml(value, {
          lang: language || "plaintext",
          theme: "github-dark",
        });
        if (!cancelled) setHtml(out);
      } catch {
        if (!cancelled) setHtml(`<pre><code>${value.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!))}</code></pre>`);
      }
    })();
    return () => { cancelled = true; };
  }, [language, value]);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <figure className="rounded-2xl border border-border overflow-hidden bg-[#0d1117]">
      <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b border-border text-xs">
        <span className="font-mono text-primary">{language}</span>
        <Button size="sm" variant="ghost" className="h-7" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div
        className="text-sm overflow-auto [&_pre]:!bg-transparent [&_pre]:p-4 [&_pre]:m-0"
        dangerouslySetInnerHTML={{ __html: html || `<pre class="p-4 text-muted-foreground">Loading…</pre>` }}
      />
      {caption && <figcaption className="text-xs text-muted-foreground px-4 py-2 border-t border-border">{caption}</figcaption>}
    </figure>
  );
}

export function BlockRenderer({ block, wordOffset = 0, activeWordIndex, onWordClick }: Props) {
  const b = block;
  if (!b) return null;

  if (b.type === "text") {
    return (
      <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
        className="text-lg leading-relaxed">
        <HighlightedText value={b.value || ""} baseIndex={wordOffset} activeIndex={activeWordIndex} onWordClick={onWordClick} />
      </motion.p>
    );
  }

  if (b.type === "highlight") {
    return (
      <motion.div initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
        className="glass border-l-4 border-primary p-5 rounded-xl flex gap-3">
        <Sparkles className="h-5 w-5 text-primary flex-none mt-0.5" />
        <div className="text-base">
          <HighlightedText value={"Key point. " + (b.value || "")} baseIndex={wordOffset} activeIndex={activeWordIndex} onWordClick={onWordClick} />
        </div>
      </motion.div>
    );
  }

  if (b.type === "list") {
    let off = wordOffset;
    const titleStripped = b.title ? stripFormatting(b.title) + "." : "";
    const titleWords = titleStripped ? countWords(titleStripped) : 0;
    return (
      <div className="glass rounded-2xl p-6">
        {b.title && (
          <div className="font-display font-bold text-lg mb-4">
            <HighlightedText value={b.title + "."} baseIndex={off} activeIndex={activeWordIndex} onWordClick={onWordClick} />
          </div>
        )}
        <ul className="space-y-2">
          {(b.items || []).map((it: string, j: number) => {
            const prev = b.items.slice(0, j).reduce((acc: number, s: string, k: number) => acc + countWords(`${k + 1}. ${s}`), 0);
            const itemBase = off + titleWords + prev + 1; // +1 to skip "j."
            return (
              <li key={j} className="flex gap-3">
                <span className="h-6 w-6 rounded-full bg-primary/20 text-primary grid place-items-center text-xs font-mono mt-0.5">{j + 1}</span>
                <span><HighlightedText value={it} baseIndex={itemBase} activeIndex={activeWordIndex} onWordClick={onWordClick} /></span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (b.type === "timeline") {
    return (
      <div className="glass rounded-2xl p-6">
        <div className="space-y-3">
          {(b.items || []).map((it: any, j: number) => (
            <div key={j} className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-primary grid place-items-center font-display font-bold text-primary-foreground shadow-glow">{it.label}</div>
              <div className="flex-1 h-px bg-border" />
              <div className="flex-1 text-sm">{it.desc}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (b.type === "table") {
    return (
      <div className="glass rounded-2xl p-4 overflow-auto">
        {b.title && <div className="font-display font-bold mb-3">{b.title}</div>}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {(b.headers || []).map((h: string, i: number) => (
                <th key={i} className="text-left p-2 font-mono text-xs uppercase text-primary">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(b.rows || []).map((r: string[], i: number) => (
              <tr key={i} className="border-b border-border/40">
                {r.map((c, j) => <td key={j} className="p-2">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (b.type === "flowchart") {
    return (
      <div className="glass rounded-2xl p-4">
        {b.title && <div className="font-display font-bold mb-2">{b.title}</div>}
        <MermaidDiagram code={b.code || "graph TD\nA-->B"} />
      </div>
    );
  }

  if (b.type === "chart") {
    const data = b.data || [];
    const variant = b.variant || "bar";
    return (
      <div className="glass rounded-2xl p-4">
        {b.title && <div className="font-display font-bold mb-3">{b.title}</div>}
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            {variant === "line" ? (
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            ) : variant === "pie" ? (
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" outerRadius={90} label>
                  {data.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
              </PieChart>
            ) : (
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                <Bar dataKey="value" fill="hsl(var(--primary))" />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  if (b.type === "image") {
    return (
      <figure className="glass rounded-2xl p-3">
        <img src={b.url} alt={b.caption || ""} className="w-full rounded-xl" loading="lazy" />
        {b.caption && <figcaption className="text-xs text-muted-foreground text-center mt-2">{b.caption}</figcaption>}
      </figure>
    );
  }

  if (b.type === "math") {
    return (
      <figure className="glass rounded-2xl p-5 overflow-x-auto">
        {b.display === false
          ? <InlineMath math={b.value || ""} />
          : <BlockMath math={b.value || ""} />}
        {b.caption && <figcaption className="text-xs text-muted-foreground text-center mt-2">{b.caption}</figcaption>}
      </figure>
    );
  }

  if (b.type === "code") {
    return <CodeBlock language={b.language || "plaintext"} value={b.value || ""} caption={b.caption} />;
  }

  return null;
}
