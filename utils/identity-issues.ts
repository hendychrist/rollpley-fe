const issueCopy: Record<string, { title: string; detail: string; tone: "warning" | "info" }> = {
  different_job_descriptions: { title: "Deskripsi pekerjaan berbeda", detail: "Nama sama ditemukan dengan deskripsi pekerjaan yang berbeda. Ini adalah bukti untuk ditinjau, bukan keputusan bahwa orangnya berbeda.", tone: "warning" },
  job_info_insufficient: { title: "Informasi pekerjaan belum cukup", detail: "Sebagian baris tidak memiliki deskripsi pekerjaan yang dapat dipakai sebagai bukti identitas.", tone: "warning" },
  no_job_info: { title: "Tidak ada informasi pekerjaan", detail: "Tidak ada deskripsi pekerjaan yang dapat dipakai untuk membedakan kandidat.", tone: "warning" },
  matching_job_description: { title: "Deskripsi pekerjaan sama", detail: "Deskripsi pekerjaan mendukung kecocokan, tetapi tidak menyelesaikan konflik identitas dengan sendirinya.", tone: "info" },
  duplicate_within_import: { title: "Nama berulang dalam impor", detail: "Ada lebih dari satu baris dengan nama yang sama. Pilih keputusan untuk setiap baris secara eksplisit.", tone: "warning" },
  missing_destination_routing_code: { title: "Routing bank tujuan belum tersedia", detail: "Impor dapat dilanjutkan, tetapi pembayaran Bank Lain akan terblokir saat finalisasi sampai routing diverifikasi.", tone: "warning" },
};

export function getIdentityIssue(code: string) {
  return issueCopy[code] ?? { title: code.replaceAll("_", " "), detail: "Periksa bukti sumber sebelum mengambil keputusan.", tone: "warning" as const };
}

export function isGenericPayrollNarration(value: string | null | undefined) {
  return /^gaji\s+\w+/i.test(value?.trim() ?? "");
}

export function usableJobLabel(value: string | null | undefined) {
  if (!value || isGenericPayrollNarration(value)) return "Tidak ada informasi jabatan yang dapat dipakai";
  return value;
}
