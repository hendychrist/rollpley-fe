"use client";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/base/alert";
import { BaseInlineError } from "@/components/base/error-state";
import { Button } from "@/components/base/button";
import { decodeReopenGuardReason } from "@/utils/alias-conflict";
import { resolvedRowMeta } from "@/components/payroll/review-queue";
import type { ApiClientError } from "@/type/api";
import type { PayrollActionResult } from "@/hooks/use-payroll-detail";
import type { PayrollMatch } from "@/type/payroll";

const REOPEN_GUARD_COPY: Record<string, string> = {
  batch_already_finalized: "Batch sudah difinalisasi — keputusan match tidak dapat dibatalkan. Hubungi admin untuk koreksi data.",
  match_rejected: "Baris ini sudah dikeluarkan (rejected). Keputusan tidak dapat dibatalkan.",
  match_not_auto_matched: "Baris ini belum dikonfirmasi sehingga tidak dapat dibatalkan.",
};

/**
 * Small confirmation dialog for "Batalkan kecocokan" on a resolved row (Fix #11).
 * On success the row returns to the pending queue ("Perlu diperiksa"); the
 * reviewer must explicitly re-select and confirm the correct employee.
 */
export function ReopenMatchDialog({ open, match, mode = "confirmed", onCancel, onReopen, onSuccess, busy }: {
  open: boolean;
  match: PayrollMatch;
  mode?: "confirmed" | "rejected";
  onCancel: () => void;
  onReopen: (reason: string) => Promise<PayrollActionResult>;
  onSuccess: () => void;
  busy: boolean;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<ApiClientError | null>(null);
  const [guardReason, setGuardReason] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setError(null);
    setGuardReason(null);
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || busy || submitting) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    setGuardReason(null);
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError({ status: 400, code: "VALIDATION_ERROR", message: "Alasan membuka kembali wajib diisi.", title: "Alasan wajib diisi", explanation: "Tuliskan alasan sebelum mengembalikan baris ke antrean.", kind: "http", timestamp: new Date().toISOString(), retryable: false });
      setSubmitting(false);
      submittingRef.current = false;
      return;
    }
    const result = await onReopen(trimmedReason);
    setSubmitting(false);
    submittingRef.current = false;
    if (result.ok) {
      onSuccess();
      return;
    }
    const err = result.error;
    if (err.status === 409 && (err.code === "PAYROLL_BATCH_NOT_REVIEWABLE" || err.code === "PAYROLL_MATCH_NOT_REVIEWABLE")) {
      setGuardReason(decodeReopenGuardReason(err) ?? "");
    } else if (err.status === 409 && err.code === "CONFLICT") {
      // Stale decision: another review changed the row while this dialog was open.
      setError(err);
      onCancel();
    } else {
      setError(err);
    }
  }

  const guardMessage = guardReason
    ? mode === "rejected"
      ? guardReason === "batch_already_finalized"
        ? "Batch sudah difinalisasi. Riwayat tetap dapat dilihat, tetapi keputusan tidak dapat diubah."
        : "Keputusan baris sudah berubah atau tidak lagi dapat dibuka kembali. Data payroll sedang diperbarui; periksa status terbaru sebelum mencoba lagi."
      : REOPEN_GUARD_COPY[guardReason] ?? "Keputusan match tidak dapat dibatalkan untuk kondisi ini. Muat ulang halaman untuk status terbaru."
    : null;

  const meta = resolvedRowMeta(match);
  const rejected = mode === "rejected";
  const previousReason = match.ReviewReason?.trim() || "Alasan tidak tercatat";

  return (
    <div className="dialog-backdrop period-dialog alias-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className="dialog-card alias-dialog" role="dialog" aria-modal="true" aria-labelledby="reopen-dialog-title">
        <button ref={closeRef} type="button" className="alias-dialog__close" onClick={onCancel} aria-label="Tutup dialog">×</button>
        <div>
          <h3 id="reopen-dialog-title">{rejected ? "Kembalikan ke antrean?" : "Batalkan kecocokan"}</h3>
          {rejected ? <>
            <p>Baris “{meta.name || "Nama tidak terbaca"}”{meta.location ? <> — {meta.location}</> : null} sebelumnya dikeluarkan dengan alasan: <strong>{previousReason}</strong>.</p>
            <p>Baris ini akan kembali ke Perlu diperiksa agar Anda dapat memilih keputusan baru.</p>
          </> : <p>
            Baris “{meta.name || "Nama tidak terbaca"}”{meta.position ? <> ({meta.position})</> : null}
            {meta.location ? <> — {meta.location}</> : null} dikembalikan ke antrean <strong>Perlu diperiksa</strong>. Keputusan lama tercatat di audit log.
          </p>}
        </div>
        <form onSubmit={submit}>
          <label>
            <span>{rejected ? "Alasan membuka kembali" : "Alasan koreksi"}</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={rejected ? "Jelaskan mengapa baris perlu diperiksa kembali" : "Mis. HR salah pilih Herman B; seharusnya Herman A"}
              required
            />
          </label>
          {guardMessage ? <Alert tone="error">{guardMessage}</Alert> : null}
          {error ? <BaseInlineError error={error} /> : null}
          <div className="dialog-actions">
            <Button variant="ghost" type="button" onClick={onCancel}>Batal</Button>
            <Button type="submit" variant="secondary" loading={submitting || busy} loadingLabel={rejected ? "Mengembalikan ke antrean…" : "Membatalkan kecocokan…"}>
              {rejected ? "Kembalikan ke antrean" : "Batalkan kecocokan"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
