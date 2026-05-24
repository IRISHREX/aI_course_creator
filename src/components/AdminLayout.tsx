import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  Bookmark,
  BookOpen,
  DatabaseBackup,
  FileQuestion,
  LayoutDashboard,
  Settings,
  Shield,
  Upload,
  Users,
} from "lucide-react";

type AiKeyState = {
  id: string;
  status: string;
} | null;

export function AdminLayout() {
  const { isAdmin, isSuperAdmin, loading } = useIsAdmin();
  const nav = useNavigate();
  const [aiKeys, setAiKeys] = useState<AiKeyState[]>([]);

  useEffect(() => {
    if (!loading && !isAdmin) nav("/");
  }, [isAdmin, loading, nav]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.aiKeys.get().then((data) => {
      setAiKeys(data.keys || (data.key ? [data.key] : []));
    }).catch(() => undefined);
  }, [isAdmin]);

  if (loading) return <div className="container py-20 text-muted-foreground">Loading...</div>;
  if (!isAdmin) return null;

  const navItems = [
    { label: "Overview", icon: LayoutDashboard, to: "/admin", end: true },
    { label: "Upload material", icon: Upload, to: "/admin/upload" },
    { label: "PYQ upload", icon: FileQuestion, to: "/admin/pyq-upload" },
    { label: "Courses", icon: BookOpen, to: "/courses" },
    { label: "Bookmarks", icon: Bookmark, to: "/bookmarks" },
    { label: "Backups", icon: DatabaseBackup, to: "/admin/backup" },
    { label: "Settings", icon: Settings, to: "/admin/settings" },
    ...(isSuperAdmin ? [{ label: "Users", icon: Users, to: "/admin/users" }] : []),
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-card/95 px-4 py-4 backdrop-blur-xl shadow-sm shadow-slate-900/5 sm:px-6">
        <div className="mx-auto flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6 xl:max-w-7xl">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-3xl bg-primary text-primary-foreground">
              <Shield className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="mt-1 font-display text-l font-bold text-foreground">{isSuperAdmin ? "Super admin" : "Content admin"}</div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground"></p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
            {navItems.map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.end}
                className={({ isActive }) => cn(
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/70 bg-background text-muted-foreground hover:border-primary/80 hover:bg-primary/5 hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>

          <div className="flex items-center gap-3 rounded-3xl border border-border/70 bg-background/90 px-4 py-3 text-sm text-muted-foreground shadow-sm">
            <Settings className="h-4 w-4 text-primary" />
            <span>{aiKeys.length ? `${aiKeys.filter((key) => key?.status === "active").length}/${aiKeys.length} AI keys active` : "AI key not configured"}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
