"use client";
import { useCallback, useRef, useState } from "react";
import type { ExportFile } from "@/type/payroll";
import { toApiClientError } from "@/utils/api-error";

/**
 * One-click bulk download of the current bank export files.
 *
 * Owns download orchestration only — server export state stays in RTK Query
 * (`usePayrollDetail` → `exportsQuery` / `exportStatusQuery`). No new Redux
 * state is introduced; all UI state here is local hook state.
 *
 * Reuses the exact same authenticated transport as the individual "Unduh"
 * button (`downloadExport`) — bulk download calls `downloadOne` N times,
 * sequentially, so a failure in one file never blocks the others and a
 * double click can never start two bulk operations at once.
 */

/** Bank groups that make up a payroll payment output. */
export const PAYROLL_EXPORT_GROUPS: readonly string[] = ["BCA", "OTHER", "SUMSEL"];

/** A file group is downloadable when its current export record is `uploaded`. */
export function isExportDownloadable(file: ExportFile | undefined | null): boolean {
  return file?.status === "uploaded";
}

/**
 * Pick the current export record per required group — the same records the
 * File bank UI displays. The list is newest-first, so stale/duplicate
 * history records of the same group are skipped in favor of the latest one.
 */
export function currentExportsByGroup(files: ExportFile[] | undefined | null): Map<string, ExportFile> {
  const byGroup = new Map<string, ExportFile>();
  for (const file of files ?? []) {
    const group = file.output_group;
    if (!byGroup.has(group)) byGroup.set(group, file);
  }
  return byGroup;
}

/** Bulk download is eligible only when every required group has an `uploaded` record. */
export function allExportsReady(files: ExportFile[] | undefined | null): boolean {
  const byGroup = currentExportsByGroup(files);
  return PAYROLL_EXPORT_GROUPS.every((group) => isExportDownloadable(byGroup.get(group)));
}

/** The ready files, in the canonical BCA → OTHER → SUMSEL order. */
export function readyExportFiles(files: ExportFile[] | undefined | null): ExportFile[] {
  const byGroup = currentExportsByGroup(files);
  return PAYROLL_EXPORT_GROUPS.map((group) => byGroup.get(group)).filter((file): file is ExportFile => Boolean(file && isExportDownloadable(file)));
}

export type BulkDownloadResult = {
  successful: string[];
  failed: Array<{ group: string; message: string }>;
};

export type BulkDownloadState = {
  /** A bulk operation is running (button locked, individual buttons for the same file disabled). */
  isDownloadingAll: boolean;
  /** Export id currently being fetched inside the bulk operation (null when idle). */
  downloadingExportId: string | null;
  /** Files finished (success + failure) in the current bulk run. */
  completedCount: number;
  /** Total files in the current bulk run (0 when idle). */
  totalCount: number;
  /** Result of the last completed bulk run; null while running or before the first run. */
  result: BulkDownloadResult | null;
};

/** Label for the in-progress bulk button: "Mengunduh 2 dari 3…".
 *  Only rendered while `isDownloadingAll` is true (loadingLabel of Button). */
export function bulkDownloadProgressLabel(state: Pick<BulkDownloadState, "completedCount" | "totalCount">): string {
  // `completedCount` = files finished before the in-flight one, so the file
  // currently being fetched is the (completedCount + 1)-th of totalCount.
  const current = Math.min(state.completedCount + 1, Math.max(state.totalCount, 1));
  return `Mengunduh ${current} dari ${state.totalCount}…`;
}

/** User-facing outcome of a completed bulk run, or null while running / before the first run. */
export function bulkDownloadSummary(result: BulkDownloadResult | null): { tone: "success" | "warning"; message: string } | null {
  if (result == null) return null;
  if (result.failed.length === 0) {
    return {
      tone: "success",
      message: result.successful.length === 1
        ? "1 file dikirim ke browser. Jika browser meminta izin beberapa unduhan, pilih Izinkan."
        : `${result.successful.length} file dikirim ke browser. Jika browser meminta izin beberapa unduhan, pilih Izinkan.`,
    };
  }
  if (result.successful.length > 0) {
    return {
      tone: "warning",
      message: `${result.successful.length} file berhasil dikirim. ${result.failed.length} file gagal diunduh: ${result.failed.map((item) => item.group).join(", ")}.`,
    };
  }
  return { tone: "warning", message: "Tidak ada file yang berhasil diunduh." };
}

function isHttpStatus(error: unknown, status: number): boolean {
  const apiError = toApiClientError(error, { method: "GET", endpoint: "export download" });
  return apiError.status === status;
}

function downloadErrorSummary(error: unknown, group: string): string {
  // User-friendly summary for the bulk result line; the full ApiClientError
  // (status, endpoint, request id, backend message) stays in the app's
  // existing error system for the individual download buttons.
  return `${group} gagal diunduh`;
}

export function usePayrollExportDownloads(batchId: string) {
  // Local UI state only — no Redux. `index` = next file to fetch; when the
  // run completes, `index === files.length` and `result` holds the summary.
  const [bulk, setBulk] = useState<{ running: boolean; index: number; files: ExportFile[]; result: BulkDownloadResult | null }>({
    running: false,
    index: 0,
    files: [],
    result: null,
  });
  // Guards against double clicks: React state updates are async, so a second
  // click within the same tick still sees running=false — the ref catches it.
  const runningRef = useRef(false);
  const activeRef = useRef(false);

  const downloadOne = useCallback(
    async (file: ExportFile) => {
      // Lazy import keeps the hook transport-independent (and testable):
      // bulk and individual downloads share the exact same authenticated
      // fetch (GET /payroll/batches/:id/exports/:exportId → blob → anchor).
      const { downloadExport } = await import("@/utils/download");
      await downloadExport(batchId, file.id, file.filename);
    },
    [batchId],
  );

  const downloadAll = useCallback(
    async (files: ExportFile[]) => {
      if (runningRef.current || activeRef.current || files.length === 0) return;
      runningRef.current = true;
      activeRef.current = true;
      setBulk({ running: true, index: 0, files, result: null });

      const successful: string[] = [];
      const failed: Array<{ group: string; message: string }> = [];

      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        setBulk((current) => ({ ...current, index }));
        try {
          await downloadOne(file);
          successful.push(file.output_group);
        } catch (error) {
          failed.push({ group: file.output_group, message: downloadErrorSummary(error, file.output_group) });
          // Auth failure (401/403): further requests are pointless — the
          // session/authorization is already broken for the whole operation.
          if (isHttpStatus(error, 401) || isHttpStatus(error, 403)) break;
        }
      }

      setBulk({ running: false, index: files.length, files, result: { successful, failed } });
      runningRef.current = false;
      activeRef.current = false;
    },
    [downloadOne],
  );

  const state: BulkDownloadState = {
    isDownloadingAll: bulk.running,
    // The file currently in flight: `index` points at the file about to be
    // fetched, and `completedCount === index` while running.
    downloadingExportId: bulk.running ? bulk.files[bulk.index]?.id ?? null : null,
    completedCount: bulk.running ? bulk.index : bulk.result ? bulk.result.successful.length + bulk.result.failed.length : 0,
    totalCount: bulk.files.length,
    result: bulk.running ? null : bulk.result,
  };

  return {
    state,
    downloadOne,
    downloadAll,
  };
}
