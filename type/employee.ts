export type EmploymentStatus = "active" | "inactive" | "resigned" | "terminated";

export interface Employee {
  id: string;
  employee_number: string | null;
  nik: string | null;
  official_name: string;
  position: string | null;
  unit: string | null;
  employment_status: EmploymentStatus;
  identity_verification_status: string;
  joined_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeInput {
  employee_number: string | null;
  nik: string | null;
  official_name: string;
  position: string | null;
  unit: string | null;
}

export interface EmployeeAlias {
  id: string;
  employee_id: string;
  alias_name: string;
  normalized_alias: string;
  /**
   * `manual_review` = created in Master Karyawan; `master_import_review` =
   * created by import conflict review; `payroll_review` = created by a payroll
   * match confirmation (Fix #11).
   */
  source: string;
  created_at: string;
}

export interface Bank {
  id: string;
  code: string;
  name: string;
  output_group: "BCA" | "SUMSEL" | "OTHER";
  transfer_fee: number | null;
}

export interface BankAccount {
  id: string;
  employee_id: string;
  bank_id: string;
  account_number: string;
  account_holder_name: string;
  valid_from: string;
  valid_until: string | null;
  verification_status: string;
  is_primary: boolean;
}

export interface PaymentAccount {
  id: string;
  bank_name: string;
  bank_code: string;
  /** Always masked by the server; full numbers are never returned. */
  account_number: string;
  verification_status: string;
  is_primary: boolean;
}

export interface BankAccountInput {  bank_id: string;
  account_number: string;
  account_holder_name: string;
  valid_from: string;
  valid_until: string | null;
  is_primary: boolean;
}
