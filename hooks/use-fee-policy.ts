"use client";
import { useState } from "react";
import { getApiError } from "@/redux/api";
import type { ApiClientError } from "@/type/api";
import { useConfirmFeePolicyMutation, useCreateFeePolicyMutation, useGetFeePolicyQuery } from "@/redux/api/fee-policy.rtk";
import type { FeePolicyInput } from "@/type/fee-policy";
export function useFeePolicy() { const policy = useGetFeePolicyQuery(); const [create, createState] = useCreateFeePolicyMutation(); const [confirm, confirmState] = useConfirmFeePolicyMutation(); const [error, setError] = useState<ApiClientError | null>(null); async function run(action: () => Promise<unknown>) { setError(null); try { await action(); return true; } catch (reason) { setError(getApiError(reason)); return false; } } return { policy, error, create: (body: FeePolicyInput) => run(() => create(body).unwrap()), confirm: (id: string) => run(() => confirm(id).unwrap()), busy: createState.isLoading || confirmState.isLoading }; }
