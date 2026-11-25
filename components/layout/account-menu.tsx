"use client";

import { LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function AccountMenu() {
  const { email, logout, loggingOut } = useAuth();
  return <div className="account-menu"><span className="account-menu__avatar">{email?.slice(0, 1).toUpperCase() ?? "A"}</span><span className="account-menu__copy"><strong>Admin</strong><small title={email ?? ""}>{email ?? "Sesi aktif"}</small></span><button onClick={logout} disabled={loggingOut} aria-label="Keluar"><LogOut size={18} /></button></div>;
}
