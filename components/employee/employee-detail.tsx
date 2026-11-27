"use client";
import { ArrowLeft, BadgeCheck, LoaderCircle, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";
import { BaseErrorState, BaseInlineError } from "@/components/base/error-state";
import { Button } from "@/components/base/button";
import { Panel } from "@/components/base/panel";
import { Skeleton } from "@/components/base/skeleton";
import { StatusBadge } from "@/components/base/status-badge";
import { EMPLOYMENT_STATUS } from "@/constants/status";
import { useEmployeeDetail } from "@/hooks/use-employee-detail";
import { AccountVisibilityProvider, useAccountVisibilityContext } from "@/components/employee/account-visibility-provider";
import { AccountRevealButton } from "@/components/employee/account-reveal-button";
import type { BankAccount, EmploymentStatus } from "@/type/employee";
import { formatDateTime } from "@/utils/format";

type OperationType = "identity" | "status" | "alias" | "account" | "verify" | "removeAlias";

function AccountList({ accounts, locked, verifyingAccountId, onEdit, onVerify }: {
  accounts: BankAccount[]; locked: boolean; verifyingAccountId: string | null; onEdit: (a: BankAccount) => void; onVerify: (id: string) => void;
}) {
  const visibility = useAccountVisibilityContext();
  if (!accounts.length) return <p className="muted">Belum ada rekening.</p>;
  return (
    <div className="account-list">
      {accounts.map((account) => (
        <div key={account.id}>
          <span>
            <strong>{account.account_holder_name}</strong>
            <small>
              <span className="account-cell__number">
                {visibility.displayNumber(account)}
                <AccountRevealButton account={account} />
              </span> · mulai {account.valid_from.slice(0, 10)}
            </small>
          </span>
          <StatusBadge label={account.verification_status === "verified" ? "Terverifikasi" : "Belum diverifikasi"} tone={account.verification_status === "verified" ? "success" : "warning"} />
          <Button variant="ghost" onClick={() => onEdit(account)}>Koreksi</Button>
          {account.verification_status !== "verified" ? (
            <Button variant="secondary" onClick={() => void onVerify(account.id)} loading={verifyingAccountId === account.id} disabled={locked} loadingLabel="Memverifikasi rekening…">
              <BadgeCheck size={16} />Verifikasi
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function EmployeeDetail({ id, returnTo, setupAccount = false }: { id: string; returnTo?: string; setupAccount?: boolean }) {
  const state = useEmployeeDetail(id); const [showAccount, setShowAccount] = useState(setupAccount); const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  // pendingOperation identifies the one running operation (and its target
  // account/alias) so only that control shows a spinner. operationRef is the
  // synchronous lock that keeps employee-detail mutations mutually exclusive.
  const [pendingOperation, setPendingOperation] = useState<null | { type: OperationType; running: boolean; accountId?: string; aliasId?: string }>(null);
  const operationRef = useRef(false);
  function guardOperation<T>(type: OperationType, fn: () => Promise<T>, target: { accountId?: string; aliasId?: string } = {}) {
    if (operationRef.current) return Promise.reject(new Error("Another action is already in progress."));
    if (state.busy) return Promise.reject(new Error("Another action is already in progress."));
    operationRef.current = true;
    setPendingOperation({ type, running: true, ...target });
    const release = () => { operationRef.current = false; setPendingOperation(null); };
    return fn().then((value) => { release(); return value; }).catch((reason) => { release(); throw reason; });
  }
  if (state.employee.isLoading) return <div className="content-wrap"><Skeleton lines={6} /></div>;
  if (state.employee.isError || !state.employee.data) return <div className="content-wrap"><BaseErrorState error={state.employee.error} onRetry={state.employee.refetch} /></div>;
  const employee = state.employee.data;
  const activeBusy = state.busy;
  // Lock = any employee-detail mutation running; spinner = only the operation actually running.
  const operationLocked = activeBusy || pendingOperation !== null;
  const runningType = pendingOperation?.running ? pendingOperation.type : null;
  const verifyingAccountId = runningType === "verify" ? pendingOperation?.accountId ?? null : null;
  const removingAliasId = runningType === "removeAlias" ? pendingOperation?.aliasId ?? null : null;
  async function addAlias(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (activeBusy) return; const form = event.currentTarget; const value = String(new FormData(form).get("alias") ?? "").trim(); if (value && await guardOperation("alias", () => state.addAlias(value)).catch(() => false)) form.reset(); }
  // Success holds the lock until the refreshed alias list no longer contains the chip, so a second DELETE cannot be sent.
  async function removeAlias(aliasId: string) { if (operationLocked) return; await guardOperation("removeAlias", async () => { const ok = await state.removeAlias(aliasId); if (ok) await state.aliases.refetch(); return ok; }, { aliasId }).catch(() => undefined); }
  async function saveIdentity(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (activeBusy) return; const data = new FormData(event.currentTarget); const nullable = (key: string) => String(data.get(key) ?? "").trim() || null; await guardOperation("identity", () => state.updateIdentity({ official_name: String(data.get("official_name") ?? "").trim(), nik: nullable("nik"), employee_number: nullable("employee_number"), position: nullable("position"), unit: nullable("unit") })).catch(() => undefined); }
  async function addAccount(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (activeBusy) return; const form = event.currentTarget; const data = new FormData(form); const validUntil = String(data.get("valid_until") ?? ""); const body = { bank_id: String(data.get("bank_id")), account_number: String(data.get("account_number")), account_holder_name: String(data.get("account_holder_name")), valid_from: String(data.get("valid_from")), valid_until: validUntil || null, is_primary: data.get("is_primary") === "on" }; const saved = editingAccount ? await guardOperation("account", () => state.updateAccount(editingAccount.id, body)).catch(() => null) : await guardOperation("account", () => state.addAccount(body)).catch(() => null); if (saved) { form.reset(); setShowAccount(false); setEditingAccount(null); } }
  async function changeStatus(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (activeBusy) return; const data = new FormData(event.currentTarget); await guardOperation("status", () => state.changeStatus(String(data.get("status")) as EmploymentStatus, String(data.get("reason")))).catch(() => undefined); }
  async function verifyAccount(accountId: string) { if (activeBusy) return; await guardOperation("verify", async () => { const ok = await state.verify(accountId); if (ok) await state.accounts.refetch(); return ok; }, { accountId }).catch(() => undefined); }
  return <div className="content-wrap"><Link href={returnTo ?? "/master-karyawan"} className="back-link"><ArrowLeft size={16} />{returnTo ? "Kembali ke review payroll" : "Master Karyawan"}</Link><header className="detail-header"><div><h1>{employee.official_name}</h1><p>{employee.position ?? "Jabatan belum diisi"} · {employee.unit ?? "Unit belum diisi"}</p>{employee.identity_verification_status !== "verified" ? <small className="identity-verification-note">Identitas belum diverifikasi</small> : null}</div><StatusBadge label={EMPLOYMENT_STATUS[employee.employment_status]} tone={employee.employment_status === "active" ? "success" : "warning"} /></header>{state.error ? <BaseInlineError error={state.error} /> : null}
    <div className="detail-grid"><Panel><h2>Identitas</h2><form className="stack-form" onSubmit={saveIdentity}><label>Nama resmi<input name="official_name" defaultValue={employee.official_name} required /></label><div className="form-grid"><label>NIK<input name="nik" defaultValue={employee.nik ?? ""} /></label><label>Nomor karyawan<input name="employee_number" defaultValue={employee.employee_number ?? ""} /></label><label>Jabatan<input name="position" defaultValue={employee.position ?? ""} /></label><label>Unit<input name="unit" defaultValue={employee.unit ?? ""} /></label></div><span className="field-help">Status verifikasi: {employee.identity_verification_status} · diperbarui {formatDateTime(employee.updated_at)}</span><Button type="submit" variant="secondary" loading={runningType === "identity"} disabled={operationLocked} loadingLabel="Menyimpan identitas…">Simpan identitas</Button></form></Panel><Panel><h2>Ubah status kerja</h2><form className="stack-form" onSubmit={changeStatus}><label>Status<select name="status" defaultValue={employee.employment_status}>{Object.entries(EMPLOYMENT_STATUS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Alasan<textarea name="reason" required placeholder="Jelaskan dasar perubahan status" /></label><Button type="submit" loading={runningType === "status"} disabled={operationLocked} loadingLabel="Menyimpan status…">Simpan status</Button></form></Panel></div>
    <Panel className="detail-section"><div className="section-heading"><div><h2>Rekening pembayaran</h2><p>Hanya rekening aktif dan terverifikasi yang layak digunakan saat finalisasi.</p></div><Button variant="secondary" onClick={() => { setEditingAccount(null); setShowAccount((value) => !value); }}><Plus size={17} />Tambah rekening</Button></div>{showAccount || editingAccount ? <form key={editingAccount?.id ?? "new"} className="account-form" onSubmit={addAccount}><label>Bank<select name="bank_id" required defaultValue={editingAccount?.bank_id ?? ""}><option value="">Pilih bank</option>{state.banks.data?.map((bank) => <option key={bank.id} value={bank.id}>{bank.name} ({bank.output_group})</option>)}</select></label><label>Nomor rekening<input name="account_number" required inputMode="numeric" placeholder={editingAccount ? "Masukkan ulang nomor lengkap" : undefined} /><span className="field-help">Nomor lengkap tidak pernah dibaca kembali dari server.</span></label><label>Nama pemilik<input name="account_holder_name" required defaultValue={editingAccount?.account_holder_name ?? ""} /></label><label>Berlaku mulai<input name="valid_from" type="date" required defaultValue={editingAccount?.valid_from.slice(0,10) ?? ""} /></label><label>Berlaku sampai<input name="valid_until" type="date" defaultValue={editingAccount?.valid_until?.slice(0,10) ?? ""} /></label><label className="check-field"><input name="is_primary" type="checkbox" defaultChecked={editingAccount?.is_primary} />Jadikan rekening utama</label><Button type="submit" loading={runningType === "account"} disabled={operationLocked} loadingLabel={editingAccount ? "Menyimpan koreksi…" : "Menyimpan rekening…"}>{editingAccount ? "Simpan koreksi" : "Simpan rekening"}</Button></form> : null}<AccountVisibilityProvider rows={[{ id: employee.id }]} accountsByEmployee={{ [employee.id]: state.accounts.data ?? [] }} scopeKey={`detail-${employee.id}`}>
  <AccountList
    accounts={state.accounts.data ?? []}
    locked={operationLocked}
    verifyingAccountId={verifyingAccountId}
    onEdit={(a) => { setShowAccount(false); setEditingAccount(a); }}
    onVerify={verifyAccount}
  />
</AccountVisibilityProvider></Panel>
    <Panel className="detail-section"><div className="section-heading"><div><h2>Alias nama</h2><p>Alias membantu pencocokan payroll berikutnya dan tidak mengubah keputusan batch lama.</p></div></div><form className="alias-form" onSubmit={addAlias}><input name="alias" placeholder="Masukkan variasi nama" required /><Button type="submit" variant="secondary" loading={runningType === "alias"} disabled={operationLocked} loadingLabel="Menambahkan alias…">Tambah alias</Button></form><div className="alias-list">{state.aliases.data?.map((alias) => <span key={alias.id}>{alias.alias_name}<small>{alias.source === "manual_review" ? "Manual" : alias.source === "payroll_review" ? "Review payroll" : "Review impor"}</small><button type="button" onClick={() => void removeAlias(alias.id)} disabled={operationLocked} aria-busy={removingAliasId === alias.id} aria-label={`Hapus alias ${alias.alias_name}`}>{removingAliasId === alias.id ? <LoaderCircle className="spin" size={15} aria-hidden /> : <Trash2 size={15} />}</button></span>)}</div></Panel>
  </div>;
}
