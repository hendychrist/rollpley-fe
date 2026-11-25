"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { getApiError } from "@/redux/api";
import { payrollApi } from "@/redux/api/payroll.rtk";
import type { AppDispatch } from "@/redux/store";
import type { ApiClientError } from "@/type/api";
import { useConfirmPeriodMutation, useFinalizePayrollMutation, useGenerateExportsMutation, useGetExportStatusQuery, useGetExportsQuery, useGetPayrollBatchQuery, useGetPayrollMatchesQuery, useGetProcessingStatusQuery, useGetReconciliationQuery, useReopenPayrollMatchMutation, useReviewPayrollMatchMutation, useStartPayrollProcessingMutation } from "@/redux/api/payroll.rtk";
import { useCreateEmployeeMutation, useDeleteAliasMutation } from "@/redux/api/employee.rtk";
import type { Employee, EmployeeInput } from "@/type/employee";
import type { ReviewMatchResponse } from "@/type/payroll";

/**
 * Result of a review PATCH call. `result` is the full BE response when
 * the call succeeds; `error` is set when the call fails (409 CONFLICT, etc.).
 * The `alias` field in result is present when save_name_variant was set.
 */
export type ReviewCallResult =
  | { ok: true; result: ReviewMatchResponse }
  | { ok: false; error: ApiClientError };

/**
 * Result of a generic guarded payroll action (reopen, alias removal, …).
 * On 409/404 the API error is kept for inline copy mapping.
 */
export type PayrollActionResult =
  | { ok: true; status?: string }
  | { ok: false; error: ApiClientError };

export function usePayrollDetail(id: string, initialMatchPage = 1) {
  const dispatch = useDispatch<AppDispatch>();
  const batch = useGetPayrollBatchQuery(id, { refetchOnFocus: false });
  const [terminal, setTerminal] = useState(false);
  const processing = useGetProcessingStatusQuery(id, { skip: !batch.data || !["uploaded", "parsing", "matching"].includes(batch.data.status), pollingInterval: terminal ? 0 : 5000, refetchOnFocus: false });
  useEffect(() => { const status = processing.data?.Status; if (status === "completed" || status === "failed") setTerminal(true); }, [processing.data?.Status]);
  const canReview = Boolean(batch.data && ["matched", "reconciled", "finalized"].includes(batch.data.status)) || processing.data?.Status === "completed";

  // Pending queue: 5 rows per page, server-filtered by status=pending.
  // `initialMatchPage` comes from the deep-link hint (reviewPage param).
  const [pendingPage, setPendingPageState] = useState(initialMatchPage);
  const pendingMatches = useGetPayrollMatchesQuery(
    { batchId: id, status: "pending", page: pendingPage, pageSize: 5 },
    { skip: !canReview },
  );
  const setPendingPage = useCallback((page: number) => { setPendingPageState(page); }, []);
  // Which page is currently in-flight (spinner shows on that control).
  // `isFetching` is true during both initial load and refetch; `isLoading`
  // is only true when there's no cached data yet.
  const pendingLoadingPage = pendingMatches.isFetching ? pendingPage : null;
  const pendingError = pendingMatches.isError ? pendingMatches.error : null;
  const pendingRef = useRef(pendingMatches);
  pendingRef.current = pendingMatches;
  const retryPendingPage = useCallback(() => { void pendingRef.current.refetch(); }, []);
  // Clamp pendingPage when total shrinks after a mutation (e.g. count drops
  // 16→15 while on page 4 — lastPage becomes 3, so fall back to 3).
  const pendingTotal = pendingMatches.data?.meta?.total ?? 0;
  const lastPendingPage = Math.max(1, Math.ceil(pendingTotal / 5));
  useEffect(() => {
    if (pendingPage > lastPendingPage) setPendingPageState(lastPendingPage);
  }, [pendingPage, lastPendingPage]);

  // Independent "Sudah dikonfirmasi" list: status=auto_matched, 5 rows per
  // page. Independent of the pending queue's page; reopen invalidates the
  // PayrollMatch tag so this refetches automatically.
  const [resolvedPage, setResolvedPageState] = useState(1);
  const [resolvedSearch, setResolvedSearch] = useState("");
  const resolvedMatches = useGetPayrollMatchesQuery({ batchId: id, status: "auto_matched", page: resolvedPage, pageSize: 5, q: resolvedSearch.trim() || undefined }, { skip: !canReview });
  const setResolvedPage = useCallback((page: number) => { setResolvedPageState(page); }, []);
  const setResolvedSearchState = useCallback((query: string) => { setResolvedSearch(query); setResolvedPageState(1); }, []);

  // Independent exclusion history. It remains queryable for finalized batches,
  // while the UI disables mutation actions in read-only mode.
  const [rejectedPage, setRejectedPageState] = useState(1);
  const rejectedMatches = useGetPayrollMatchesQuery({ batchId: id, status: "rejected", page: rejectedPage, pageSize: 5 }, { skip: !canReview });
  const setRejectedPage = useCallback((page: number) => { setRejectedPageState(page); }, []);
  const rejectedRef = useRef(rejectedMatches);
  rejectedRef.current = rejectedMatches;
  const retryRejectedPage = useCallback(() => { void rejectedRef.current.refetch(); }, []);

  const reconciliation = useGetReconciliationQuery(id, { skip: !canReview });
  const exportsQuery = useGetExportsQuery(id, { skip: batch.data?.status !== "finalized" });
  const [start, startState] = useStartPayrollProcessingMutation();
  const [review, reviewState] = useReviewPayrollMatchMutation();
  const [createEmployee, employeeState] = useCreateEmployeeMutation();
  const [finalize, finalizeState] = useFinalizePayrollMutation();
  const [generate, generateState] = useGenerateExportsMutation();
  const [confirmPeriod, confirmPeriodState] = useConfirmPeriodMutation();
  const [reopenMatch, reopenState] = useReopenPayrollMatchMutation();
  const [deleteAlias, deleteAliasState] = useDeleteAliasMutation();
  const [error, setError] = useState<ApiClientError | null>(null);

  // ── Export retry refresh lifecycle ──────────────────────────────────────────
  // When a user clicks "Buat / coba ulang ekspor", the generate mutation
  // response (ExportFile[]) is upserted into the getExports RTK Query cache
  // so the File bank UI immediately reflects the server's post-POST state.
  // A polling gate is armed to keep getExportStatus polling alive while
  // the cache still has pending/uploading rows, or while no fresh
  // server refresh has landed since the retry started.
  //
  // Disarm condition (must be met to stop polling):
  //   1. The retry gate is active, AND
  //   2. exportsQuery.data has been refetched (fulfilledTimeStamp > retryStart), AND
  //   3. No row in the cache is pending or uploading.
  //
  // This prevents the stale-terminal race: a pre-retry "failed" cache must
  // not immediately stop the poller; the poller stays alive until the
  // post-retry refetch confirms the latest server state.
  const exportRetryRef = useRef<{ startedAt: number } | null>(null);
  const generateMutationRef = useRef(generate);
  generateMutationRef.current = generate;

  const handleGenerate = useCallback(async () => {
    setError(null);
    try {
      const files = await generateMutationRef.current(id).unwrap();
      // Upsert the mutation response into the getExports cache so the UI
      // reflects the actual server state immediately, without waiting for
      // the tag-invalidation refetch to land. This is a cache sync, not a
      // source-of-truth override — the subsequent refetch still reconciles.
      dispatch(payrollApi.util.upsertQueryData("getExports", id, files));
      // Arm the retry poller: keep getExportStatus polling until a fresh
      // server refresh (fulfilledTimeStamp > startedAt) confirms all rows
      // are terminal. If the refetch never lands, the poller stays alive.
      exportRetryRef.current = { startedAt: Date.now() };
      return true;
    } catch (reason) {
      // Mutation failed: disarm any in-flight retry poller. The previous
      // cached export rows remain visible; RTK Query does not invalidate
      // tags on mutation failure, so the poller naturally stays at whatever
      // state it was in.
      exportRetryRef.current = null;
      setError(getApiError(reason));
      return false;
    }
  }, [dispatch, id]);

  // Effective active-row check: the base gate (cache has pending/uploading)
  // OR the retry gate (poller armed and no post-retry refresh has confirmed
  // terminal state yet). The retry gate self-disarms once a fresh refetch
  // lands with all-terminal rows.
  const exportsData = exportsQuery.data;
  const hasActiveInCache = (exportsData ?? []).some(
    (f) => f.status === "uploading" || f.status === "pending",
  );
  const retryGate = exportRetryRef.current;
  // A fresh refetch = fulfilledTimeStamp exists and is after retry startedAt.
  // RTK Query updates fulfilledTimeStamp on every successful fetch.
  const hasFreshRefetch =
    retryGate !== null &&
    exportsQuery.fulfilledTimeStamp !== undefined &&
    exportsQuery.fulfilledTimeStamp > retryGate.startedAt;
  const hasActiveExportRow =
    hasActiveInCache ||
    (retryGate !== null && !hasFreshRefetch);

  // Drives the File bank rows from live backend status. Polls every 4s while
  // any row is uploading/pending; the interval is 0 once all rows are terminal.
  // Also runs on page load, so a reload mid-upload resumes the loading UI.
  // The retry gate keeps polling alive after a generate/retry until a fresh
  // post-retry refetch confirms all rows are terminal.
  const exportStatusQuery = useGetExportStatusQuery(id, {
    skip: batch.data?.status !== "finalized",
    refetchOnMountOrArgChange: true,
    pollingInterval: hasActiveExportRow ? 4000 : 0,
  });

  // Auto-disarm the retry gate once a fresh refetch confirms all rows are
  // terminal. This runs on every render where the condition holds; the
  // gate is cleared so subsequent renders fall back to the base cache-only
  // gate (which will be false at this point).
  useEffect(() => {
    if (retryGate && hasFreshRefetch && !hasActiveInCache) {
      exportRetryRef.current = null;
    }
  }, [retryGate, hasFreshRefetch, hasActiveInCache]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try { await action(); return true; }
    catch (reason) { setError(getApiError(reason)); return false; }
  }
  async function createEmployeeFromReview(body: EmployeeInput): Promise<Employee | null> {
    setError(null);
    try { return await createEmployee(body).unwrap(); }
    catch (reason) { setError(getApiError(reason)); return null; }
  }

  return {
    batch, processing,
    pendingMatches, pendingPage, setPendingPage, pendingLoadingPage, pendingError, retryPendingPage,
    resolvedMatches, resolvedPage, setResolvedPage, resolvedSearch, setResolvedSearch: setResolvedSearchState,
    rejectedMatches, rejectedPage, setRejectedPage, retryRejectedPage,
    reconciliation, exportsQuery, exportStatusQuery, hasActiveExportRow, error,
    start: () => { setTerminal(false); return run(() => start(id).unwrap()); },
    review: async (matchId: string, status: string, employee_id?: string, reason?: string, save_name_variant?: boolean): Promise<ReviewCallResult> => {
      setError(null);
      try {
        const result = await review({ batchId: id, matchId, status, employee_id, reason, save_name_variant }).unwrap();
        return { ok: true, result };
      } catch (err) {
        setError(getApiError(err));
        return { ok: false, error: getApiError(err) };
      }
    },
    createEmployee: createEmployeeFromReview,
    finalize: () => run(() => finalize(id).unwrap()),
    generate: () => run(() => handleGenerate()),
    confirmPeriod: (period: string) => run(() => confirmPeriod({ batchId: id, period }).unwrap()),
    /** Fix #11: revert a confirmed decision back to the review queue. */
    reopen: async (matchId: string, reason: string): Promise<PayrollActionResult> => {
      setError(null);
      try {
        const result = await reopenMatch({ batchId: id, matchId, reason: reason.trim() }).unwrap();
        return { ok: true, status: result.status };
      }
      catch (err) {
        const error = getApiError(err);
        setError(error);
        if (error.status === 409 && (error.code === "PAYROLL_MATCH_NOT_REVIEWABLE" || error.code === "PAYROLL_BATCH_NOT_REVIEWABLE")) {
          dispatch(payrollApi.util.invalidateTags([
            { type: "PayrollMatch", id },
            { type: "Reconciliation", id },
            { type: "PayrollBatch", id },
          ]));
        }
        return { ok: false, error };
      }
    },
    /** Fix #11: delete the blocking alias so the reviewer can re-confirm the row. */
    removeAlias: async (employeeId: string, aliasId: string): Promise<PayrollActionResult> => {
      setError(null);
      try { await deleteAlias({ employeeId, aliasId }).unwrap(); return { ok: true }; }
      catch (err) { const error = getApiError(err); setError(error); return { ok: false, error }; }
    },
    busy: startState.isLoading || reviewState.isLoading || employeeState.isLoading || finalizeState.isLoading || generateState.isLoading || confirmPeriodState.isLoading || reopenState.isLoading || deleteAliasState.isLoading,
  };
}
