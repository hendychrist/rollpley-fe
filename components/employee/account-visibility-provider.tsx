"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import {
  useAccountVisibility,
  type AccountVisibilityController,
  type AccountLike,
} from "@/hooks/use-account-visibility";

const AccountVisibilityContext = createContext<AccountVisibilityController | null>(null);

interface AccountVisibilityProviderProps {
  rows: readonly { id: string }[];
  accountsByEmployee: Record<string, AccountLike[]>;
  scopeKey: string;
  children: ReactNode;
}

export function AccountVisibilityProvider({
  rows,
  accountsByEmployee,
  scopeKey,
  children,
}: AccountVisibilityProviderProps) {
  const visibility = useAccountVisibility({ rows, accountsByEmployee, scopeKey });

  return (
    <AccountVisibilityContext.Provider value={visibility}>
      {visibility.error ? (
        <div className="account-reveal-error" role="alert">
          <span>{visibility.error}</span>
          <button type="button" onClick={visibility.clearError} aria-label="Dismiss account reveal error">
            Dismiss
          </button>
        </div>
      ) : null}
      {children}
    </AccountVisibilityContext.Provider>
  );
}

export function useAccountVisibilityContext() {
  const context = useContext(AccountVisibilityContext);

  if (!context) {
    throw new Error("Account visibility components must be used inside AccountVisibilityProvider.");
  }

  return context;
}
