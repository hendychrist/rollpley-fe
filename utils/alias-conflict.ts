import type { ApiClientError } from "@/type/api";
import type { AliasConflictDetail } from "@/type/payroll";

/**
 * The BE (Fix #11) ships `error.details` as a JSON-encoded *string* on every
 * 4xx/5xx envelope. Decode it once, validate the known fields, and fall back
 * to `undefined` when the payload is missing or malformed — callers use an
 * Indonesian default copy instead of surfacing raw internals.
 */
export function decodeAliasConflictDetails(error: ApiClientError): AliasConflictDetail | undefined {
  let details = error.backendError?.details;
  if (typeof details === "string") {
    try { details = JSON.parse(details); } catch { return undefined; }
  }
  if (!details || typeof details !== "object") return undefined;
  const record = details as Record<string, unknown>;
  const conflictType: AliasConflictDetail["conflict_type"] =
    record.conflict_type === "alias_ownership" || record.conflict_type === "official_name_collision"
      ? record.conflict_type
      : undefined;
  return {
    conflict_type: conflictType,
    alias_name: typeof record.alias_name === "string" ? record.alias_name : undefined,
    owner_name: typeof record.owner_name === "string" ? record.owner_name : undefined,
  };
}

/** Decodes `error.details` for reopen-guard 409s (`PAYROLL_*_NOT_REVIEWABLE`). */
export function decodeReopenGuardReason(error: ApiClientError): string | undefined {
  let details = error.backendError?.details;
  if (typeof details === "string") {
    try { details = JSON.parse(details); } catch { return undefined; }
  }
  if (!details || typeof details !== "object") return undefined;
  const reason = (details as Record<string, unknown>).reason;
  return typeof reason === "string" && reason.trim() ? reason : undefined;
}

/** BE matcher normalization (match.go normalizeName / match_postgres.go normalizeForAlias). */
export function normalizePayrollName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .split(/[^a-z0-9À-ɏ]+/i)
    .filter(Boolean)
    .join(" ");
}
