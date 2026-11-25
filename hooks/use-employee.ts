"use client";
import { useState } from "react";
import { getApiError } from "@/redux/api";
import type { ApiClientError } from "@/type/api";
import { useCreateEmployeeMutation, useGetEmployeesQuery } from "@/redux/api/employee.rtk";
import type { EmployeeInput } from "@/type/employee";

export function useEmployeeList() {
  const [page, setPage] = useState(1); const [search, setSearch] = useState(""); const [status, setStatus] = useState("");
  const query = useGetEmployeesQuery({ page, pageSize: 20, search, status });
  return { ...query, page, setPage, search, setSearch: (value: string) => { setSearch(value); setPage(1); }, status, setStatus: (value: string) => { setStatus(value); setPage(1); } };
}

export function useEmployeeCreate(onSuccess: () => void) {
  const [createEmployee, state] = useCreateEmployeeMutation(); const [error, setError] = useState<ApiClientError | null>(null);
  async function submit(input: EmployeeInput) { setError(null); try { await createEmployee(input).unwrap(); onSuccess(); } catch (reason) { setError(getApiError(reason)); } }
  return { submit, loading: state.isLoading, error };
}
