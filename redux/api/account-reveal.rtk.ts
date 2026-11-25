
import { emptySplitApi } from "@/redux/api";
import type { ApiEnvelope } from "@/type/api";
import type {
  RevealAccountNumbersRequest,
  RevealedAccountNumber,
} from "@/type/account-reveal";

export const accountRevealApi = emptySplitApi.injectEndpoints({
  endpoints: (build) => ({
    revealAccountNumbers: build.mutation<
      RevealedAccountNumber[],
      RevealAccountNumbersRequest
    >({
      query: (body) => ({
        url: "/employees/bank-accounts/reveal",
        method: "POST",
        body,
        cache: "no-store",
      }),
      transformResponse: (
        response: ApiEnvelope<RevealedAccountNumber[]>,
      ) => response.data,
    }),
  }),
});

export const {
  useRevealAccountNumbersMutation,
} = accountRevealApi;
