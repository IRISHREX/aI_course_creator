import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

  if (loading) return <div className="container py-20 text-muted-foreground">Loading...</div>;
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
    <div className="min-h-screen bg-background">
      <header className="sticky top-28 z-30 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl shadow-sm shadow-slate-950/10 md:top-16 sm:px-5">
        <div className="mx-auto flex max-w-7xl justify-end">
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Admin options"
                    className="h-11 w-11 rounded-xl border border-primary/40 bg-card/90 text-primary shadow-sm shadow-primary/10 hover:bg-primary/10 hover:text-primary"
                  >
                    <Settings className="h-5 w-5" strokeWidth={2.35} />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">Admin options</TooltipContent>
            </Tooltip>

            <PopoverContent
              align="end"
              side="bottom"
              sideOffset={8}
              className="w-[min(25rem,calc(100vw-1rem))] rounded-l-full rounded-r-2xl border-primary/30 bg-card/95 p-3 shadow-xl shadow-primary/10 backdrop-blur-xl"
            >
              <nav
                aria-label="Admin navigation"
                className="grid grid-cols-4 gap-2 rounded-l-full rounded-r-xl border border-primary/20 bg-primary/5 p-3 pl-8"
              >
                {navItems.map((item) => (
                  <Tooltip key={item.label}>
                    <TooltipTrigger asChild>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        aria-label={item.label}
                        className={({ isActive }) => cn(
                          "grid h-11 w-11 place-items-center rounded-xl border border-primary/30 bg-background/90 text-muted-foreground shadow-sm transition hover:bg-primary/10 hover:text-primary",
                          isActive && "border-primary/50 bg-primary/15 text-primary ring-1 ring-primary/25",
                        )}
                      >
                        <item.icon className="h-4 w-4" strokeWidth={2.3} />
                        <span className="sr-only">{item.label}</span>
                      </NavLink>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{item.label}</TooltipContent>
                  </Tooltip>
                ))}
              </nav>
            </PopoverContent>
          </Popover>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
