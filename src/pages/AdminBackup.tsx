import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/useAdmin";
import { backendApi } from "@/integrations/api/client";
import { Database, Download, FileCode, FileText, RotateCw } from "lucide-react";
import { toast } from "sonner";

const TOKEN_KEY = "ignouprep.auth.token";

type BackupFormat = "sql" | "json" | "dictionary" | "pdf" | "docs";

const formats: Array<{
  value: BackupFormat;
  title: string;
  detail: string;
  icon: typeof FileText;
}> = [
  { value: "sql", title: "SQL", detail: "Postgres insert script for database restore workflows.", icon: Database },
  { value: "json", title: "JSON", detail: "Complete table arrays for archival and migration tools.", icon: FileCode },
  { value: "dictionary", title: "Dictionary", detail: "Rows grouped by table and keyed by record id.", icon: FileCode },
  { value: "pdf", title: "PDF", detail: "Readable audit snapshot for quick offline review.", icon: FileText },
  { value: "docs", title: "Docs", detail: "Word-compatible document snapshot for sharing.", icon: FileText },
];

function filenameFromDisposition(value: string | null, fallback: string) {
  const match = value?.match(/filename="([^"]+)"/i);
  return match?.[1] || fallback;
}

export default function AdminBackup() {
  const { isAdmin, loading } = useIsAdmin();
  const nav = useNavigate();
  const [stats, setStats] = useState({ users: 0, courses: 0, topics: 0, pyqs: 0 });
  const [busyFormat, setBusyFormat] = useState<BackupFormat | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !isAdmin) nav("/");
  }, [isAdmin, loading, nav]);

  useEffect(() => {
    if (!isAdmin) return;
    backendApi.from("profiles").select("id", { count: "exact", head: true }).then((users) => {
      return Promise.all([
        Promise.resolve(users),
        backendApi.from("courses").select("id", { count: "exact", head: true }),
        backendApi.from("topics").select("id", { count: "exact", head: true }),
        backendApi.from("course_pyq").select("id", { count: "exact", head: true }),
      ]);
    }).then(([users, courses, topics, pyqs]) => {
      setStats({
        users: users.count || 0,
        courses: courses.count || 0,
        topics: topics.count || 0,
        pyqs: pyqs.count || 0,
      });
    }).catch(() => undefined);
  }, [isAdmin]);

  const downloadBackup = async (format: BackupFormat) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      toast.error("Sign in again before exporting data.");
      return;
    }

    setBusyFormat(format);
    try {
      const response = await fetch(`${backendApi.apiUrl}/admin/backup?format=${encodeURIComponent(format)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const message = await response.json().then((data) => data?.error).catch(() => "");
        throw new Error(message || `Backup failed (${response.status})`);
      }

      const blob = await response.blob();
      const filename = filenameFromDisposition(response.headers.get("content-disposition"), `ai_course_creator_backup.${format}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setLastBackup(new Date().toLocaleString());
      toast.success(`${formats.find((item) => item.value === format)?.title || "Data"} backup downloaded`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not download backup");
    } finally {
      setBusyFormat(null);
    }
  };

  if (loading) return <div className="container py-20 text-muted-foreground">Loading...</div>;
  if (!isAdmin) return null;

  const totals = [
    { label: "Users", value: stats.users },
    { label: "Courses", value: stats.courses },
    { label: "Lessons", value: stats.topics },
    { label: "PYQs", value: stats.pyqs },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/70 bg-card/70 p-5">
        <div>
          <div className="text-xs font-mono uppercase tracking-widest text-primary">Data Backup</div>
          <h1 className="mt-2 font-display text-3xl font-bold">Backup settings</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Export platform data for restore, audit, migration, or readable documentation workflows.
          </p>
        </div>
        <Badge variant="outline">{lastBackup ? `Last: ${lastBackup}` : "Ready"}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {totals.map((item) => (
          <div key={item.label} className="rounded-lg border border-border/70 bg-card/70 p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{item.label}</div>
            <div className="mt-2 font-display text-3xl font-bold">{item.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {formats.map((format) => (
          <div key={format.value} className="rounded-lg border border-border/70 bg-card/70 p-4">
            <format.icon className="mb-3 h-5 w-5 text-primary" />
            <div className="font-display text-lg font-bold">{format.title}</div>
            <p className="mt-2 min-h-16 text-xs leading-5 text-muted-foreground">{format.detail}</p>
            <Button
              type="button"
              variant={format.value === "sql" ? "hero" : "outline"}
              className="mt-4 w-full"
              disabled={busyFormat !== null}
              onClick={() => downloadBackup(format.value)}
            >
              {busyFormat === format.value ? <RotateCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export
            </Button>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border/70 bg-card/70 p-5 text-sm text-muted-foreground">
        Backups include course content, lessons, quiz data, PYQs, users, roles, bookmarks, and progress. Password hashes and saved AI keys are intentionally excluded.
      </div>
    </div>
  );
}
