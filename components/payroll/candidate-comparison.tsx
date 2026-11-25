"use client";
import Link from "next/link";
import { CircleCheck, AlertCircle } from "lucide-react";
import { Alert } from "@/components/base/alert";
import { BaseInlineError } from "@/components/base/error-state";
import { BaseLoadingState } from "@/components/base/loading-state";
import { StatusBadge } from "@/components/base/status-badge";
import { usePayrollCandidateEvidence } from "@/hooks/use-payroll-review";
import type { BankAccount, Employee } from "@/type/employee";

// Mirrors the BE rule (employee_lookup.go, bank_lookup.go, finalize.go):
// an account is payroll-ready when it is primary, verified, and effective
// on the current date. The most-recent effective account wins.
function readyPrimaryAccount(accounts: BankAccount[]): { account?: BankAccount; reason?: string } | null {
  const today = new Date().toISOString().slice(0, 10);
  const primaryAccounts = accounts.filter((a) => a.is_primary);
  if (!primaryAccounts.length) return { reason: "Belum ada rekening utama." };
  const effective = primaryAccounts.filter((a) => a.valid_from <= today && (!a.valid_until || a.valid_until >= today));
  if (!effective.length) {
    const anyPrimary = primaryAccounts[0];
    return { reason: `Rekening utama belum efektif untuk periode ini (berlaku mulai ${anyPrimary.valid_from.slice(0, 10)}).` };
  }
  // Same ordering as BE: most recent valid_from wins
  effective.sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  const ready = effective.find((a) => a.verification_status === "verified");
  if (ready) return { account: ready };
  return { reason: `Rekening utama belum terverifikasi (status: ${effective[0].verification_status}).` };
}

const EMPLOYMENT_LABELS: Record<Employee["employment_status"], string> = {
  active: "Karyawan aktif",
  inactive: "Karyawan tidak aktif",
  resigned: "Karyawan mengundurkan diri",
  terminated: "Karyawan diberhentikan",
};

export function CandidateComparison({
  employee,
  selected,
  onSelect,
  returnTo,
  groupName = "payroll-candidate",
  sourceName,
  suggestionLabel,
}: {
  employee: Employee;
  selected: boolean;
  onSelect: (id: string) => void;
  returnTo: string;
  groupName?: string;
  /** PDF source spelling — shown as "Nama di PDF" when set */
  sourceName?: string;
  /** Short reason label like "Ejaan mirip" */
  suggestionLabel?: string;
}) {
  const evidence = usePayrollCandidateEvidence(employee.id);
  const eligibleStatus = employee.employment_status === "active";
  const accounts = evidence.accounts.data ?? [];
  const accountsLoading = evidence.accounts.isLoading || (accounts.length > 0 && evidence.accounts.isFetching);
  const aliasesLoading = evidence.aliases.isFetching;
  const banksLoading = evidence.banks.isFetching;
  const aliasesFailed = evidence.aliases.isError;
  const banksFailed = evidence.banks.isError;
  const evidenceFailed = evidence.accounts.isError || aliasesFailed || banksFailed;
  const primaryStatus = !accountsLoading && !evidenceFailed ? readyPrimaryAccount(accounts) : null;
  const readyAccount = primaryStatus?.account ?? null;
  const blockReason = primaryStatus?.reason ?? null;
  const maskAccount = (value: string) => value.length <= 4 ? `••••${value}` : `•••• ${value.slice(-4)}`;
  const employmentLabel = EMPLOYMENT_LABELS[employee.employment_status];
  const bankName = (bankId: string) => evidence.banks.data?.find((b) => b.id === bankId)?.name;

  return (
    <article className={`candidate-card ${selected ? "candidate-card--selected" : ""}`}>
      {/* Header: radio + name + employment badge */}
      <label className="candidate-choice">
        <input
          type="radio"
          name={groupName}
          value={employee.id}
          checked={selected}
          disabled={!eligibleStatus || evidenceFailed}
          onChange={() => onSelect(employee.id)}
        />
        <span className="candidate-choice__name">
          <strong>{employee.official_name}</strong>
          <StatusBadge label={employmentLabel} tone={eligibleStatus ? "success" : "warning"} />
        </span>
      </label>

      {/* Loading / error states */}
      {accountsLoading ? <BaseLoadingState compact label="Memuat rekening…" /> : null}
      {aliasesLoading || banksLoading ? <BaseLoadingState compact label="Memuat data pendukung…" /> : null}
      {evidence.accounts.isError ? <BaseInlineError error={evidence.accounts.error} /> : null}
      {aliasesFailed ? <BaseInlineError error={evidence.aliases.error} /> : null}
      {banksFailed ? <BaseInlineError error={evidence.banks.error} /> : null}

      {/* Name comparison — PDF source vs master name */}
      {sourceName ? (
        <div className="candidate-field candidate-field--name-compare">
          <dt>Nama di PDF</dt>
          <dd>
            <span className="name-compare__pdf">{sourceName}</span>
            {suggestionLabel ? (
              <span className="name-compare__label" title={`Alasan cocok: ${suggestionLabel}`}>{suggestionLabel}</span>
            ) : null}
          </dd>
          <dt>Nama di Master</dt>
          <dd>{employee.official_name}</dd>
        </div>
      ) : null}

      {/* Detail fields */}
      {!accountsLoading && !evidenceFailed ? (
        <dl className="candidate-detail">
          <div className="candidate-field candidate-field--job">
            <dt>Jabatan</dt>
            <dd>{employee.position ?? "Tidak tersedia"}</dd>
          </div>
          <div className="candidate-field candidate-field--account">
            <dt>Rekening</dt>
            <dd>
              {accounts.length ? accounts.map((account) => {
                const isReady = readyAccount?.id === account.id;
                return (
                  <span
                    key={account.id}
                    className={`account-line ${isReady ? "account-line--ready" : ""}`}
                    title={isReady ? "Rekening terverifikasi dan siap dipakai untuk payroll" : undefined}
                  >
                    {isReady ? <CircleCheck aria-hidden size={14} /> : null}
                    <span className="account-line__bank">{bankName(account.bank_id) ?? "Bank"}</span>
                    <span className="account-line__number" aria-label={`Rekening berakhir ${account.account_number.slice(-4)}`}>{maskAccount(account.account_number)}</span>
                    {account.is_primary ? <span className="account-line__tag">Utama</span> : null}
                    <span className={`account-line__status ${account.verification_status === "verified" ? "verified" : "unverified"}`}>
                      {account.verification_status === "verified" ? "Terverifikasi" : "Belum terverifikasi"}
                    </span>
                  </span>
                );
              }) : "Belum ada rekening"}
            </dd>
          </div>
          <div className="candidate-field candidate-field--unit">
            <dt>Unit</dt>
            <dd>{employee.unit ?? "Tidak tersedia"}</dd>
          </div>
          <div className="candidate-field candidate-field--nik">
            <dt>NIK</dt>
            <dd>{employee.nik ?? "Tidak tersedia"}</dd>
          </div>
          <div className="candidate-field candidate-field--alias">
            <dt>Alias</dt>
            <dd>
              {evidence.aliases.data?.length
                ? evidence.aliases.data.map((alias) => (
                    <span key={alias.id}>{alias.alias_name} <em>({alias.source === "manual_review" ? "review manual" : alias.source === "payroll_review" ? "review payroll" : "impor"})</em></span>
                  ))
                : "Tidak ada alias"}
            </dd>
          </div>
        </dl>
      ) : null}

      {/* Payment readiness — distinct from identity selection */}
      {!accountsLoading && !evidenceFailed ? (
        readyAccount ? (
          <p className="candidate-readiness candidate-readiness--ready" role="status">
            <CircleCheck aria-hidden size={14} />
            Rekening siap untuk payroll
          </p>
        ) : blockReason ? (
          <p className="candidate-readiness candidate-readiness--blocked" role="status">
            <AlertCircle aria-hidden size={14} />
            {blockReason}
          </p>
        ) : null
      ) : null}

      {/* Inactive status banner */}
      {!eligibleStatus ? (
        <Alert tone="warning">{employmentLabel}. Status tidak diubah otomatis dan kandidat ini tidak dapat dipilih sebelum HR meninjau master.</Alert>
      ) : null}

      {/* Footer: master link — separate from radio label so clicking it never selects */}
      <Link
        className="candidate-link"
        href={`/master-karyawan/${employee.id}?returnTo=${encodeURIComponent(returnTo)}`}
      >
        Tinjau master karyawan
      </Link>
    </article>
  );
}
