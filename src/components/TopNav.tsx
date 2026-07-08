import { Link, NavLink, useLocation } from "react-router-dom";
import { Radio, BookOpen, LogIn, LogOut, Bookmark, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const TopNav = () => {
  const { user, signOut } = useAuth();
  const { isAdmin, isSuperAdmin } = useIsAdmin();
  const loc = useLocation();

  const navItems = [
    { to: "/courses", label: "Courses", icon: BookOpen },
    ...(user ? [{ to: "/bookmarks", label: "Bookmarks", icon: Bookmark }] : []),
    ...(isAdmin ? [{ to: "/admin", label: "Admin", icon: Shield }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
      <div className="container flex h-16 min-w-0 items-center justify-between gap-3 px-4 sm:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-2 group">
          <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-primary shadow-glow sm:h-10 sm:w-10">
            <Radio className="h-4 w-4 text-primary-foreground sm:h-5 sm:w-5" strokeWidth={2.5} />
            <span className="absolute inset-0 rounded-xl border border-primary/40 animate-pulse-glow" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-base font-bold leading-none sm:text-lg">Signal</div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground sm:text-[10px]">Academy</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((it) => (
            <Tooltip key={it.to}>
              <TooltipTrigger asChild>
                <NavLink
                  to={it.to}
                  aria-label={it.label}
                  className={({ isActive }) =>
                    `grid h-10 w-10 place-items-center rounded-xl transition-all ${
                      isActive ? "bg-primary/15 text-primary shadow-[0_0_22px_hsl(var(--primary)/0.16)]" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                    }`
                  }
                >
                  <it.icon className="h-4 w-4" />
                  <span className="sr-only">{it.label}</span>
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="bottom">{it.label}</TooltipContent>
            </Tooltip>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <ThemeSwitcher />
          {user ? (
            <>
              <span className="hidden sm:inline text-xs text-muted-foreground font-mono">
                {user.email?.split("@")[0]}
                {isSuperAdmin ? <span className="ml-1 text-primary">/ super</span> : isAdmin && <span className="ml-1 text-primary">/ admin</span>}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
                    <LogOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Sign out</TooltipContent>
              </Tooltip>
            </>
          ) : (
            loc.pathname !== "/auth" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="hero" size="icon" aria-label="Sign in">
                    <Link to="/auth"><LogIn className="h-4 w-4" /><span className="sr-only">Sign in</span></Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Sign in</TooltipContent>
              </Tooltip>
            )
          )}
        </div>
      </div>
      <nav className="flex justify-around border-t border-border/60 bg-background/40 px-2 py-2 md:hidden">
        {navItems.map((it) => (
          <NavLink key={it.to} to={it.to}
            className={({ isActive }) =>
              `flex min-h-11 min-w-16 flex-col items-center justify-center gap-1 rounded-md px-2 text-[11px] font-medium ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
            <it.icon className="h-4 w-4" />
            {it.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
};
