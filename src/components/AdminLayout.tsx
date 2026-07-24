import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";
import {
  Bookmark,
  BookOpen,
  DatabaseBackup,
  FileQuestion,
  LayoutDashboard,
  Settings,
  Upload,
  Users,
} from "lucide-react";

export function AdminLayout() {
  const { isAdmin, isSuperAdmin, loading } = useIsAdmin();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && !isAdmin) nav("/");
  }, [isAdmin, loading, nav]);

  if (loading) return <div className="container py-20 text-sm text-muted-foreground">Loading admin workspace...</div>;
  if (!isAdmin) return null;

  const navItems = [
    { label: "Overview", icon: LayoutDashboard, to: "/admin", end: true },
    { label: "Upload material", icon: Upload, to: "/admin/upload" },
    { label: "PYQ upload", icon: FileQuestion, to: "/admin/pyq-upload" },
    { label: "Courses", icon: BookOpen, to: "/courses" },
    { label: "Bookmarks", icon: Bookmark, to: "/bookmarks" },
    { label: "Backups", icon: DatabaseBackup, to: "/admin/backup" },
    ...(isSuperAdmin ? [{ label: "Users", icon: Users, to: "/admin/users" }] : []),
    { label: "Settings", icon: Settings, to: "/admin/settings" },
  ];
  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-[1440px] md:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="border-b border-border/70 bg-card/40 md:border-b-0 md:border-r">
        <div className="px-4 pb-2 pt-5 md:px-5 md:pb-4 md:pt-7">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Workspace</p>
          <h1 className="mt-1 text-lg font-semibold">Administration</h1>
        </div>
        <nav aria-label="Admin navigation" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn(
                "flex min-h-10 shrink-0 items-center gap-2.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                isActive && "bg-primary/10 text-primary",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-6 md:py-8 lg:px-10">
        <div className="mx-auto max-w-6xl"><Outlet /></div>
      </main>
    </div>
  );
}
