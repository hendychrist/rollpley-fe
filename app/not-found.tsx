import Link from "next/link";
import { ROUTES } from "@/constants/routes";

export default function NotFound() {
  return <main className="simple-page"><h1>Halaman tidak ditemukan</h1><p>Alamat yang Anda buka tidak tersedia.</p><Link className="button button--primary" href={ROUTES.payroll}>Kembali ke Payroll</Link></main>;
}
