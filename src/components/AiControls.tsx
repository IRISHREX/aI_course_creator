import { useEffect, useState } from "react";
import { Sliders, RotateCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getAiSettings,
  setAiSettings,
  resetAiSettings,
  onAiSettingsChange,
  AI_DEFAULT_SETTINGS,
  type AiSettings,
} from "@/integrations/supabase/client";

const MODELS = [
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite (cheapest, fastest)" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (balanced)" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (best, slower)" },
];

type Override = Partial<AiSettings>;

/** Per-call override popover. Returns the override via `onChange`; pass to `aiOverride` in invoke body. */
export function AiOverridePopover({
  value,
  onChange,
  label = "AI",
}: {
  value: Override;
  onChange: (v: Override) => void;
  label?: string;
}) {
  const defaults = getAiSettings();
  const v = { ...defaults, ...value };
  const dirty = Object.keys(value || {}).length > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1">
          <Sliders className="h-3.5 w-3.5" />
          {label}{dirty ? "*" : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3">
        <div className="text-xs text-muted-foreground">Per-call override (this action only)</div>
        <Field label="Model">
          <select
            value={v.model}
            onChange={(e) => onChange({ ...value, model: e.target.value })}
            className="w-full bg-background border border-input rounded-md h-9 px-2 text-sm"
          >
            {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Max tokens">
            <Input
              type="number" min={64} max={8192}
              value={v.maxTokens}
              onChange={(e) => onChange({ ...value, maxTokens: Number(e.target.value) })}
            />
          </Field>
          <Field label="Temp">
            <Input
              type="number" step={0.1} min={0} max={2}
              value={v.temperature}
              onChange={(e) => onChange({ ...value, temperature: Number(e.target.value) })}
            />
          </Field>
        </div>
        <Field label="Lesson context chars">
          <Input
            type="number" min={500} max={40000} step={500}
            value={v.lessonContextChars}
            onChange={(e) => onChange({ ...value, lessonContextChars: Number(e.target.value) })}
          />
        </Field>
        <div className="flex justify-between pt-1">
          <Button variant="ghost" size="sm" onClick={() => onChange({})}>Clear override</Button>
          <span className="text-[10px] text-muted-foreground self-center">Defaults set in Admin Dashboard</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Global AI defaults card — used in Admin Dashboard. */
export function AiDefaultsCard() {
  const [s, setS] = useState<AiSettings>(getAiSettings());
  useEffect(() => onAiSettingsChange(() => setS(getAiSettings())), []);
  const update = (patch: Partial<AiSettings>) => setS(setAiSettings(patch));

  return (
    <div className="glass rounded-2xl p-5 mb-8">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="font-display font-bold flex items-center gap-2">
            <Sliders className="h-5 w-5 text-primary" />
            AI defaults
          </div>
          <div className="text-xs text-muted-foreground">
            Used by every AI action unless overridden per-call. Aggressive defaults save tokens.
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setS(resetAiSettings())} className="gap-1">
          <RotateCw className="h-3.5 w-3.5" /> Reset to defaults
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Default model">
          <select
            value={s.model}
            onChange={(e) => update({ model: e.target.value })}
            className="w-full bg-background border border-input rounded-md h-9 px-2 text-sm"
          >
            {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
        <Field label="Temperature">
          <Input type="number" step={0.1} min={0} max={2} value={s.temperature}
            onChange={(e) => update({ temperature: Number(e.target.value) })} />
        </Field>
        <Field label="Short-call max tokens (quiz, mindmap, answers)">
          <Input type="number" min={64} max={8192} value={s.maxTokens}
            onChange={(e) => update({ maxTokens: Number(e.target.value) })} />
        </Field>
        <Field label="Lesson max tokens">
          <Input type="number" min={512} max={8192} value={s.lessonMaxTokens}
            onChange={(e) => update({ lessonMaxTokens: Number(e.target.value) })} />
        </Field>
        <Field label="Generic context chars (mindmap, quiz)">
          <Input type="number" min={500} max={20000} step={500} value={s.contextChars}
            onChange={(e) => update({ contextChars: Number(e.target.value) })} />
        </Field>
        <Field label="Lesson source-text chars">
          <Input type="number" min={1000} max={40000} step={500} value={s.lessonContextChars}
            onChange={(e) => update({ lessonContextChars: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="mt-3 text-[11px] text-muted-foreground">
        Defaults: {AI_DEFAULT_SETTINGS.model} • temp {AI_DEFAULT_SETTINGS.temperature} • {AI_DEFAULT_SETTINGS.maxTokens}/{AI_DEFAULT_SETTINGS.lessonMaxTokens} tokens • {AI_DEFAULT_SETTINGS.contextChars}/{AI_DEFAULT_SETTINGS.lessonContextChars} chars
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
