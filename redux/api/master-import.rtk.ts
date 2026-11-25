import { emptySplitApi } from "@/redux/api";
import type { ApiEnvelope, StandardPageMeta } from "@/type/api";
import type { MasterImportRow, MasterImportSession } from "@/type/master-import";

export interface ReviewImportRowInput {
  decision: string;
  reason?: string;
  employee_id?: string;
  source_row_id?: string;
  replaces_account_id?: string;
  effective_date?: string;
  mapped_unit?: string;
  identity_evidence?: string;
}

export const masterImportApi = emptySplitApi.injectEndpoints({
  endpoints: (build) => ({
    getMasterImport: build.query<MasterImportSession, string>({
      query: (id) => `/master-imports/${id}`,
      transformResponse: (response: ApiEnvelope<MasterImportSession>) => response.data,
      providesTags: (_result, _error, id) => [{ type: "MasterImport", id }],
    }),
    getMasterImportRows: build.query<{ rows: MasterImportRow[]; meta: StandardPageMeta }, { importId: string; page?: number; pageSize?: number; classification?: string; issue?: string; pendingGroups?: boolean }>({
      query: ({ importId, page = 1, pageSize = 20, classification, issue, pendingGroups }) => ({ url: `/master-imports/${importId}/rows`, params: { page, page_size: pageSize, classification: classification || undefined, issue: issue || undefined, pending_groups: pendingGroups || undefined } }),
      transformResponse: (response: ApiEnvelope<MasterImportRow[], StandardPageMeta>) => ({ rows: response.data, meta: response.meta }),
      providesTags: (_result, _error, { importId }) => [{ type: "MasterImport", id: `ROWS-${importId}` }],
    }),
    reviewMasterImportRow: build.mutation<MasterImportRow, { importId: string; rowId: string; body: ReviewImportRowInput }>({
      query: ({ importId, rowId, body }) => ({ url: `/master-imports/${importId}/rows/${rowId}`, method: "PATCH", body }),
      transformResponse: (response: ApiEnvelope<MasterImportRow>) => response.data,
      invalidatesTags: (_result, _error, { importId }) => [{ type: "MasterImport", id: importId }, { type: "MasterImport", id: `ROWS-${importId}` }],
    }),
    reviewDistinctMasterImportRows: build.mutation<MasterImportRow[], { importId: string; rowIds: string[]; note?: string }>({
      query: ({ importId, rowIds, note }) => ({ url: `/master-imports/${importId}/rows/review-distinct`, method: "PATCH", body: { row_ids: rowIds, reason: note || undefined } }),
      transformResponse: (response: ApiEnvelope<MasterImportRow[]>) => response.data,
      invalidatesTags: (_result, _error, { importId }) => [{ type: "MasterImport", id: importId }, { type: "MasterImport", id: `ROWS-${importId}` }],
    }),
    confirmMasterImport: build.mutation<MasterImportSession, string>({
      query: (id) => ({ url: `/master-imports/${id}/confirm`, method: "POST",timeout: 180_000 }),
      transformResponse: (response: ApiEnvelope<MasterImportSession>) => response.data,
      invalidatesTags: (_result, _error, id) => [{ type: "MasterImport", id }, { type: "Employee", id: "LIST" }],
    }),
  }),
});

export const {
  useGetMasterImportQuery,
  useGetMasterImportRowsQuery,
  useReviewMasterImportRowMutation,
  useReviewDistinctMasterImportRowsMutation,
  useConfirmMasterImportMutation,
} = masterImportApi;
