import { ChevronLeft, ChevronRight } from "lucide-react";
import { LoaderCircle } from "lucide-react";

export type RangePage = {
  start: number;
  end: number;
  page: number;
};

export function RangePagination({
  page,
  pageSize,
  total,
  loadingPage,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  loadingPage: number | null;
  onChange: (page: number) => void;
}) {
  if (total <= pageSize) return null;

  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  // Build range buttons: each button covers `pageSize` items (last one may be shorter).
  const ranges: RangePage[] = [];
  for (let p = 1; p <= lastPage; p++) {
    ranges.push({
      start: (p - 1) * pageSize + 1,
      end: Math.min(p * pageSize, total),
      page: p,
    });
  }

  // For ≤ 4 pages: show every range. For > 4: show a compact window of 3 around current.
  const windowSize = 3;
  let visible: RangePage[];
  if (ranges.length <= 4) {
    visible = ranges;
  } else {
    const half = Math.floor(windowSize / 2);
    let winStart = page - half;
    let winEnd = page + half;
    if (winStart < 1) { winStart = 1; winEnd = windowSize; }
    if (winEnd > ranges.length) { winEnd = ranges.length; winStart = Math.max(1, winEnd - windowSize + 1); }
    visible = ranges.slice(winStart - 1, winEnd);
  }

  const showFirst = visible[0].page > 1;
  const showLast = visible[visible.length - 1].page < lastPage;

  const renderRangeBtn = (r: RangePage) => {
    const isActive = r.page === page;
    const isLoading = loadingPage === r.page;
    const label = `${r.start}–${r.end}`;
    return (
      <button
        key={r.page}
        type="button"
        className={`range-pager__btn ${isActive ? "is-active" : ""}`}
        aria-current={isActive ? "page" : undefined}
        disabled={isLoading}
        onClick={() => onChange(r.page)}
      >
        {isLoading ? <LoaderCircle aria-hidden className="spin" size={12} /> : label}
      </button>
    );
  };

  return (
    <nav className="range-pager" aria-label="Paginasi antrean pemeriksaan">
      <span className="range-pager__summary">
        Menampilkan <strong>{start}–{end}</strong> dari <strong>{total}</strong>
      </span>
      <div className="range-pager__controls" role="group" aria-label="Navigasi halaman">
        {showFirst ? (
          <button type="button" className="range-pager__arrow" aria-label="Halaman pertama" disabled={loadingPage !== null} onClick={() => onChange(1)}>«</button>
        ) : null}
        <button
          type="button"
          className="range-pager__arrow"
          aria-label="Halaman sebelumnya"
          disabled={page <= 1 || loadingPage !== null}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={14} />
        </button>
        {visible.map(renderRangeBtn)}
        <button
          type="button"
          className="range-pager__arrow"
          aria-label="Halaman berikutnya"
          disabled={page >= lastPage || loadingPage !== null}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={14} />
        </button>
        {showLast ? (
          <button type="button" className="range-pager__arrow" aria-label="Halaman terakhir" disabled={loadingPage !== null} onClick={() => onChange(lastPage)}>»</button>
        ) : null}
      </div>
    </nav>
  );
}
