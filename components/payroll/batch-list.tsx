"use client";

import Link, { useLinkStatus } from "next/link";
import { LoaderCircle, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/base/alert";
import { Button } from "@/components/base/button";
import { EmptyState } from "@/components/base/empty-state";
import { BaseErrorState } from "@/components/base/error-state";
import { BaseLoadingState } from "@/components/base/loading-state";
import { Pagination } from "@/components/base/pagination";
import { Panel } from "@/components/base/panel";
import { StatusBadge } from "@/components/base/status-badge";
import { BATCH_STATUS } from "@/constants/status";
import { getApiError } from "@/redux/api";
import { useBulkDeletePayrollBatchesMutation, useGetPayrollBatchesQuery, useLazyGetPayrollDeletionSelectionQuery } from "@/redux/api/payroll.rtk";
import type { ApiClientError } from "@/type/api";
import type { PayrollBatch, PayrollDeleteBlocker, PayrollDeletionSelection } from "@/type/payroll";
import { formatDateTime, periodLabel } from "@/utils/format";

function statusTone(status: string) { if (status === "finalized") return "success" as const; if (status.includes("failed")) return "danger" as const; if (["matched", "reconciled"].includes(status)) return "warning" as const; return "pending" as const; }
const BLOCK_REASON = { processing: "Sedang diproses", finalized: "Sudah difinalisasi", unsupported_status: "Status ini tidak dapat dihapus" } as const;

function conflictBlockers(error: ApiClientError): PayrollDeleteBlocker[] {
  const details = error.backendError?.details;
  if (!details || typeof details !== "object" || !("blocked" in details) || !Array.isArray(details.blocked)) return [];
  return details.blocked.filter((item): item is PayrollDeleteBlocker => Boolean(item) && typeof item === "object" && "id" in item && typeof item.id === "string" && "code" in item && typeof item.code === "string" && "reason" in item && typeof item.reason === "string");
}

function blockerMessage(blockers: PayrollDeleteBlocker[]) {
  if (!blockers.length) return "Satu atau lebih batch kini dilindungi dan tidak dapat dihapus. Pilihan telah diperbarui.";
  const known: Record<string, string> = { processing: "sedang diproses", finalized: "sudah difinalisasi", unsupported_status: "statusnya tidak mendukung penghapusan" };
  const descriptions = blockers.slice(0, 3).map((item) => `${item.id.slice(0, 8)}… ${known[item.reason] ?? "dilindungi oleh server"}`);
  const remainder = blockers.length > 3 ? ` dan ${blockers.length - 3} batch lainnya` : "";
  return `${descriptions.join(", ")}${remainder}. Tinjau pilihan terbaru lalu konfirmasi kembali.`;
}

export function BatchList() {
  const [page, setPage] = useState(1);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allSelection, setAllSelection] = useState<PayrollDeletionSelection | null>(null);
  const [dialogIds, setDialogIds] = useState<string[] | null>(null);
  const [actionError, setActionError] = useState<ApiClientError | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingFocus, setPendingFocus] = useState(false);
  const selectionGeneration = useRef(0);
  const selectButtonRef = useRef<HTMLButtonElement>(null);
  const cancelDialogRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [fetchDeletionSelection, selectionState] = useLazyGetPayrollDeletionSelectionQuery();
  const [bulkDelete, deleteState] = useBulkDeletePayrollBatchesMutation();
  const { data, isLoading, isFetching, isError, error, refetch } = useGetPayrollBatchesQuery({ page, pageSize: 6 });
  const selectedCount = selectedIds.size;
  const allEligibleSelected = Boolean(allSelection && selectedCount === allSelection.ids.length && allSelection.ids.every((id) => selectedIds.has(id)));
  const oneSelectedBatch = useMemo(() => dialogIds?.length === 1 ? data?.rows.find((batch) => batch.id === dialogIds[0]) : undefined, [data?.rows, dialogIds]);

  const closeDialog = useCallback(() => { setDialogIds(null); requestAnimationFrame(() => selectButtonRef.current?.focus()); }, []);

  useEffect(() => {
    if (!dialogIds) return;
    cancelDialogRef.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape" && !deleteState.isLoading) closeDialog();
      if (event.key !== "Tab") return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex='-1'])") ?? []);
      if (!controls.length) return;
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [closeDialog, deleteState.isLoading, dialogIds]);

  useEffect(() => {
    if (!data || page <= 1) return;
    const lastPage = Math.max(1, Math.ceil(data.meta.total / data.meta.page_size));
    if (page > lastPage) setPage(lastPage);
  }, [data, page]);

  useEffect(() => {
    if (!pendingFocus || isFetching) return;
    listRef.current?.focus(); setPendingFocus(false);
  }, [isFetching, pendingFocus]);

  function beginSelection() { setSelectionMode(true); setNotice(null); setActionError(null); setActionMessage(null); }
  function cancelSelection() {
    selectionGeneration.current += 1;
    setSelectionMode(false); setSelectedIds(new Set()); setAllSelection(null); setDialogIds(null); setActionError(null); setActionMessage(null);
    requestAnimationFrame(() => selectButtonRef.current?.focus());
  }
  function toggleRow(id: string) {
    setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    setActionError(null); setActionMessage(null);
  }

  async function toggleAll() {
    if (allEligibleSelected) { setSelectedIds(new Set()); setActionError(null); setActionMessage(null); return; }
    const generation = selectionGeneration.current;
    setActionError(null); setActionMessage(null);
    try {
      const result = await fetchDeletionSelection(undefined, false).unwrap();
      if (!selectionMode || generation !== selectionGeneration.current) return;
      setAllSelection(result); setSelectedIds(new Set(result.ids));
    } catch (reason) {
      if (!selectionMode || generation !== selectionGeneration.current) return;
      setActionError(getApiError(reason, { method: "GET", endpoint: "/payroll/batches/deletion-selection" }));
    }
  }

  async function reconcileSelection() {
    try {
      const latest = await fetchDeletionSelection(undefined, false).unwrap(); const eligible = new Set(latest.ids);
      setSelectedIds((current) => new Set([...current].filter((id) => eligible.has(id)))); setAllSelection(latest);
    } catch { /* Preserve the existing selection when reconciliation cannot be confirmed. */ }
  }

  function openDialog() { if (selectedCount) { setDialogIds([...selectedIds]); setActionError(null); setActionMessage(null); } }

  async function confirmDelete() {
    if (!dialogIds?.length || deleteState.isLoading) return;
    const submittedIds = [...dialogIds]; setActionError(null); setActionMessage(null);
    try {
      const result = await bulkDelete(submittedIds).unwrap();
      setDialogIds(null); setSelectionMode(false); setSelectedIds(new Set()); setAllSelection(null);
      setNotice(`${result.deleted_count} batch payroll dihapus`); setPendingFocus(true);
      const refreshResult = await refetch();
      if (refreshResult.error) setActionMessage("Penghapusan berhasil, tetapi riwayat belum dapat dimuat ulang. Jangan mengulangi penghapusan sebelum daftar berhasil diperbarui.");
    } catch (reason) {
      const normalized = getApiError(reason, { method: "POST", endpoint: "/payroll/batches/bulk-delete" });
      if (normalized.status === 409 && normalized.code === "PAYROLL_BATCH_DELETE_NOT_ALLOWED") {
        const blockers = conflictBlockers(normalized); const blockedIds = new Set(blockers.map((item) => item.id));
        setSelectedIds((current) => new Set([...current].filter((id) => !blockedIds.has(id))));
        setDialogIds(null); setActionMessage(blockerMessage(blockers)); await refetch(); return;
      }
      if (normalized.status === 404) {
        setDialogIds(null); setActionMessage("Satu atau lebih batch yang dipilih sudah tidak tersedia. Pilihan diselaraskan dengan eligibility terbaru.");
        await refetch(); await reconcileSelection(); return;
      }
      if (["network", "offline", "timeout"].includes(normalized.kind)) {
        setDialogIds(null); setActionMessage("Hasil penghapusan belum dapat dipastikan. Riwayat dan eligibility disegarkan sebelum tindakan dapat dicoba lagi.");
        await refetch(); await reconcileSelection(); return;
      }
      setActionError(normalized);
    }
  }

  const heading = <div className="history-heading"><div><h2>Batch sebelumnya</h2><p>Lanjutkan pekerjaan yang belum selesai atau buka hasil sebelumnya.</p></div></div>;
  if (isLoading) return <>{heading}<Panel><BaseLoadingState label="Loading payroll history…" /></Panel></>;
  if (isError && !data) return <>{heading}<Panel><BaseErrorState error={error} onRetry={refetch} compact /></Panel></>;

  return <>
    <div className="history-heading">
      <div><h2>Batch sebelumnya</h2><p>Lanjutkan pekerjaan yang belum selesai atau buka hasil sebelumnya.</p></div>
      <div className="batch-selection-toolbar">
        {!selectionMode ? <button ref={selectButtonRef} type="button" className="button button--secondary" onClick={beginSelection}>Pilih</button> : <>
          <Button type="button" variant="ghost" disabled={deleteState.isLoading} onClick={cancelSelection}>Batal</Button>
          <Button type="button" variant="secondary" loading={selectionState.isFetching} loadingLabel="Memuat…" onClick={() => void toggleAll()}>{allEligibleSelected ? "Batalkan pilihan" : "Pilih semua"}</Button>
          <Button type="button" variant="danger" disabled={!selectedCount} onClick={openDialog}><Trash2 aria-hidden size={17} />Hapus ({selectedCount})</Button>
        </>}
      </div>
    </div>
    {selectionMode ? <p className="selection-summary" role="status">{allSelection ? `${selectedCount} batch dipilih dari semua halaman${allSelection.blocked_count ? ` · ${allSelection.blocked_count} batch dilindungi` : ""}` : `${selectedCount} batch dipilih`}</p> : null}
    {notice ? <Alert tone="success">{notice}</Alert> : null}
    {actionMessage ? <Alert tone="warning">{actionMessage}</Alert> : null}
    {actionError ? <Alert tone="error" title={actionError.title}>{actionError.explanation}</Alert> : null}
    {isError && data ? <Alert tone="error" title="Riwayat belum dapat dimuat ulang">Data yang ditampilkan mungkin belum terbaru. Coba muat ulang riwayat sebelum melakukan penghapusan lain.</Alert> : null}
    <Panel>
      <div className="batch-list" ref={listRef} tabIndex={-1} aria-busy={isFetching}>
        {!data?.rows.length ? <EmptyState illustration="history" title="Belum ada batch payroll" description="Batch yang sudah diunggah akan muncul di sini agar dapat dilanjutkan setelah halaman dimuat ulang." /> : data.rows.map((batch) => <BatchRow key={batch.id} batch={batch} selectionMode={selectionMode} selected={selectedIds.has(batch.id)} toggle={toggleRow} />)}
      </div>
      {data && data.meta.total > data.meta.page_size ? <Pagination page={page} pageSize={data.meta.page_size} total={data.meta.total} onChange={setPage} /> : null}
    </Panel>
    {dialogIds ? <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleteState.isLoading) closeDialog(); }}>
      <section ref={dialogRef} className="dialog payroll-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-payroll-title" aria-describedby="delete-payroll-description">
        <header><div><h2 id="delete-payroll-title">Hapus permanen {dialogIds.length} batch?</h2><p id="delete-payroll-description">Batch yang dipilih dan hasil pemrosesannya akan dihapus permanen dari riwayat payroll.</p></div><button type="button" aria-label="Tutup" disabled={deleteState.isLoading} onClick={closeDialog}><X aria-hidden /></button></header>
        {oneSelectedBatch ? <dl className="delete-batch-summary"><div><dt>File</dt><dd>{oneSelectedBatch.original_filename}</dd></div><div><dt>Waktu diperbarui</dt><dd>{formatDateTime(oneSelectedBatch.updated_at)}</dd></div></dl> : null}
        {allSelection?.blocked_count ? <p className="delete-batch-note">{allSelection.blocked_count} batch yang dilindungi tidak termasuk pilihan dan akan tetap tersimpan.</p> : null}
        <p className="delete-batch-note">Daftar ini dibekukan saat dialog dibuka. Batch yang ditambahkan setelahnya tidak akan ikut dihapus.</p>
        {actionError ? <Alert tone="error" title={actionError.title}>{actionError.explanation}</Alert> : null}
        <div className="dialog-actions"><button ref={cancelDialogRef} type="button" className="button button--secondary" disabled={deleteState.isLoading} onClick={closeDialog}>Batal</button><Button type="button" variant="danger" loading={deleteState.isLoading} loadingLabel="Menghapus…" onClick={() => void confirmDelete()}>Hapus permanen</Button></div>
      </section>
    </div> : null}
  </>;
}

// Rendered inside the row's <Link>: useLinkStatus() reports pending only for
// this link, so just the clicked batch shows "Membuka batch…" while the route
// transition (middleware + RSC) is in flight. Other rows are unaffected.
function BatchRowLinkContent({ batch }: { batch: PayrollBatch }) {
  const { pending } = useLinkStatus();
  const subtitle = [batch.period ? periodLabel(batch.period) : null, batch.unit || null].filter(Boolean).join(" · ");
  return <>
    <span className="batch-row__identity" aria-busy={pending}>
      <strong>{pending ? <LoaderCircle aria-hidden className="spin" size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} /> : null}{batch.original_filename}</strong>
      <small aria-live="polite">{pending ? "Membuka batch…" : subtitle}</small>
    </span>
    <span className="batch-row__meta"><StatusBadge label={BATCH_STATUS[batch.status] ?? batch.status} tone={statusTone(batch.status)} /><small>Diperbarui {formatDateTime(batch.updated_at)}</small></span>
  </>;
}

function BatchRow({ batch, selectionMode, selected, toggle }: { batch: PayrollBatch; selectionMode: boolean; selected: boolean; toggle: (id: string) => void }) {
  return <article className={`batch-row ${selected ? "batch-row--selected" : ""}`}>
    {selectionMode && batch.can_delete ? <label className="batch-checkbox"><input type="checkbox" checked={selected} onChange={() => toggle(batch.id)} /><span className="sr-only">Pilih batch {batch.original_filename}, {formatDateTime(batch.updated_at)}</span></label> : null}
    <Link href={`/payroll/${batch.id}`} className="batch-row__link">
      <BatchRowLinkContent batch={batch} />
    </Link>
    {selectionMode && !batch.can_delete && batch.delete_block_reason ? <small className="batch-block-reason">{BLOCK_REASON[batch.delete_block_reason]}</small> : null}
  </article>;
}
