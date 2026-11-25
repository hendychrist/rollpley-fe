"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, type FormEvent } from "react";
import { Alert } from "@/components/base/alert";
import { BaseInlineError } from "@/components/base/error-state";
import { Button } from "@/components/base/button";
import { Logo } from "@/components/layout/logo";
import { useLogin } from "@/hooks/use-auth";

function LoginForm() {
  const params = useSearchParams();
  const { login, loading, error } = useLogin();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void login(String(data.get("email")), String(data.get("password")), params.get("next") ?? undefined);
  }

  return <main className="login-page"><section className="login-card"><Logo /><div className="login-card__heading"><h1>Selamat datang</h1><p>Masuk untuk mengelola payroll dan master karyawan.</p></div>{params.get("reason") === "session" ? <Alert tone="warning">Sesi Anda berakhir. Silakan masuk kembali.</Alert> : null}{error ? <BaseInlineError error={error} /> : null}<form onSubmit={submit}><label>Email<input name="email" type="email" autoComplete="email" required placeholder="admin@perusahaan.co.id" /></label><label>Kata sandi<input name="password" type="password" autoComplete="current-password" required /></label><Button type="submit" loading={loading}>Masuk</Button></form><p className="login-card__note">Akses admin ditentukan oleh server. Hubungi pengelola sistem jika akun Anda ditolak.</p></section></main>;
}

export default function LoginPage() {
  return <Suspense fallback={<main className="login-page"><section className="login-card"><Logo /><p>Memuat formulir masuk…</p></section></main>}><LoginForm /></Suspense>;
}
