import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/base/button";

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  return <nav className="pagination" aria-label="Paginasi"><span>Halaman {page} dari {lastPage} · {total} data</span><div><Button variant="secondary" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Halaman sebelumnya"><ChevronLeft size={17} /></Button><Button variant="secondary" onClick={() => onChange(page + 1)} disabled={page >= lastPage} aria-label="Halaman berikutnya"><ChevronRight size={17} /></Button></div></nav>;
}
