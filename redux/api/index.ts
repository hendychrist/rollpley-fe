import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
} from "@reduxjs/toolkit/query/react";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";
import type { ApiClientError, ApiEnvelope } from "@/type/api";
import { normalizeApiError, toApiClientError } from "@/utils/api-error";

const transport = fetchBaseQuery({ baseUrl: publicEnv.apiBaseUrl, timeout: 60_000 });

export async function handleUnauthorizedSession(resetApiState?: () => void) {
  await createClient().auth.signOut({ scope: "local" });
  resetApiState?.();
  if (typeof window === "undefined" || window.location.pathname === "/login") return;
  const previous = Number(window.sessionStorage.getItem("rollpley-auth-redirect") ?? 0);
  if (Date.now() - previous > 5000) {
    window.sessionStorage.setItem("rollpley-auth-redirect", String(Date.now()));
    window.location.assign("/login?reason=session");
  }
}

const authenticatedBaseQuery: BaseQueryFn<
  string | FetchArgs,
  unknown,
  ApiClientError
> = async (args, api, extraOptions) => {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const original = typeof args === "string" ? { url: args } : args;
  const method = original.method?.toString().toUpperCase() ?? "GET";
  const endpoint = original.url;
  const requestId = crypto.randomUUID();
  const headers = new Headers(original.headers as HeadersInit | undefined);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Request-ID", requestId);

  const result = await transport({ ...original, headers }, api, extraOptions);
  if (result.error) {
    if (result.error.status === 401) {
      await handleUnauthorizedSession(() => { api.dispatch(emptySplitApi.util.resetApiState()); });
    }
    const responseRequestId = result.meta?.response?.headers.get("X-Request-ID") ?? undefined;
    return { error: normalizeApiError(result.error, { method, endpoint, requestId, responseRequestId, operation: endpoint.startsWith("/employees") ? "employee-list-read" : undefined }) };
  }
  if (typeof window !== "undefined") window.sessionStorage.removeItem("rollpley-auth-redirect");
  return { data: result.data };
};

export const emptySplitApi = createApi({
  reducerPath: "api",
  baseQuery: authenticatedBaseQuery,
  tagTypes: ["Bank", "Employee", "PayrollBatch", "PayrollMatch", "Reconciliation", "Export", "MasterImport", "FeePolicy"],
  endpoints: () => ({}),
});

export async function getAccessToken() {
  const { data } = await createClient().auth.getSession();
  return data.session?.access_token ?? null;
}

export function getApiErrorMessage(error: unknown) {
  return toApiClientError(error).message;
}

export const getApiError = toApiClientError;

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export async function uploadMultipart<T>({
  path,
  formData,
  headers,
  onProgress,
}: {
  path: string;
  formData: FormData;
  headers?: Record<string, string>;
  onProgress?: (progress: UploadProgress) => void;
}): Promise<ApiEnvelope<T>> {
  const token = await getAccessToken();
  if (!token) throw normalizeApiError({ status: 401, data: { message: "Supabase session is unavailable.", error: { code: "UNAUTHENTICATED" }, data: null, meta: null } }, { method: "POST", endpoint: path, operation: "master-import-upload" });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${publicEnv.apiBaseUrl}${path}`);
    xhr.timeout = 120_000;
    xhr.responseType = "json";
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    const requestId = crypto.randomUUID();
    xhr.setRequestHeader("X-Request-ID", requestId);
    Object.entries(headers ?? {}).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    // ponytail: request a screen wake lock around uploads so hidden tabs don't throttle XHR; deny = progress still works, only throttling risk
    const reportProgress = (event: ProgressEvent) => { if (!event.lengthComputable) return; onProgress?.({ loaded: event.loaded, total: event.total, percent: Math.round((event.loaded / event.total) * 100) }); };
    const wake = navigator as typeof navigator & { wakeLock?: { request: (options: { type: "screen" }) => Promise<{ release: () => Promise<void> }> } };
    void (async () => {
      if (!wake.wakeLock) { xhr.upload.addEventListener("progress", reportProgress); return; }
      try { const lock = await wake.wakeLock.request({ type: "screen" }); xhr.upload.addEventListener("progress", reportProgress); xhr.addEventListener("loadend", () => void lock.release(), { once: true }); }
      catch { xhr.upload.addEventListener("progress", reportProgress); }
    })();
    xhr.addEventListener("load", () => {
      const envelope = xhr.response as ApiEnvelope<T> | null;
      if (xhr.status >= 200 && xhr.status < 300 && envelope) return resolve(envelope);
      if (xhr.status === 401) void handleUnauthorizedSession();
      if (xhr.status >= 200 && xhr.status < 300) return reject(normalizeApiError({ status: "PARSING_ERROR", originalStatus: xhr.status, data: "", error: "The upload endpoint returned an invalid JSON envelope" }, { method: "POST", endpoint: path, requestId, responseRequestId: xhr.getResponseHeader("X-Request-ID") ?? undefined, operation: "master-import-upload" }));
      reject(normalizeApiError({ status: xhr.status, data: envelope }, { method: "POST", endpoint: path, requestId, responseRequestId: xhr.getResponseHeader("X-Request-ID") ?? undefined, operation: "master-import-upload" }));
    });
    xhr.addEventListener("error", () => reject(normalizeApiError({ status: "FETCH_ERROR", error: "Browser upload request failed" }, { method: "POST", endpoint: path, requestId, operation: "master-import-upload" })));
    xhr.addEventListener("timeout", () => reject(normalizeApiError({ status: "TIMEOUT_ERROR", error: "Browser upload request timed out" }, { method: "POST", endpoint: path, requestId, operation: "master-import-upload" })));
    xhr.addEventListener("abort", () => reject(normalizeApiError({ status: "CUSTOM_ERROR", error: "The upload was interrupted.", data: undefined }, { method: "POST", endpoint: path, requestId, operation: "master-import-upload" })));
    xhr.send(formData);
  });
}
