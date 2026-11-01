import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { clearDevice, getMeta, setMeta } from "@/features/offline/db";
import { api, configureAuthHooks, refreshAccessToken, setAccessToken } from "@/lib/api";
import type { TokenOut, User } from "@/types/api";

type Status = "loading" | "authenticated" | "anonymous" | "offline_cached";

interface AuthCtx {
  status: Status;
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  register: (data: RegisterData) => Promise<User>;
  loginDemo: () => Promise<User>;
  logout: (opts?: { clearDevice?: boolean }) => Promise<void>;
  setUser: (u: User) => void;
}

export interface RegisterData {
  full_name: string;
  email: string;
  password: string;
  school: { name: string; udise_code?: string | null; district?: string | null; block?: string | null };
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUserState] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const accept = useCallback((t: TokenOut) => {
    setAccessToken(t.access_token);
    setUserState(t.user);
    setStatus("authenticated");
    // Cached so an offline classroom can still open downloaded lessons.
    void setMeta("user", t.user).catch(() => {});
  }, []);

  useEffect(() => {
    configureAuthHooks({
      onTokens: accept,
      onAuthLost: () => {
        setAccessToken(null);
        setUserState(null);
        setStatus("anonymous");
      },
    });
    (async () => {
      const t = await refreshAccessToken();
      if (t) return;
      if (!navigator.onLine) {
        const cached = await getMeta<User>("user").catch(() => undefined);
        if (cached) {
          setUserState(cached);
          setStatus("offline_cached");
          return;
        }
      }
      setStatus("anonymous");
    })();
  }, [accept]);

  // When connectivity returns, upgrade a cached offline login to a real one.
  useEffect(() => {
    if (status !== "offline_cached") return;
    const on = () => void refreshAccessToken().then((t) => !t && setStatus("anonymous"));
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [status]);

  const value = useMemo<AuthCtx>(
    () => ({
      status,
      user,
      setUser: (u) => setUserState(u),
      login: async (email, password) => {
        const t = await api<TokenOut>("/auth/login", { method: "POST", body: { email, password }, auth: false });
        accept(t);
        return t.user;
      },
      register: async (data) => {
        const t = await api<TokenOut>("/auth/register", { method: "POST", body: data, auth: false });
        accept(t);
        return t.user;
      },
      loginDemo: async () => {
        const t = await api<TokenOut>("/auth/demo", { method: "POST", auth: false });
        accept(t);
        return t.user;
      },
      logout: async (opts) => {
        try {
          await api("/auth/logout", { method: "POST", auth: false });
        } catch {
          /* offline logout still clears local state */
        }
        setAccessToken(null);
        setUserState(null);
        setStatus("anonymous");
        qc.clear();
        if (opts?.clearDevice) await clearDevice(true);
        else await setMeta("user", null).catch(() => {});
      },
    }),
    [status, user, accept, qc],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
