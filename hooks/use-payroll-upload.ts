"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ROUTES } from "@/constants/routes";
import { getApiError, uploadMultipart, type UploadProgress } from "@/redux/api";
import { normalizeApiError } from "@/utils/api-error";
import type { ApiClientError } from "@/type/api";
import { payrollApi } from "@/redux/api/payroll.rtk";
import { store } from "@/redux/store";
import type { PayrollBatch } from "@/type/payroll";
import { validatePayrollFile } from "@/validations/files";

export function usePayrollUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const idempotencyRef = useRef<string | null>(null);
  const payloadSignatureRef = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadGuardRef = useRef(false);
  function selectFile(nextFile: File | null) {
    setError(null); setProgress(null);
    if (!nextFile) { setFile(null); return; }
    setFile(nextFile);
    const issue = validatePayrollFile(nextFile);
    if (issue) {
      const status = nextFile.size > 20 * 1024 * 1024 ? 413 : 415;
      setError(normalizeApiError({ status, data: { message: issue, error: { code: status === 413 ? "FILE_TOO_LARGE" : "UNSUPPORTED_FILE_TYPE" }, data: null, meta: null } }, { method: "POST", endpoint: "/payroll/batches" }));
      return;
    }
    idempotencyRef.current = null; payloadSignatureRef.current = null;
  }
  async function upload(period?: string) {
    if (uploadGuardRef.current) return;
    if (!file) return setError(normalizeApiError({ status: 400, data: { message: "Select a payroll PDF before continuing.", error: { code: "PAYROLL_FILE_REQUIRED" }, data: null, meta: null } }, { method: "POST", endpoint: "/payroll/batches" }));
    const fileIssue = validatePayrollFile(file);
    if (fileIssue) {
      const status = file.size > 20 * 1024 * 1024 ? 413 : 415;
      return setError(normalizeApiError({ status, data: { message: fileIssue, error: { code: status === 413 ? "FILE_TOO_LARGE" : "UNSUPPORTED_FILE_TYPE" }, data: null, meta: null } }, { method: "POST", endpoint: "/payroll/batches" }));
    }
    if (period && !/^\d{4}-\d{2}$/.test(period)) return setError(normalizeApiError({ status: 400, data: { message: "Payroll period must use YYYY-MM.", error: { code: "PAYROLL_PERIOD_INVALID" }, data: null, meta: null } }, { method: "POST", endpoint: "/payroll/batches" }));
    const signature = `${file.name}:${file.size}:${file.lastModified}:${period ?? ""}`;
    if (payloadSignatureRef.current !== signature) { idempotencyRef.current = crypto.randomUUID(); payloadSignatureRef.current = signature; }
    const body = new FormData(); body.append("file", file); if (period) body.append("period", period);
    uploadGuardRef.current = true; setUploading(true); setError(null);
    try {
      const response = await uploadMultipart<PayrollBatch>({ path: "/payroll/batches", formData: body, headers: { "Idempotency-Key": idempotencyRef.current! }, onProgress: setProgress });
      store.dispatch(payrollApi.util.invalidateTags([{ type: "PayrollBatch", id: "LIST" }]));
      router.push(`${ROUTES.payroll}/${response.data.id}`);
    } catch (reason) { setError(getApiError(reason, { method: "POST", endpoint: "/payroll/batches" })); }
    finally { setUploading(false); uploadGuardRef.current = false; }
  }
  return { file, fileIsValid: Boolean(file && !validatePayrollFile(file)), inputRef, selectFile, dragging, setDragging, progress, error, uploading, upload };
}
