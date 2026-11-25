import { emptySplitApi } from "@/redux/api";
import type { ApiEnvelope, EmployeePageMeta } from "@/type/api";
import type {
  Bank,
  BankAccount,
  BankAccountInput,
  Employee,
  EmployeeAlias,
  EmployeeInput,
  EmploymentStatus,
  PaymentAccount,
} from "@/type/employee";

export interface EmployeeListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  sort?: "official_name" | "created_at" | "employee_number";
}

export const employeeApi = emptySplitApi.injectEndpoints({
  endpoints: (build) => ({
    getEmployees: build.query<{ rows: Employee[]; meta: EmployeePageMeta; accounts: Record<string, PaymentAccount[]> }, EmployeeListParams | void>({
      query: (params) => ({
        url: "/employees",
        params: {
          page: params?.page ?? 1,
          page_size: params?.pageSize ?? 20,
          search: params?.search || undefined,
          status: params?.status || undefined,
          sort: params?.sort ?? "official_name",
        },
      }),
      transformResponse: (response: ApiEnvelope<Employee[], EmployeePageMeta>) => ({
        rows: response.data,
        meta: response.meta,
        accounts: response.meta?.accounts ?? {},
      }),
      providesTags: (result) => [
        { type: "Employee", id: "LIST" },
        ...(result?.rows.map(({ id }) => ({ type: "Employee" as const, id })) ?? []),
      ],
    }),
    getEmployee: build.query<Employee, string>({
      query: (id) => `/employees/${id}`,
      transformResponse: (response: ApiEnvelope<Employee>) => response.data,
      providesTags: (_result, _error, id) => [{ type: "Employee", id }],
    }),
    createEmployee: build.mutation<Employee, EmployeeInput>({
      query: (body) => ({ url: "/employees", method: "POST", body }),
      transformResponse: (response: ApiEnvelope<Employee>) => response.data,
      invalidatesTags: [{ type: "Employee", id: "LIST" }],
    }),
    updateEmployee: build.mutation<Employee, { id: string; body: EmployeeInput }>({
      query: ({ id, body }) => ({ url: `/employees/${id}`, method: "PATCH", body }),
      transformResponse: (response: ApiEnvelope<Employee>) => response.data,
      invalidatesTags: (_result, _error, { id }) => [{ type: "Employee", id }, { type: "Employee", id: "LIST" }],
    }),
    updateEmployeeStatus: build.mutation<Employee, { id: string; status: EmploymentStatus; reason: string }>({
      query: ({ id, ...body }) => ({ url: `/employees/${id}/status`, method: "PATCH", body }),
      transformResponse: (response: ApiEnvelope<Employee>) => response.data,
      invalidatesTags: (_result, _error, { id }) => [{ type: "Employee", id }, { type: "Employee", id: "LIST" }],
    }),
    getBanks: build.query<Bank[], void>({
      query: () => "/banks",
      transformResponse: (response: ApiEnvelope<Bank[]>) => response.data,
      providesTags: [{ type: "Bank", id: "LIST" }],
    }),
    getBankAccounts: build.query<BankAccount[], string>({
      query: (employeeId) => `/employees/${employeeId}/bank-accounts`,
      transformResponse: (response: ApiEnvelope<BankAccount[]>) => response.data,
      providesTags: (_result, _error, id) => [{ type: "Employee", id: `ACCOUNTS-${id}` }],
    }),
    createBankAccount: build.mutation<BankAccount, { employeeId: string; body: BankAccountInput }>({
      query: ({ employeeId, body }) => ({ url: `/employees/${employeeId}/bank-accounts`, method: "POST", body }),
      transformResponse: (response: ApiEnvelope<BankAccount>) => response.data,
      invalidatesTags: (_result, _error, { employeeId }) => [{ type: "Employee", id: `ACCOUNTS-${employeeId}` }],
    }),
    updateBankAccount: build.mutation<BankAccount, { employeeId: string; accountId: string; body: BankAccountInput }>({
      query: ({ employeeId, accountId, body }) => ({ url: `/employees/${employeeId}/bank-accounts/${accountId}`, method: "PATCH", body }),
      transformResponse: (response: ApiEnvelope<BankAccount>) => response.data,
      invalidatesTags: (_result, _error, { employeeId }) => [{ type: "Employee", id: `ACCOUNTS-${employeeId}` }],
    }),
    verifyBankAccount: build.mutation<BankAccount, { employeeId: string; accountId: string }>({
      query: ({ employeeId, accountId }) => ({ url: `/employees/${employeeId}/bank-accounts/${accountId}/verify`, method: "POST" }),
      transformResponse: (response: ApiEnvelope<BankAccount>) => response.data,
      invalidatesTags: (_result, _error, { employeeId }) => [
        { type: "Employee", id: `ACCOUNTS-${employeeId}` },
        { type: "Employee", id: employeeId },
        { type: "Employee", id: "LIST" },
      ],
    }),
    getAliases: build.query<EmployeeAlias[], string>({
      query: (employeeId) => `/employees/${employeeId}/aliases`,
      transformResponse: (response: ApiEnvelope<EmployeeAlias[]>) => response.data,
      providesTags: (_result, _error, id) => [{ type: "Employee", id: `ALIASES-${id}` }],
    }),
    createAlias: build.mutation<EmployeeAlias, { employeeId: string; aliasName: string }>({
      query: ({ employeeId, aliasName }) => ({ url: `/employees/${employeeId}/aliases`, method: "POST", body: { alias_name: aliasName } }),
      transformResponse: (response: ApiEnvelope<EmployeeAlias>) => response.data,
      invalidatesTags: (_result, _error, { employeeId }) => [{ type: "Employee", id: `ALIASES-${employeeId}` }],
    }),
    deleteAlias: build.mutation<void, { employeeId: string; aliasId: string }>({
      query: ({ employeeId, aliasId }) => ({ url: `/employees/${employeeId}/aliases/${aliasId}`, method: "DELETE" }),
      invalidatesTags: (_result, _error, { employeeId }) => [{ type: "Employee", id: `ALIASES-${employeeId}` }],
    }),
  }),
});

export const {
  useGetEmployeesQuery,
  useGetEmployeeQuery,
  useCreateEmployeeMutation,
  useUpdateEmployeeMutation,
  useUpdateEmployeeStatusMutation,
  useGetBanksQuery,
  useGetBankAccountsQuery,
  useCreateBankAccountMutation,
  useUpdateBankAccountMutation,
  useVerifyBankAccountMutation,
  useGetAliasesQuery,
  useCreateAliasMutation,
  useDeleteAliasMutation,
} = employeeApi;
