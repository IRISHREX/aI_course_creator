import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Volume2, Pause, Play, Square, Settings2, Headphones } from "lucide-react";

interface Props {
  /** Plain text to read aloud (already concatenated from blocks). */
  text: string;
}

const PREFS_KEY = "signal-tts-prefs";

interface Prefs { voiceURI?: string; rate: number; pitch: number }

const loadPrefs = (): Prefs => {
  if (typeof window === "undefined") return { rate: 1, pitch: 1 };
  try { return { rate: 1, pitch: 1, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") }; }
  catch { return { rate: 1, pitch: 1 }; }
};

export function ReadMode({ text }: Props) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  }, [prefs]);

  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const start = () => {
    if (!supported || !text.trim()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = voices.find((x) => x.voiceURI === prefs.voiceURI);
    if (v) u.voice = v;
    u.rate = prefs.rate;
    u.pitch = prefs.pitch;
    u.onend = () => setState("idle");
    u.onerror = () => setState("idle");
    utterRef.current = u;
    window.speechSynthesis.speak(u);
    setState("playing");
  };

  const togglePause = () => {
    if (!supported) return;
    if (state === "playing") { window.speechSynthesis.pause(); setState("paused"); }
    else if (state === "paused") { window.speechSynthesis.resume(); setState("playing"); }
  };

  const stop = () => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setState("idle");
  };

  if (!supported) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Headphones className="h-3.5 w-3.5" /> Read mode not supported in this browser
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {state === "idle" ? (
        <Button variant="neon" size="sm" onClick={start} title="Read aloud">
          <Volume2 className="h-4 w-4 mr-1" /> Read
        </Button>
      ) : (
        <>
          <Button variant="neon" size="sm" onClick={togglePause}>
            {state === "playing" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={stop}>
            <Square className="h-4 w-4" />
          </Button>
        </>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" title="Voice settings">
            <Settings2 className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="end">
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Voice</Label>
              <Select
                value={prefs.voiceURI || ""}
                onValueChange={(v) => setPrefs({ ...prefs, voiceURI: v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="System default" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {voices.map((v) => (
                    <SelectItem key={v.voiceURI} value={v.voiceURI}>
                      {v.name} <span className="text-muted-foreground">({v.lang})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs flex justify-between">
                <span>Speed</span>
                <span className="font-mono text-primary">{prefs.rate.toFixed(2)}x</span>
              </Label>
              <Slider
                min={0.5} max={2} step={0.05}
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
                min={0.5} max={2} step={0.05}
                value={[prefs.pitch]}
                onValueChange={(v) => setPrefs({ ...prefs, pitch: v[0] })}
                className="mt-2"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Settings are saved to this browser.
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Convert lesson blocks into plain text for narration. */
export function blocksToReadable(title: string, summary: string, blocks: any[]): string {
  const parts: string[] = [title, summary];
  for (const b of blocks || []) {
    if (!b) continue;
    if (b.type === "text") parts.push(b.value);
    else if (b.type === "highlight") parts.push("Key point. " + b.value);
    else if (b.type === "list") {
      if (b.title) parts.push(b.title + ".");
      (b.items || []).forEach((it: string, i: number) => parts.push(`${i + 1}. ${it}`));
    } else if (b.type === "timeline") {
      (b.items || []).forEach((it: any) => parts.push(`${it.label}: ${it.desc}`));
    }
  }
  return parts.filter(Boolean).join(". ").replace(/\.\.+/g, ".");
}
