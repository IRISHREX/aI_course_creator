import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_APP_SETTINGS, useAppSettings, type AppSettings, type ThreePositionPreset } from "@/lib/appSettings";
import { Palette, RotateCcw, Save, Settings, Sparkles, User, Wand2 } from "lucide-react";
import { toast } from "sonner";

const positionOptions: { value: ThreePositionPreset; label: string }[] = [
  { value: "left", label: "Left corner" },
  { value: "right", label: "Right corner" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "custom", label: "Custom vector" },
];

export default function AdminSettings() {
  const [settings, setSettings] = useAppSettings();
  const update = (patch: Partial<AppSettings>) => setSettings({
    ...settings,
    ...patch,
    profile: { ...settings.profile, ...(patch.profile || {}) },
    customTheme: { ...settings.customTheme, ...(patch.customTheme || {}) },
    threeD: { ...settings.threeD, ...(patch.threeD || {}), vector: { ...settings.threeD.vector, ...(patch.threeD?.vector || {}) } },
    ai: { ...settings.ai, ...(patch.ai || {}) },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <div className="text-xs font-mono uppercase tracking-widest text-primary">Admin Settings</div>
        <h1 className="mt-2 font-display text-3xl font-bold">Platform settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">Profile, theme, 3D background, and default AI prompt controls.</p>
      </div>

      <Tabs defaultValue="profile" className="glass rounded-lg p-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile"><User className="h-4 w-4 mr-1" /> Profile</TabsTrigger>
          <TabsTrigger value="theme"><Palette className="h-4 w-4 mr-1" /> Theme</TabsTrigger>
          <TabsTrigger value="three"><Settings className="h-4 w-4 mr-1" /> 3D</TabsTrigger>
          <TabsTrigger value="ai"><Wand2 className="h-4 w-4 mr-1" /> AI</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-5 grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Display name</Label><Input value={settings.profile.displayName} onChange={e => update({ profile: { displayName: e.target.value } as any })} /></div>
            <div><Label>Title</Label><Input value={settings.profile.title} onChange={e => update({ profile: { title: e.target.value } as any })} /></div>
          </div>
          <div><Label>Bio / admin note</Label><Textarea rows={4} value={settings.profile.bio} onChange={e => update({ profile: { bio: e.target.value } as any })} /></div>
        </TabsContent>

        <TabsContent value="theme" className="mt-5 space-y-4">
          <label className="flex items-center justify-between rounded-lg border border-border/60 p-3">
            <span><span className="block text-sm font-medium">Enable custom theme maker</span><span className="text-xs text-muted-foreground">Overrides the active theme color tokens.</span></span>
            <Switch checked={settings.customTheme.enabled} onCheckedChange={enabled => update({ customTheme: { enabled } as any })} />
          </label>
          <div className="grid gap-3 sm:grid-cols-5">
            {(["primary", "secondary", "background", "foreground", "card"] as const).map(key => (
              <div key={key}>
                <Label className="capitalize">{key}</Label>
                <Input type="color" value={settings.customTheme[key]} onChange={e => update({ customTheme: { [key]: e.target.value } as any })} className="h-10" />
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="three" className="mt-5 space-y-5">
          <label className="flex items-center justify-between rounded-lg border border-border/60 p-3">
            <span><span className="block text-sm font-medium">Enable 3D background</span><span className="text-xs text-muted-foreground">Turns the global Three.js object on or off.</span></span>
            <Switch checked={settings.threeD.enabled} onCheckedChange={enabled => update({ threeD: { enabled } as any })} />
          </label>
          <div>
            <Label>Speed: {settings.threeD.speed.toFixed(1)}x</Label>
            <Slider min={0.2} max={3} step={0.1} value={[settings.threeD.speed]} onValueChange={([speed]) => update({ threeD: { speed } as any })} />
          </div>
          <div>
            <Label>Opacity: {Math.round(settings.threeD.opacity * 100)}%</Label>
            <Slider min={0.1} max={1} step={0.05} value={[settings.threeD.opacity]} onValueChange={([opacity]) => update({ threeD: { opacity } as any })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-5">
            {positionOptions.map(option => (
              <Button key={option.value} type="button" variant={settings.threeD.position === option.value ? "hero" : "ghost"} onClick={() => update({ threeD: { position: option.value } as any })}>
                {option.label}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["x", "y", "z"] as const).map(axis => (
              <div key={axis}>
                <Label>{axis.toUpperCase()} vector</Label>
                <Input type="number" value={settings.threeD.vector[axis]} onChange={e => update({ threeD: { position: "custom", vector: { [axis]: Number(e.target.value) } } as any })} />
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="ai" className="mt-5 space-y-4">
          <div><Label>AI optimization default</Label><Textarea rows={3} value={settings.ai.optimizationPrompt} onChange={e => update({ ai: { optimizationPrompt: e.target.value } as any })} /></div>
          <div><Label>Course generation prompt addition</Label><Textarea rows={5} value={settings.ai.coursePrompt} onChange={e => update({ ai: { coursePrompt: e.target.value } as any })} /></div>
          <div><Label>Lesson generation prompt addition</Label><Textarea rows={5} value={settings.ai.lessonPrompt} onChange={e => update({ ai: { lessonPrompt: e.target.value } as any })} /></div>
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap gap-2">
        <Button variant="hero" onClick={() => { setSettings(settings); toast.success("Settings saved"); }}><Save className="h-4 w-4 mr-1" /> Save settings</Button>
        <Button variant="neon" onClick={() => { setSettings(DEFAULT_APP_SETTINGS); toast.success("Settings reset"); }}><RotateCcw className="h-4 w-4 mr-1" /> Reset</Button>
        <span className="inline-flex items-center text-xs text-muted-foreground"><Sparkles className="h-3.5 w-3.5 mr-1 text-primary" /> Changes apply instantly in this browser.</span>
      </div>
    </div>
  );
}
