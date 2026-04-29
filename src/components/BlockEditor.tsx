import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Type,
  Lightbulb,
  List as ListIcon,
  GitBranch,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  X,
} from "lucide-react";

export type Block =
  | { type: "text"; value: string }
  | { type: "highlight"; value: string }
  | { type: "list"; title?: string; items: string[] }
  | { type: "timeline"; items: { label: string; desc: string }[] };

interface Props {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
}

const blank: Record<Block["type"], () => Block> = {
  text: () => ({ type: "text", value: "" }),
  highlight: () => ({ type: "highlight", value: "" }),
  list: () => ({ type: "list", title: "", items: [""] }),
  timeline: () => ({ type: "timeline", items: [{ label: "", desc: "" }] }),
};

const TYPE_META: { id: Block["type"]; label: string; icon: any }[] = [
  { id: "text", label: "Text", icon: Type },
  { id: "highlight", label: "Highlight", icon: Lightbulb },
  { id: "list", label: "List", icon: ListIcon },
  { id: "timeline", label: "Timeline", icon: GitBranch },
];

export function BlockEditor({ blocks, onChange }: Props) {
  const update = (i: number, b: Block) => {
    const next = [...blocks];
    next[i] = b;
    onChange(next);
  };
  const remove = (i: number) => onChange(blocks.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = (type: Block["type"], at?: number) => {
    const b = blank[type]();
    if (at === undefined) onChange([...blocks, b]);
    else onChange([...blocks.slice(0, at + 1), b, ...blocks.slice(at + 1)]);
  };

  return (
    <div className="space-y-3">
      {blocks.length === 0 && (
        <div className="glass rounded-xl p-6 text-center text-sm text-muted-foreground">
          No blocks yet — add one below.
        </div>
      )}

      {blocks.map((b, i) => {
        const meta = TYPE_META.find((t) => t.id === b.type)!;
        const Icon = meta.icon;
        return (
          <div key={i} className="glass rounded-xl border border-border/60 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/60">
              <div className="flex items-center gap-2 text-xs font-mono uppercase text-primary">
                <Icon className="h-3.5 w-3.5" />
                {meta.label}
                <span className="text-muted-foreground">#{i + 1}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0}>
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(i, 1)} disabled={i === blocks.length - 1}>
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(i)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="p-3">
              {b.type === "text" && (
                <Textarea
                  rows={3}
                  placeholder="Paragraph text…"
                  value={b.value}
                  onChange={(e) => update(i, { ...b, value: e.target.value })}
                />
              )}

              {b.type === "highlight" && (
                <Textarea
                  rows={2}
                  placeholder="Key takeaway / callout…"
                  value={b.value}
                  onChange={(e) => update(i, { ...b, value: e.target.value })}
                />
              )}

              {b.type === "list" && (
                <div className="space-y-2">
                  <Input
                    placeholder="List title (optional)"
                    value={b.title ?? ""}
                    onChange={(e) => update(i, { ...b, title: e.target.value })}
                  />
                  {b.items.map((it, k) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-xs font-mono text-muted-foreground w-5 text-right pt-2">{k + 1}.</span>
                      <Input
                        value={it}
                        placeholder={`Item ${k + 1}`}
                        onChange={(e) => {
                          const items = [...b.items];
                          items[k] = e.target.value;
                          update(i, { ...b, items });
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-destructive"
                        onClick={() => update(i, { ...b, items: b.items.filter((_, x) => x !== k) })}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => update(i, { ...b, items: [...b.items, ""] })}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add item
                  </Button>
                </div>
              )}

              {b.type === "timeline" && (
                <div className="space-y-2">
                  {b.items.map((it, k) => (
                    <div key={k} className="flex gap-2 items-start">
                      <Input
                        className="w-24"
                        placeholder="Label"
                        value={it.label}
                        onChange={(e) => {
                          const items = [...b.items];
                          items[k] = { ...items[k], label: e.target.value };
                          update(i, { ...b, items });
                        }}
                      />
                      <Input
                        className="flex-1"
                        placeholder="Description"
                        value={it.desc}
                        onChange={(e) => {
                          const items = [...b.items];
                          items[k] = { ...items[k], desc: e.target.value };
                          update(i, { ...b, items });
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-destructive"
                        onClick={() => update(i, { ...b, items: b.items.filter((_, x) => x !== k) })}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => update(i, { ...b, items: [...b.items, { label: "", desc: "" }] })}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add step
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div className="glass rounded-xl p-3 border border-dashed border-border">
        <div className="text-xs text-muted-foreground mb-2">Add block:</div>
        <div className="flex flex-wrap gap-2">
          {TYPE_META.map((t) => (
            <Button key={t.id} variant="neon" size="sm" onClick={() => add(t.id)}>
              <t.icon className="h-3.5 w-3.5 mr-1" /> {t.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
