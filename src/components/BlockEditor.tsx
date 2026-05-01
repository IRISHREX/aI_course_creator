import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Type, Lightbulb, List as ListIcon, GitBranch, Plus, Trash2, ChevronUp, ChevronDown, X,
  Table as TableIcon, Workflow, BarChart3, Image as ImageIcon, Upload, Sparkles, Loader2,
  Sigma, Code2,
} from "lucide-react";

export type Block =
  | { type: "text"; value: string }
  | { type: "highlight"; value: string }
  | { type: "list"; title?: string; items: string[] }
  | { type: "timeline"; items: { label: string; desc: string }[] }
  | { type: "table"; title?: string; headers: string[]; rows: string[][] }
  | { type: "flowchart"; title?: string; code: string }
  | { type: "chart"; title?: string; variant: "bar" | "line" | "pie"; data: { name: string; value: number }[] }
  | { type: "image"; url: string; caption?: string }
  | { type: "math"; value: string; display?: boolean; caption?: string }
  | { type: "code"; language: string; value: string; caption?: string };

interface Props { blocks: Block[]; onChange: (blocks: Block[]) => void; courseId?: string; topicId?: string; }

const blank: Record<Block["type"], () => Block> = {
  text: () => ({ type: "text", value: "" }),
  highlight: () => ({ type: "highlight", value: "" }),
  list: () => ({ type: "list", title: "", items: [""] }),
  timeline: () => ({ type: "timeline", items: [{ label: "", desc: "" }] }),
  table: () => ({ type: "table", title: "", headers: ["Column 1", "Column 2"], rows: [["", ""]] }),
  flowchart: () => ({ type: "flowchart", title: "", code: "graph TD\n  A[Start] --> B[Process]\n  B --> C[End]" }),
  chart: () => ({ type: "chart", title: "", variant: "bar", data: [{ name: "A", value: 10 }, { name: "B", value: 20 }] }),
  image: () => ({ type: "image", url: "", caption: "" }),
  math: () => ({ type: "math", value: "E = mc^2", display: true, caption: "" }),
  code: () => ({ type: "code", language: "javascript", value: "// your code here\nconsole.log('hello');", caption: "" }),
};

const TYPE_META: { id: Block["type"]; label: string; icon: any }[] = [
  { id: "text", label: "Text", icon: Type },
  { id: "highlight", label: "Highlight", icon: Lightbulb },
  { id: "list", label: "List", icon: ListIcon },
  { id: "timeline", label: "Timeline", icon: GitBranch },
  { id: "table", label: "Table", icon: TableIcon },
  { id: "flowchart", label: "Flowchart", icon: Workflow },
  { id: "chart", label: "Chart", icon: BarChart3 },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "math", label: "Math", icon: Sigma },
  { id: "code", label: "Code", icon: Code2 },
];

function ImageBlockEditor({ block, update, topicId }: { block: any; update: (b: any) => void; topicId?: string }) {
  const [busy, setBusy] = useState<"upload" | "ai" | null>(null);
  const [prompt, setPrompt] = useState("");

  const onUpload = async (file: File) => {
    setBusy("upload");
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${topicId || "misc"}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("lesson-images").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("lesson-images").getPublicUrl(path);
      update({ ...block, url: pub.publicUrl });
      toast.success("Image uploaded");
    } catch (e: any) { toast.error(e.message || "Upload failed"); }
    finally { setBusy(null); }
  };

  const onGenerate = async () => {
    if (!prompt.trim()) { toast.error("Describe the image"); return; }
    setBusy("ai");
    try {
      const { data, error } = await supabase.functions.invoke("generate-image", { body: { prompt, topicId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      update({ ...block, url: data.url, caption: block.caption || prompt });
      toast.success("Image generated");
    } catch (e: any) { toast.error(e.message || "Generation failed"); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-3">
      {block.url && <img src={block.url} alt={block.caption || ""} className="w-full max-h-72 object-contain rounded-lg border border-border" />}
      <div className="grid sm:grid-cols-2 gap-2">
        <label className="glass rounded-lg p-3 text-center cursor-pointer text-xs hover:border-primary/40">
          <Upload className="h-4 w-4 mx-auto mb-1" /> {busy === "upload" ? "Uploading…" : "Upload image"}
          <input type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])} />
        </label>
        <Input placeholder="Or paste image URL…" value={block.url} onChange={e => update({ ...block, url: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <Input placeholder="AI prompt: e.g. bar chart of GDP per country" value={prompt} onChange={e => setPrompt(e.target.value)} />
        <Button variant="neon" size="sm" disabled={busy === "ai"} onClick={onGenerate}>
          {busy === "ai" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-4 w-4 mr-1" /> Generate</>}
        </Button>
      </div>
      <Input placeholder="Caption (optional)" value={block.caption || ""} onChange={e => update({ ...block, caption: e.target.value })} />
    </div>
  );
}

export function BlockEditor({ blocks, onChange, topicId }: Props) {
  const update = (i: number, b: Block) => { const next = [...blocks]; next[i] = b; onChange(next); };
  const remove = (i: number) => onChange(blocks.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks]; [next[i], next[j]] = [next[j], next[i]]; onChange(next);
  };
  const add = (type: Block["type"]) => onChange([...blocks, blank[type]()]);

  return (
    <div className="space-y-3">
      {blocks.length === 0 && (
        <div className="glass rounded-xl p-6 text-center text-sm text-muted-foreground">No blocks yet — add one below.</div>
      )}

      {blocks.map((b, i) => {
        const meta = TYPE_META.find(t => t.id === b.type)!;
        const Icon = meta.icon;
        return (
          <div key={i} className="glass rounded-xl border border-border/60 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/60">
              <div className="flex items-center gap-2 text-xs font-mono uppercase text-primary">
                <Icon className="h-3.5 w-3.5" /> {meta.label} <span className="text-muted-foreground">#{i + 1}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0}><ChevronUp className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(i, 1)} disabled={i === blocks.length - 1}><ChevronDown className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>

            <div className="p-3">
              {b.type === "text" && <Textarea rows={3} placeholder="Paragraph text…" value={b.value} onChange={e => update(i, { ...b, value: e.target.value })} />}
              {b.type === "highlight" && <Textarea rows={2} placeholder="Key takeaway…" value={b.value} onChange={e => update(i, { ...b, value: e.target.value })} />}

              {b.type === "list" && (
                <div className="space-y-2">
                  <Input placeholder="List title (optional)" value={b.title ?? ""} onChange={e => update(i, { ...b, title: e.target.value })} />
                  {b.items.map((it, k) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-xs font-mono text-muted-foreground w-5 text-right pt-2">{k + 1}.</span>
                      <Input value={it} placeholder={`Item ${k + 1}`} onChange={e => { const items = [...b.items]; items[k] = e.target.value; update(i, { ...b, items }); }} />
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => update(i, { ...b, items: b.items.filter((_, x) => x !== k) })}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => update(i, { ...b, items: [...b.items, ""] })}><Plus className="h-3.5 w-3.5 mr-1" /> Add item</Button>
                </div>
              )}

              {b.type === "timeline" && (
                <div className="space-y-2">
                  {b.items.map((it, k) => (
                    <div key={k} className="flex gap-2 items-start">
                      <Input className="w-24" placeholder="Label" value={it.label} onChange={e => { const items = [...b.items]; items[k] = { ...items[k], label: e.target.value }; update(i, { ...b, items }); }} />
                      <Input className="flex-1" placeholder="Description" value={it.desc} onChange={e => { const items = [...b.items]; items[k] = { ...items[k], desc: e.target.value }; update(i, { ...b, items }); }} />
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => update(i, { ...b, items: b.items.filter((_, x) => x !== k) })}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => update(i, { ...b, items: [...b.items, { label: "", desc: "" }] })}><Plus className="h-3.5 w-3.5 mr-1" /> Add step</Button>
                </div>
              )}

              {b.type === "table" && (
                <div className="space-y-2">
                  <Input placeholder="Table title (optional)" value={b.title ?? ""} onChange={e => update(i, { ...b, title: e.target.value })} />
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead><tr>
                        {b.headers.map((h, k) => (
                          <th key={k} className="p-1">
                            <Input value={h} placeholder={`Col ${k + 1}`} onChange={e => { const headers = [...b.headers]; headers[k] = e.target.value; update(i, { ...b, headers }); }} />
                          </th>
                        ))}
                        <th className="p-1 w-10">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => update(i, { ...b, headers: [...b.headers, `Col ${b.headers.length + 1}`], rows: b.rows.map(r => [...r, ""]) })}><Plus className="h-3.5 w-3.5" /></Button>
                        </th>
                      </tr></thead>
                      <tbody>
                        {b.rows.map((r, ri) => (
                          <tr key={ri}>
                            {r.map((c, ci) => (
                              <td key={ci} className="p-1">
                                <Input value={c} onChange={e => { const rows = b.rows.map(rr => [...rr]); rows[ri][ci] = e.target.value; update(i, { ...b, rows }); }} />
                              </td>
                            ))}
                            <td className="p-1">
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => update(i, { ...b, rows: b.rows.filter((_, x) => x !== ri) })}><X className="h-3.5 w-3.5" /></Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => update(i, { ...b, rows: [...b.rows, b.headers.map(() => "")] })}><Plus className="h-3.5 w-3.5 mr-1" /> Add row</Button>
                </div>
              )}

              {b.type === "flowchart" && (
                <div className="space-y-2">
                  <Input placeholder="Title (optional)" value={b.title ?? ""} onChange={e => update(i, { ...b, title: e.target.value })} />
                  <Textarea rows={6} className="font-mono text-xs" value={b.code} onChange={e => update(i, { ...b, code: e.target.value })} />
                  <p className="text-[10px] text-muted-foreground">Mermaid syntax — e.g. <code>graph TD; A--&gt;B</code></p>
                </div>
              )}

              {b.type === "chart" && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input placeholder="Chart title" value={b.title ?? ""} onChange={e => update(i, { ...b, title: e.target.value })} />
                    <Select value={b.variant} onValueChange={(v: any) => update(i, { ...b, variant: v })}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bar">Bar</SelectItem>
                        <SelectItem value="line">Line</SelectItem>
                        <SelectItem value="pie">Pie</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {b.data.map((d, k) => (
                    <div key={k} className="flex gap-2">
                      <Input placeholder="Label" value={d.name} onChange={e => { const data = [...b.data]; data[k] = { ...d, name: e.target.value }; update(i, { ...b, data }); }} />
                      <Input type="number" placeholder="Value" value={d.value} onChange={e => { const data = [...b.data]; data[k] = { ...d, value: Number(e.target.value) }; update(i, { ...b, data }); }} />
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => update(i, { ...b, data: b.data.filter((_, x) => x !== k) })}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => update(i, { ...b, data: [...b.data, { name: "", value: 0 }] })}><Plus className="h-3.5 w-3.5 mr-1" /> Add point</Button>
                </div>
              )}

              {b.type === "image" && <ImageBlockEditor block={b} update={(nb) => update(i, nb)} topicId={topicId} />}
            </div>
          </div>
        );
      })}

      <div className="glass rounded-xl p-3 border border-dashed border-border">
        <div className="text-xs text-muted-foreground mb-2">Add block:</div>
        <div className="flex flex-wrap gap-2">
          {TYPE_META.map(t => (
            <Button key={t.id} variant="neon" size="sm" onClick={() => add(t.id)}>
              <t.icon className="h-3.5 w-3.5 mr-1" /> {t.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
