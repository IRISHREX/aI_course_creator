import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Users, BookOpen, FileQuestion, Upload, Shield, Bookmark, KeyRound, Activity, Trash2, Save, RotateCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type AiKeyState = {
  id: string;
  provider: string;
  keyPreview: string | null;
  status: string;
  lastError: string | null;
  updatedAt: string;
} | null;

type ProviderType = "google" | "openai" | "groq";

const PROVIDERS: { value: ProviderType; label: string; helpUrl?: string }[] = [
  { value: "google", label: "Google Gemini", helpUrl: "https://aistudio.google.com/api-keys" },
  { value: "openai", label: "OpenAI", helpUrl: "https://platform.openai.com/api-keys" },
  { value: "groq", label: "Groq", helpUrl: "https://console.groq.com" },
];

export default function AdminDashboard() {
  const { isAdmin, isSuperAdmin, loading } = useIsAdmin();
  const nav = useNavigate();
  const [stats, setStats] = useState({ users: 0, courses: 0, topics: 0, pyqs: 0 });
  const [aiKey, setAiKey] = useState<AiKeyState>(null);
  const [aiKeys, setAiKeys] = useState<AiKeyState[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<ProviderType>("google");
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
      setStats({
        users: u.count || 0, courses: c.count || 0, topics: t.count || 0, pyqs: p.count || 0,
      });
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

  const saveKey = async () => {
    if (!apiKey.trim()) {
      toast.error(`Paste a ${PROVIDERS.find(p => p.value === selectedProvider)?.label} API key first`);
      return;
    }
    setKeyBusy(true);
    try {
      const data = await supabase.aiKeys.save(apiKey.trim(), selectedProvider);
      setAiKey(data.key);
      setApiKey("");
      await refreshAiKey();
      toast.success(`${PROVIDERS.find(p => p.value === selectedProvider)?.label} API key added`);
      await checkKey();
    } catch (e: any) {
      toast.error(e.message || "Could not save API key");
    } finally {
      setKeyBusy(false);
    }
  };

  const checkKey = async () => {
    setChecking(true);
    try {
      const data = await supabase.aiKeys.check();
      await refreshAiKey();
      if (data.check?.ok) toast.success(`${data.check.provider.toUpperCase()} key is active`);
      else toast.error(data.check?.message || "API key check failed");
    } catch (e: any) {
      toast.error(e.message || "API key check failed");
    } finally {
      setChecking(false);
    }
  };

  const deleteKey = async (id?: string) => {
    setKeyBusy(true);
    try {
      await supabase.aiKeys.remove(id);
      await refreshAiKey();
      setApiKey("");
      toast.success(id ? "API key deleted" : "All API keys deleted");
    } catch (e: any) {
      toast.error(e.message || "Could not delete API key");
    } finally {
      setKeyBusy(false);
    }
  };

  if (loading) return <div className="container py-20 text-muted-foreground">Loading…</div>;
  if (!isAdmin) return null;

  const cards = [
    { label: "Users", value: stats.users, icon: Users },
    { label: "Courses", value: stats.courses, icon: BookOpen },
    { label: "Lessons", value: stats.topics, icon: BookOpen },
    { label: "PYQs", value: stats.pyqs, icon: FileQuestion },
  ];

  return (
    <div className="container max-w-6xl py-10">
      <div className="flex items-start justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" /> Admin Dashboard
          </h1>
          <p className="text-muted-foreground text-sm">
            {isSuperAdmin ? "Super admin — full control" : "Admin — content & PYQ management"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {cards.map(c => (
          <div key={c.label} className="glass rounded-2xl p-5">
            <c.icon className="h-5 w-5 text-primary mb-2" />
            <div className="text-3xl font-display font-bold">{c.value}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="glass rounded-2xl p-5 mb-8">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <div className="font-display font-bold flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              AI API Keys
            </div>
            <div className="text-xs text-muted-foreground">
              Add API keys for Gemini, OpenAI, or Groq. Saved keys are tried in order; if one fails, generation switches to the next active key.
            </div>
          </div>
          <Badge
            variant={aiKey?.status === "active" ? "default" : aiKey ? "destructive" : "outline"}
            className="capitalize"
          >
            {aiKeys.length ? `${aiKeys.filter((key) => key.status === "active").length}/${aiKeys.length} active` : "not set"}
          </Badge>
        </div>

        {aiKeys.length > 0 && (
          <div className="mb-4 space-y-4">
            {PROVIDERS.map((provider) => {
              const providerKeys = aiKeys.filter(k => k.provider === provider.value);
              if (!providerKeys.length) return null;
              return (
                <div key={provider.value}>
                  <div className="text-sm font-semibold text-muted-foreground mb-2">{provider.label}</div>
                  <div className="space-y-2">
                    {providerKeys.map((key, index) => (
                      <div key={key.id} className="grid gap-2 rounded-lg border border-border/60 p-3 text-sm md:grid-cols-[auto_1fr_auto_auto_auto] md:items-center">
                        <Badge variant={key.status === "active" ? "default" : "destructive"} className="capitalize">
                          {key.status}
                        </Badge>
                        <div>
                          <div className="font-mono">{index + 1}. {key.keyPreview || "saved"}</div>
                          {key.lastError && <div className="text-xs text-destructive mt-1">{key.lastError}</div>}
                        </div>
                        <div className="text-xs text-muted-foreground">{key.updatedAt ? new Date(key.updatedAt).toLocaleString() : "Unknown"}</div>
                        <Button onClick={() => deleteKey(key.id)} variant="ghost" size="sm" disabled={keyBusy || checking} className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-[auto_1fr_auto_auto_auto_auto] md:items-end">
          <div>
            <Label htmlFor="provider">Provider</Label>
            <Select value={selectedProvider} onValueChange={(v) => setSelectedProvider(v as ProviderType)}>
              <SelectTrigger id="provider" className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="api-key">Add key</Label>
            <Input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={`Paste ${PROVIDERS.find(p => p.value === selectedProvider)?.label} API key`}
              autoComplete="off"
              className="mt-2"
            />
            <div className="mt-2 text-xs text-muted-foreground">
              Need a key? <a href={PROVIDERS.find(p => p.value === selectedProvider)?.helpUrl} target="_blank" rel="noreferrer" className="text-primary underline">Generate one here</a>.
            </div>
          </div>
          <Button onClick={saveKey} disabled={keyBusy || checking} className="md:mb-0">
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

      <div className="grid md:grid-cols-2 gap-3">
        <Link to="/admin/upload" className="glass rounded-2xl p-5 hover:bg-primary/5 transition">
          <Upload className="h-5 w-5 text-primary mb-2" />
          <div className="font-display font-bold">Upload course material</div>
          <div className="text-xs text-muted-foreground">Generate courses from PDFs / docs / text</div>
        </Link>
        <Link to="/admin/pyq-upload" className="glass rounded-2xl p-5 hover:bg-primary/5 transition">
          <FileQuestion className="h-5 w-5 text-primary mb-2" />
          <div className="font-display font-bold">Generate PYQs from doc / image</div>
          <div className="text-xs text-muted-foreground">Upload PDF / image, AI extracts &amp; tags lessons</div>
        </Link>
        <Link to="/courses" className="glass rounded-2xl p-5 hover:bg-primary/5 transition">
          <BookOpen className="h-5 w-5 text-primary mb-2" />
          <div className="font-display font-bold">Manage courses</div>
          <div className="text-xs text-muted-foreground">Edit lessons, tags, content blocks</div>
        </Link>
        <Link to="/bookmarks" className="glass rounded-2xl p-5 hover:bg-primary/5 transition">
          <Bookmark className="h-5 w-5 text-primary mb-2" />
          <div className="font-display font-bold">My bookmarks</div>
          <div className="text-xs text-muted-foreground">Resume your reading</div>
        </Link>
        {isSuperAdmin && (
          <Link to="/admin/users" className="glass rounded-2xl p-5 hover:bg-primary/5 transition border border-primary/30">
            <Users className="h-5 w-5 text-primary mb-2" />
            <div className="font-display font-bold">User management</div>
            <div className="text-xs text-muted-foreground">Promote / demote admins, view all users</div>
          </Link>
        )}
      </div>
    </div>
  );
}
