import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import { Users, BookOpen, FileQuestion, Upload, Shield, Bookmark } from "lucide-react";

export default function AdminDashboard() {
  const { isAdmin, isSuperAdmin, loading } = useIsAdmin();
  const nav = useNavigate();
  const [stats, setStats] = useState({ users: 0, courses: 0, topics: 0, pyqs: 0 });

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
