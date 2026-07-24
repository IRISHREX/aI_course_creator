import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { backendApi } from "@/integrations/api/client";
import { toast } from "sonner";
import {
  Type, Lightbulb, List as ListIcon, GitBranch, Plus, Trash2, ChevronUp, ChevronDown, X,
  Table as TableIcon, Workflow, BarChart3, Image as ImageIcon, Upload, Sparkles, Loader2,
  Sigma, Code2, Settings2,
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

const TYPE_META_BY_ID = new Map(TYPE_META.map((meta) => [meta.id, meta]));
const EXPLAINABLE_TYPES = new Set<Block["type"]>(["flowchart", "chart", "math", "code"]);
const DEFAULT_EXPLANATION_PROMPT = "Explain this in simple, human language for a learner. Focus on what each part means, why it matters, and the key takeaway. Keep it concise but clear.";
const EXPLANATION_PROMPT_KEY = "lesson_block_explanation_prompt";

const asString = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const asStringArray = (value: unknown) => Array.isArray(value) ? value.map((item) => asString(item)) : [""];

function normalizeMathValue(value: unknown, caption: unknown = "") {
  const raw = asString(value).trim();
  const rawCaption = asString(caption).trim();
  if (!raw) return { value: "", caption: rawCaption };

  const patterns = [
    /\$\$([\s\S]+?)\$\$/,
    /\$([^$\n]+?)\$/,
    /\\\[([\s\S]+?)\\\]/,
    /\\\(([\s\S]+?)\\\)/,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match) continue;
    const equation = match[1].trim();
    const prose = raw.replace(match[0], " ").replace(/\s+/g, " ").trim();
    return { value: equation, caption: [prose, rawCaption].filter(Boolean).join(" ") };
  }

  const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1) {
    const score = (line: string) => (line.match(/[\\^_=+\-*/]|\\begin|\\frac|\\sum|\\int|\\sqrt/g) || []).length;
    const equationIndex = lines.reduce((best, line, index) => score(line) > score(lines[best]) ? index : best, 0);
    if (score(lines[equationIndex]) > 0) {
      return {
        value: lines[equationIndex].replace(/^\$\$?|\$\$?$/g, "").trim(),
        caption: [...lines.slice(0, equationIndex), ...lines.slice(equationIndex + 1), rawCaption].filter(Boolean).join(" "),
      };
    }
  }

  return { value: raw.replace(/^\$\$?|\$\$?$/g, "").trim(), caption: rawCaption };
}

function blockToEditableBlock(block: unknown): Block {
  if (!block || typeof block !== "object") {
    return { type: "text", value: typeof block === "undefined" ? "" : String(block) };
  }

  const maybeBlock = block as Record<string, unknown>;
  switch (maybeBlock.type) {
    case "text":
      return { type: "text", value: asString(maybeBlock.value) };
    case "highlight":
      return { type: "highlight", value: asString(maybeBlock.value) };
    case "list":
      return { type: "list", title: asString(maybeBlock.title), items: asStringArray(maybeBlock.items) };
    case "timeline":
      return {
        type: "timeline",
        items: Array.isArray(maybeBlock.items)
          ? maybeBlock.items.map((item) => ({
              label: asString((item as Record<string, unknown>)?.label),
              desc: asString((item as Record<string, unknown>)?.desc),
            }))
          : [{ label: "", desc: "" }],
      };
    case "table":
      return {
        type: "table",
        title: asString(maybeBlock.title),
        headers: asStringArray(maybeBlock.headers),
        rows: Array.isArray(maybeBlock.rows)
          ? maybeBlock.rows.map((row) => asStringArray(row))
          : [[""]],
      };
    case "flowchart":
      return { type: "flowchart", title: asString(maybeBlock.title), code: asString(maybeBlock.code, "graph TD\n  A[Start] --> B[Process]\n  B --> C[End]") };
    case "chart":
      return {
        type: "chart",
        title: asString(maybeBlock.title),
        variant: maybeBlock.variant === "line" || maybeBlock.variant === "pie" ? maybeBlock.variant : "bar",
        data: Array.isArray(maybeBlock.data)
          ? maybeBlock.data.map((item) => ({
              name: asString((item as Record<string, unknown>)?.name),
              value: Number((item as Record<string, unknown>)?.value) || 0,
            }))
          : [{ name: "", value: 0 }],
      };
    case "image":
      return { type: "image", url: asString(maybeBlock.url), caption: asString(maybeBlock.caption) };
    case "math": {
      const math = normalizeMathValue(maybeBlock.value, maybeBlock.caption);
      return { type: "math", value: math.value, display: maybeBlock.display !== false, caption: math.caption };
    }
    case "code":
      return { type: "code", language: asString(maybeBlock.language, "plaintext"), value: asString(maybeBlock.value), caption: asString(maybeBlock.caption) };
  }

  if (typeof maybeBlock.value === "string") {
    return { type: "text", value: maybeBlock.value };
  }

  return { type: "text", value: JSON.stringify(block, null, 2) };
}

function ImageBlockEditor({ block, update, topicId }: { block: any; update: (b: any) => void; topicId?: string }) {
  const [busy, setBusy] = useState<"upload" | "ai" | null>(null);
  const [prompt, setPrompt] = useState("");

  const onUpload = async (file: File) => {
    setBusy("upload");
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${topicId || "misc"}/${Date.now()}.${ext}`;
      const { error } = await backendApi.storage.from("lesson-images").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: pub } = backendApi.storage.from("lesson-images").getPublicUrl(path);
      update({ ...block, url: pub.publicUrl });
      toast.success("Image uploaded");
    } catch (e: any) { toast.error(e.message || "Upload failed"); }
    finally { setBusy(null); }
  };

  const onGenerate = async () => {
    if (!prompt.trim()) { toast.error("Describe the image"); return; }
    setBusy("ai");
    try {
      const { data, error } = await backendApi.functions.invoke("generate-image", { body: { prompt, topicId } });
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

function blockToExplainableText(block: Block) {
  if (block.type === "flowchart") return [block.title, block.code].filter(Boolean).join("\n");
  if (block.type === "chart") return [block.title, block.variant, JSON.stringify(block.data)].filter(Boolean).join("\n");
  if (block.type === "math") return [block.caption, block.value].filter(Boolean).join("\n");
  if (block.type === "code") return [block.caption, block.language, block.value].filter(Boolean).join("\n");
  return "";
}

export function BlockEditor({ blocks, onChange, topicId }: Props) {
  const safeBlocks = Array.isArray(blocks) ? blocks.map(blockToEditableBlock) : [];
  const [explainingIndex, setExplainingIndex] = useState<number | null>(null);
  const [explanationPrompt, setExplanationPrompt] = useState(() => localStorage.getItem(EXPLANATION_PROMPT_KEY) || DEFAULT_EXPLANATION_PROMPT);
  const update = (i: number, b: Block) => { const next = [...safeBlocks]; next[i] = b; onChange(next); };
  const remove = (i: number) => onChange(safeBlocks.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= safeBlocks.length) return;
    const next = [...safeBlocks]; [next[i], next[j]] = [next[j], next[i]]; onChange(next);
  };
  const add = (type: Block["type"]) => onChange([...safeBlocks, blank[type]()]);
  const saveExplanationPrompt = (value: string) => {
    setExplanationPrompt(value);
    localStorage.setItem(EXPLANATION_PROMPT_KEY, value);
  };

  const explainBlock = async (index: number, block: Block) => {
    if (!EXPLAINABLE_TYPES.has(block.type)) return;
    const source = blockToExplainableText(block);
    if (!source.trim()) {
      toast.error("Add content to this block first");
      return;
    }

    setExplainingIndex(index);
    try {
      const { data, error } = await backendApi.functions.invoke("explain-lesson-block", {
        body: {
          topicId,
          blockType: block.type,
          block,
          prompt: explanationPrompt,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const explanation = String(data?.explanation || "").trim();
      if (!explanation) throw new Error("AI returned an empty explanation");

      const next = [...safeBlocks];
      const explanationBlock: Block = { type: "highlight", value: explanation };
      if (next[index + 1]?.type === "highlight") next[index + 1] = explanationBlock;
      else next.splice(index + 1, 0, explanationBlock);
      onChange(next);
      toast.success("Explanation added next to the block");
    } catch (e: any) {
      toast.error(e.message || "Explanation failed");
    } finally {
      setExplainingIndex(null);
    }
  };

  return (
    <div className="space-y-3">
      {safeBlocks.length === 0 && (
        <div className="glass rounded-xl p-6 text-center text-sm text-muted-foreground">No blocks yet — add one below.</div>
      )}

      {safeBlocks.map((b, i) => {
        const meta = TYPE_META_BY_ID.get(b.type) ?? TYPE_META_BY_ID.get("text")!;
        const Icon = meta.icon;
        return (
          <div key={i} className="glass rounded-xl border border-border/60 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/60">
              <div className="flex items-center gap-2 text-xs font-mono uppercase text-primary">
                <Icon className="h-3.5 w-3.5" /> {meta.label} <span className="text-muted-foreground">#{i + 1}</span>
              </div>
              <div className="flex items-center gap-1">
                {EXPLAINABLE_TYPES.has(b.type) && (
                  <>
                    <Button
                      variant="neon"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => explainBlock(i, b)}
                      disabled={explainingIndex !== null}
                    >
                      {explainingIndex === i ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      <span className="ml-1 hidden sm:inline">Explain</span>
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Explanation prompt settings">
                          <Settings2 className="h-3.5 w-3.5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-80">
                        <div className="mb-2 text-sm font-semibold">AI explanation prompt</div>
                        <Textarea
                          rows={5}
                          value={explanationPrompt}
                          onChange={(e) => saveExplanationPrompt(e.target.value)}
                          className="text-xs"
                        />
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className="text-[10px] text-muted-foreground">Used by every math, code, graph, and flowchart explain button.</p>
                          <Button variant="ghost" size="sm" onClick={() => saveExplanationPrompt(DEFAULT_EXPLANATION_PROMPT)}>Reset</Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0}><ChevronUp className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(i, 1)} disabled={i === safeBlocks.length - 1}><ChevronDown className="h-3.5 w-3.5" /></Button>
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

              {b.type === "math" && (
                <div className="space-y-2">
                  <Textarea
                    rows={3}
                    className="font-mono text-xs"
                    placeholder="LaTeX e.g. \\frac{a}{b} or E = mc^2"
                    value={b.value}
                    onChange={e => update(i, { ...b, value: e.target.value })}
                    onBlur={() => {
                      const math = normalizeMathValue(b.value, b.caption);
                      update(i, { ...b, value: math.value, caption: math.caption });
                    }}
                  />
                  <div className="flex items-center gap-3 text-xs">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={b.display !== false} onChange={e => update(i, { ...b, display: e.target.checked })} />
                      Display (centered) mode
                    </label>
                  </div>
                  <Input placeholder="Caption (optional)" value={b.caption || ""} onChange={e => update(i, { ...b, caption: e.target.value })} />
                  <p className="text-[10px] text-muted-foreground">KaTeX syntax. Use single backslashes in LaTeX commands.</p>
                </div>
              )}

              {b.type === "code" && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Select value={b.language} onValueChange={(v: any) => update(i, { ...b, language: v })}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["javascript","typescript","python","java","c","cpp","csharp","go","rust","ruby","php","sql","bash","html","css","json","yaml","markdown","plaintext"].map(l => (
                          <SelectItem key={l} value={l}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input placeholder="Caption (optional)" value={b.caption || ""} onChange={e => update(i, { ...b, caption: e.target.value })} />
                  </div>
                  <Textarea rows={8} className="font-mono text-xs" value={b.value} onChange={e => update(i, { ...b, value: e.target.value })} />
                </div>
              )}

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
