"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/base/button";
import { Alert } from "@/components/base/alert";
import { Pagination } from "@/components/base/pagination";
import { RangePagination } from "@/components/base/range-pagination";
import { ExceptionReview } from "@/components/payroll/exception-review";
import { ReopenMatchDialog } from "@/components/payroll/reopen-match-dialog";
import { Skeleton } from "@/components/base/skeleton";
import type { PayrollActionResult, ReviewCallResult } from "@/hooks/use-payroll-detail";
import type { Employee, EmployeeInput } from "@/type/employee";
import type { PayrollMatch } from "@/type/payroll";
import { formatCurrency } from "@/utils/format";

export type ReviewFilter = "all" | "identity" | "account";

/**
 * BE serializes ParsedRow without JSON tags (parse.go) — the real wire keys
 * are Go field names. Read the PascalCase fields, fall back to the legacy
 * lowercase ones, and return "" when a field is genuinely absent so the UI
 * omits the segment instead of printing a bare "Hal. · Baris".
 */
export function resolvedRowMeta(match: PayrollMatch): { name: string; position: string; location: string } {
  const row = match.Row;
  const name = row.RawName ?? row.raw_name ?? "";
  const position = row.RawPosition ?? row.position ?? "";
  const page = row.Page ?? row.source_page;
  const number = row.RowNumber ?? row.source_row;
  const location = [page != null ? `Hal. ${page}` : null, number != null ? `Baris ${number}` : null].filter(Boolean).join(" · ");
  return { name, position, location };
}

function categoryFor(match: PayrollMatch): Exclude<ReviewFilter, "all"> {
  return match.Status === "pending_account" || match.Status === "pending_bank_routing" || match.ReasonCode === "missing_destination_routing_code" ? "account" : "identity";
}

export function ReviewQueue({ matches, pendingTotal, pendingQueueLoading, batchId, period, initialActiveId, initialFilter, pendingPage, setPendingPage, pendingLoadingPage, pendingError, retryPendingPage, save, createEmployee, createError, busy, removeAlias, reopen, resolvedMatches, resolvedPage, setResolvedPage, resolvedSearch, setResolvedSearch, rejectedMatches, rejectedPage, setRejectedPage, retryRejectedPage }: { matches: PayrollMatch[]; pendingTotal: number; pendingQueueLoading: boolean; batchId: string; period?: string; initialActiveId?: string; initialFilter: ReviewFilter; pendingPage: number; setPendingPage: (page: number) => void; pendingLoadingPage: number | null; pendingError: unknown; retryPendingPage: () => void; save: (id: string, status: string, employeeId?: string, reason?: string, saveNameVariant?: boolean) => Promise<ReviewCallResult>; createEmployee: (body: EmployeeInput) => Promise<Employee | null>; createError: string | null; busy: boolean; removeAlias?: (employeeId: string, aliasId: string) => Promise<PayrollActionResult>; reopen?: (matchId: string, reason: string) => Promise<PayrollActionResult>; resolvedMatches?: { data?: { rows: PayrollMatch[]; meta: { total: number } }; isLoading: boolean; isError: boolean }; resolvedPage: number; setResolvedPage: (page: number) => void; resolvedSearch: string; setResolvedSearch: (query: string) => void; rejectedMatches: { data?: { rows: PayrollMatch[]; meta: { total: number } }; isLoading: boolean; isFetching: boolean; isError: boolean }; rejectedPage: number; setRejectedPage: (page: number) => void; retryRejectedPage: () => void }) {
  // The pending queue is server-filtered (status=pending, 5 rows/page).
  // `matches` already contains only pending rows for the current page.
  const pending = matches;
  // Fix #11: confirmed rows come from their own paginated query
  // (status=auto_matched, 5 per page) — independent of the pending queue.
  // Section visibility is data-driven, never a loading assumption:
  // - guided review block (heading/temuan/antrean/filters/empty state):
  //   rendered only when the pending total is known (> 0); an unknown total
  //   (initial load in flight or a page error) keeps the existing loading
  //   behavior, and a confirmed total of 0 removes the whole block from the DOM.
  // - "Sudah dikonfirmasi": rendered only once its total is known and > 0.
  // - "Dikeluarkan": rendered only once the rejected total is known and > 0;
  //   "Memuat…" / error copy live inside the body, not on a visible card.
  const showPendingSection = !pendingQueueLoading && pendingError == null && pendingTotal > 0;
  const showResolvedSection = !resolvedMatches?.isLoading && !resolvedMatches?.isError && (resolvedMatches?.data?.meta?.total ?? 0) > 0;
  const showRejectedSection = !rejectedMatches.isLoading && !rejectedMatches.isError && (rejectedMatches.data?.meta?.total ?? 0) > 0;
  const [filter, setFilter] = useState<ReviewFilter>(initialFilter);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reopenFor, setReopenFor] = useState<PayrollMatch | null>(null);
  const [reopenMode, setReopenMode] = useState<"confirmed" | "rejected">("confirmed");
  const [resolvedOpen, setResolvedOpen] = useState(false);
  const [rejectedOpen, setRejectedOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [resolvedSearchInput, setResolvedSearchInput] = useState(resolvedSearch);
  const resolvedSearchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleResolvedSearchChange = useCallback((value: string) => {
    setResolvedSearchInput(value);
    if (resolvedSearchTimerRef.current) clearTimeout(resolvedSearchTimerRef.current);
    resolvedSearchTimerRef.current = setTimeout(() => setResolvedSearch(value), 300);
  }, [setResolvedSearch]);
  useEffect(() => () => { if (resolvedSearchTimerRef.current) clearTimeout(resolvedSearchTimerRef.current); }, []);
  const resolvedRows = resolvedMatches?.data?.rows ?? [];
  const resolvedTotal = resolvedMatches?.data?.meta?.total ?? 0;
  const lastResolvedPage = Math.max(1, Math.ceil(resolvedTotal / 5));
  // ponytail: clamp once per data change — reopening the last row of the last
  // page refetches the empty page, and this lands on the nearest valid page.
  useEffect(() => {
    if (resolvedPage > lastResolvedPage) setResolvedPage(lastResolvedPage);
  }, [resolvedPage, lastResolvedPage, setResolvedPage]);
  const rejectedRows = rejectedMatches.data?.rows ?? [];
  const rejectedTotal = rejectedMatches.data?.meta?.total;
  const lastRejectedPage = Math.max(1, Math.ceil((rejectedTotal ?? 0) / 5));
  useEffect(() => {
    if (rejectedTotal != null && rejectedPage > lastRejectedPage) setRejectedPage(lastRejectedPage);
  }, [rejectedPage, rejectedTotal, lastRejectedPage, setRejectedPage]);
  const counts = useMemo(() => ({ identity: pending.filter((match) => categoryFor(match) === "identity").length, account: pending.filter((match) => categoryFor(match) === "account").length }), [pending]);
  const visible = useMemo(() => pending.filter((match) => filter === "all" || categoryFor(match) === filter), [filter, pending]);

  const autoOpenedRef = useRef(false);
  const restoreScrollIdRef = useRef<string | null>(initialActiveId ?? null);
  useEffect(() => {
    if (autoOpenedRef.current || !visible.length) return;
    autoOpenedRef.current = true;
    const restored = initialActiveId ? visible.find((match) => match.ID === initialActiveId) : undefined;
    // If a specific match was requested via deep link but it's not on this
    // page, don't open a different finding in its place.
    setActiveId(restored?.ID ?? (initialActiveId ? null : visible[0].ID));
    if (!restored && initialActiveId) restoreScrollIdRef.current = null;
  }, [initialActiveId, visible]);

  useLayoutEffect(() => {
    if (!activeId || restoreScrollIdRef.current !== activeId) return;
    const element = document.getElementById(`finding-${activeId}`);
    if (!element) return;
    restoreScrollIdRef.current = null;
    const bounds = element.getBoundingClientRect();
    if (bounds.top >= 0 && bounds.bottom <= window.innerHeight) return;
    element.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [activeId]);

  useEffect(() => {
    if (activeId && !visible.some((match) => match.ID === activeId)) setActiveId(null);
  }, [activeId, visible]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeId) params.set("review", activeId);
    if (pendingPage > 1) params.set("reviewPage", String(pendingPage));
    if (filter !== "all") params.set("reviewFilter", filter);
    const query = params.toString();
    const url = `/payroll/${batchId}${query ? `?${query}` : ""}`;
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.replaceState(window.history.state, "", url);
  }, [activeId, batchId, filter, pendingPage]);

  const filters = ([
    { id: "all", label: "Semua", count: pending.length },
    { id: "identity", label: "Identitas", count: counts.identity },
    { id: "account", label: "Rekening", count: counts.account },
  ] satisfies Array<{ id: ReviewFilter; label: string; count: number }>).filter((item) => item.id === "all" || item.count > 0);
  const activeIndex = visible.findIndex((match) => match.ID === activeId);
  const scrollToFinding = (id: string, delay: number) => window.setTimeout(() => document.getElementById(`finding-${id}`)?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }), delay);
  const moveTo = (index: number) => { const target = visible[index]; if (!target) return; setActiveId(target.ID); scrollToFinding(target.ID, 0); };
  const handleResolved = (id: string) => { const index = visible.findIndex((match) => match.ID === id); const next = visible[index + 1] ?? visible[index - 1]; setActiveId(next?.ID ?? null); if (next) scrollToFinding(next.ID, 260); };
  const returnUrlFor = (matchId: string) => {
    const params = new URLSearchParams({ review: matchId });
    if (pendingPage > 1) params.set("reviewPage", String(pendingPage));
    if (filter !== "all") params.set("reviewFilter", filter);
    return `/payroll/${batchId}?${params.toString()}`;
  };

  const anySectionVisible = showPendingSection || showResolvedSection || showRejectedSection || pendingQueueLoading || pendingError != null || resolvedMatches?.isLoading || resolvedMatches?.isError || rejectedMatches.isLoading || rejectedMatches.isError || rejectedMatches.isFetching;
  if (!anySectionVisible) return null;

  return <section className="workflow-section payroll-review">
    {showPendingSection ? <div className="review-pending-block">
      <div className="review-heading"><div><span className="review-eyebrow">Guided payroll review</span><h2 id="review-heading">Perlu diperiksa</h2><p>Bandingkan bukti PDF dengan master karyawan, lalu ambil satu keputusan pada satu waktu.</p></div><span className="review-heading__count"><strong>{pendingTotal}</strong> temuan</span></div>
      <div className="review-toolbar"><div><strong>Antrean temuan</strong><span>Pilih satu temuan untuk membuka perbandingan.</span></div><div className="review-filters" role="group" aria-label="Filter temuan">{filters.map((item) => <button key={item.id} type="button" className={filter === item.id ? "is-active" : ""} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{item.count}</span></button>)}</div></div>
      {activeIndex >= 0 ? <nav className="queue-navigation" aria-label="Navigasi antrean pemeriksaan"><span>Temuan <strong>{activeIndex + 1}</strong> dari <strong>{visible.length}</strong> pada halaman ini</span><div>{activeIndex > 0 ? <button type="button" onClick={() => moveTo(activeIndex - 1)}><ChevronLeft aria-hidden size={16} />Sebelumnya</button> : null}{activeIndex < visible.length - 1 ? <button type="button" onClick={() => moveTo(activeIndex + 1)}>Berikutnya<ChevronRight aria-hidden size={16} /></button> : null}</div></nav> : null}
      <div className="match-list">{visible.map((match, index) => <ExceptionReview key={match.ID} match={match} order={(pendingPage - 1) * 5 + pending.findIndex((item) => item.ID === match.ID) + 1 || index + 1} batchId={batchId} period={period} returnTo={returnUrlFor(match.ID)} open={activeId === match.ID} onOpen={() => setActiveId(match.ID)} onClose={() => setActiveId(null)} onResolved={() => handleResolved(match.ID)} save={save} createEmployee={createEmployee} createError={createError} busy={busy} removeAlias={removeAlias} />)}</div>
      <RangePagination page={pendingPage} pageSize={5} total={pendingTotal} loadingPage={pendingLoadingPage} onChange={(page) => setPendingPage(page)} />
    </div> : null}
    {pendingQueueLoading ? <div className="match-list" aria-busy="true">{visible.length ? <div className="match-list__refreshing"><p className="muted" role="status">Memperbarui antrean pemeriksaan…</p></div> : <Skeleton lines={4} />}</div> : null}
    {pendingError != null ? <div className="range-pager-retry"><span>Gagal memuat halaman {pendingPage}.</span><Button variant="secondary" onClick={retryPendingPage}>Coba lagi</Button></div> : null}
    {notice ? <Alert tone="success">{notice}</Alert> : null}
    {showResolvedSection ? <div className="resolved-queue">
        <button type="button" className="resolved-queue__toggle" aria-expanded={resolvedOpen} onClick={() => setResolvedOpen((value) => !value)}>
          <span className="resolved-queue__eyebrow">Sudah dikonfirmasi</span>
          <span className="resolved-queue__count">{resolvedTotal} baris</span>
          <ChevronDown className={`resolved-queue__chevron${resolvedOpen ? " is-open" : ""}`} aria-hidden size={16} />
        </button>
        {resolvedOpen ? (
          <div className="resolved-queue__body" aria-label="Baris yang sudah dikonfirmasi">
            <p className="resolved-queue__hint">Memperbaiki kesalahan: batalkan kecocokan untuk mengembalikan baris ke antrean pemeriksaan.</p>
            <div className="resolved-queue__search">
              <label htmlFor="resolved-search">Cari nama di baris terkonfirmasi</label>
              <input id="resolved-search" type="search" className="review-search-input" placeholder="Cari nama…" value={resolvedSearchInput} onChange={(e) => handleResolvedSearchChange(e.target.value)} />
            </div>
            {resolvedMatches?.isLoading ? <p className="muted" role="status">Memuat baris terkonfirmasi…</p>
              : resolvedRows.length ? (
                <div className="resolved-queue__list">
                  {resolvedRows.map((match) => {
                    const meta = resolvedRowMeta(match);
                    return (
                      <div key={match.ID} className="resolved-row">
                        <div>
                          <strong>{meta.name || "Nama tidak terbaca"}</strong>
                          {meta.position || meta.location ? <small>{[meta.position, meta.location].filter(Boolean).join(" · ")}</small> : null}
                        </div>
                        {reopen ? <Button type="button" variant="secondary" onClick={() => { setReopenMode("confirmed"); setReopenFor(match); }}>
                          Batalkan kecocokan
                        </Button> : null}
                      </div>
                    );
                  })}
                </div>
              ) : <p className="resolved-queue__empty">{resolvedSearch.trim() ? "Tidak ada nama yang cocok." : "Belum ada baris yang dikonfirmasi di halaman ini."}</p>}
            <Pagination page={resolvedPage} pageSize={5} total={resolvedTotal} onChange={(page) => setResolvedPage(Math.min(Math.max(1, page), lastResolvedPage))} />
          </div>
        ) : null}
      </div> : null}
    {showRejectedSection ? <div className="resolved-queue rejected-queue">
      <button type="button" className="resolved-queue__toggle" aria-expanded={rejectedOpen} onClick={() => setRejectedOpen((value) => !value)}>
        <span className="resolved-queue__eyebrow">Dikeluarkan</span>
        <span className="resolved-queue__count">{rejectedTotal == null ? (rejectedMatches.isError ? "Gagal dimuat" : "Memuat…") : `${rejectedTotal} baris`}</span>
        <ChevronDown className={`resolved-queue__chevron${rejectedOpen ? " is-open" : ""}`} aria-hidden size={16} />
      </button>
      {rejectedOpen ? <div className="resolved-queue__body" aria-label="Baris yang dikeluarkan">
        <p className="resolved-queue__hint">Riwayat baris yang tidak disertakan dalam payroll dan ekspor bank batch ini.</p>
        {rejectedMatches.isLoading || (rejectedMatches.isFetching && !rejectedMatches.data) ? <p className="muted" role="status">Memuat baris yang dikeluarkan…</p>
          : rejectedMatches.isError ? <div className="range-pager-retry"><span>Gagal memuat baris yang dikeluarkan.</span><Button variant="secondary" onClick={retryRejectedPage}>Coba lagi</Button></div>
            : rejectedRows.length ? <div className="resolved-queue__list">
              {rejectedRows.map((match) => {
                const meta = resolvedRowMeta(match);
                return <div key={match.ID} className="resolved-row rejected-row">
                  <div>
                    <strong>{meta.name || "Nama tidak terbaca"}</strong>
                    {meta.position || meta.location ? <small>{[meta.position, meta.location].filter(Boolean).join(" · ")}</small> : null}
                    <span className="rejected-row__amount">{formatCurrency(match.Row.GajiDiterima ?? match.Row.net_amount)}</span>
                    <p>{match.ReviewReason?.trim() || "Alasan tidak tercatat"}</p>
                  </div>
                  {reopen ? <Button type="button" variant="secondary" onClick={() => { setReopenMode("rejected"); setReopenFor(match); }}>Periksa kembali</Button> : null}
                </div>;
              })}
            </div> : <p className="resolved-queue__empty">Belum ada baris yang dikeluarkan.</p>}
        {rejectedTotal != null ? <Pagination page={rejectedPage} pageSize={5} total={rejectedTotal} onChange={(page) => setRejectedPage(Math.min(Math.max(1, page), lastRejectedPage))} /> : null}
      </div> : null}
    </div> : null}
    {reopen && reopenFor ? <ReopenMatchDialog
      open
      match={reopenFor}
      mode={reopenMode}
      onCancel={() => setReopenFor(null)}
      onReopen={(reason) => reopen(reopenFor.ID, reason)}
      // ponytail: no navigation — the refetched match now sits in the pending queue
      onSuccess={() => { setReopenFor(null); setNotice(reopenMode === "rejected" ? "Baris dikembalikan ke antrean pemeriksaan." : "Kecocokan dibatalkan dan baris dikembalikan ke antrean pemeriksaan."); }}
      busy={busy}
    /> : null}
  </section>;
}
