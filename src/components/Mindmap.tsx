import { useEffect, useRef } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "base",
  securityLevel: "loose",
  fontFamily: "inherit",
  themeVariables: {
    background: "transparent",
    primaryColor: "#67e8f9",
    primaryTextColor: "#06121a",
    primaryBorderColor: "#22d3ee",
    secondaryColor: "#c084fc",
    secondaryTextColor: "#14051f",
    secondaryBorderColor: "#a855f7",
    tertiaryColor: "#86efac",
    tertiaryTextColor: "#04130a",
    tertiaryBorderColor: "#22c55e",
    lineColor: "#94a3b8",
    textColor: "#f8fafc",
  },
});

interface Node { id: string; label: string; children?: Node[] }

const BRANCH_COLORS = [
  { bg: "hsl(186 100% 18% / 0.9)", border: "hsl(186 100% 58%)", text: "hsl(190 35% 96%)", soft: "hsl(186 100% 55% / 0.16)" },
  { bg: "hsl(270 70% 22% / 0.9)", border: "hsl(270 90% 68%)", text: "hsl(270 60% 96%)", soft: "hsl(270 90% 65% / 0.16)" },
  { bg: "hsl(145 58% 19% / 0.9)", border: "hsl(145 80% 55%)", text: "hsl(145 55% 96%)", soft: "hsl(145 80% 55% / 0.15)" },
  { bg: "hsl(38 80% 21% / 0.9)", border: "hsl(45 100% 60%)", text: "hsl(45 70% 96%)", soft: "hsl(45 100% 60% / 0.16)" },
  { bg: "hsl(340 72% 20% / 0.9)", border: "hsl(340 90% 67%)", text: "hsl(340 65% 97%)", soft: "hsl(340 90% 67% / 0.16)" },
  { bg: "hsl(210 78% 21% / 0.9)", border: "hsl(210 95% 63%)", text: "hsl(210 70% 97%)", soft: "hsl(210 95% 63% / 0.16)" },
];

function cleanLabel(value: unknown) {
  return String(value || "Untitled").replace(/\s+/g, " ").trim().slice(0, 120);
}

function sanitizeMermaidFlowchart(code: string): string {
  return code.replace(/\b([A-Za-z][\w-]*)\s*([\[{])([^"{}\[\]\n]+)([\]}])/g, (_match, id, open, label, close) => {
    const safeLabel = String(label).replace(/\s+/g, " ").trim().replace(/"/g, "'");
    return `${id}${open}"${safeLabel}"${close}`;
  });
}

function MindmapNode({ node, depth, branchIndex }: { node: Node; depth: number; branchIndex: number }) {
  const color = BRANCH_COLORS[Math.max(0, branchIndex) % BRANCH_COLORS.length];
  const children = node.children || [];
  const isPrimaryBranch = depth === 1;
  return (
    <div
      className="relative min-w-0 rounded-lg border p-3 shadow-sm"
      style={{
        background: depth <= 1 ? color.bg : `linear-gradient(135deg, ${color.soft}, hsl(var(--card) / 0.76))`,
        borderColor: color.border,
        boxShadow: depth <= 1 ? `0 0 24px ${color.soft}` : undefined,
      }}
    >
      <div className="flex min-w-0 items-start gap-2">
        <span
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: color.border, boxShadow: `0 0 12px ${color.border}` }}
        />
        <div className="min-w-0">
          <div
            className={`break-words font-display font-semibold leading-snug ${isPrimaryBranch ? "text-sm" : "text-xs"}`}
            style={{ color: depth <= 1 ? color.text : "hsl(var(--foreground))" }}
          >
            {cleanLabel(node.label)}
          </div>
        </div>
      </div>
      {children.length > 0 && (
        <div className="mt-3 space-y-2 border-l pl-3" style={{ borderColor: color.border }}>
          {children.map((child, index) => (
            <MindmapNode key={`${child.id || child.label}-${index}`} node={child} depth={depth + 1} branchIndex={branchIndex} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Mindmap({ data }: { data: Node | null | undefined }) {
  if (!data) return null;
  const branches = data.children || [];
  return (
    <div className="w-full overflow-auto rounded-xl border border-border/70 bg-background/35 p-4">
      <div className="mx-auto mb-5 w-fit max-w-full rounded-xl border border-primary/80 bg-primary px-5 py-3 text-center font-display text-base font-bold leading-tight text-primary-foreground shadow-glow">
        {cleanLabel(data.label)}
      </div>
      {branches.length > 0 ? (
        <div className="grid min-w-[720px] gap-3 md:grid-cols-2 xl:grid-cols-3">
          {branches.map((branch, index) => (
            <MindmapNode key={`${branch.id || branch.label}-${index}`} node={branch} depth={1} branchIndex={index} />
          ))}
        </div>
      ) : (
        <div className="text-center text-sm text-muted-foreground">No branches in this mind map yet.</div>
      )}
    </div>
  );
}

/** Generic mermaid renderer for flowcharts */
export function MermaidDiagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!code || !ref.current) return;
    const id = "md-" + Math.random().toString(36).slice(2, 9);
    const safeCode = sanitizeMermaidFlowchart(code);
    mermaid.render(id, safeCode).then(({ svg }) => {
      if (ref.current) ref.current.innerHTML = svg;
    }).catch(err => {
      if (ref.current) ref.current.innerHTML = `<pre class="text-xs text-destructive p-3">${err.message}</pre>`;
    });
  }, [code]);
  return <div ref={ref} className="w-full overflow-auto" />;
}
