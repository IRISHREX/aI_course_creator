import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { MermaidDiagram } from "./Mindmap";
import { ChartContainer } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";

const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--destructive))"];

interface Props {
  block: any;
  /** Optional: tokens belonging to this block, for karaoke highlight */
  wordOffset?: number;
  activeWordIndex?: number | null;
  onWordClick?: (idx: number) => void;
  /** All tokens of the page (text fragments) so we can render with highlight */
  text?: string;
}

/** Render plain text with per-word spans, supporting active-word highlight + click-to-seek. */
function HighlightedText({ value, baseIndex, activeIndex, onWordClick, className = "" }:
  { value: string; baseIndex: number; activeIndex: number | null | undefined; onWordClick?: (i: number) => void; className?: string }) {
  const parts: React.ReactNode[] = [];
  const re = /(\s+)/g;
  let last = 0;
  let wordI = 0;
  const segments = value.split(re); // alternating word/whitespace
  segments.forEach((seg, i) => {
    if (/^\s+$/.test(seg) || seg === "") {
      parts.push(<span key={`s${i}`}>{seg}</span>);
    } else {
      const idx = baseIndex + wordI;
      const active = activeIndex === idx;
      parts.push(
        <span
          key={`w${i}`}
          data-w={idx}
          onClick={() => onWordClick?.(idx)}
          className={`cursor-pointer rounded px-0.5 transition-colors ${active ? "bg-primary text-primary-foreground" : "hover:bg-primary/15"}`}
        >
          {seg}
        </span>
      );
      wordI++;
    }
  });
  return <span className={className}>{parts}</span>;
}

/** Count words in a string (whitespace-separated). */
export function countWords(s: string): number {
  return (s.match(/\S+/g) || []).length;
}

/** Concatenate all readable text in a block to a string (matches blocksToReadable order). */
export function blockToText(b: any): string {
  if (!b) return "";
  if (b.type === "text") return b.value || "";
  if (b.type === "highlight") return "Key point. " + (b.value || "");
  if (b.type === "list") {
    const head = b.title ? b.title + "." : "";
    const items = (b.items || []).map((it: string, i: number) => `${i + 1}. ${it}`).join(". ");
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
  return "";
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
    const titleWords = b.title ? countWords(b.title + ".") : 0;
    return (
      <div className="glass rounded-2xl p-6">
        {b.title && (
          <div className="font-display font-bold text-lg mb-4">
            <HighlightedText value={b.title + "."} baseIndex={off} activeIndex={activeWordIndex} onWordClick={onWordClick} />
          </div>
        )}
        <ul className="space-y-2">
          {(b.items || []).map((it: string, j: number) => {
            const txt = `${j + 1}. ${it}`;
            const base = off + titleWords + b.items.slice(0, j).reduce((acc: number, s: string, k: number) => acc + countWords(`${k + 1}. ${s}`), 0);
            return (
              <li key={j} className="flex gap-3">
                <span className="h-6 w-6 rounded-full bg-primary/20 text-primary grid place-items-center text-xs font-mono mt-0.5">{j + 1}</span>
                <span><HighlightedText value={it} baseIndex={base + 1 /* skip "j." */} activeIndex={activeWordIndex} onWordClick={onWordClick} /></span>
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

  return null;
}
