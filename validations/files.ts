const PDF_MAX_BYTES = 20 * 1024 * 1024;

export function validatePayrollFile(file: File): string | null {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return "Berkas harus berformat PDF.";
  }
  if (file.size === 0) return "Berkas PDF kosong.";
  if (file.size > PDF_MAX_BYTES) return "Ukuran PDF melebihi batas 20 MB.";
  return null;
}

const REQUIRED_IMPORT_EXTENSIONS = new Set(["xlsx", "xlsm", "xls"]);

export function validateMasterFiles(files: File[]): string | null {
  const extensions = new Set(files.map((file) => file.name.split(".").pop()?.toLowerCase()));
  if (files.length === 3 && [...REQUIRED_IMPORT_EXTENSIONS].every((extension) => extensions.has(extension))) return null;
  return "Pilih tepat tiga berkas workbook master: BCA .xlsx, Bank Lain .xlsm, dan Bank Sumsel .xls.";
}
