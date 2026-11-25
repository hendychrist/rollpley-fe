export interface MasterImportFile {
  id: string;
  kind: string;
  original_filename: string;
  sha256: string;
  size_bytes: number;
  version: number;
  manifest: Record<string, unknown>;
  export_compatibility: string;
}

export interface MasterImportSession {
  id: string;
  status: string;
  total_rows: number;
  created_count: number;
  linked_count: number;
  unchanged_count: number;
  excluded_count: number;
  files?: MasterImportFile[];
  counts?: Record<string, number>;
  confirmed_at?: string | null;
  created_at: string;
}

export interface MasterImportRow {
  id: string;
  import_id: string;
  source_file_id: string;
  source_sheet: string;
  source_row: number;
  raw_name: string;
  raw_account?: string;
  normalized_account?: string;
  masked_account: string;
  raw_bank_label: string;
  raw_routing_code: string;
  bank_code: string;
  section: string;
  mapped_unit?: string;
  raw_note: string;
  job_description?: string;
  normalized_job_title?: string;
  job_qualifier?: string;
  classification: string;
  available_decisions: string[];
  issues: string[];
  export_issue?: string;
  decision?: string;
  decision_reason?: string;
  identity_evidence?: string;
  selected_employee_id?: string;
  selected_source_row_id?: string;
  replaces_account_id?: string;
  effective_date?: string;
}
