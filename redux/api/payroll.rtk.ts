import { emptySplitApi } from "@/redux/api";
import type { ApiEnvelope, StandardPageMeta } from "@/type/api";
import type { BulkDeletePayrollResult, ExportFile, NameSuggestionsResult, PayrollBatch, PayrollDeletionSelection, PayrollMatch, ProcessingStatus, Reconciliation, ReopenMatchResponse, ReviewMatchResponse } from "@/type/payroll";

export const payrollApi = emptySplitApi.injectEndpoints({
  endpoints: (build) => ({
    getPayrollBatches: build.query<{ rows: PayrollBatch[]; meta: StandardPageMeta }, { page?: number; pageSize?: number } | void>({
      query: (params) => ({ url: "/payroll/batches", params: { page: params?.page ?? 1, page_size: params?.pageSize ?? 10 } }),
      transformResponse: (response: ApiEnvelope<PayrollBatch[], StandardPageMeta>) => ({ rows: response.data, meta: response.meta }),
      providesTags: (result) => [{ type: "PayrollBatch", id: "LIST" }, ...(result?.rows.map(({ id }) => ({ type: "PayrollBatch" as const, id })) ?? [])],
    }),
    getPayrollBatch: build.query<PayrollBatch, string>({
      query: (id) => `/payroll/batches/${id}`,
      transformResponse: (response: ApiEnvelope<PayrollBatch>) => response.data,
      providesTags: (_result, _error, id) => [{ type: "PayrollBatch", id }],
    }),
    getPayrollDeletionSelection: build.query<PayrollDeletionSelection, void>({
      query: () => "/payroll/batches/deletion-selection",
      transformResponse: (response: ApiEnvelope<PayrollDeletionSelection>) => response.data,
      forceRefetch: () => true,
    }),
    bulkDeletePayrollBatches: build.mutation<BulkDeletePayrollResult, string[]>({
      query: (ids) => ({ url: "/payroll/batches/bulk-delete", method: "POST", body: { ids } }),
      transformResponse: (response: ApiEnvelope<BulkDeletePayrollResult>) => response.data,
      invalidatesTags: (_result, error, ids) => error ? [] : [
        { type: "PayrollBatch", id: "LIST" },
        ...ids.flatMap((id) => [
          { type: "PayrollBatch" as const, id },
          { type: "PayrollMatch" as const, id },
          { type: "Reconciliation" as const, id },
          { type: "Export" as const, id },
        ]),
      ],
    }),
    startPayrollProcessing: build.mutation<{ run_id: string }, string>({
      query: (id) => ({ url: `/payroll/batches/${id}/parse-match`, method: "POST" }),
      transformResponse: (response: ApiEnvelope<{ run_id: string }>) => response.data,
      invalidatesTags: (_result, _error, id) => [{ type: "PayrollBatch", id }],
    }),
    getProcessingStatus: build.query<ProcessingStatus, string>({
      query: (id) => `/payroll/batches/${id}/processing-status`,
      transformResponse: (response: ApiEnvelope<ProcessingStatus>) => response.data,
      providesTags: (_result, _error, id) => [{ type: "PayrollBatch", id }],
    }),
    getPayrollMatches: build.query<{ rows: PayrollMatch[]; meta: StandardPageMeta }, { batchId: string; status?: string; page?: number; pageSize?: number; q?: string }>({
      query: ({ batchId, status, page = 1, pageSize = 50, q }) => ({ url: `/payroll/batches/${batchId}/matches`, params: { status: status || undefined, page, page_size: pageSize, q: q?.trim() || undefined } }),
      transformResponse: (response: ApiEnvelope<PayrollMatch[], StandardPageMeta>) => ({ rows: response.data, meta: response.meta }),
      providesTags: (_result, _error, { batchId }) => [{ type: "PayrollMatch", id: batchId }],
    }),
    // Recomputes name-variant suggestions against the current employee master
    // for a stored match row — used for old batches whose Candidate field is empty.
    getNameSuggestions: build.query<NameSuggestionsResult, { batchId: string; matchId: string }>({
      query: ({ batchId, matchId }) => `/payroll/batches/${batchId}/matches/${matchId}/name-suggestions`,
      transformResponse: (response: ApiEnvelope<NameSuggestionsResult>) => response.data,
    }),
    reviewPayrollMatch: build.mutation<ReviewMatchResponse, { batchId: string; matchId: string; status: string; employee_id?: string; reason?: string; save_name_variant?: boolean }>({
      query: ({ batchId, matchId, ...body }) => ({ url: `/payroll/batches/${batchId}/matches/${matchId}`, method: "PATCH", body }),
      transformResponse: (response: ApiEnvelope<ReviewMatchResponse>) => response.data,
      invalidatesTags: (_result, _error, { batchId }) => [{ type: "PayrollMatch", id: batchId }, { type: "Reconciliation", id: batchId }],
    }),
    getReconciliation: build.query<Reconciliation, string>({
      query: (id) => `/payroll/batches/${id}/reconciliation`,
      transformResponse: (response: ApiEnvelope<Reconciliation>) => response.data,
      providesTags: (_result, _error, id) => [{ type: "Reconciliation", id }],
    }),
    // Fix #11: revert a confirmed auto_matched decision back to the review
    // queue. Only matched/reconciled batches + auto_matched rows are valid.
    reopenPayrollMatch: build.mutation<ReopenMatchResponse, { batchId: string; matchId: string; reason: string }>({
      query: ({ batchId, matchId, reason }) => ({ url: `/payroll/batches/${batchId}/matches/${matchId}/reopen`, method: "POST", body: { reason } }),
      transformResponse: (response: ApiEnvelope<ReopenMatchResponse>) => response.data,
      invalidatesTags: (_result, _error, { batchId }) => [
        { type: "PayrollMatch", id: batchId },
        { type: "Reconciliation", id: batchId },
        { type: "PayrollBatch", id: batchId },
      ],
    }),
    confirmPeriod: build.mutation<PayrollBatch, { batchId: string; period: string }>({
      query: ({ batchId, period }) => ({ url: `/payroll/batches/${batchId}/period`, method: "PATCH", body: { period } }),
      transformResponse: (response: ApiEnvelope<PayrollBatch>) => response.data,
      invalidatesTags: (_result, _error, { batchId }) => [{ type: "PayrollBatch", id: batchId }, { type: "PayrollBatch", id: "LIST" }, { type: "Reconciliation", id: batchId }],
    }),
    finalizePayroll: build.mutation<unknown, string>({
      query: (id) => ({ url: `/payroll/batches/${id}/finalize`, method: "POST" }),
      invalidatesTags: (_result, _error, id) => [{ type: "PayrollBatch", id }, { type: "PayrollBatch", id: "LIST" }, { type: "Export", id }],
    }),
    getExports: build.query<ExportFile[], string>({
      query: (id) => `/payroll/batches/${id}/exports`,
      transformResponse: (response: ApiEnvelope<ExportFile[]>) => response.data,
      providesTags: (_result, _error, id) => [{ type: "Export", id }],
    }),
    generateExports: build.mutation<ExportFile[], string>({
      query: (id) => ({ url: `/payroll/batches/${id}/exports`, method: "POST" }),
      transformResponse: (response: ApiEnvelope<ExportFile[]>) => response.data,
      invalidatesTags: (_result, _error, id) => [{ type: "Export", id }],
    }),
    // Polls while any export row is still active; returns 0 once all rows are
    // terminal (uploaded/failed/pending) so the interval stops itself.
    getExportStatus: build.query<number, string>({
      query: (id) => `/payroll/batches/${id}/exports`,
      transformResponse: (response: { data: ExportFile[] } | ExportFile[]) => {
        const files = Array.isArray(response) ? response : response?.data;

        if (!Array.isArray(files)) {
          throw new Error("Format respons GET /exports tidak valid");
        }

        const isProcessing = files.some(
          (file) => file.status === "uploading" || file.status === "pending",
        );

        return isProcessing ? 4000 : 0;
      },
      providesTags: (_result, _error, id) => [{ type: "Export", id }],
    }),
  }),
});

export const {
  useGetPayrollBatchesQuery,
  useGetPayrollBatchQuery,
  useLazyGetPayrollDeletionSelectionQuery,
  useBulkDeletePayrollBatchesMutation,
  useStartPayrollProcessingMutation,
  useGetProcessingStatusQuery,
  useGetPayrollMatchesQuery,
  useGetNameSuggestionsQuery,
  useReviewPayrollMatchMutation,
  useReopenPayrollMatchMutation,
  useGetReconciliationQuery,
  useConfirmPeriodMutation,
  useFinalizePayrollMutation,
  useGetExportsQuery,
  useGenerateExportsMutation,
  useGetExportStatusQuery,
} = payrollApi;
