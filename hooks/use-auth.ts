"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { ROUTES } from "@/constants/routes";
import { createClient } from "@/lib/supabase/client";
import { emptySplitApi } from "@/redux/api";
import { store } from "@/redux/store";
import type { ApiClientError } from "@/type/api";
import { normalizeApiError } from "@/utils/api-error";

export function useAuth() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then((result: { data: { user: { email?: string } | null } }) => setEmail(result.data.user?.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => setEmail(session?.user.email ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  async function logout() {
    setLoggingOut(true);
    await createClient().auth.signOut();
    store.dispatch(emptySplitApi.util.resetApiState());
    router.replace(ROUTES.login);
    router.refresh();
  }

  return { email, logout, loggingOut };
}

export function useLogin() {
  const router = useRouter();
  const [error, setError] = useState<ApiClientError | null>(null);
  const [loading, setLoading] = useState(false);

  async function login(email: string, password: string, next: string = ROUTES.payroll) {
    setError(null);
    setLoading(true);
    const { error: authError } = await createClient().auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) {
      const normalized = normalizeApiError({ status: authError.status || 401, data: { message: authError.message, error: { code: authError.code ?? "AUTH_FAILED" }, data: null, meta: null } }, { method: "POST" });
      setError({ ...normalized, title: "Sign-in failed", explanation: "Check your email and password. If access should be available, contact the system administrator." });
      return;
    }
    router.replace(next.startsWith("/") && !next.startsWith("//") ? next : ROUTES.payroll);
    router.refresh();
  }

  return { login, loading, error };
}
