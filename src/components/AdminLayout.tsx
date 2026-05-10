import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Bookmark,
  BookOpen,
  FileQuestion,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
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
  const [open, setOpen] = useState(() => localStorage.getItem("admin.sidebar.open") !== "false");
  const [aiKeys, setAiKeys] = useState<AiKeyState[]>([]);

  useEffect(() => {
    if (!loading && !isAdmin) nav("/");
  }, [isAdmin, loading, nav]);

  useEffect(() => {
    localStorage.setItem("admin.sidebar.open", String(open));
  }, [open]);

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
    ...(isSuperAdmin ? [{ label: "Users", icon: Users, to: "/admin/users" }] : []),
  ];

  return (
    <div className={cn("relative min-h-[calc(100vh-4rem)] transition-[padding] duration-300", open ? "lg:pl-80" : "lg:pl-24")}>
      <Button
        type="button"
        variant="hero"
        size="icon"
        onClick={() => setOpen((value) => !value)}
        className="fixed left-4 top-24 z-40 h-10 w-10 shadow-glow lg:hidden"
        aria-label="Toggle admin console"
      >
        <Menu className="h-4 w-4" />
      </Button>

      <aside
        className={cn(
          "fixed left-4 top-24 z-30 rounded-lg border border-border bg-card/90 p-3 shadow-elevated backdrop-blur-xl transition-all duration-300",
          "max-h-[calc(100vh-7rem)] overflow-y-auto",
          open ? "w-[280px] translate-x-0" : "w-[64px] -translate-x-[84px] lg:translate-x-0",
        )}
      >
        <div className={cn("flex items-center gap-3", open ? "px-3 py-3" : "justify-center py-2")}>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Shield className="h-5 w-5" />
          </div>
          {open && (
            <div className="min-w-0">
              <div className="truncate font-display font-bold">Admin Console</div>
              <div className="text-xs text-muted-foreground">{isSuperAdmin ? "Super admin" : "Content admin"}</div>
            </div>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("ml-auto hidden h-8 w-8 lg:inline-flex", !open && "ml-0")}
            onClick={() => setOpen((value) => !value)}
            aria-label="Collapse admin console"
          >
            {open ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </Button>
        </div>

        <nav className="mt-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              title={!open ? item.label : undefined}
              className={({ isActive }) => cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                open ? "" : "justify-center px-0",
                isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {open && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {open && (
          <div className="mt-4 rounded-md border border-border/70 p-3 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
              <Settings className="h-3.5 w-3.5 text-primary" />
              System status
            </div>
            {aiKeys.length ? `${aiKeys.filter((key) => key?.status === "active").length}/${aiKeys.length} AI keys active` : "AI key not configured"}
          </div>
        )}
      </aside>

      <section className="min-w-0 px-4 py-8 lg:px-8">
        <Outlet />
      </section>
    </div>
  );
}
