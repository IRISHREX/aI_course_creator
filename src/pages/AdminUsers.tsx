import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, ShieldCheck, User as UserIcon, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ThreeBackground from "@/components/ThreeBackground";

interface UserRow {
  id: string;
  display_name: string | null;
  created_at: string;
  roles: string[];
}

export default function AdminUsers() {
  const { isSuperAdmin, loading: aLoad } = useIsAdmin();
  const nav = useNavigate();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => { if (!aLoad && !isSuperAdmin) nav("/"); }, [isSuperAdmin, aLoad, nav]);

  const load = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, display_name, created_at").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const byUser = new Map<string, string[]>();
    (roles || []).forEach((r: any) => {
      const arr = byUser.get(r.user_id) || []; arr.push(r.role); byUser.set(r.user_id, arr);
    });
    setRows((profiles || []).map((p: any) => ({
      id: p.id, display_name: p.display_name, created_at: p.created_at, roles: byUser.get(p.id) || ["user"],
    })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  if (aLoad) return <div className="container py-20 text-muted-foreground">Loading…</div>;
  if (!isSuperAdmin) return null;

  const setRole = async (userId: string, role: "admin" | "super_admin", grant: boolean) => {
    setBusyId(userId);
    try {
      if (grant) {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
        if (error && !error.message.includes("duplicate")) throw error;
      } else {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
        if (error) throw error;
      }
      toast.success(`${grant ? "Granted" : "Revoked"} ${role}`);
      load();
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setBusyId(null); }
  };

  const visible = rows.filter(r =>
    !filter || r.display_name?.toLowerCase().includes(filter.toLowerCase()) || r.id.includes(filter)
  );

  return (
    <>
      <ThreeBackground />
      <div className="container max-w-4xl py-10">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" /> User Management
          </h1>
          <p className="text-muted-foreground text-sm">{rows.length} users</p>
        </div>
        <Input placeholder="Search by name or id…" value={filter} onChange={e => setFilter(e.target.value)} className="max-w-xs" />
      </div>

      {loading ? <div className="text-muted-foreground">Loading…</div> : (
        <div className="space-y-2">
          {visible.map(r => {
            const isSA = r.roles.includes("super_admin");
            const isA = r.roles.includes("admin");
            return (
              <div key={r.id} className="glass rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-primary/10 grid place-items-center">
                    {isSA ? <ShieldCheck className="h-5 w-5 text-primary" /> : isA ? <Shield className="h-5 w-5 text-primary" /> : <UserIcon className="h-5 w-5 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.display_name || "—"}</div>
                    <div className="text-xs font-mono text-muted-foreground truncate">{r.id}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {isSA && <span className="text-primary mr-2">super admin</span>}
                      {isA && <span className="mr-2">admin</span>}
                      <span>· joined {new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                    <>
                      <Button size="sm" variant={isA ? "ghost" : "neon"} onClick={() => setRole(r.id, "admin", !isA)}>
                        {isA ? "Revoke admin" : "Make admin"}
                      </Button>
                      <Button size="sm" variant={isSA ? "ghost" : "hero"} onClick={() => setRole(r.id, "super_admin", !isSA)}>
                        {isSA ? "Revoke super" : "Make super admin"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {visible.length === 0 && <div className="text-muted-foreground text-center py-10">No users match.</div>}
        </div>
      )}
    </div>
    </>
  );
}
