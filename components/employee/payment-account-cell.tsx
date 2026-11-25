"use client";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import type { PaymentAccount } from "@/type/employee";
import { useAccountVisibilityContext } from "@/components/employee/account-visibility-provider";
import { StatusBadge } from "@/components/base/status-badge";

interface PaymentAccountCellProps {
  accounts: PaymentAccount[];
}

export function PaymentBankCell({ accounts }: PaymentAccountCellProps) {
  if (accounts.length === 0) {
    return <span className="cell-empty">—</span>;
  }

  return (
    <div className="account-cell">
      {accounts.map((account) => (
        <div className="account-cell__row" key={account.id}>
          <span>{account.bank_name}</span>
        </div>
      ))}
    </div>
  );
}

export function PaymentAccountCell({ accounts }: PaymentAccountCellProps) {
  const visibility = useAccountVisibilityContext();

  if (accounts.length === 0) {
    return <span className="cell-empty">—</span>;
  }

  return (
    <div className="account-cell">
      {accounts.map((account) => {
        const visible = visibility.isVisible(account.id);
        const loading = visibility.isPending(account.id);

        return (
          <div className="account-cell__row" key={account.id}>
            <span className="account-cell__number">
              {visibility.displayNumber(account)}
            </span>
            <button
              type="button"
              className="account-cell__eye"
              onClick={() => visibility.toggleOne(account.id)}
              aria-label={visible || loading ? `Hide account number for ${account.bank_name}` : `Reveal account number for ${account.bank_name}`}
              aria-pressed={visible}
              aria-busy={loading}
              title={visible || loading ? "Hide account number" : "Reveal account number"}
            >
              {loading ? (
                <LoaderCircle aria-hidden="true" size={16} className="account-cell__spinner" />
              ) : visible ? (
                <EyeOff aria-hidden="true" size={16} />
              ) : (
                <Eye aria-hidden="true" size={16} />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function PaymentAccountStatus({ accounts }: PaymentAccountCellProps) {
  if (accounts.length === 0) return <StatusBadge label="Belum ada rekening" tone="neutral" />;

  const primary = accounts.find((account) => account.is_primary);
  if (primary) return <StatusBadge label={primary.verification_status === "verified" ? "Rekening terverifikasi" : "Rekening belum terverifikasi"} tone={primary.verification_status === "verified" ? "success" : "warning"} />;

  if (accounts.length === 1) return <StatusBadge label={accounts[0].verification_status === "verified" ? "Rekening terverifikasi" : "Rekening belum terverifikasi"} tone={accounts[0].verification_status === "verified" ? "success" : "warning"} />;

  const verified = accounts.filter((account) => account.verification_status === "verified").length;
  return <StatusBadge label={verified ? `${verified} dari ${accounts.length} rekening terverifikasi` : "Rekening belum terverifikasi"} tone={verified === accounts.length ? "success" : "warning"} />;
}

export function PaymentAccountHeader() {
  const visibility = useAccountVisibilityContext();

  return (
    <span className="account-cell__heading">
      <span>No. Rekening</span>
      <button
        type="button"
        className="account-cell__eye"
        onClick={visibility.toggleAll}
        disabled={!visibility.hasAccounts}
        aria-label={visibility.allVisible ? "Hide all account numbers on this page" : "Reveal all account numbers on this page"}
        aria-pressed={visibility.allVisible}
        title={visibility.allVisible ? "Hide all account numbers" : "Reveal all account numbers"}
      >
        {visibility.allVisible ? (
          <EyeOff aria-hidden="true" size={16} />
        ) : (
          <Eye aria-hidden="true" size={16} />
        )}
      </button>
    </span>
  );
}
