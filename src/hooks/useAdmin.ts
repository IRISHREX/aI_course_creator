import { useEffect, useState } from "react";
import { backendApi } from "@/integrations/api/client";
import { useAuth } from "./useAuth";

export const useIsAdmin = () => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    if (!user) { setIsAdmin(false); setIsSuperAdmin(false); setLoading(false); return; }
    backendApi.from("user_roles").select("role").eq("user_id", user.id)
      .then(({ data }) => {
        if (!active) return;
        const roles = (data || []).map((r: any) => r.role);
        const sa = roles.includes("super_admin");
        setIsSuperAdmin(sa);
        setIsAdmin(sa || roles.includes("admin"));
        setLoading(false);
      });
    return () => { active = false; };
  }, [user?.id]);
  return { isAdmin, isSuperAdmin, loading };
};
