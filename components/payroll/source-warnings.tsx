"use client";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { RangePagination } from "@/components/base/range-pagination";
import type { ReconciliationIssue } from "@/type/payroll";
import { formatCurrency, formatSignedCurrency } from "@/utils/format";

const PAGE_SIZE = 5;
const GROSS_NET_PATTERN = /^gross-potongan (-?\d+) != gaji_diterima (-?\d+)$/;

type WarningKind = "nominal" | "rounding";
type Filter = "all" | WarningKind;
type SourceWarning = { kind: WarningKind; issue: ReconciliationIssue; net: number | null; computed: number | null; delta: number | null };

function toWarning(kind: WarningKind, issue: ReconciliationIssue): SourceWarning {
  const match = GROSS_NET_PATTERN.exec(issue.reason);
  const computed = match ? Number(match[1]) : null;
  const net = match ? Number(match[2]) : null;
  const delta = issue.rounding_delta ?? (computed != null && net != null ? computed - net : null);
  return { kind, issue, net, computed, delta };
}

/**
 * Informational source-arithmetic warnings (gross − potongan ≠ Neto PDF).
 * They never block finalization, so they are collapsed by default: a compact
 * summary first, details only on request, 5 per page in stable page/row order.
 */
export function SourceWarnings({ nominal, rounding, roundingTotal }: { nominal: ReconciliationIssue[]; rounding: ReconciliationIssue[]; roundingTotal?: number | null }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const bodyId = useId();

  const all = useMemo(() => [
    ...nominal.map((issue) => toWarning("nominal", issue)),
    ...rounding.map((issue) => toWarning("rounding", issue)),
  ].sort((a, b) => a.issue.page - b.issue.page || a.issue.row - b.issue.row), [nominal, rounding]);

  const total = all.length;
  if (total === 0) return null;

  const visible = filter === "all" ? all : all.filter((item) => item.kind === filter);
  const lastPage = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, lastPage);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = visible.slice(start, start + PAGE_SIZE);
  const filters = ([
    { id: "all", label: "Semua", count: total },
    { id: "nominal", label: "Nominal", count: nominal.length },
    { id: "rounding", label: "Pembulatan", count: rounding.length },
  ] satisfies Array<{ id: Filter; label: string; count: number }>).filter((item) => item.id === "all" || item.count > 0);
  const counts = [nominal.length ? `${nominal.length} nominal` : null, rounding.length ? `${rounding.length} pembulatan${roundingTotal ? ` (${formatSignedCurrency(roundingTotal)})` : ""}` : null].filter(Boolean).join(" · ");

  function selectFilter(next: Filter) { setFilter(next); setPage(1); }

  return <section className="resolved-queue source-warnings">
    <button type="button" className="resolved-queue__toggle source-warnings__toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((value) => !value)}>
      <TriangleAlert aria-hidden size={16} className="source-warnings__icon" />
      <span className="source-warnings__summary">
        <span><span className="resolved-queue__eyebrow">Peringatan sumber · {total}</span> <span className="resolved-queue__count">{counts}</span></span>
        <span className="source-warnings__hint">Tidak memblokir finalisasi. Neto tetap mengikuti angka pada PDF.</span>
      </span>
      <span className="source-warnings__action">{open ? "Tutup detail" : "Lihat detail"}</span>
      <ChevronDown className={`resolved-queue__chevron${open ? " is-open" : ""}`} aria-hidden size={16} />
    </button>
    {open ? <div id={bodyId} className="resolved-queue__body">
      {filters.length > 2 ? <div className="review-filters source-warnings__filters" role="group" aria-label="Filter peringatan sumber">
        {filters.map((item) => <button key={item.id} type="button" className={filter === item.id ? "is-active" : ""} aria-pressed={filter === item.id} onClick={() => selectFilter(item.id)}>{item.label}<span>{item.count}</span></button>)}
      </div> : null}
      <p className="sr-only" role="status">{`Menampilkan ${visible.length ? start + 1 : 0}–${start + pageItems.length} dari ${visible.length} peringatan`}</p>
      <ul className="source-warnings__list">
        {pageItems.map(({ kind, issue, net, computed, delta }, index) => <li key={`${issue.category}-${issue.page}-${issue.row}-${start + index}`} className="source-warning">
          <div className="source-warning__head">
            <span className="source-warning__ref">Hal. {issue.page} · Baris {issue.row}</span>
            {kind === "rounding"
              ? <span className="source-warning__badge source-warning__badge--rounding">≈ Pembulatan{delta != null ? ` · ${formatSignedCurrency(delta)}` : ""}</span>
              : <span className="source-warning__badge source-warning__badge--nominal"><TriangleAlert aria-hidden size={12} />Selisih nominal{delta != null ? ` · ${formatSignedCurrency(delta)}` : ""}</span>}
          </div>
          {net != null && computed != null ? <dl className="source-warning__amounts">
            <div className="source-warning__net"><dt>Neto PDF</dt><dd>{formatCurrency(net)}</dd></div>
            <div><dt>Gross − potongan</dt><dd>{formatCurrency(computed)}</dd></div>
          </dl> : <p className="source-warning__reason">{issue.reason}</p>}
        </li>)}
      </ul>
      <RangePagination page={currentPage} pageSize={PAGE_SIZE} total={visible.length} loadingPage={null} onChange={setPage} ariaLabel="Paginasi peringatan sumber" />
    </div> : null}
  </section>;
}
