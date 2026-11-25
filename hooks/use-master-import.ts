"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { getApiError, uploadMultipart } from "@/redux/api";
import type { ApiClientError } from "@/type/api";
import { masterImportApi, useConfirmMasterImportMutation, useGetMasterImportQuery, useGetMasterImportRowsQuery, useReviewDistinctMasterImportRowsMutation, useReviewMasterImportRowMutation, type ReviewImportRowInput } from "@/redux/api/master-import.rtk";
import { store } from "@/redux/store";
import type { MasterImportSession } from "@/type/master-import";
import { intakeMasterFiles, MASTER_TEMPLATE_LIMIT, masterFileIdentity, masterTemplateKey, validateMasterFiles } from "@/validations/master-import-files";
import { normalizeApiError } from "@/utils/api-error";

export function useMasterImport() {
  const router = useRouter(); const params = useSearchParams(); const importId = params.get("import");
  const [files, setFiles] = useState<File[]>([]); const [progress, setProgress] = useState<number | null>(null); const [uploading, setUploading] = useState(false); const [error, setError] = useState<ApiClientError | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadGuardRef = useRef(false);
  const session = useGetMasterImportQuery(importId ?? "", { skip: !importId, refetchOnFocus: false }); const [confirm, confirmState] = useConfirmMasterImportMutation();

  // Shared intake for picker and drop: append, reject conflicts, never overwrite or truncate.
  function addFiles(incoming: File[]) {
    if (uploading) return;
    const result = intakeMasterFiles(files, incoming, MASTER_TEMPLATE_LIMIT);
    setFiles(result.files);
    setError(null); setProgress(null);
    if (result.rejected.length) setNotice(result.rejected.map((item) => item.message).join(" "));
    else setNotice(null);
  }
  function removeFile(identity: string) {
    if (uploading) return;
    setFiles((current) => current.filter((file) => masterFileIdentity(file) !== identity));
    setError(null); setProgress(null); setNotice(null);
  }
  function resetInput() { if (inputRef.current) inputRef.current.value = ""; }
  function openPicker() { if (uploading) return; resetInput(); inputRef.current?.click(); }
  async function upload() {
    if (uploadGuardRef.current) return;
    const issue = validateMasterFiles(files); if (issue) return setError(normalizeApiError({ status: 400, data: { message: issue, error: { code: "MASTER_IMPORT_FILES_INVALID" }, data: null, meta: null } }, { method: "POST", endpoint: "/master-imports", operation: "master-import-upload" }));
    setError(null); setNotice(null); uploadGuardRef.current = true; setUploading(true); const body = new FormData(); files.forEach((file) => body.append("file", file));
    try { const response = await uploadMultipart<MasterImportSession>({ path: "/master-imports", formData: body, onProgress: ({ percent }) => setProgress(percent) }); store.dispatch(masterImportApi.util.invalidateTags([{ type: "MasterImport", id: response.data.id }])); router.replace(`/master-karyawan?import=${response.data.id}`); }
    catch (reason) { setError(getApiError(reason, { method: "POST", endpoint: "/master-imports" })); }
    finally { setUploading(false); uploadGuardRef.current = false; }
  }
  async function confirmImport() { if (!importId) return; setError(null); try { await confirm(importId).unwrap(); } catch (reason) { setError(getApiError(reason)); } }
  return {
    files, addFiles, removeFile, openPicker, inputRef, notice,
    selectedCount: files.length,
    templateKeys: files.map(masterTemplateKey),
    isComplete: files.length === MASTER_TEMPLATE_LIMIT,
    canSubmit: files.length === MASTER_TEMPLATE_LIMIT && !uploading && !validateMasterFiles(files),
    progress, uploading, error, upload, importId, session, confirmImport, confirming: confirmState.isLoading,
  };
}

export function useMasterImportReview(importId: string) {
  const importSession = useGetMasterImportQuery(importId, { refetchOnFocus: false });
  const rows = useGetMasterImportRowsQuery({ importId, classification: "conflict", pendingGroups: true, pageSize: 100 });
  const [review, reviewState] = useReviewMasterImportRowMutation();
  const [reviewDistinct, distinctState] = useReviewDistinctMasterImportRowsMutation();
  const [error, setError] = useState<ApiClientError | null>(null);
  async function save(rowId: string, body: ReviewImportRowInput) { setError(null); try { await review({ importId, rowId, body }).unwrap(); return true; } catch (reason) { setError(getApiError(reason)); return false; } }
  async function saveDistinct(rowIds: string[], note?: string) { setError(null); try { await reviewDistinct({ importId, rowIds, note: note?.trim() || undefined }).unwrap(); await rows.refetch(); return true; } catch (cause) { setError(getApiError(cause)); return false; } }
  function invalidateRows() { store.dispatch(masterImportApi.util.invalidateTags([{ type: "MasterImport", id: importId }, { type: "MasterImport", id: `ROWS-${importId}` }])); }
  return { importSession, rows, save, saveDistinct, saving: reviewState.isLoading || distinctState.isLoading, error, invalidateRows };
}
