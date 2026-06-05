import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pencil, RotateCcw, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Node { id: string; label: string; info?: string; detail?: string; description?: string; children?: Node[] }

type MermaidApi = typeof import("mermaid").default;
let mermaidPromise: Promise<MermaidApi> | null = null;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((module) => {
      const mermaid = module.default;
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
      return mermaid;
    });
  }
  return mermaidPromise;
}

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

function cleanInfo(node: Node) {
  return String(node.info || node.detail || node.description || "").replace(/\s+/g, " ").trim().slice(0, 150);
}

function sanitizeMermaidFlowchart(code: string): string {
  return code.replace(/\b([A-Za-z][\w-]*)\s*([\[{])([^"{}\[\]\n]+)([\]}])/g, (_match, id, open, label, close) => {
    const safeLabel = String(label).replace(/\s+/g, " ").trim().replace(/"/g, "'");
    return `${id}${open}"${safeLabel}"${close}`;
  });
}

type PositionedNode = {
  node: Node;
  depth: number;
  branchIndex: number;
  x: number;
  y: number;
  parentKey?: string;
  key: string;
  angle: number;
};

const CANVAS = { width: 980, height: 660, cx: 490, cy: 330 };
type SavedPositions = Record<string, { x: number; y: number }>;
type DragState = { key: string; startClientX: number; startClientY: number; startX: number; startY: number } | null;

function polarPoint(angle: number, radius: number, wave = 0) {
  return {
    x: CANVAS.cx + Math.cos(angle) * radius + Math.sin(angle * 3) * wave,
    y: CANVAS.cy + Math.sin(angle) * radius + Math.cos(angle * 2) * wave,
  };
}

function layoutMindmap(root: Node) {
  const positioned: PositionedNode[] = [];
  const branches = root.children || [];
  positioned.push({ node: root, depth: 0, branchIndex: 0, x: CANVAS.cx, y: CANVAS.cy, key: "root", angle: -Math.PI / 2 });

  const addChildren = (node: Node, parent: PositionedNode, depth: number, branchIndex: number, baseAngle: number) => {
    const children = (node.children || []).slice(0, depth === 1 ? 5 : 4);
    if (!children.length || depth > 3) return;
    const spread = depth === 1 ? 0.78 : 0.46;
    const radius = depth === 1 ? 305 : 415;
    children.forEach((child, childIndex) => {
      const offset = children.length === 1 ? 0 : (childIndex / (children.length - 1) - 0.5) * spread;
      const angle = baseAngle + offset;
      const point = polarPoint(angle, radius, depth === 1 ? 18 : 10);
      const key = `${parent.key}-${child.id || child.label}-${childIndex}`;
      const current = { node: child, depth: depth + 1, branchIndex, x: point.x, y: point.y, parentKey: parent.key, key, angle };
      positioned.push(current);
      addChildren(child, current, depth + 1, branchIndex, angle);
    });
  };

  branches.forEach((branch, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(branches.length, 1);
    const point = polarPoint(angle, 175, 16);
    const key = `root-${branch.id || branch.label}-${index}`;
    const current = { node: branch, depth: 1, branchIndex: index, x: point.x, y: point.y, parentKey: "root", key, angle };
    positioned.push(current);
    addChildren(branch, current, 1, index, angle);
  });

  return positioned;
}

function storageKeyForMindmap(root: Node | null | undefined) {
  if (!root) return "mindmap-layout-empty";
  const raw = `${root.id || "root"}:${root.label || ""}:${(root.children || []).map((child) => child.id || child.label).join("|")}`;
  return `mindmap-layout:${encodeURIComponent(raw).slice(0, 220)}`;
}

function readSavedPositions(storageKey: string): SavedPositions {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function nodeSize(depth: number, hasInfo: boolean) {
  const isRoot = depth === 0;
  return {
    width: isRoot ? 190 : depth === 1 ? 160 : 138,
    height: isRoot ? 86 : hasInfo ? 86 : 62,
  };
}

function clampNodePosition(x: number, y: number, width: number, height: number) {
  return {
    x: Math.min(Math.max(x, width / 2 + 10), CANVAS.width - width / 2 - 10),
    y: Math.min(Math.max(y, height / 2 + 10), CANVAS.height - height / 2 - 10),
  };
}

function MindmapNode({
  item,
  isDragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  item: PositionedNode;
  isDragging: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>, item: PositionedNode, width: number, height: number) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>, item: PositionedNode, width: number, height: number) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const { node, depth, branchIndex, x, y } = item;
  const color = BRANCH_COLORS[Math.max(0, branchIndex) % BRANCH_COLORS.length];
  const info = cleanInfo(node);
  const isRoot = depth === 0;
  const { width, height } = nodeSize(depth, Boolean(info));
  return (
    <div
      className={`absolute touch-none select-none rounded-xl border p-3 text-center shadow-sm backdrop-blur-sm transition-transform duration-200 hover:z-20 hover:scale-105 ${isDragging ? "z-30 scale-105 cursor-grabbing" : "cursor-grab"}`}
      onPointerDown={(event) => onPointerDown(event, item, width, height)}
      onPointerMove={(event) => onPointerMove(event, item, width, height)}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        left: x - width / 2,
        top: y - height / 2,
        width,
        minHeight: height,
        background: isRoot ? "hsl(var(--primary))" : depth === 1 ? color.bg : `linear-gradient(135deg, ${color.soft}, hsl(var(--card) / 0.88))`,
        borderColor: isRoot ? "hsl(var(--primary-foreground) / 0.45)" : color.border,
        boxShadow: isDragging
          ? `0 18px 42px ${color.soft}, 0 0 0 2px ${color.border}`
          : isRoot ? "0 0 30px hsl(var(--primary) / 0.35)" : `0 0 ${depth === 1 ? 26 : 14}px ${color.soft}`,
      }}
    >
      {!isRoot && (
        <span
          className="mx-auto mb-1 block h-2 w-8 rounded-full"
          style={{ background: color.border, boxShadow: `0 0 12px ${color.border}` }}
        />
      )}
      <div
        className={`break-words font-display font-semibold leading-tight ${isRoot ? "text-base" : depth === 1 ? "text-sm" : "text-xs"}`}
        style={{ color: isRoot ? "hsl(var(--primary-foreground))" : depth === 1 ? color.text : "hsl(var(--foreground))" }}
      >
        {cleanLabel(node.label)}
      </div>
      {info && (
        <div
          className="mt-1 line-clamp-3 text-[10px] leading-snug"
          style={{ color: isRoot ? "hsl(var(--primary-foreground) / 0.78)" : depth === 1 ? color.text : "hsl(var(--muted-foreground))" }}
        >
          {info}
        </div>
      )}
    </div>
  );
}

export function Mindmap({ data, exportMode = false }: { data: Node | null | undefined; exportMode?: boolean }) {
  const storageKey = useMemo(() => storageKeyForMindmap(data), [data]);
  const basePositioned = useMemo(() => data ? layoutMindmap(data) : [], [data]);
  const [savedPositions, setSavedPositions] = useState<SavedPositions>(() => readSavedPositions(storageKey));
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const dragRef = useRef<DragState>(null);

  useEffect(() => {
    setSavedPositions(readSavedPositions(storageKey));
    setDraggingKey(null);
    dragRef.current = null;
  }, [storageKey]);

  const positioned = useMemo(() => basePositioned.map((item) => {
    const saved = savedPositions[item.key];
    return saved ? { ...item, x: saved.x, y: saved.y } : item;
  }), [basePositioned, savedPositions]);

  const persistPositions = (next: SavedPositions) => {
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>, item: PositionedNode) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { key: item.key, startClientX: event.clientX, startClientY: event.clientY, startX: item.x, startY: item.y };
    setDraggingKey(item.key);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>, item: PositionedNode, width: number, height: number) => {
    const drag = dragRef.current;
    if (!drag || drag.key !== item.key) return;
    const nextPoint = clampNodePosition(drag.startX + event.clientX - drag.startClientX, drag.startY + event.clientY - drag.startClientY, width, height);
    setSavedPositions((current) => {
      const next = { ...current, [item.key]: nextPoint };
      persistPositions(next);
      return next;
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setDraggingKey(null);
  };

  const resetLayout = () => {
    localStorage.removeItem(storageKey);
    setSavedPositions({});
  };

  if (!data) return null;
  const branches = data.children || [];
  const byKey = new Map(positioned.map((item) => [item.key, item]));
  return (
    <div className="w-full overflow-auto rounded-xl border border-border/70 bg-background/35 p-3">
      {branches.length > 0 ? (
        <div className="relative mx-auto min-w-[980px]" style={{ width: CANVAS.width, height: CANVAS.height }}>
          {!exportMode && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 top-2 z-40 h-8 bg-background/70 px-2 text-xs backdrop-blur"
              onClick={resetLayout}
              title="Reset mind map layout"
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset layout
            </Button>
          )}
          <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`} aria-hidden="true">
            {[105, 190, 300, 415].map((radius) => (
              <circle
                key={radius}
                cx={CANVAS.cx}
                cy={CANVAS.cy}
                r={radius}
                fill="none"
                stroke="hsl(var(--border))"
                strokeDasharray="5 8"
                strokeOpacity="0.46"
              />
            ))}
            {branches.map((_branch, index) => {
              const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(branches.length, 1);
              const end = polarPoint(angle, 440);
              return <line key={index} x1={CANVAS.cx} y1={CANVAS.cy} x2={end.x} y2={end.y} stroke="hsl(var(--border))" strokeOpacity="0.28" />;
            })}
            {positioned.filter((item) => item.parentKey).map((item) => {
              const parent = byKey.get(item.parentKey!);
              if (!parent) return null;
              const color = BRANCH_COLORS[item.branchIndex % BRANCH_COLORS.length];
              const midRadius = item.depth === 1 ? 70 : 34;
              const cx1 = parent.x + Math.cos(parent.angle) * midRadius;
              const cy1 = parent.y + Math.sin(parent.angle) * midRadius;
              const cx2 = item.x - Math.cos(item.angle) * midRadius;
              const cy2 = item.y - Math.sin(item.angle) * midRadius;
              return (
                <path
                  key={`${parent.key}-${item.key}`}
                  d={`M ${parent.x} ${parent.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${item.x} ${item.y}`}
                  fill="none"
                  stroke={color.border}
                  strokeWidth={item.depth === 1 ? 3 : 1.7}
                  strokeOpacity={item.depth === 1 ? 0.9 : 0.72}
                />
              );
            })}
          </svg>
          {positioned.map((item) => (
            <MindmapNode
              key={item.key}
              item={item}
              isDragging={draggingKey === item.key}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
          ))}
        </div>
      ) : (
        <div className="text-center text-sm text-muted-foreground">No branches in this mind map yet.</div>
      )}
    </div>
  );
}

/** Generic mermaid renderer for flowcharts */
export function MermaidDiagram({
  code,
  isAdmin = false,
  onRepair,
  onManualFix,
}: {
  code: string;
  isAdmin?: boolean;
  onRepair?: (errorMessage: string) => void | Promise<void>;
  onManualFix?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [repairing, setRepairing] = useState(false);
  useEffect(() => {
    if (!code) return;
    let active = true;
    setError("");
    setSvg("");
    if (ref.current) ref.current.innerHTML = "";
    const id = "md-" + Math.random().toString(36).slice(2, 9);
    const safeCode = sanitizeMermaidFlowchart(code);
    loadMermaid().then(async (mermaid) => {
      const parsed = await mermaid.parse(safeCode, { suppressErrors: true } as any);
      if (parsed === false) throw new Error("Mermaid graph could not parse");
      return mermaid.render(id, safeCode);
    }).then((result) => {
      const nextSvg = result.svg || "";
      const isMermaidError = /Syntax error in text|mermaid version|error-icon|class="error"/i.test(nextSvg);
      if (isMermaidError) throw new Error("Mermaid graph could not render");
      if (active) setSvg(nextSvg);
    }).catch(err => {
      if (active) setError(err?.message || "Mermaid graph could not render");
    });
    return () => { active = false; };
  }, [code]);

  const repair = async () => {
    if (!onRepair) return;
    setRepairing(true);
    try {
      await onRepair(error);
    } finally {
      setRepairing(false);
    }
  };

  if (error) {
    if (!isAdmin) return null;
    return (
      <div className="rounded-xl border border-destructive/35 bg-destructive/5 p-3 text-sm">
        <div className="font-medium text-destructive">Mermaid graph needs repair</div>
        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{error}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="neon" size="sm" onClick={repair} disabled={repairing || !onRepair}>
            {repairing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1 h-3.5 w-3.5" />}
            Reimagine graph
          </Button>
          <Button variant="outline" size="sm" onClick={onManualFix} disabled={!onManualFix}>
            <Pencil className="mr-1 h-3.5 w-3.5" />
            Manual fix
          </Button>
        </div>
      </div>
    );
  }

  return <div ref={ref} className="w-full overflow-auto" dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />;
}
