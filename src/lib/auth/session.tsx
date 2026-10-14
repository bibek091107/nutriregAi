"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api/client";

export interface SessionUser {
  id: string;
  displayName: string;
  email: string | null;
  organizationName: string | null;
  role: string | null;
}

interface SessionValue {
  user: SessionUser | null;
  status: "loading" | "authenticated" | "anonymous";
  signOut: () => void;
}

/**
 * Auth-ready session provider.
 *
 * No demo user is fabricated. When the backend exposes no session endpoint the
 * provider resolves to `anonymous`, and the shell renders a neutral signed-out
 * affordance instead of pretending someone is logged in.
 */
const SessionContext = createContext<SessionValue>({
  user: null,
  status: "loading",
  signOut: () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<SessionValue["status"]>("loading");

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<SessionUser>("/api/v1/auth/session", { signal: controller.signal }).then(
      (session) => {
        setUser(session);
        setStatus("authenticated");
      },
      () => {
        if (process.env.NODE_ENV === "development") {
          apiRequest<SessionUser>("/api/v1/auth/dev-login", {
            method: "POST",
            body: { displayName: "Dev User", email: "dev@nutrireg.local" },
            signal: controller.signal,
          }).then(
            (session) => {
              setUser(session);
              setStatus("authenticated");
            },
            () => {
              setUser(null);
              setStatus("anonymous");
            }
          );
        } else {
          setUser(null);
          setStatus("anonymous");
        }
      },
    );
    return () => controller.abort();
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    setStatus("anonymous");
    if (typeof document !== "undefined") {
      void apiRequest<void>("/api/v1/auth/logout", { method: "POST" }).catch(() => {});
    }
  }, []);

  const value = useMemo(() => ({ user, status, signOut }), [user, status, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

/** Initials for the avatar slot; empty when nobody is signed in. */
export function initialsFor(name: string | null | undefined): string {
  if (!name) return "";
  const parts = name
    .replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
