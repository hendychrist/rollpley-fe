"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRevealAccountNumbersMutation } from "@/redux/api/account-reveal.rtk";
import type { PaymentAccount } from "@/type/employee";

type RevealedValue = {
  employeeId: string;
  accountNumber: string;
};

/** Minimal shape shared by PaymentAccount and BankAccount (both have id + account_number). */
export type AccountLike = Pick<PaymentAccount, "id" | "account_number">;

export interface AccountVisibilityController {
  hasAccounts: boolean;
  allVisible: boolean;
  error: string | null;
  displayNumber: (account: AccountLike) => string;
  isVisible: (accountId: string) => boolean;
  isPending: (accountId: string) => boolean;
  toggleOne: (accountId: string) => void;
  toggleAll: () => void;
  hideAll: () => void;
  clearError: () => void;
}

export interface AccountVisibilityInput {
  rows: readonly { id: string }[];
  accountsByEmployee: Record<string, AccountLike[]>;
  scopeKey: string;
}

function requestErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = error.status;

    if (typeof status === "number") {
      if (status === 401) return "Your session has expired. Sign in again before revealing account numbers. (HTTP 401)";
      if (status === 403) return "You do not have permission to reveal account numbers. (HTTP 403)";
      return `Unable to reveal account numbers. Please try again. (HTTP ${status})`;
    }
  }

  return "Unable to reveal account numbers. Check your connection and try again.";
}

export function useAccountVisibility({
  rows,
  accountsByEmployee,
  scopeKey,
}: AccountVisibilityInput): AccountVisibilityController {
  const [reveal, { reset }] = useRevealAccountNumbersMutation();
  const resetRef = useRef(reset);
  resetRef.current = reset;

  const accountOwners = useMemo(() => {
    const owners = new Map<string, string>();

    for (const employee of rows) {
      for (const account of accountsByEmployee[employee.id] ?? []) {
        if (account.id) owners.set(account.id, employee.id);
      }
    }

    return owners;
  }, [rows, accountsByEmployee]);

  const accountOwnersRef = useRef(accountOwners);
  accountOwnersRef.current = accountOwners;

  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;

  const generationRef = useRef(0);
  const desiredRef = useRef(new Set<string>());
  const pendingRef = useRef(new Set<string>());
  const revealedRef = useRef<Record<string, RevealedValue>>({});
  const bulkGenerationRef = useRef<number | null>(null);
  const [revealedState, setRevealedState] = useState<{
    scopeKey: string;
    values: Record<string, RevealedValue>;
  }>({ scopeKey, values: {} });
  const revealed = revealedState.scopeKey === scopeKey ? revealedState.values : {};
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const hideAll = useCallback(() => {
    generationRef.current += 1;
    bulkGenerationRef.current = null;
    desiredRef.current.clear();
    pendingRef.current.clear();
    revealedRef.current = {};
    setRevealedState({ scopeKey: scopeRef.current, values: {} });
    setPending(new Set());
    setError(null);
    resetRef.current();
  }, []);

  useEffect(() => {
    hideAll();

    return () => {
      generationRef.current += 1;
      desiredRef.current.clear();
      pendingRef.current.clear();
      revealedRef.current = {};
      resetRef.current();
    };
  }, [hideAll, scopeKey, accountsByEmployee]);

  useEffect(() => {
    const onBlur = () => hideAll();
    const onVisibilityChange = () => {
      if (document.hidden) hideAll();
    };

    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [hideAll]);

  const revealBatch = useCallback(
    async (requestedIds: string[]) => {
      const ids = requestedIds.filter(
        (id) => accountOwnersRef.current.has(id) && !pendingRef.current.has(id) && !revealedRef.current[id],
      );

      if (ids.length === 0) return;

      const currentGeneration = generationRef.current;
      const currentScope = scopeRef.current;

      for (const id of ids) pendingRef.current.add(id);
      setPending(new Set(pendingRef.current));

      try {
        const result = await reveal({ account_ids: ids }).unwrap();

        if (currentGeneration !== generationRef.current || currentScope !== scopeRef.current) return;

        const next = { ...revealedRef.current };
        const receivedIds = new Set<string>();
        const requestedSet = new Set(ids);

        for (const item of result) {
          if (
            !requestedSet.has(item.id) ||
            !desiredRef.current.has(item.id) ||
            accountOwnersRef.current.get(item.id) !== item.employee_id ||
            typeof item.account_number !== "string" ||
            item.account_number.length === 0
          ) {
            continue;
          }

          next[item.id] = {
            employeeId: item.employee_id,
            accountNumber: item.account_number,
          };
          receivedIds.add(item.id);
        }

        revealedRef.current = next;
        setRevealedState({ scopeKey: currentScope, values: next });

        if (ids.some((id) => desiredRef.current.has(id) && !receivedIds.has(id))) {
          setError("Some account numbers are unavailable or no longer eligible to be revealed.");
        }
      } catch (requestError) {
        if (currentGeneration === generationRef.current && currentScope === scopeRef.current) {
          for (const id of ids) desiredRef.current.delete(id);
          setError(requestErrorMessage(requestError));
        }
      } finally {
        resetRef.current();

        if (currentGeneration === generationRef.current && currentScope === scopeRef.current) {
          for (const id of ids) pendingRef.current.delete(id);
          setPending(new Set(pendingRef.current));
        }
      }
    },
    [reveal],
  );

  const toggleOne = useCallback(
    (accountId: string) => {
      if (!accountOwnersRef.current.has(accountId)) return;

      setError(null);

      if (desiredRef.current.has(accountId) || revealedRef.current[accountId]) {
        desiredRef.current.delete(accountId);
        const next = { ...revealedRef.current };
        delete next[accountId];
        revealedRef.current = next;
        setRevealedState({ scopeKey: scopeRef.current, values: next });
        return;
      }

      desiredRef.current.add(accountId);

      if (pendingRef.current.has(accountId)) {
        setPending(new Set(pendingRef.current));
        return;
      }

      void revealBatch([accountId]);
    },
    [revealBatch],
  );

  const toggleAll = useCallback(() => {
    const ids = Array.from(accountOwnersRef.current.keys());
    if (ids.length === 0) return;

    if (ids.every((id) => desiredRef.current.has(id))) {
      hideAll();
      return;
    }

    for (const id of ids) desiredRef.current.add(id);
    setError(null);

    const missing = ids.filter((id) => !revealedRef.current[id] && !pendingRef.current.has(id));
    const currentGeneration = generationRef.current;
    bulkGenerationRef.current = currentGeneration;

    void (async () => {
      for (let i = 0; i < missing.length; i += 100) {
        if (currentGeneration !== generationRef.current) break;
        await revealBatch(missing.slice(i, i + 100));
      }

      if (bulkGenerationRef.current === currentGeneration) bulkGenerationRef.current = null;
    })();
  }, [hideAll, revealBatch]);

  const displayNumber = useCallback(
    (account: AccountLike) => {
      const item = revealed[account.id];
      return item && accountOwners.get(account.id) === item.employeeId
        ? item.accountNumber
        : account.account_number;
    },
    [revealed, accountOwners],
  );

  const isVisible = useCallback(
    (accountId: string) => {
      const item = revealed[accountId];
      return Boolean(item && accountOwners.get(accountId) === item.employeeId);
    },
    [revealed, accountOwners],
  );

  const isPending = useCallback(
    (accountId: string) => pending.has(accountId) && desiredRef.current.has(accountId),
    [pending],
  );

  return {
    hasAccounts: accountOwners.size > 0,
    allVisible: accountOwners.size > 0 && Array.from(accountOwners.keys()).every((id) => isVisible(id)),
    error,
    displayNumber,
    isVisible,
    isPending,
    toggleOne,
    toggleAll,
    hideAll,
    clearError: () => setError(null),
  };
}
