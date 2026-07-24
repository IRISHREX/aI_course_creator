import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { backendApi } from "@/integrations/api/client";

interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: "bearer";
  user: AuthUser;
}

interface AuthCtx {
  user: AuthUser | null;
  session: AuthSession | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ user: null, session: null, loading: true, signOut: async () => {} });

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = backendApi.auth.onAuthStateChange((_e, s) => setSession(s));
    backendApi.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <Ctx.Provider value={{
      user: session?.user ?? null,
      session,
      loading,
      signOut: async () => { await backendApi.auth.signOut(); },
    }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);
