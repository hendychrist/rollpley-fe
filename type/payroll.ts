export interface PayrollBatch {
  id: string;
  /** "YYYY-MM" when set; empty string when period has not been confirmed. */
  period: string;
  unit: string;
  status: string;
  original_filename: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
  can_delete: boolean;
  delete_block_reason: "processing" | "finalized" | "unsupported_status" | null;
}

export interface PayrollDeletionSelection {
  ids: string[];
  eligible_count: number;
  blocked_count: number;
  total_count: number;
}

export interface BulkDeletePayrollResult {
  deleted_ids: string[];
  deleted_count: number;
}

export interface PayrollDeleteBlocker {
  id: string;
  code: string;
  reason: string;
}

export interface ProcessingStatus {
  RunID?: string;
  BatchID?: string;
  Version?: number;
  Stage?: string;
  Status?: "processing" | "completed" | "failed";
  TotalRows?: number;
  AutoMatched?: number;
  Pending?: number;
  ErrorCode?: string;
  CompletedAt?: string | null;
  UpdatedAt?: string;
  batch_id?: string;
}

export interface PayrollSourceRow {
  Page?: number;
  RowNumber?: number;
  Nik?: string;
  RawName?: string;
  RawPosition?: string;
  RawUnitCode?: string;
  GajiDiterima?: number;
  UnknownAmounts?: string[];
  Warnings?: string[];
  source_page: number;
  source_row: number;
  raw_name: string;
  normalized_name: string;
  nik?: string;
  position?: string;
  unit?: string;
  bank_name?: string;
  account_number?: string;
  net_amount?: number;
  [key: string]: string | number | boolean | string[] | null | undefined;
}

export interface PayrollMatch {
  ID: string;
  RowID: string;
  BatchID: string;
  Status: string;
  MatchMethod: string;
  MatchedEmployeeID: string | null;
  Row: PayrollSourceRow;
  ReasonCode: string;
  /**
   * JSON-encoded suggestion payload.
   * For name_variant_suggestion:
   *   [{ "employee_id", "name", "position", "unit", "suggestion_reason", "source_name" }]
   * For pending_identity:
   *   [{ "employee_id", "name", "position", "unit" }]  (fuzzy candidate list)
   * Empty string for rows with no candidates.
   */
  Candidate: string;
  ReviewReason?: string;
  MachineReasonCode?: string;
  ReviewedAt: string | null;
  SourceFilename?: string;
}

export interface CandidateSuggestion {
  employee_id: string;
  name: string;
  position?: string;
  unit?: string;
  /** Short human-readable reason, e.g. "Beda spasi", "Ejaan mirip" */
  suggestion_reason?: string;
  /** PDF source spelling — the name as it appeared in the PDF */
  source_name?: string;
}

/**
 * Result of GET /payroll/batches/:batchId/matches/:matchId/name-suggestions
 * Same shape as match.Candidate — a MatchResult recomputed against the
 * current employee master. `Candidate` is JSON-encoded, same as PayrollMatch.
 */
export interface NameSuggestionsResult {
  RowNumber: number;
  Status: string;
  MatchMethod: string;
  EmployeeID: string;
  ReasonCode: string;
  Candidate: string; // JSON array of CandidateSuggestion, or "" when no match
}

/**
 * Result of PATCH /payroll/batches/:batchId/matches/:matchId
 * The `alias` field is present only when save_name_variant was set.
 * action: "saved" = new alias inserted; "existing" = already had it.
 */
export interface ReviewMatchResponse {
  match_id: string;
  status: string;
  employee_id?: string;
  alias?: {
    employee_id: string;
    alias_name?: string;
    normalized_alias: string;
    /** "saved" = new alias, "existing" = already present for this employee */
    action: "saved" | "existing";
  };
}

/**
 * Parsed `error.details` of a 409 ALIAS_CONFLICT response. The BE ships
 * `details` as a JSON-encoded string; `decodeAliasConflictDetails` decodes it.
 */
export interface AliasConflictDetail {
  conflict_type?: "alias_ownership" | "official_name_collision";
  alias_name?: string;
  /** Official name of the employee that owns the alias / uses the name officially. */
  owner_name?: string;
}

/** Result of POST /payroll/batches/:id/matches/:matchId/reopen (Fix #11). */
export interface ReopenMatchResponse {
  match_id: string;
  batch_id: string;
  status?: string;
  previous: {
    status: string;
    employee_id?: string;
    reason?: string;
    reviewed_by?: string;
    reviewed_at?: string;
  };
}

export interface ReconciliationIssue {
  category: string;
  severity?: "informational" | "blocking";
  page: number;
  row: number;
  reason: string;
  /** Signed integer in rupiah. Emitted for accepted source_arithmetic_tolerance issues. Absent = unavailable (older BE). */
  rounding_delta?: number;
}

export interface Reconciliation {
  batch_id: string;
  source_rows: number;
  matched_rows: number;
  pending_rows: number;
  approved_rows: number;
  unresolved_rows: number;
  excluded_rows: number;
  reviewed_rows: number;
  unknown_amount_rows: number;
  source_net_total: number;
  approved_source_net_total: number;
  unresolved_source_net_total: number;
  excluded_source_net_total: number;
  printed_net_total: number | null;
  extraction_difference: number | null;
  transfer_total: number;
  fee_total: number;
  difference: number;
  difference_known: boolean;
  finalizable: boolean;
  blockers: string[];
  issues: ReconciliationIssue[];
  unknown_amount_fields?: string[];
  /** Signed integer sum of all accepted rounding deltas. BE returns even when difference_known=false. Zero is valid. */
  rounding_delta_total?: number;
}

export interface ExportFile {
  id: string;
  output_group: "BCA" | "SUMSEL" | "OTHER";
  filename: string;
  recipient_count: number;
  total_amount: number;
  status: "pending" | "uploading" | "uploaded" | "failed";
  /** Absent in current BE payload; only shown when a valid per-file value is returned. */
  updated_at?: string | null;
  sha256?: string;
  size_bytes?: number;
  error?: string;
}
