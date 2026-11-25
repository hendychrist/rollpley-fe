export function Skeleton({ lines = 4 }: { lines?: number }) {
  return <div className="skeleton" aria-label="Memuat data">{Array.from({ length: lines }).map((_, index) => <span key={index} />)}</div>;
}
