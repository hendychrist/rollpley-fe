"use client";
import { ArrowLeft, Download, FileCheck2, Play, RefreshCw, CalendarClock, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Alert } from "@/components/base/alert";
import { BaseErrorState, BaseInlineError } from "@/components/base/error-state";
import { EmptyState } from "@/components/base/empty-state";
import { Button } from "@/components/base/button";
import { Panel } from "@/components/base/panel";
import { Skeleton } from "@/components/base/skeleton";
import { StatusBadge } from "@/components/base/status-badge";
import { BATCH_STATUS } from "@/constants/status";
import { usePayrollDetail } from "@/hooks/use-payroll-detail";
import { usePayrollExportDownloads, allExportsReady, readyExportFiles, bulkDownloadProgressLabel, bulkDownloadSummary } from "@/hooks/use-payroll-export-downloads";
import { downloadExport } from "@/utils/download";
import { formatCurrency, formatDateTime, periodLabel } from "@/utils/format";
import { ReviewQueue } from "@/components/payroll/review-queue";
import { SourceWarnings } from "@/components/payroll/source-warnings";
import { getApiError } from "@/redux/api";
import type { ApiClientError } from "@/type/api";
import type { EmployeeInput } from "@/type/employee";
import type { ExportFile, ReconciliationIssue } from "@/type/payroll";

const OPERATION_LABELS = {
  start: "Starting match",
  review: "Saving decision",
  createEmployee: "Creating employee",
  finalize: "Memfinalisasi…",
  generate: "Membuat Excel…",
  finalizeAndExport: "Finalisasi & buat Excel…",
  confirmPeriod: "Menyimpan periode…",
} as const;
type Operation = keyof typeof OPERATION_LABELS;

function reconciliationBlockerLabel(blocker: string): string {
  const normalized = blocker.trim().toLowerCase().replace(/\.$/, "");
  return normalized === "approved transfer calculation is incomplete"
    ? "Perhitungan total transfer belum lengkap."
    : blocker;
}

// Issue reasons are shown exactly as the backend states them (e.g. the account
// rule now refers to the currently valid account, not the payroll period).
function issueReasonLabel(issue: ReconciliationIssue): string {
  return issue.reason;
}

const EXPORT_STATUS: Record<ExportFile["status"], { label: string; tone: "success" | "pending" | "danger" | "neutral" }> = {
  pending: { label: "Menunggu diproses", tone: "pending" },
  uploading: { label: "Sedang menyiapkan file…", tone: "pending" },
  uploaded: { label: "Siap diunduh", tone: "success" },
  failed: { label: "Gagal membuat file", tone: "danger" },
};

const MONTHS: Array<[string, string]> = [
  ["01", "Januari"], ["02", "Februari"], ["03", "Maret"], ["04", "April"],
  ["05", "Mei"], ["06", "Juni"], ["07", "Juli"], ["08", "Agustus"],
  ["09", "September"], ["10", "Oktober"], ["11", "November"], ["12", "Desember"],
];

const YEARS: number[] = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() + i - 2);

export function BatchDetail({ id, reviewId, reviewPage = 1, reviewFilter = "all" }: { id: string; reviewId?: string; reviewPage?: number; reviewFilter?: "all" | "identity" | "account" }) {
  const state = usePayrollDetail(id, reviewPage);
  const [downloadError, setDownloadError] = useState<ApiClientError | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [periodError, setPeriodError] = useState<ApiClientError | null>(null);
  const [finalizePhase, setFinalizePhase] = useState<"idle" | "finalizing" | "exporting">("idle");
  const [periodMonth, setPeriodMonth] = useState("");
  const [periodYear, setPeriodYear] = useState("");
  const [showPeriodDialog, setShowPeriodDialog] = useState(false);
  const lastErrorRef = useRef<ApiClientError | null>(null);
  // Operations owned by this component's guard(). The ref is the synchronous
  // lock; the state drives rendering. Review decisions are NOT guarded here
  // (they are scoped per finding card), so they never make these controls busy.
  const activeOperationRef = useRef<Operation | null>(null);
  const [activeOperation, setActiveOperation] = useState<Operation | null>(null);
  const activeBusy = activeOperation !== null;
  // Handler-level lock for the whole finalize → export flow, acquired before window.confirm.
  const finalizingRef = useRef(false);
  const bulkDownload = usePayrollExportDownloads(id);

  // The File bank shows one current record per bank group (newest first).
  // Bulk download is eligible only when BCA, OTHER and SUMSEL are all ready.
  const readyExports = readyExportFiles(state.exportsQuery.data);
  const allReady = allExportsReady(state.exportsQuery.data);

  function guard<T>(operation: Operation, fn: () => Promise<T>) {
    if (activeOperationRef.current !== null) return Promise.reject(lastErrorRef.current ?? getApiError(new Error("Another payroll action is already in progress. Check the latest server state before trying again.")));
    activeOperationRef.current = operation;
    setActiveOperation(operation);
    const release = () => { activeOperationRef.current = null; setActiveOperation(null); };
    return fn()
      .then((value) => { lastErrorRef.current = null; release(); return value; })
      .catch((reason) => { lastErrorRef.current = getApiError(reason); release(); throw reason; });
  }

  if (state.batch.isLoading) return <div className="content-wrap"><Skeleton lines={7} /></div>;
  if (!state.batch.data) return <div className="content-wrap"><BaseErrorState error={state.batch.error} onRetry={state.batch.refetch} /></div>;

  const batch = state.batch.data;
  const processing = state.processing.data;
  const reconciliation = state.reconciliation.data;

  const pendingRows = state.pendingMatches.data?.rows ?? [];
  const pendingTotal = state.pendingMatches.data?.meta?.total ?? 0;

  const processingFailure: ApiClientError | null = processing?.Status === "failed"
    ? { status: "CUSTOM_ERROR", code: processing.ErrorCode ?? "PROCESSING_FAILED", message: "Payroll processing failed.", title: "Payroll processing failed", explanation: "The uploaded data is still stored. Review the backend error code before starting another processing attempt.", kind: "unknown", method: "GET", endpoint: `/payroll/batches/${id}/processing-status`, timestamp: processing.UpdatedAt ?? batch.updated_at, retryable: false }
    : null;

  async function download(exportId: string, filename: string) {
    setDownloadError(null);
    try { await downloadExport(id, exportId, filename); }
    catch (reason) { setDownloadError(getApiError(reason)); }
  }

  // One click attempts all three ready files in sequence. A single-file
  // failure never blocks the others; a 401/403 stops the run because the
  // session itself is broken. Individual buttons for the in-flight file are
  // disabled to prevent duplicate requests of the same artifact.
  async function downloadAllReady() {
    setDownloadError(null);
    await bulkDownload.downloadAll(readyExports);
  }

  const bulkSummary = bulkDownloadSummary(bulkDownload.state.result);

  async function handleConfirmPeriod() {
    if (!periodMonth || !periodYear) { setPeriodError(getApiError(new Error("Pilih bulan dan tahun terlebih dahulu."))); return; }
    const period = `${periodYear}-${periodMonth}`;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) { setPeriodError(getApiError(new Error("Format periode tidak valid."))); return; }
    setPeriodError(null);
    const ok = await guard("confirmPeriod", () => state.confirmPeriod(period)).catch(() => false);
    if (ok) { setShowPeriodDialog(false); setPeriodMonth(""); setPeriodYear(""); }
  }

  // One click: POST /finalize then POST /exports.
  // If export generation fails, the reviewer can retry just the export
  // via the "Buat / coba ulang ekspor" button without re-finalizing.
  async function handleFinalizeAndExport() {
    if (finalizingRef.current || activeOperationRef.current !== null) return;
    finalizingRef.current = true;
    try {
      if (!window.confirm("Finalisasi bersifat utuh dan tidak dapat diubah. Lanjutkan hanya jika seluruh ringkasan sudah benar.")) return;
      setFinalizePhase("finalizing");
      const finalizeOk = await guard("finalize", () => state.finalize()).catch(() => false);
      if (finalizeOk) {
        setFinalizePhase("exporting");
        await guard("generate", () => state.generate()).catch(() => undefined);
      }
    } finally {
      finalizingRef.current = false;
      setFinalizePhase("idle");
    }
  }

  async function startProcessing() { await guard("start", () => state.start()).catch(() => undefined); }
  async function generateExports() { await guard("generate", () => state.generate()).catch(() => undefined); }
  async function createFromReview(body: EmployeeInput) {
    setCreateError(null);
    const employee = await guard("createEmployee", () => state.createEmployee(body)).catch(() => null);
    if (!employee) setCreateError("Gagal menyimpan data karyawan. Periksa koneksi lalu coba lagi.");
    return employee;
  }

  const reconciliationIssues = reconciliation?.issues ?? [];
  // Severity is authoritative for new payloads. Category-only grouping below
  // preserves the previous warning presentation for older payloads.
  const toleranceIssues: ReconciliationIssue[] = reconciliationIssues.filter(
    (issue) => issue.category === "source_arithmetic_tolerance" && issue.severity !== "blocking",
  );
  const blockingIssues: ReconciliationIssue[] = reconciliationIssues.filter(
    (issue) => issue.severity === "blocking",
  );
  const isSourceArithmeticCategory = (issue: ReconciliationIssue) => issue.category === "extraction_amount" || issue.category === "source_arithmetic_reviewed";
  // gross-potongan != gaji_diterima rows: still warnings (shown in the nominal
  // panel), but informational — the PDF net is authoritative and they never block.
  const sourceArithmeticWarnings: ReconciliationIssue[] = reconciliationIssues.filter(
    (issue) => issue.severity === "informational" && isSourceArithmeticCategory(issue),
  );
  const informationalIssues: ReconciliationIssue[] = reconciliationIssues.filter(
    (issue) => issue.severity === "informational" && issue.category !== "source_arithmetic_tolerance" && !isSourceArithmeticCategory(issue),
  );
  const legacyArithmeticIssues: ReconciliationIssue[] = reconciliationIssues.filter(
    (issue) => !issue.severity && issue.category !== "source_arithmetic_tolerance" && isSourceArithmeticCategory(issue),
  );
  // Source warnings that still genuinely block (e.g. component sum, unreadable
  // cells, or an older backend). Detailed in their own panel, not in the alert.
  const unresolvedIssues = [...blockingIssues.filter(isSourceArithmeticCategory), ...legacyArithmeticIssues];
  // Per-row blockers listed in the alert: genuine non-source-arithmetic rows only (e.g. routing).
  const blockerRowIssues = blockingIssues.filter((issue) => !isSourceArithmeticCategory(issue));
  const hasFinalizationBlockers = Boolean(reconciliation?.blockers.length || blockingIssues.length);

  // transfer_total=0 with difference_known=false means the backend hasn't
  // completed the calculation yet — display "Belum dihitung", not "Rp0".
  // difference_known=false means no calculation was performed for at least one
  // approved row (missing period, unknown amount, no employee, no account,
  // invalid fee policy, or source_net < fee). transfer_total in that case is
  // a partial sum, not a valid zero — so use difference_known directly.
  const transferCalcIncomplete = reconciliation ? !reconciliation.difference_known : false;

  const periodMissing = !batch.period;
  const showPeriodAction = periodMissing && batch.status !== "finalized";
  const reconciliationInitialLoading = !reconciliation && state.reconciliation.isLoading;
  const reconciliationRefreshing = Boolean(reconciliation && state.reconciliation.isFetching);
  const reconciliationCurrent = Boolean(reconciliation && !state.reconciliation.isFetching && !state.reconciliation.isError);

  return <div className="content-wrap">
    <Link href="/payroll" className="back-link"><ArrowLeft size={16} />Payroll</Link>
    <header className="batch-header">
      <div>
        <h1>{batch.period ? `${periodLabel(batch.period)} · ` : ""}{batch.unit}</h1>
        <p>{batch.original_filename} · diperbarui {formatDateTime(batch.updated_at)}</p>
      </div>
      <StatusBadge label={BATCH_STATUS[batch.status] ?? batch.status} tone={batch.status === "finalized" ? "success" : batch.status.includes("failed") ? "danger" : "pending"} />
    </header>
    {state.error ? <BaseInlineError error={state.error} /> : null}
    {state.batch.isError ? <BaseInlineError error={state.batch.error} /> : null}
    {downloadError ? <BaseInlineError error={downloadError} /> : null}
    {periodError ? <BaseInlineError error={periodError} /> : null}

    {batch.status === "uploaded" && !processing?.Status ? (
      <Panel className="next-action">
        <div><h2>PDF siap diproses</h2><p>Backend akan membaca dokumen dan mencocokkan identitas dengan master karyawan.</p></div>
        <Button onClick={() => void startProcessing()} loading={activeOperation === "start"} disabled={activeBusy} loadingLabel={OPERATION_LABELS.start}><Play size={17} />Mulai pencocokan</Button>
      </Panel>
    ) : null}

    {state.processing.isError ? <BaseInlineError error={state.processing.error} /> : null}
    {processing?.Status === "processing" ? <Panel className="processing-card"><span className="processing-pulse" /><div><h2>Payroll sedang diproses</h2><p>Tahap: {processing.Stage ?? "membaca dokumen"}. Status ini berasal dari backend dan halaman akan diperbarui otomatis.</p></div></Panel> : null}
    {processingFailure ? <BaseInlineError error={processingFailure} /> : null}
    {state.pendingMatches.isError ? <BaseInlineError error={state.pendingMatches.error} /> : null}

    {state.pendingMatches.isLoading ? <section className="workflow-section" aria-label="Memuat antrean review"><Skeleton lines={4} /></section> : null}

    {/* Review queue — always available when the batch is reviewable.
        The pending cards section shows an empty state when there are no
        pending rows; the confirmed card is always reachable. */}
    <ReviewQueue
      matches={pendingRows}
      pendingTotal={pendingTotal}
      pendingQueueLoading={state.pendingMatches.isLoading}
      batchId={id}
      period={batch.period}
      initialActiveId={reviewId}
      initialFilter={reviewFilter}
      pendingPage={state.pendingPage}
      setPendingPage={state.setPendingPage}
      pendingLoadingPage={state.pendingLoadingPage}
      pendingError={state.pendingError}
      retryPendingPage={state.retryPendingPage}
      save={state.review}
      createEmployee={createFromReview}
      createError={createError}
      busy={activeBusy}
      removeAlias={state.removeAlias}
      reopen={batch.status === "finalized" ? undefined : (matchId, reason) => state.reopen(matchId, reason)}
      resolvedMatches={state.resolvedMatches}
      resolvedPage={state.resolvedPage}
      setResolvedPage={state.setResolvedPage}
      resolvedSearch={state.resolvedSearch}
      setResolvedSearch={state.setResolvedSearch}
      rejectedMatches={state.rejectedMatches}
      rejectedPage={state.rejectedPage}
      setRejectedPage={state.setRejectedPage}
      retryRejectedPage={state.retryRejectedPage}
    />

    {state.reconciliation.isError ? <BaseInlineError error={state.reconciliation.error} /> : null}

    {reconciliationInitialLoading ? (
      <section className="workflow-section reconciliation-section" aria-busy="true" aria-live="polite">
        <div className="section-heading">
          <div><h2>Rekonsiliasi</h2><p>Menghitung rekonsiliasi…</p></div>
          <span className="reconciliation-loading-label"><RefreshCw className="spin" aria-hidden size={15} />Menghitung rekonsiliasi…</span>
        </div>
        <Panel>
          <p className="reconciliation-helper">Memeriksa nominal, rekening, biaya transfer, dan blocker.</p>
          <div className="metric-grid reconciliation-skeleton" aria-hidden="true">
            {["Neto PDF", "Transfer", "Biaya transfer", "Selisih"].map((label) => <div key={label}><span>{label}</span><i /></div>)}
          </div>
          <div className="population-row reconciliation-skeleton-chips" aria-hidden="true"><i /><i /><i /></div>
          <div className="reconciliation-skeleton-blocker" aria-hidden="true"><i /><i /></div>
        </Panel>
      </section>
    ) : null}

    {reconciliation ? (
      <section className="workflow-section">
        <div className="section-heading">
          <div><h2>Rekonsiliasi</h2><p>Nominal berikut dihitung oleh backend dari data sumber dan rekening yang layak.</p></div>
          {reconciliationRefreshing ? <span className="reconciliation-loading-label" role="status"><RefreshCw className="spin" aria-hidden size={15} />Memperbarui rekonsiliasi…</span> : state.reconciliation.isError ? <StatusBadge label="Perlu dimuat ulang" tone="warning" /> : <StatusBadge label={reconciliation.finalizable ? "Siap difinalkan" : "Belum siap"} tone={reconciliation.finalizable ? "success" : "warning"} />}
        </div>
        <Panel>
          <div className="metric-grid">
            <div><span>Neto PDF</span><strong>{formatCurrency(reconciliation.printed_net_total)}</strong></div>
            <div><span>Transfer</span>
              <strong>{transferCalcIncomplete ? <em className="muted">Belum dihitung</em> : formatCurrency(reconciliation.transfer_total)}</strong>
            </div>
            <div><span>Biaya transfer</span>
              <strong>{transferCalcIncomplete ? <em className="muted">Belum dihitung</em> : formatCurrency(reconciliation.fee_total)}</strong>
            </div>
            <div><span>Selisih rekonsiliasi</span>
              <strong>{reconciliation.difference_known ? formatCurrency(reconciliation.difference) : "Belum diketahui"}</strong>
            </div>
          </div>
          <div className="population-row">
            <span>{reconciliation.approved_rows} disetujui</span>
            <span>{reconciliation.unresolved_rows} belum selesai</span>
            <span>{reconciliation.excluded_rows} dikeluarkan</span>
          </div>

          {hasFinalizationBlockers ? (
            <div className="blocker-actions">
              <Alert tone="warning" title="Finalisasi masih diblokir">
                <ul>
                  {reconciliation.blockers.map((blocker) => <li key={blocker}>{reconciliationBlockerLabel(blocker)}</li>)}
                  {blockerRowIssues.map((issue, index) => <li key={`${issue.category}-${issue.page}-${issue.row}-${index}`}><strong>Hal. {issue.page} · Baris {issue.row}:</strong> {issueReasonLabel(issue)}</li>)}
                </ul>
              </Alert>
              <div className="blocker-action-buttons">
                {showPeriodAction ? (
                  <Button variant="secondary" onClick={() => setShowPeriodDialog(true)}>
                    <CalendarClock size={16} />Konfirmasi periode
                  </Button>
                ) : null}
                {unresolvedIssues.length > 0 ? (
                  <Button variant="secondary" onClick={() => document.getElementById("reconciliation-warning-details")?.scrollIntoView({ behavior: "smooth", block: "nearest" })}>
                    <AlertTriangle size={16} />Lihat rincian peringatan
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {showPeriodDialog ? (
            <div className="period-dialog" role="dialog" aria-label="Konfirmasi periode">
              <div className="dialog-card">
                <h3>Konfirmasi periode payroll</h3>
                <p>Pilih bulan dan tahun yang tercantum pada rekap gaji.</p>
                <div className="period-dialog__fields">
                  <label className="period-dialog__field">
                    <span>Bulan</span>
                    <select value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)}>
                      <option value="" disabled>Pilih bulan</option>
                      {MONTHS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="period-dialog__field">
                    <span>Tahun</span>
                    <select value={periodYear} onChange={(e) => setPeriodYear(e.target.value)}>
                      <option value="" disabled>Pilih tahun</option>
                      {YEARS.map((year) => <option key={year} value={String(year)}>{year}</option>)}
                    </select>
                  </label>
                </div>
                {periodError ? <Alert tone="error" title="Periode tidak tersimpan">{periodError.explanation}</Alert> : null}
                <div className="dialog-actions">
                  <Button variant="secondary" onClick={() => { setShowPeriodDialog(false); setPeriodMonth(""); setPeriodYear(""); setPeriodError(null); }}>Batal</Button>
                  <Button
                    onClick={() => void handleConfirmPeriod()}
                    disabled={!periodMonth || !periodYear || activeBusy}
                    loading={activeOperation === "confirmPeriod"}
                    loadingLabel={OPERATION_LABELS.confirmPeriod}
                  >
                    <CalendarClock size={16} />Simpan periode
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Informational source warnings: collapsed summary, details on demand. */}
          <SourceWarnings nominal={sourceArithmeticWarnings} rounding={toleranceIssues} roundingTotal={reconciliation.rounding_delta_total} />

          {informationalIssues.length > 0 ? (
            <div className="arithmetic-issues informational-issues">
              <h3>Informasi rekonsiliasi · {informationalIssues.length}</h3>
              <div className="issue-list">
                {informationalIssues.map((issue, idx) => <div key={`${issue.category}-${issue.page}-${issue.row}-${idx}`} className="issue-card issue-card--informational"><span className="issue-ref">Hal. {issue.page} · Baris {issue.row}</span><span className="issue-reason">{issueReasonLabel(issue)}</span></div>)}
              </div>
            </div>
          ) : null}

          {unresolvedIssues.length > 0 ? (
            <div id="reconciliation-warning-details" className="arithmetic-issues">
              <h3>{unresolvedIssues.length} peringatan nominal</h3>
              <div className="issue-list">
                {unresolvedIssues.map((issue, idx) => (
                  <div key={`${issue.category}-${issue.page}-${issue.row}-${idx}`} className="issue-card">
                    <span className="issue-ref">Hal. {issue.page} · Baris {issue.row}</span>
                    <span className="issue-reason">{issue.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {batch.status !== "finalized" ? (
            <div className="finalize-action">
              <p>{reconciliationCurrent ? "Finalisasi membuat snapshot tetap untuk seluruh batch. Jika satu baris tidak valid, tidak ada bagian batch yang difinalkan." : "Menunggu rekonsiliasi terbaru sebelum kelayakan finalisasi dapat dipastikan."}</p>
              <Button
                onClick={() => void handleFinalizeAndExport()}
                loading={finalizePhase !== "idle"}
                loadingLabel={finalizePhase === "exporting" ? OPERATION_LABELS.generate : finalizePhase === "finalizing" ? OPERATION_LABELS.finalizeAndExport : undefined}
                disabled={!reconciliationCurrent || !reconciliation.finalizable || finalizePhase !== "idle" || activeBusy}
              >
                <FileCheck2 size={17} />{reconciliationCurrent ? "Finalisasi & buat Excel" : "Menunggu rekonsiliasi"}
              </Button>
            </div>
          ) : null}
        </Panel>
      </section>
    ) : null}

    {batch.status === "finalized" ? (
      <section className="workflow-section">
        <div className="section-heading">
          <div>
            <h2>File bank</h2>
            <p>File siap diunduh berarti artefak tersimpan, bukan bukti transfer bank telah dilakukan.</p>
          </div>
          {allReady ? (
            <Button
              onClick={() => void downloadAllReady()}
              loading={bulkDownload.state.isDownloadingAll}
              loadingLabel={bulkDownloadProgressLabel(bulkDownload.state)}
            >
              <Download size={17} />Unduh semua file
            </Button>
          ) : (
            <Button
              onClick={() => void generateExports()}
              loading={activeOperation === "generate" || state.hasActiveExportRow}
              loadingLabel={activeOperation === "generate" ? OPERATION_LABELS.generate : "Sedang membuat file…"}
              disabled={activeBusy}
            >
              <RefreshCw size={17} />Buat / coba ulang ekspor
            </Button>
          )}
        </div>
        <Panel>
          {state.exportsQuery.isLoading ? <Skeleton lines={2} /> : state.exportsQuery.isError ? <BaseInlineError error={state.exportsQuery.error} /> : state.exportsQuery.data?.length ? (
            <div className="export-list">
              {state.exportStatusQuery.isError ? (
                <p className="export-list__stale"><AlertTriangle aria-hidden size={14} />Status belum bisa diperbarui</p>
              ) : null}
              {state.exportsQuery.data.map((file) => {
                const config = EXPORT_STATUS[file.status];
                // Pause the bar when the last status poll failed: the server
                // state is unknown, so an animating bar would imply a fresh
                // backend update. Resume on the next successful poll.
                const isStale = state.exportStatusQuery.isError && file.status === "uploading";
                const isDownloading = bulkDownload.state.isDownloadingAll && bulkDownload.state.downloadingExportId === file.id;
                return (
                  <div key={file.id}>
                    <span><strong>{file.output_group}</strong><small>{file.filename} · {file.recipient_count} penerima · {formatCurrency(file.total_amount)}</small></span>
                    {file.status === "uploading" ? (
                      <div className={`file-progress${isStale ? " file-progress--paused" : ""}`}>
                        <span className="file-progress__label">{isStale ? "Status belum bisa diperbarui" : "Menyiapkan file…"}</span>
                        <div className="progress" role="progressbar" aria-label={`Menyiapkan file ${file.output_group}`} aria-busy="true">
                          <span className={`progress__fill progress__fill--indeterminate${isStale ? " progress__fill--paused" : ""}`} />
                        </div>
                      </div>
                    ) : (
                      <StatusBadge label={config.label} tone={config.tone} />
                    )}
                    {file.status === "uploaded" ? <Button variant="secondary" onClick={() => void download(file.id, file.filename)} disabled={isDownloading}><Download size={17} />Unduh</Button> : null}
                  </div>
                );
              })}
              {bulkSummary ? <Alert tone={bulkSummary.tone}>{bulkSummary.message}</Alert> : null}
            </div>
          ) : (
            <EmptyState compact illustration="export" title="File ekspor belum tersedia" description="Buat file bank setelah finalisasi berhasil. Status ini tidak berarti transfer sudah dijalankan." />
          )}
        </Panel>
      </section>
    ) : null}
  </div>;
}
