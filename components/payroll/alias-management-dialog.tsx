"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/base/alert";
import { BaseInlineError } from "@/components/base/error-state";
import { Button } from "@/components/base/button";
import { useGetEmployeeQuery, useGetAliasesQuery } from "@/redux/api/employee.rtk";
import { normalizePayrollName } from "@/utils/alias-conflict";
import type { PayrollActionResult } from "@/hooks/use-payroll-detail";
import type { AliasConflictDetail } from "@/type/payroll";

/**
 * Single small dialog for alias review + removal (Fix #11). Opened only from
 * "Tinjau alias" (409 ALIAS_CONFLICT flow) or "Hapus alias" (reopen flow).
 * The dialog shows the evidence the API and permissions provide: the alias,
 * its current owner, and — when opened from payroll review — the selected
 * employee. Removing the alias never reassigns it or changes another row;
 * the owning payroll row must be re-confirmed by the reviewer afterwards.
 */
export function AliasManagementDialog({ open, conflict, candidateName, employeeId, onRemoved, onClose, removeAlias, busy }: {
  open: boolean;
  /** Decoded 409 conflict — the only alias evidence available from the review flow. */
  conflict?: AliasConflictDetail;
  /** Display name of the employee selected in the payroll review (context only). */
  candidateName?: string;
  /** Employee whose alias list is shown. Set when opened from a resolved row. */
  employeeId?: string;
  /** Called after a successful removal; the dialog closes and the form is preserved. */
  onRemoved: () => void;
  onClose: () => void;
  removeAlias: (employeeId: string, aliasId: string) => Promise<PayrollActionResult>;
  busy: boolean;
}) {
  const owner = useGetEmployeeQuery(employeeId ?? "", { skip: !employeeId }).data;
  const aliases = useGetAliasesQuery(employeeId ?? "", { skip: !employeeId, refetchOnMountOrArgChange: true });

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const deletingRef = useRef(false);

  const aliasName = conflict?.alias_name ?? "";
  const normalized = normalizePayrollName(aliasName);

  const removableAliases = useMemo(() => {
    const rows = aliases.data ?? [];
    return rows
      .filter((alias) => normalizePayrollName(alias.alias_name) === normalized)
      .map((alias) => ({ alias, removable: employeeId ? alias.employee_id === employeeId : false }));
  }, [aliases.data, normalized, employeeId]);

  useEffect(() => {
    if (!open) return;
    setDeletingId(null);
    setError(null);
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function handleDelete(aliasId: string) {
    if (!employeeId || deletingRef.current || deletingId || busy) return;
    deletingRef.current = true;
    setDeletingId(aliasId);
    setError(null);
    const result = await removeAlias(employeeId, aliasId);
    deletingRef.current = false;
    setDeletingId(null);
    if (result.ok) {
      void aliases.refetch();
      onRemoved();
    } else {
      setError(result.error);
    }
  }

  const ownershipConflict = conflict?.conflict_type === "alias_ownership";
  const ownerLabel = ownershipConflict
    ? conflict?.owner_name
    : undefined;

  return (
    <div className="dialog-backdrop period-dialog alias-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog-card alias-dialog" role="dialog" aria-modal="true" aria-labelledby="alias-dialog-title">
        <button ref={closeRef} type="button" className="alias-dialog__close" onClick={onClose} aria-label="Tutup dialog">×</button>
        <div>
          <h3 id="alias-dialog-title">Tinjau alias</h3>
          <p>
            {ownershipConflict
              ? <>Alias <strong>“{aliasName}”</strong> sudah digunakan oleh <strong>{ownerLabel ?? "karyawan lain"}</strong>.</>
              : <>Nama <strong>“{aliasName}”</strong> adalah nama resmi karyawan lain.</>}
          </p>
          {candidateName ? <p className="alias-dialog__context">Baris ini sedang membandingkan dengan kandidat <strong>{candidateName}</strong>.</p> : null}
        </div>

        {employeeId ? (
          aliases.isLoading ? <p className="muted" role="status">Memuat alias…</p> : aliases.isError ? <BaseInlineError error={aliases.error} /> : (
            <div className="alias-dialog__list">
              <p className="field-help">
                Karyawan: {owner?.official_name ?? "Memuat…"}
                {removableAliases.length ? " — alias berikut dapat dihapus oleh akun Anda:" : " — tidak ada alias yang dapat dihapus di sini."}
              </p>
              {removableAliases.map(({ alias, removable }) => (
                <div key={alias.id} className={`alias-dialog__row${removable ? "" : " alias-dialog__row--blocked"}`}>
                  <span><strong>{alias.alias_name}</strong><small>{alias.source === "manual_review" ? "Manual" : alias.source === "payroll_review" ? "Review payroll" : "Review impor"}</small></span>
                  {removable ? (
                    <Button
                      variant="danger"
                      onClick={() => void handleDelete(alias.id)}
                      loading={deletingId === alias.id}
                      loadingLabel="Menghapus…"
                      disabled={busy && deletingId !== alias.id}
                    >
                      Hapus alias
                    </Button>
                  ) : (
                    <Link className="alias-dialog__owner-link" href={`/master-karyawan/${alias.employee_id}`}>
                      Milik karyawan lain
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          <Alert tone="info">
            {ownershipConflict ? (
              <>Untuk melanjutkan konfirmasi, hapus alias yang bentrok dari master karyawan pemiliknya, lalu ulangi konfirmasi baris ini.</>
            ) : (
              <>Kembali ke bukti kandidat dan pilih karyawan yang benar. Nama resmi ini tidak dapat disimpan sebagai alias.</>
            )}
          </Alert>
        )}

        {error ? <BaseInlineError error={error} /> : null}
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onClose}>Tutup</Button>
        </div>
      </section>
    </div>
  );
}
