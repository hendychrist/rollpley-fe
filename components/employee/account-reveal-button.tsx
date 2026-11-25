"use client";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import type { AccountLike } from "@/hooks/use-account-visibility";
import { useAccountVisibilityContext } from "@/components/employee/account-visibility-provider";

export function AccountRevealButton({ account, bankName }: { account: AccountLike; bankName?: string }) {
  const visibility = useAccountVisibilityContext();
  const visible = visibility.isVisible(account.id);
  const loading = visibility.isPending(account.id);
  const label = bankName ?? "";

  return (
    <button
      type="button"
      className="account-cell__eye"
      onClick={() => visibility.toggleOne(account.id)}
      aria-label={visible ? `Sembunyikan nomor rekening${label ? ` ${label}` : ""}` : `Tampilkan nomor rekening${label ? ` ${label}` : ""}`}
      aria-pressed={visible}
      aria-busy={loading}
      title={visible ? "Sembunyikan nomor rekening" : "Tampilkan nomor rekening"}
    >
      {loading ? (
        <LoaderCircle aria-hidden="true" size={16} className="account-cell__spinner" />
      ) : visible ? (
        <EyeOff aria-hidden="true" size={16} />
      ) : (
        <Eye aria-hidden="true" size={16} />
      )}
    </button>
  );
}
