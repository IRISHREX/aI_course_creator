import { useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVoicePrefs, useSpeechVoices } from "@/lib/voicePrefs";
import { cn } from "@/lib/utils";

interface Props {
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  triggerClassName?: string;
  triggerVariant?: "ghost" | "neon" | "outline" | "secondary";
  contentClassName?: string;
  compact?: boolean;
}

export function VoiceSettingsPopover({
  align = "end",
  side = "bottom",
  triggerClassName,
  triggerVariant = "ghost",
  contentClassName,
  compact = false,
}: Props) {
  const [prefs, setPrefs] = useVoicePrefs();
  const voices = useSpeechVoices();
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? voices.filter((v) => v.name.toLowerCase().includes(q) || v.lang.toLowerCase().includes(q))
      : voices;
    const byLang = new Map<string, SpeechSynthesisVoice[]>();
    for (const v of list) {
      const key = v.lang || "other";
      if (!byLang.has(key)) byLang.set(key, []);
      byLang.get(key)!.push(v);
    }
    return Array.from(byLang.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [voices, query]);

  const selectedVoice = voices.find((v) => v.voiceURI === prefs.voiceURI);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={triggerVariant}
          size="icon"
          className={cn(compact ? "h-9 w-9" : "h-10 w-10", triggerClassName)}
          title="Voice settings"
          aria-label="Voice settings"
        >
          <Settings2 className={cn(compact ? "h-4 w-4" : "h-4 w-4")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent side={side} align={align} className={cn("w-80", contentClassName)}>
        <div className="space-y-4">
          <div>
            <Label className="text-xs flex items-center justify-between">
              <span>Voice</span>
              <span className="text-[10px] font-mono text-muted-foreground">{voices.length} available</span>
            </Label>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search voices or language…"
              className="mt-1 h-8 text-xs"
            />
            <Select
              value={prefs.voiceURI || ""}
              onValueChange={(v) => setPrefs({ ...prefs, voiceURI: v })}
            >
              <SelectTrigger className="mt-2 h-9">
                <SelectValue placeholder="System default">
                  {selectedVoice ? (
                    <span className="truncate">
                      {selectedVoice.name}{" "}
                      <span className="text-muted-foreground">({selectedVoice.lang})</span>
                    </span>
                  ) : (
                    "System default"
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {grouped.length === 0 && (
                  <div className="px-2 py-3 text-xs text-muted-foreground">No voices match</div>
                )}
                {grouped.map(([lang, list]) => (
                  <SelectGroup key={lang}>
                    <SelectLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {lang}
                    </SelectLabel>
                    {list.map((v) => (
                      <SelectItem key={v.voiceURI} value={v.voiceURI}>
                        <span className="truncate">
                          {v.name}
                          {v.default && <span className="ml-1 text-[10px] text-primary">· default</span>}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {prefs.voiceURI && (
              <button
                type="button"
                onClick={() => setPrefs({ ...prefs, voiceURI: undefined })}
                className="mt-1 text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                Reset to system default
              </button>
            )}
          </div>
          <div>
            <Label className="text-xs flex justify-between">
              <span>Speed</span>
              <span className="font-mono text-primary">{prefs.rate.toFixed(2)}x</span>
            </Label>
            <Slider
              min={0.5}
              max={2}
              step={0.05}
              value={[prefs.rate]}
              onValueChange={(v) => setPrefs({ ...prefs, rate: v[0] })}
              className="mt-2"
            />
          </div>
          <div>
            <Label className="text-xs flex justify-between">
              <span>Pitch</span>
              <span className="font-mono text-primary">{prefs.pitch.toFixed(2)}</span>
            </Label>
            <Slider
              min={0.5}
              max={2}
              step={0.05}
              value={[prefs.pitch]}
              onValueChange={(v) => setPrefs({ ...prefs, pitch: v[0] })}
              className="mt-2"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Voice, speed and pitch are shared across Read mode and Play mode.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
