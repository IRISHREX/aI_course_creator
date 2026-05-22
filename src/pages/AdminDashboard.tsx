import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Activity,
  ArrowRight,
  Bookmark,
  BookOpen,
  FileQuestion,
  KeyRound,
  RotateCw,
  Save,
  Trash2,
  Upload,
  Users,
} from "lucide-react";

type AiKeyState = {
  id: string;
  provider: string;
  keyPreview: string | null;
  status: string;
  lastError: string | null;
  updatedAt: string;
} | null;

export default function AdminDashboard() {
  const { isAdmin, isSuperAdmin, loading } = useIsAdmin();
  const nav = useNavigate();
  const [stats, setStats] = useState({ users: 0, courses: 0, topics: 0, pyqs: 0 });
  const [aiKey, setAiKey] = useState<AiKeyState>(null);
  const [aiKeys, setAiKeys] = useState<AiKeyState[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin) nav("/");
  }, [isAdmin, loading, nav]);

  useEffect(() => {
    (async () => {
      const [u, c, t, p] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("courses").select("id", { count: "exact", head: true }),
        supabase.from("topics").select("id", { count: "exact", head: true }),
        supabase.from("course_pyq").select("id", { count: "exact", head: true }),
      ]);
      setStats({ users: u.count || 0, courses: c.count || 0, topics: t.count || 0, pyqs: p.count || 0 });
    })();
  }, []);

  const refreshAiKey = async () => {
    const data = await supabase.aiKeys.get();
    setAiKey(data.key);
    setAiKeys(data.keys || (data.key ? [data.key] : []));
  };

  useEffect(() => {
    if (!isAdmin) return;
    refreshAiKey().catch(() => undefined);
  }, [isAdmin]);

  const checkKey = async () => {
    setChecking(true);
    try {
      const data = await supabase.aiKeys.check();
      await refreshAiKey();
      if (data.check?.ok) toast.success("Gemini key is active");
      else toast.error(data.check?.message || "Gemini key check failed");
    } catch (e: any) {
      toast.error(e.message || "Gemini key check failed");
    } finally {
      setChecking(false);
    }
  };

  const saveKey = async () => {
    if (!apiKey.trim()) {
      toast.error("Paste a Gemini API key first");
      return;
    }
    setKeyBusy(true);
    try {
      const data = await supabase.aiKeys.save(apiKey.trim());
      setAiKey(data.key);
      setApiKey("");
      await refreshAiKey();
      toast.success("Gemini API key added");
      await checkKey();
    } catch (e: any) {
      toast.error(e.message || "Could not save API key");
    } finally {
      setKeyBusy(false);
    }
  };

  const deleteKey = async (id?: string) => {
    setKeyBusy(true);
    try {
      await supabase.aiKeys.remove(id);
      await refreshAiKey();
      setApiKey("");
      toast.success(id ? "Gemini API key deleted" : "All Gemini API keys deleted");
    } catch (e: any) {
      toast.error(e.message || "Could not delete API key");
    } finally {
      setKeyBusy(false);
    }
  };

  if (loading) return <div className="container py-20 text-muted-foreground">Loading...</div>;
  if (!isAdmin) return null;

  const cards = [
    { label: "Users", value: stats.users, icon: Users },
    { label: "Courses", value: stats.courses, icon: BookOpen },
    { label: "Lessons", value: stats.topics, icon: BookOpen },
    { label: "PYQs", value: stats.pyqs, icon: FileQuestion },
  ];

  const quickActions = [
    { label: "Upload course material", desc: "Generate courses from PDFs, docs, or text", icon: Upload, to: "/admin/upload" },
    { label: "Generate PYQs", desc: "Extract and tag questions to lessons", icon: FileQuestion, to: "/admin/pyq-upload" },
    { label: "Manage courses", desc: "Edit lessons, tags, and content blocks", icon: BookOpen, to: "/courses" },
    { label: "My bookmarks", desc: "Resume saved reading positions", icon: Bookmark, to: "/bookmarks" },
    ...(isSuperAdmin ? [{ label: "User management", desc: "Promote or demote admins", icon: Users, to: "/admin/users" }] : []),
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/70 bg-card/60 p-5">
            <div>
              <h1 className="font-display text-3xl font-bold">Dashboard</h1>
              <p className="text-sm text-muted-foreground"></p>
            </div>
            <Badge variant={isSuperAdmin ? "default" : "outline"}>{isSuperAdmin ? "Full control" : "Content access"}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {cards.map((card) => (
              <div key={card.label} className="rounded-lg border border-border/70 bg-card/70 p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <card.icon className="h-5 w-5 text-primary" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{card.label}</span>
                </div>
                <div className="text-3xl font-display font-bold">{card.value.toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-border/70 bg-card/70 p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-display font-bold flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-primary" />
                  Gemini API keys
                </div>
                <div className="text-xs text-muted-foreground">Saved keys are tried in order; failed keys rotate to the next active key.</div>
              </div>
              <Badge variant={aiKey?.status === "active" ? "default" : aiKey ? "destructive" : "outline"} className="capitalize">
                {aiKeys.length ? `${aiKeys.filter((key) => key?.status === "active").length}/${aiKeys.length} active` : "not set"}
              </Badge>
            </div>

            {aiKeys.length > 0 && (
              <div className="mb-4 space-y-2">
                {aiKeys.map((key, index) => key && (
                  <div key={key.id} className="grid gap-2 rounded-lg border border-border/60 bg-background/30 p-3 text-sm md:grid-cols-[auto_1fr_auto_auto_auto] md:items-center">
                    <Badge variant={key.status === "active" ? "default" : "destructive"} className="capitalize">{key.status}</Badge>
                    <div>
                      <div className="font-mono">{index + 1}. {key.keyPreview || "saved"}</div>
                      {key.lastError && <div className="text-xs text-destructive mt-1">{key.lastError}</div>}
                    </div>
                    <div className="text-xs text-muted-foreground capitalize">{key.provider}</div>
                    <div className="text-xs text-muted-foreground">{key.updatedAt ? new Date(key.updatedAt).toLocaleString() : "Unknown"}</div>
                    <Button onClick={() => deleteKey(key.id)} variant="ghost" size="sm" disabled={keyBusy || checking} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
              <div>
                <Label htmlFor="gemini-key">Add key</Label>
                <Input
                  id="gemini-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste Gemini API key"
                  autoComplete="off"
                  className="mt-2"
                />
              </div>
              <Button onClick={saveKey} disabled={keyBusy || checking}>
                {keyBusy ? <RotateCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Add
              </Button>
              <Button onClick={checkKey} variant="outline" disabled={!aiKeys.length || keyBusy || checking}>
                {checking ? <RotateCw className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                Check all
              </Button>
              <Button onClick={() => deleteKey()} variant="destructive" disabled={!aiKeys.length || keyBusy || checking}>
                <Trash2 className="h-4 w-4" />
                Delete all
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {quickActions.map((action) => (
              <Link key={action.label} to={action.to} className="group rounded-lg border border-border/70 bg-card/70 p-5 transition hover:border-primary/50 hover:bg-primary/5">
                <action.icon className="mb-2 h-5 w-5 text-primary" />
                <div className="flex items-center justify-between font-display font-bold">
                  {action.label}
                  <ArrowRight className="h-4 w-4 opacity-0 transition group-hover:opacity-100" />
                </div>
                <div className="text-xs text-muted-foreground">{action.desc}</div>
              </Link>
            ))}
          </div>
    </div>
  );
}
