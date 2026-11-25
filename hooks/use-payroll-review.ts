"use client";
import { useMemo } from "react";
import {
  useGetAliasesQuery,
  useGetBankAccountsQuery,
  useGetBanksQuery,
  useGetEmployeesQuery,
} from "@/redux/api/employee.rtk";
import { useGetNameSuggestionsQuery } from "@/redux/api/payroll.rtk";
import type { CandidateSuggestion } from "@/type/payroll";
import { parseCandidateSuggestions } from "@/utils/candidate-suggestions";

export function usePayrollCandidateSearch(search: string) {
  return useGetEmployeesQuery(
    { search: search.trim(), pageSize: 20, sort: "official_name" },
    { skip: search.trim().length < 2 },
  );
}

export function usePayrollCandidateEvidence(employeeId: string) {
  const accounts = useGetBankAccountsQuery(employeeId, { refetchOnMountOrArgChange: true });
  const aliases = useGetAliasesQuery(employeeId, { refetchOnMountOrArgChange: true });
  const banks = useGetBanksQuery(undefined, { refetchOnMountOrArgChange: true });
  return { accounts, aliases, banks };
}

/**
 * Parses the JSON-encoded `Candidate` field on a PayrollMatch into
 * a typed array. No network call.
 */
export function useMatchSuggestions(candidateJson: string): CandidateSuggestion[] {
  return useMemo(() => parseCandidateSuggestions(candidateJson), [candidateJson]);
}

/**
 * Fetches name-variant suggestions from the BE for a stored match row.
 * Used for old batches whose `match.Candidate` is empty (pre-variant
 * matching). Activates when the review panel for a `pending_new` row is opened.
 *
 * `enabled` gates the query so it only fires when the panel is open.
 * Returns `isFetching` / `data` / `error` for UI loading/empty/error states.
 */
export function useNameSuggestionsQuery(
  batchId: string,
  matchId: string,
  enabled: boolean,
) {
  const query = useGetNameSuggestionsQuery(
    { batchId, matchId },
    { skip: !enabled, refetchOnFocus: false, refetchOnMountOrArgChange: false },
  );
  return query;
}
