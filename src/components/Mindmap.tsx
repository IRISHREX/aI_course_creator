import { useEffect, useRef } from "react";
import mermaid from "mermaid";

mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose", fontFamily: "inherit" });

interface Node { id: string; label: string; children?: Node[] }

/** Convert tree -> mermaid mindmap syntax */
function toMermaid(root: Node): string {
  const lines: string[] = ["mindmap"];
  const walk = (n: Node, depth: number) => {
    const indent = "  ".repeat(depth + 1);
    const safe = n.label.replace(/[\n\r"]+/g, " ").slice(0, 80);
    lines.push(`${indent}${depth === 0 ? "root((" + safe + "))" : safe}`);
    (n.children || []).forEach(c => walk(c, depth + 1));
  };
  walk(root, 0);
  return lines.join("\n");
}

export function Mindmap({ data }: { data: Node | null | undefined }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data || !ref.current) return;
    const id = "mm-" + Math.random().toString(36).slice(2, 9);
    const code = toMermaid(data);
    mermaid.render(id, code).then(({ svg }) => {
      if (ref.current) ref.current.innerHTML = svg;
    }).catch(err => {
      if (ref.current) ref.current.innerHTML = `<pre class="text-xs text-destructive">${err.message}</pre>`;
    });
  }, [data]);

  if (!data) return null;
  return <div ref={ref} className="mermaid-container w-full overflow-auto" />;
}

/** Generic mermaid renderer for flowcharts */
export function MermaidDiagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!code || !ref.current) return;
    const id = "md-" + Math.random().toString(36).slice(2, 9);
    mermaid.render(id, code).then(({ svg }) => {
      if (ref.current) ref.current.innerHTML = svg;
    }).catch(err => {
      if (ref.current) ref.current.innerHTML = `<pre class="text-xs text-destructive p-3">${err.message}</pre>`;
    });
  }, [code]);
  return <div ref={ref} className="w-full overflow-auto" />;
}
