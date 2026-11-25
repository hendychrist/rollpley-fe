import { publicEnv } from "@/lib/env";
import { getAccessToken, handleUnauthorizedSession } from "@/redux/api";
import { normalizeApiError } from "@/utils/api-error";

function filenameFromDisposition(value: string | null) {
  const encoded = value?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  return value?.match(/filename="?([^";]+)"?/i)?.[1] ?? null;
}

export async function downloadExport(batchId: string, exportId: string, fallbackName: string) {
  const token = await getAccessToken();
  const endpoint = `/payroll/batches/${batchId}/exports/${exportId}`; const requestId = crypto.randomUUID();
  if (!token) throw normalizeApiError({ status: 401, data: { message: "Supabase session is unavailable.", error: { code: "UNAUTHENTICATED" }, data: null, meta: null } }, { method: "GET", endpoint, requestId });
  let response: Response; const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 60_000);
  try { response = await fetch(`${publicEnv.apiBaseUrl}${endpoint}`, { headers: { Authorization: `Bearer ${token}`, "X-Request-ID": requestId }, signal: controller.signal }); }
  catch (reason) { const timedOut = reason instanceof DOMException && reason.name === "AbortError"; throw normalizeApiError(timedOut ? { status: "TIMEOUT_ERROR", error: "Browser download request timed out" } : { status: "FETCH_ERROR", error: "Browser download request failed" }, { method: "GET", endpoint, requestId }); }
  finally { window.clearTimeout(timeout); }
  if (response.status === 401) void handleUnauthorizedSession();
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || contentType.includes("application/json") || contentType.includes("text/html")) {
    let body: unknown;
    try { body = contentType.includes("application/json") ? await response.json() : { message: "The download endpoint returned HTML or another non-workbook response.", error: { code: "UNEXPECTED_DOWNLOAD_RESPONSE" }, meta: { content_type: contentType } }; } catch { body = { message: "The download response could not be read.", error: { code: "MALFORMED_DOWNLOAD_RESPONSE" } }; }
    if (response.ok) throw normalizeApiError({ status: "PARSING_ERROR", originalStatus: response.status, data: typeof body === "string" ? body : JSON.stringify(body), error: "Expected a workbook but received a non-binary response" }, { method: "GET", endpoint, requestId, responseRequestId: response.headers.get("X-Request-ID") ?? undefined });
    throw normalizeApiError({ status: response.status, data: body }, { method: "GET", endpoint, requestId, responseRequestId: response.headers.get("X-Request-ID") ?? undefined });
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filenameFromDisposition(response.headers.get("content-disposition")) ?? fallbackName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
