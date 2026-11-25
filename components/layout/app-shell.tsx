"use client";

import { Banknote, Menu, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/layout/logo";
import { AccountMenu } from "@/components/layout/account-menu";
import { ROUTES } from "@/constants/routes";

const items = [
  { href: ROUTES.payroll, label: "Payroll", icon: Banknote },
  { href: ROUTES.employees, label: "Master Karyawan", icon: Users },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return <div className="app-shell">
    <button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Buka navigasi"><Menu /></button>
    {open ? <button className="sidebar-backdrop" onClick={() => setOpen(false)} aria-label="Tutup navigasi" /> : null}
    <aside className={`sidebar ${open ? "sidebar--open" : ""}`}>
      <div className="sidebar__top"><Logo /><button className="sidebar__close" onClick={() => setOpen(false)} aria-label="Tutup navigasi"><X /></button></div>
      <nav>{items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return <Link key={href} href={href} className={active ? "active" : ""} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}><Icon aria-hidden size={21} />{label}</Link>;
      })}</nav>
      <AccountMenu />
    </aside>
    <main className="main-content">{children}</main>
  </div>;
}
