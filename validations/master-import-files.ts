const TEMPLATE_LABELS = {
  xlsx: "BCA (.xlsx)",
  xlsm: "Bank Lain (.xlsm)",
  xls: "Bank Sumsel (.xls)",
} as const;

export type MasterTemplateKey = keyof typeof TEMPLATE_LABELS;

export const MASTER_TEMPLATE_LIMIT = 3;
export const MASTER_TEMPLATE_LABELS = TEMPLATE_LABELS;

// ponytail: extension check is preliminary; the backend still verifies actual workbook template identity
export function masterTemplateKey(file: File): MasterTemplateKey | null {
  const extension = (file.name.split(".").pop() ?? "").toLowerCase();
  return extension in TEMPLATE_LABELS ? (extension as MasterTemplateKey) : null;
}

// ponytail: metadata-based identity (name + size + lastModified + path); distinguishes picker selections, NOT file content — no content hashing
export function masterFileIdentity(file: File): string {
  const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
  return [file.name, String(file.size), String(file.lastModified), path].join("|");
}

export type MasterIntakeReason = "DUPLICATE" | "CONFLICT" | "CAPACITY" | "INVALID";

export interface MasterIntakeResult {
  files: File[];
  added: number;
  rejected: { file: File; reason: MasterIntakeReason; message: string }[];
}

// ponytail: whole-incoming-set reject. If ANY file in the incoming selection is invalid,
// conflicting, or would exceed capacity, the ENTIRE incoming set is dropped — no partial
// acceptance. Previously selected files are never touched. Duplicates (files already in the
// selection) are reported with clear feedback but do not block the rest of the incoming set.
export function intakeMasterFiles(current: File[], incoming: File[], limit: number = MASTER_TEMPLATE_LIMIT): MasterIntakeResult {
  const taken = new Set(current.map(masterFileIdentity));
  const ownedKeys = new Set(current.map((file) => masterTemplateKey(file)).filter(Boolean));
  const rejected: MasterIntakeResult["rejected"] = [];

  // Fresh = incoming files not already in the selection.
  const fresh = incoming.filter((file) => !taken.has(masterFileIdentity(file)));

  // Report duplicates (already in selection) — informational, does not block the set.
  for (const file of incoming) {
    if (taken.has(masterFileIdentity(file))) {
      rejected.push({ file, reason: "DUPLICATE", message: `"${file.name}" sudah dipilih.` });
    }
  }

  // Validate the fresh batch as a whole.
  // Rule: the batch must contain ONLY template files, no template type may already be
  // owned by the current selection, and current + batch must not exceed the limit.
  // Any violation → the entire fresh batch is rejected (no partial accept).
  const hardReject: { reason: MasterIntakeReason; message: string } | null = (() => {
    for (const file of fresh) {
      const key = masterTemplateKey(file);
      if (!key) {
        return { reason: "INVALID", message: `Berkas "${file.name}" bukan template impor (${Object.values(TEMPLATE_LABELS).join(", ")}).` };
      }
      if (ownedKeys.has(key)) {
        return { reason: "CONFLICT", message: `Template ${TEMPLATE_LABELS[key]} sudah dipilih; hapus dulu yang lama sebelum menggantinya dengan "${file.name}".` };
      }
    }
    if (current.length + fresh.length > limit) {
      return { reason: "CAPACITY", message: `Kapasitas ${limit} berkas sudah penuh; pilihan ini ditolak.` };
    }
    return null;
  })();

  if (hardReject) {
    rejected.push({ file: fresh[0], reason: hardReject.reason, message: hardReject.message });
    return { files: [...current], added: 0, rejected };
  }

  // Clean path: all fresh files are valid, non-conflicting, within capacity.
  const files = [...current, ...fresh];
  return { files, added: fresh.length, rejected };
}

export function validateMasterFiles(files: File[], limit: number = MASTER_TEMPLATE_LIMIT): string | null {
  if (files.length !== limit) return `Pilih tepat ${limit} berkas workbook master.`;
  for (const [key, label] of Object.entries(TEMPLATE_LABELS) as [MasterTemplateKey, string][]) {
    if (!files.some((file) => masterTemplateKey(file) === key)) return `Berkas ${label} belum dipilih.`;
  }
  return null;
}
