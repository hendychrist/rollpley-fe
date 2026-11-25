import { emptySplitApi } from "@/redux/api";
import type { ApiEnvelope } from "@/type/api";
import type { FeePolicy, FeePolicyInput } from "@/type/fee-policy";

export const feePolicyApi = emptySplitApi.injectEndpoints({
  endpoints: (build) => ({
    getFeePolicy: build.query<FeePolicy, void>({ query: () => "/fee-policy", transformResponse: (response: ApiEnvelope<FeePolicy>) => response.data, providesTags: [{ type: "FeePolicy", id: "LATEST" }] }),
    createFeePolicy: build.mutation<FeePolicy, FeePolicyInput>({ query: (body) => ({ url: "/fee-policy", method: "POST", body }), transformResponse: (response: ApiEnvelope<FeePolicy>) => response.data, invalidatesTags: [{ type: "FeePolicy", id: "LATEST" }] }),
    confirmFeePolicy: build.mutation<FeePolicy, string>({ query: (id) => ({ url: `/fee-policy/${id}/confirm`, method: "POST" }), transformResponse: (response: ApiEnvelope<FeePolicy>) => response.data, invalidatesTags: [{ type: "FeePolicy", id: "LATEST" }] }),
  }),
});
export const { useGetFeePolicyQuery, useCreateFeePolicyMutation, useConfirmFeePolicyMutation } = feePolicyApi;
