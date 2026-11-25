export const EMPLOYMENT_STATUS = {
  active: "Aktif",
  inactive: "Tidak aktif",
  resigned: "Mengundurkan diri",
  terminated: "Diberhentikan",
} as const;

export const BATCH_STATUS: Record<string, string> = {
  uploading: "Mengunggah",
  uploaded: "Siap diproses",
  upload_failed: "Unggahan gagal",
  parsing: "Membaca dokumen",
  matching: "Mencocokkan data",
  matched: "Perlu diperiksa",
  reconciled: "Siap difinalkan",
  finalized: "Selesai",
};

export const PROCESSING_TERMINAL_STATUSES = new Set(["completed", "failed"]);
