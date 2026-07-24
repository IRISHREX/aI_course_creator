import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useCourseBySlug } from "@/hooks/useCourses";
import { DEFAULT_COURSE_SETTINGS, getCourseSettings, setCourseSettings, type CourseSettings as CourseSettingsValue } from "@/lib/appSettings";
import { ArrowLeft, Orbit, RotateCcw, Save, Settings2, Sparkles, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function CourseSettings() {
  const { courseSlug } = useParams();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { course, loading } = useCourseBySlug(courseSlug);
  const [settings, setSettings] = useState<CourseSettingsValue>(DEFAULT_COURSE_SETTINGS);

  useEffect(() => {
    if (course?.id) setSettings(getCourseSettings(course.id));
  }, [course?.id]);

  if (adminLoading || loading) return <div className="container py-20 text-muted-foreground">Loading...</div>;
  if (!isAdmin) return <div className="container py-20 text-muted-foreground">Admins only.</div>;
  if (!course) return <div className="container py-20 text-muted-foreground">Course not found.</div>;

  const save = () => {
    setCourseSettings(course.id, settings);
    toast.success("Course settings saved");
  };

  return (
    <div className="container max-w-4xl py-10">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to={`/course/${course.slug}`}><ArrowLeft className="h-4 w-4 mr-1" /> Back to course</Link>
      </Button>
      <div className="mb-6">
        <div className="text-xs font-mono uppercase tracking-widest text-primary">Course Settings</div>
        <h1 className="mt-2 font-display text-3xl font-bold flex items-center gap-2"><Settings2 className="h-6 w-6 text-primary" /> {course.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Per-course generation, cleanup, and 3D preferences.</p>
      </div>

      <div className="glass rounded-lg p-5 space-y-5">
        <div>
          <Label>Course generation prompt addition</Label>
          <Textarea rows={5} value={settings.generationPrompt} onChange={e => setSettings({ ...settings, generationPrompt: e.target.value })} />
        </div>
        <div>
          <Label>Lesson generation prompt addition</Label>
          <Textarea rows={5} value={settings.lessonPrompt} onChange={e => setSettings({ ...settings, lessonPrompt: e.target.value })} />
        </div>
        <div>
          <Label>Duplicate cleanup prompt addition</Label>
          <Textarea rows={4} value={settings.duplicateCleanupPrompt} onChange={e => setSettings({ ...settings, duplicateCleanupPrompt: e.target.value })} />
        </div>
        <label className="flex items-center justify-between rounded-lg border border-border/60 p-3">
          <span><span className="block text-sm font-medium">Enable 3D for this course</span><span className="text-xs text-muted-foreground">Use this as the course-specific preference for lesson/course pages.</span></span>
          <Switch checked={settings.threeDEnabled} onCheckedChange={threeDEnabled => setSettings({ ...settings, threeDEnabled })} />
        </label>
        <div>
          <Label>Course 3D speed: {settings.threeDSpeed.toFixed(1)}x</Label>
          <Slider min={0.2} max={3} step={0.1} value={[settings.threeDSpeed]} onValueChange={([threeDSpeed]) => setSettings({ ...settings, threeDSpeed })} />
        </div>
        <label className="flex items-center justify-between rounded-lg border border-border/60 p-3">
          <span><span className="block text-sm font-medium">Lesson screen graphics</span><span className="text-xs text-muted-foreground">Show Three.js screensaver-style graphics behind lessons.</span></span>
          <Switch checked={settings.lessonGraphicsEnabled} onCheckedChange={lessonGraphicsEnabled => setSettings({ ...settings, lessonGraphicsEnabled })} />
        </label>
        <div>
          <Label>Lesson graphic style</Label>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {[
              { value: "terrain", label: "Terrain", icon: Sparkles },
              { value: "particles", label: "Particles", icon: Settings2 },
              { value: "orbit", label: "Orbit", icon: Orbit },
            ].map((option) => {
              const Icon = option.icon;
              return (
                <Button
                  key={option.value}
                  type="button"
                  variant={settings.lessonVisualStyle === option.value ? "hero" : "outline"}
                  onClick={() => setSettings({ ...settings, lessonVisualStyle: option.value as any })}
                  className="justify-start gap-2"
                >
                  <Icon className="h-4 w-4" /> {option.label}
                </Button>
              );
            })}
          </div>
        </div>
        <label className="flex items-center justify-between rounded-lg border border-border/60 p-3">
          <span><span className="block text-sm font-medium">Lesson and quiz sounds</span><span className="text-xs text-muted-foreground">Play subtle feedback tones for page turns, answers, and completion.</span></span>
          <Switch checked={settings.lessonSoundsEnabled} onCheckedChange={lessonSoundsEnabled => setSettings({ ...settings, lessonSoundsEnabled })} />
        </label>
        <label className="flex items-center justify-between rounded-lg border border-border/60 p-3">
          <span><span className="block text-sm font-medium">Enhanced quiz screens</span><span className="text-xs text-muted-foreground">Use progress, streak, instant feedback, and review-style quiz UI.</span></span>
          <Switch checked={settings.quizEnhanced} onCheckedChange={quizEnhanced => setSettings({ ...settings, quizEnhanced })} />
        </label>
      </div>

      <div className="mt-5 flex gap-2">
        <Button variant="hero" onClick={save}><Save className="h-4 w-4 mr-1" /> Save course settings</Button>
        <Button variant="neon" onClick={() => setSettings(DEFAULT_COURSE_SETTINGS)}><RotateCcw className="h-4 w-4 mr-1" /> Reset</Button>
      </div>
    </div>
  );
}
