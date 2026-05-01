import { Link, NavLink, useLocation } from "react-router-dom";
import { Radio, BookOpen, Upload, LogIn, LogOut, Bookmark } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

export const TopNav = () => {
  const { user, signOut } = useAuth();
  const { isAdmin } = useIsAdmin();
  const loc = useLocation();

  const navItems = [
    { to: "/courses", label: "Courses", icon: BookOpen },
    ...(isAdmin ? [{ to: "/admin/upload", label: "Upload", icon: Upload }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 glass border-b border-border/60">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="relative h-9 w-9 rounded-xl bg-gradient-primary grid place-items-center shadow-glow">
            <Radio className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
            <span className="absolute inset-0 rounded-xl border border-primary/40 animate-pulse-glow" />
          </div>
          <div>
            <div className="font-display font-bold text-lg leading-none">Signal</div>
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase">Academy</div>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-all ${
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`
              }
            >
              <it.icon className="h-4 w-4" />
              {it.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          {user ? (
            <>
              <span className="hidden sm:inline text-xs text-muted-foreground font-mono">
                {user.email?.split("@")[0]}{isAdmin && <span className="ml-1 text-primary">· admin</span>}
              </span>
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            loc.pathname !== "/auth" && (
              <Button asChild variant="hero" size="sm">
                <Link to="/auth"><LogIn className="h-4 w-4 mr-1" /> Sign in</Link>
              </Button>
            )
          )}
        </div>
      </div>
      <nav className="md:hidden flex items-center justify-around border-t border-border/60 py-2">
        {navItems.map((it) => (
          <NavLink key={it.to} to={it.to}
            className={({ isActive }) =>
              `flex flex-col items-center text-[10px] gap-0.5 px-2 ${isActive ? "text-primary" : "text-muted-foreground"}`}>
            <it.icon className="h-4 w-4" />
            {it.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
};
