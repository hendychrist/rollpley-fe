"use client";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, FileText, Search, ShieldAlert, Users } from "lucide-react";
import Link from "next/link";
import { Alert } from "@/components/base/alert";
import { BaseInlineError } from "@/components/base/error-state";
import { Button } from "@/components/base/button";
import { StatusBadge } from "@/components/base/status-badge";
import { AliasManagementDialog } from "@/components/payroll/alias-management-dialog";
import { CandidateComparison } from "@/components/payroll/candidate-comparison";
import { usePayrollCandidateSearch, useMatchSuggestions, useNameSuggestionsQuery } from "@/hooks/use-payroll-review";
import { decodeAliasConflictDetails } from "@/utils/alias-conflict";
import { parseNameSuggestionsFromQuery } from "@/utils/candidate-suggestions";
import type { Employee, EmployeeInput } from "@/type/employee";
import type { AliasConflictDetail, CandidateSuggestion, PayrollMatch } from "@/type/payroll";
import type { PayrollActionResult, ReviewCallResult } from "@/hooks/use-payroll-detail";
import { formatCurrency, periodLabel } from "@/utils/format";
import { getIdentityIssue, usableJobLabel } from "@/utils/identity-issues";

function NewEmployeeForm({ sourceName, create, onCreated, busy, createError, panelId }: { sourceName: string; create: (body: EmployeeInput) => Promise<Employee | null>; onCreated: (employee: Employee) => void; busy: boolean; createError: string | null; panelId: string }) {
  const [open, setOpen] = useState(false);
  const [closed, setClosed] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  // Local pending state: only this form's "Simpan" shows a spinner. `busy`
  // (another guarded payroll operation) only locks it, without a misleading label.
  const [submitting, setSubmitting] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const submittingRef = useRef(false);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Close the form: animate 1fr → 0fr, unmount after transition
  useEffect(() => {
    if (open) { setClosed(false); return; }
    if (closed) return;
    if (reducedMotionRef.current) { setClosed(true); return; }
    const t = window.setTimeout(() => setClosed(true), 280);
    return () => window.clearTimeout(t);
  }, [open]);

  // Focus returns to trigger when user clicks Batal (open goes true→false while !closed)
  useEffect(() => {
    if (open || closed) return;
    triggerRef.current?.focus({ preventScroll: true });
  }, [open, closed]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || busy) return;
    const form = event.currentTarget;
    submittingRef.current = true;
    setSubmitting(true);
    setFormError(null);
    try {
      const data = new FormData(form);
      const nullable = (key: string) => String(data.get(key) ?? "").trim() || null;
      const employee = await create({
        official_name: String(data.get("official_name") ?? "").trim(),
        nik: nullable("nik"),
        employee_number: nullable("employee_number"),
        position: nullable("position"),
        unit: nullable("unit"),
      });
      if (employee) { onCreated(employee); form.reset(); setOpen(false); setFormError(null); }
      else setFormError(createError ?? "Gagal menyimpan data karyawan. Coba lagi.");
    } finally { submittingRef.current = false; setSubmitting(false); }
  }

  const formPanelId = `${panelId}-new-employee`;
  const isOpen = open && !closed;

  return (
    <div className="new-employee">
      <Button
        ref={triggerRef}
        type="button"
        variant="primary"
        className="payroll-create-button"
        onClick={() => setOpen(true)}
        aria-expanded={isOpen}
        aria-controls={formPanelId}
        disabled={open}
      >
        Tambah karyawan
      </Button>

      {/* Wrapper kept in DOM from closed state so browser can animate 0fr→1fr */}
      <div className="payroll-employee-form__motion" data-open={isOpen} aria-hidden={!isOpen}>
        <div className="payroll-employee-form__clip" inert={!open}>
          <form id={formPanelId} onSubmit={submit} className="payroll-employee-form">
            <p className="payroll-employee-form__hint">Pastikan karyawan belum terdaftar di master.</p>
            <div className="payroll-employee-form__fields">
              <label>Nama resmi<input name="official_name" defaultValue={sourceName} required /></label>
              <label>NIK<input name="nik" /></label>
              <label>Nomor karyawan<input name="employee_number" /></label>
              <label>Jabatan<input name="position" /></label>
              <label>Unit<input name="unit" /></label>
            </div>
            {formError ? <Alert tone="error">{formError}</Alert> : null}
            <div className="payroll-employee-form__actions">
              <Button type="button" className="payroll-employee-form__cancel" onClick={() => setOpen(false)} disabled={busy || submitting}>
                Batal
              </Button>
              <Button type="submit" loading={submitting} disabled={busy} loadingLabel="Menyimpan…">
                Simpan
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function displayStatus(status: string) { const labels: Record<string, string> = { pending_identity: "Identitas belum dipastikan", pending_new: "Karyawan baru / belum cocok", pending_account: "Rekening belum terverifikasi", pending_bank_routing: "Routing bank belum terverifikasi" }; return labels[status] ?? status.replaceAll("_", " "); }

function accountBlockerReason(reasonCode: string | undefined): string {
  if (!reasonCode) return "Identitas dapat dikonfirmasi, tetapi rekening utama belum tersedia, belum efektif, atau belum terverifikasi sehingga batch tidak dapat difinalisasi.";
  const map: Record<string, string> = {
    no_verified_primary_account: "Belum ada rekening utama yang terverifikasi. Verifikasi rekening utama karyawan sebelum finalisasi.",
    primary_account_not_effective: "Rekening utama belum efektif untuk periode ini. Perbarui tanggal berlaku rekening.",
    primary_account_unverified: "Rekening utama belum terverifikasi. Lakukan verifikasi rekening sebelum finalisasi.",
  };
  return map[reasonCode] ?? `Identitas dapat dikonfirmasi, tetapi batch tidak dapat difinalisasi sebelum rekening diselesaikan. Alasan: ${reasonCode}.`;
}

// Compact full-width PDF evidence strip shown above the candidate grid
// when comparing two or more candidates.
function SourceEvidenceStrip({ match, sourceName, sourcePosition, sourceUnit, page, row }: {
  match: PayrollMatch; sourceName: string; sourcePosition: string; sourceUnit: string; page: string | number; row: string | number;
}) {
  const sourceAccount = match.Row.account_number;
  const sourceBank = match.Row.bank_name;
  return (
    <section className="source-evidence source-evidence--compact" aria-label="Bukti penggajian dari PDF">
      <span className="source-evidence__icon"><FileText aria-hidden size={16} /></span>
      <dl className="source-evidence__fields">
        <div><dt>Nama</dt><dd>{sourceName || "Tidak terbaca"}</dd></div>
        <div><dt>Jabatan</dt><dd>{sourcePosition}</dd></div>
        <div><dt>Unit</dt><dd>{sourceUnit}</dd></div>
        <div><dt>Neto</dt><dd className="source-amount">{formatCurrency(match.Row.GajiDiterima ?? match.Row.net_amount)}</dd></div>
        <div><dt>Lokasi</dt><dd>Hal. {page} · Baris {row}</dd></div>
        {sourceBank || sourceAccount ? (
          <div><dt>Rekening PDF</dt><dd>
            {sourceBank ?? "—"}{sourceAccount ? ` · ${sourceAccount}` : ""}
          </dd></div>
        ) : null}
        <div><dt>Kode</dt><dd>{match.ReasonCode || match.Status}</dd></div>
      </dl>
    </section>
  );
}

export function ExceptionReview({ match, order, batchId, period, returnTo, open, onOpen, onClose, onResolved, save, createEmployee, createError, busy, removeAlias, onReopened }: {
  match: PayrollMatch; order: number; batchId: string; period?: string;
  returnTo: string;
  open: boolean; onOpen: () => void; onClose: () => void; onResolved: () => void;
  save: (id: string, status: string, employeeId?: string, reason?: string, saveNameVariant?: boolean) => Promise<ReviewCallResult>;
  createEmployee: (body: EmployeeInput) => Promise<Employee | null>;
  createError: string | null;
  busy: boolean;
  /** Fix #11: delete a blocking alias so the reviewer can re-confirm. */
  removeAlias?: (employeeId: string, aliasId: string) => Promise<PayrollActionResult>;
  /** Fix #11: called when the row returns to the pending queue (reopen / alias removed). */
  onReopened?: () => void;
}) {
  const sourceName = match.Row.RawName ?? match.Row.raw_name ?? "";
  const sourcePosition = usableJobLabel(match.Row.RawPosition ?? match.Row.position);
  const sourceUnit = match.Row.RawUnitCode ?? match.Row.unit ?? "Unit tidak tersedia";
  const page = match.Row.Page ?? match.Row.source_page ?? "—";
  const row = match.Row.RowNumber ?? match.Row.source_row ?? "—";

  const [search, setSearch] = useState(sourceName);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [created, setCreated] = useState<Employee | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [decisionMode, setDecisionMode] = useState<"confirm" | "exclude" | null>(null);
  // saveAlias was removed — alias is auto-saved when confirming a suggestion
  // candidate. "Cocokkan sekali" passes skipAlias=true to decide() for the retry path.
  const [aliasConflict, setAliasConflict] = useState<AliasConflictDetail | null>(null);
  const [aliasDialog, setAliasDialog] = useState(false);
  // Synchronous in-flight lock for this card's review PATCH. Held from
  // activation until the success flow has called onResolved(), or released
  // immediately on failure.
  const decidingRef = useRef(false);
  // Which decision control of this card initiated the in-flight PATCH.
  // Scoped per card: other finding cards stay usable.
  const [pendingDecision, setPendingDecision] = useState<"confirm" | "confirm-once" | "exclude" | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = `review-${match.ID}`;

  // --- unmount after close-animation ---
  const [closed, setClosed] = useState(!open);
  const closedRef = useRef(closed);
  const [closing, setClosing] = useState(false);
  const reducedMotionRef = useRef(false);

  const candidates = usePayrollCandidateSearch(search);
  const candidateRows = useMemo(() => {
    const rows = candidates.data?.rows ?? [];
    return created && !rows.some((item) => item.id === created.id) ? [created, ...rows] : rows;
  }, [candidates.data?.rows, created]);

  // --- Suggestions ---
  // For new matching (pending_identity + name_variant_suggestion):
  //   read from match.Candidate (already set by BE at match time).
  // For old batches (pending_new + no_match):
  //   match.Candidate is empty → fetch fresh suggestions via GET endpoint.
  const staticSuggestions = useMatchSuggestions(match.Candidate);
  const isOldBatchNoMatch = match.Status === "pending_new";
  const nameSuggestionsQuery = useNameSuggestionsQuery(batchId, match.ID, isOldBatchNoMatch && open);
  const fetchedSuggestions = useMemo(
    () => parseNameSuggestionsFromQuery(nameSuggestionsQuery.data),
    [nameSuggestionsQuery.data],
  );
  // Combine: static (from match.Candidate) + fetched (from GET endpoint)
  const suggestions = useMemo(() => {
    const combined = [...staticSuggestions, ...fetchedSuggestions];
    // Dedup by employee_id
    const seen = new Set<string>();
    return combined.filter((s) => {
      if (seen.has(s.employee_id)) return false;
      seen.add(s.employee_id);
      return true;
    });
  }, [staticSuggestions, fetchedSuggestions]);

  // Suggestion employees from BE that aren't in the search results.
  // These are lightweight Employee stubs — CandidateComparison fetches the
  // full employee record (accounts, aliases, NIK) on mount via
  // usePayrollCandidateEvidence, so the stub only provides display fields.
  const suggestionExtras = useMemo(
    () => suggestions
      .filter((s) => !candidateRows.some((c) => c.id === s.employee_id))
      .map((s) => ({
        id: s.employee_id,
        official_name: s.name,
        position: s.position ?? null,
        unit: s.unit ?? null,
        nik: null,
        employee_number: null,
        employment_status: "active" as const,
        // Required by the Employee type but unused by CandidateComparison
        identity_verification_status: "",
        joined_at: null,
        ended_at: null,
        created_at: "",
        updated_at: "",
      })) as Employee[],
    [suggestions, candidateRows],
  );
  const allCandidateRows = useMemo(
    () => (suggestionExtras.length ? [...candidateRows, ...suggestionExtras] : candidateRows),
    [candidateRows, suggestionExtras],
  );
  const selectedCandidate = allCandidateRows.find((employee) => employee.id === selectedId);
  const showCompactEvidence = allCandidateRows.length >= 2;

  // Which suggestions have a suggestion_reason to display
  const suggestionMap = useMemo(() => {
    const map = new Map<string, CandidateSuggestion>();
    suggestions.forEach((s: CandidateSuggestion) => map.set(s.employee_id, s));
    return map;
  }, [suggestions]);

  // Reset alias state when the selected candidate changes
  useEffect(() => { setAliasAction("none"); setAliasConflict(null); setAliasDialog(false); }, [selectedId]);

  useEffect(() => { if (decisionMode === "exclude") reasonRef.current?.focus(); }, [decisionMode]);

  // Detect prefers-reduced-motion on mount
  useEffect(() => {
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const [opening, setOpening] = useState(open);
  const cancelOpenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!open) {
      setOpening(false);
      return;
    }
    if (closed) {
      setClosed(false);
      closedRef.current = false;
      setClosing(false);
      if (reducedMotionRef.current) { setOpening(true); return; }
      let cancelled = false;
      requestAnimationFrame(() => { requestAnimationFrame(() => { if (!cancelled) setOpening(true); }); });
      const cleanup = () => { cancelled = true; };
      cancelOpenRef.current = cleanup;
      return cleanup;
    }
    setClosing(false);
    setOpening(true);
  }, [open, closed]);

  useEffect(() => {
    if (open || closedRef.current) return;
    cancelOpenRef.current?.();
    setClosing(true);
    if (reducedMotionRef.current) {
      setClosed(true); closedRef.current = true; setClosing(false); return;
    }
    if (panelRef.current?.contains(document.activeElement)) {
      toggleRef.current?.focus({ preventScroll: true });
    }
    const t = window.setTimeout(() => {
      setClosed(true); closedRef.current = true; setClosing(false);
    }, 280);
    return () => window.clearTimeout(t);
  }, [open]);

  const bodyInert = closing || closed;
  const issue = getIdentityIssue(match.ReasonCode || match.Status);
  const financialBlocker = match.Status === "pending_account" || match.Status === "pending_bank_routing";

  const selectCandidate = (id: string) => { setSelectedId(id); setDecisionMode("confirm"); setValidation(null); };

  // The alias checkbox is available when:
  // 1. The row has BE suggestions (name_variant_suggestion or no_match with candidates),
  // 2. A candidate is selected,
  // 3. The selected candidate's master name differs from the PDF source name
  //    (i.e. saving the source spelling as an alias would be useful).
  const selectedSuggestion = selectedId ? suggestionMap.get(selectedId) : undefined;
  const canSaveAlias = Boolean(selectedSuggestion) && sourceName.trim().length >= 2;

  // Alias state: "none" (not set), "saved" (new alias inserted), "existing" (already present)
  const [aliasAction, setAliasAction] = useState<"none" | "saved" | "existing">("none");

  // "Cocokkan sekali" — confirm the match without saving the alias.
  // Used when the alias conflicts with another employee (409 CONFLICT).
  // The skip flag is passed as an argument (not a ref), so a blocked
  // invocation can never leave a stale "skip alias" behind for the next decision.
  function confirmOnce() {
    if (decidingRef.current) return;
    setAliasConflict(null);
    void decide("auto_matched", true);
  }

  async function decide(status: "auto_matched" | "rejected", skipAlias = false) {
    if (decidingRef.current) return;
    setValidation(null);
    setAliasConflict(null);
    setAliasAction("none");
    // A reason is required only for exclusion; for a confirmation the selected employee is the decision and the reason is optional.
    if (status === "rejected" && !reason.trim()) { reasonRef.current?.focus(); return setValidation("Alasan keputusan wajib diisi."); }
    if (status === "auto_matched" && !selectedId) return setValidation("Pilih satu kandidat karyawan terlebih dahulu.");
    // Acquire the lock and show pending synchronously, before any async work.
    decidingRef.current = true;
    setPendingDecision(status === "rejected" ? "exclude" : skipAlias ? "confirm-once" : "confirm");
    let keepLockedUntilResolved = false;
    try {
      // Alias is auto-saved when confirming a suggestion candidate whose
      // PDF source name differs from the master name (canSaveAlias=true),
      // unless skipAlias is set by "Cocokkan sekali" after a 409 CONFLICT.
      const saveNameVariant = status === "auto_matched" && canSaveAlias && !skipAlias;
      const result = await save(
        match.ID,
        status,
        status === "rejected" ? "" : selectedId ?? undefined,
        reason.trim(),
        status === "rejected" ? false : saveNameVariant,
      );

      if (result.ok) {
        setSaved(true);
        const alias = result.result.alias;
        if (alias) setAliasAction(alias.action);
        // Keep the decision locked through the completion delay: there is no
        // re-entry window between a successful PATCH and onResolved().
        keepLockedUntilResolved = true;
        window.setTimeout(() => {
          setReason(""); setSelectedId(null); setDecisionMode(null);
          setAliasAction("none"); setAliasConflict(null);
          onResolved();
          decidingRef.current = false;
          setPendingDecision(null);
        }, 240);
      } else {
        // 409 CONFLICT — BE rolls back the match decision when the alias
        // conflicts. Decoded evidence lives in error.details (JSON string).
        const err = result.error;
        const msg = err.backendMessage || err.message;
        const conflict = err.status === 409 ? decodeAliasConflictDetails(err) : undefined;
        const isAliasConflict = conflict !== undefined || msg.toLowerCase().includes("alias") || msg.includes("name variant");
        if (status === "auto_matched" && saveNameVariant && isAliasConflict) {
          setAliasConflict(conflict ?? {
            alias_name: sourceName.trim(),
            owner_name: undefined,
            conflict_type: undefined,
          });
        } else {
          setValidation(msg || "Gagal menyimpan keputusan. Coba lagi.");
        }
      }
    } finally {
      // Failure (or unexpected throw): release immediately so the card stays actionable.
      if (!keepLockedUntilResolved) { decidingRef.current = false; setPendingDecision(null); }
    }
  }

  const startExclusion = () => {
    if (decisionMode !== "exclude") { setSelectedId(null); setDecisionMode("exclude"); setValidation(null); }
    else void decide("rejected");
  };

  return (
    <article id={`finding-${match.ID}`} className={`exception-card ${open ? "exception-card--open" : ""} ${saved ? "exception-card--saved" : ""}`}>
      <header className="exception-row">
        <span className="exception-order" aria-label={`Temuan ${order}`}>{String(order).padStart(2, "0")}</span>
        <div className="exception-identity">
          <h3>{sourceName || "Nama tidak terbaca"}</h3>
          <p>{sourcePosition} · {sourceUnit}</p>
          <small>Halaman {page} · Baris {row}</small>
        </div>
        <strong className="exception-amount">{formatCurrency(match.Row.GajiDiterima ?? match.Row.net_amount)}</strong>
        <div className="exception-status">
          <StatusBadge label={displayStatus(match.Status)} tone={financialBlocker ? "danger" : "warning"} />
          <span>{issue.title}</span>
        </div>
        <Button
          ref={toggleRef}
          className="exception-toggle"
          type="button"
          variant={open ? "ghost" : "secondary"}
          onClick={open ? onClose : onOpen}
          aria-expanded={open}
          aria-controls={panelId}
        >
          {open ? "Tutup" : "Periksa temuan"}
          <ChevronDown aria-hidden size={16} />
        </Button>
      </header>

      {!closed && (
        <div id={panelId} ref={panelRef} className={`exception-body${opening ? " exception-body--open" : ""}`} aria-hidden={!open} inert={bodyInert}>
          <div className="exception-body__inner"><div className="exception-body__content">
            {saved ? <Alert tone="success" title="Keputusan tersimpan">Hasil backend telah diterima. Antrean sedang diperbarui.</Alert> : null}

            <div className="review-issue">
              <Alert tone={issue.tone} title={issue.title}>{issue.detail}</Alert>
              {match.Status === "pending_account" ? (
                <Alert tone="error" title="Rekening belum siap untuk payroll">{accountBlockerReason(match.ReasonCode)}</Alert>
              ) : null}
              {match.Status === "pending_bank_routing" ? (
                <Alert tone="error" title="Routing bank tujuan belum terverifikasi">
                  Finalisasi Bank Lain tetap terblokir sampai master bank diperbaiki.
                </Alert>
              ) : null}
            </div>

            {/* Compact full-width PDF strip when comparing ≥2 candidates */}
            {showCompactEvidence ? (
              <SourceEvidenceStrip match={match} sourceName={sourceName} sourcePosition={sourcePosition} sourceUnit={sourceUnit} page={page} row={row} />
            ) : null}

            <div className={`comparison-workspace ${showCompactEvidence ? "comparison-workspace--candidates" : ""}`}>
              {/* Full PDF panel — only when no compact strip */}
              {!showCompactEvidence ? (
                <section className="source-evidence" aria-labelledby={`source-${match.ID}`}>
                  <div className="comparison-title">
                    <span><FileText aria-hidden size={18} /></span>
                    <div><small>Bukti penggajian</small><h4 id={`source-${match.ID}`}>Sumber PDF</h4></div>
                  </div>
                  <dl>
                    <div><dt>Nama pada PDF</dt><dd>{sourceName || "Tidak terbaca"}</dd></div>
                    <div><dt>Jabatan</dt><dd>{sourcePosition}</dd></div>
                    <div><dt>Unit</dt><dd>{sourceUnit}</dd></div>
                    <div><dt>Gaji / neto</dt><dd className="source-amount">{formatCurrency(match.Row.GajiDiterima ?? match.Row.net_amount)}</dd></div>
                    <div><dt>Lokasi sumber</dt><dd>Halaman {page}, baris {row}</dd></div>
                    <div><dt>Kode temuan</dt><dd>{match.ReasonCode || match.Status}</dd></div>
                    {match.Row.Warnings?.length ? <div><dt>Peringatan sumber</dt><dd>{match.Row.Warnings.join(", ")}</dd></div> : null}
                  </dl>
                </section>
              ) : null}

              <section className={`candidate-workspace ${showCompactEvidence ? "candidate-workspace--full" : ""}`} aria-labelledby={`candidate-${match.ID}`}>
                <div className="comparison-title">
                  <span><Users aria-hidden size={18} /></span>
                  <div>
                    <small>Data pembanding</small>
                    <h4 id={`candidate-${match.ID}`}>Kandidat Master Karyawan</h4>
                  </div>
                </div>

                <label className="candidate-search">
                  <span>Cari master karyawan</span>
                  <span className="search-control">
                    <Search aria-hidden size={17} />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Cari nama atau nomor karyawan"
                    />
                  </span>
                </label>
                <p className="field-help">Kandidat tidak dipilih otomatis. Bandingkan identitas, unit, jabatan, alias, dan rekening.</p>

                {candidates.isFetching ? <p className="muted" role="status">Memuat kandidat…</p> : null}
                {candidates.isError ? <BaseInlineError error={candidates.error} /> : null}

                {/* BE-computed name-variant suggestions.
                    New matching: read from match.Candidate (already set at match time).
                    Old batches (pending_new): fetched via GET name-suggestions endpoint. */}
                {nameSuggestionsQuery.isFetching && isOldBatchNoMatch ? (
                  <div className="suggestion-section" aria-label="Saran nama mirip">
                    <div className="suggestion-section__header">
                      <span className="suggestion-section__eyebrow">Saran nama mirip</span>
                    </div>
                    <p className="muted" role="status">Mencari nama mirip…</p>
                  </div>
                ) : nameSuggestionsQuery.isError && isOldBatchNoMatch ? (
                  <div className="suggestion-section" aria-label="Saran nama mirip">
                    <div className="suggestion-section__header">
                      <span className="suggestion-section__eyebrow">Saran nama mirip</span>
                    </div>
                    <BaseInlineError error={nameSuggestionsQuery.error} />
                    <Alert tone="info">Gagal memuat saran. Gunakan pencarian manual di atas.</Alert>
                  </div>
                ) : suggestions.length > 0 ? (
                  <div className="suggestion-section" aria-label="Saran nama mirip">
                    <div className="suggestion-section__header">
                      <span className="suggestion-section__eyebrow">Saran nama mirip</span>
                      <span className="field-help">Saran dari backend — cocokkan dengan master karyawan sebelum memilih.</span>
                    </div>
                    <div className="candidate-list candidate-list--grid">
                      {suggestionExtras.map((employee) => {
                        const suggestion = suggestionMap.get(employee.id);
                        return (
                          <CandidateComparison
                            key={employee.id}
                            employee={employee}
                            selected={selectedId === employee.id}
                            onSelect={selectCandidate}
                            returnTo={returnTo}
                            groupName={`payroll-candidate-${match.ID}`}
                            sourceName={suggestion?.source_name ?? sourceName}
                            suggestionLabel={suggestion?.suggestion_reason}
                          />
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Main candidate list — excludes suggestion extras that are
                    already rendered in the dedicated suggestion section above.
                    Search results that overlap with suggestions are deduped
                    by the filter in suggestionExtras. */}
                <div className={`candidate-list ${allCandidateRows.length >= 2 ? "candidate-list--grid" : ""}`}>
                  {candidateRows.map((employee) => {
                    const suggestion = suggestionMap.get(employee.id);
                    return (
                      <CandidateComparison
                        key={employee.id}
                        employee={employee}
                        selected={selectedId === employee.id}
                        onSelect={selectCandidate}
                        returnTo={returnTo}
                        groupName={`payroll-candidate-${match.ID}`}
                        sourceName={suggestion ? (suggestion.source_name ?? sourceName) : undefined}
                        suggestionLabel={suggestion?.suggestion_reason}
                      />
                    );
                  })}
                  {!candidates.isFetching && !candidates.isError && !allCandidateRows.length ? (
                    <Alert tone="info">Tidak ada karyawan yang ditemukan. Ubah pencarian atau buat data baru setelah bukti HR diperiksa.</Alert>
                  ) : null}
                </div>

                <NewEmployeeForm sourceName={sourceName} create={createEmployee} onCreated={(emp) => { setCreated(emp); setSelectedId(emp.id); setDecisionMode("confirm"); setValidation(null); setAliasConflict(null); setAliasAction("none"); }} createError={createError} busy={busy} panelId={panelId} />
                {created ? (
                  <Alert tone="success">
                    Data {created.official_name} dibuat, tetapi belum siap dibayar.{" "}
                    <Link href={`/master-karyawan/${created.id}?setup=account&returnTo=${encodeURIComponent(returnTo)}`}>
                      Lengkapi dan verifikasi rekening
                    </Link>.
                  </Alert>
                ) : null}
              </section>
            </div>

            {decisionMode === "confirm" ? (
              <section className="decision-reason">
                <div>
                  <h4>Alasan keputusan (opsional)</h4>
                  <p>Tambahkan catatan bukti kecocokan dengan {selectedCandidate?.official_name ?? "kandidat ini"} bila diperlukan.</p>
                </div>
                <label>
                  <span className="sr-only">Alasan keputusan (opsional)</span>
                  <textarea ref={reasonRef} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Tuliskan bukti HR yang digunakan (opsional)" />
                </label>
                {/* Alias auto-saved on confirm when a suggestion candidate is
                    selected and PDF source name differs from master name.
                    On 409 CONFLICT (alias already used by another employee),
                    show "Cocokkan sekali" to retry without saving the alias. */}
                {canSaveAlias && selectedId && (aliasAction !== "none" || aliasConflict) ? (
                  <div className="alias-option">
                    {aliasAction === "saved" ? (
                      <span className="alias-option__status alias-option__status--success">Alias &ldquo;{sourceName}&rdquo; disimpan.</span>
                    ) : null}
                    {aliasAction === "existing" ? (
                      <span className="alias-option__status alias-option__status--success">Alias &ldquo;{sourceName}&rdquo; sudah ada untuk karyawan ini.</span>
                    ) : null}
                    {aliasConflict ? (
                      <div className="alias-option__conflict">
                        <span className="alias-option__status alias-option__status--error">
                          {aliasConflict.conflict_type === "alias_ownership"
                            ? <>Alias &ldquo;{aliasConflict.alias_name ?? sourceName}&rdquo; sudah digunakan{aliasConflict.owner_name ? <> oleh <strong>{aliasConflict.owner_name}</strong></> : null}.</>
                            : aliasConflict.conflict_type === "official_name_collision"
                              ? <>Nama &ldquo;{aliasConflict.alias_name ?? sourceName}&rdquo; adalah nama resmi karyawan lain{aliasConflict.owner_name ? <> ({aliasConflict.owner_name})</> : ""}.</>
                              : <>Alias &ldquo;{aliasConflict.alias_name ?? sourceName}&rdquo; tidak dapat disimpan — bentrok dengan data master.</>}
                        </span>
                        <div className="alias-option__actions">
                          <Button type="button" variant="secondary" onClick={confirmOnce} loading={pendingDecision === "confirm-once"} loadingLabel="Menyimpan keputusan…" disabled={pendingDecision !== null}>
                            Cocokkan sekali
                          </Button>
                          {removeAlias ? (
                            <Button type="button" variant="ghost" onClick={() => setAliasDialog(true)}>
                              Tinjau alias
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {validation ? <Alert tone="error">{validation}</Alert> : null}
              </section>
            ) : decisionMode === "exclude" ? (
              <section className="decision-reason">
                <div>
                  <h4>Keluarkan dari payroll ini?</h4>
                  <p><strong>{sourceName || "Nama tidak terbaca"}</strong> · {formatCurrency(match.Row.GajiDiterima ?? match.Row.net_amount)}{period ? ` · ${periodLabel(period)}` : ""}. Baris ini tidak akan masuk ekspor bank batch ini.</p>
                </div>
                <label>
                  <span>Alasan mengeluarkan</span>
                  <textarea ref={reasonRef} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Tuliskan alasan baris dikeluarkan dari batch ini" required />
                </label>
                {validation ? <Alert tone="error">{validation}</Alert> : null}
              </section>
            ) : null}

            <footer className="exception-actions">
              <span><ShieldAlert aria-hidden size={17} />Keputusan hanya tersimpan setelah dikonfirmasi.</span>
              <div>
                <Button type="button" variant="ghost" onClick={onClose}>Periksa nanti</Button>
                <Button type="button" variant="secondary" onClick={startExclusion} loading={pendingDecision === "exclude"} loadingLabel="Menyimpan keputusan…" disabled={pendingDecision !== null}>
                  {decisionMode === "exclude" ? "Keluarkan temuan" : "Keluarkan dengan alasan"}
                </Button>
                <Button
                  type="button"
                  onClick={() => void decide("auto_matched")}
                  loading={pendingDecision === "confirm"}
                  loadingLabel="Menyimpan keputusan…"
                  disabled={!selectedId || decisionMode !== "confirm" || pendingDecision !== null}
                >
                  {selectedCandidate ? `Konfirmasi ${selectedCandidate.official_name}` : "Konfirmasi kecocokan"}
                </Button>
              </div>
            </footer>

            {removeAlias ? (
              <AliasManagementDialog
                open={aliasDialog}
                conflict={aliasConflict ?? undefined}
                candidateName={selectedCandidate?.official_name}
                onRemoved={() => { setAliasDialog(false); setAliasConflict(null); onReopened?.(); }}
                onClose={() => setAliasDialog(false)}
                removeAlias={removeAlias}
                busy={busy}
              />
            ) : null}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
