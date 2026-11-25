import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import type { ApiClientError, ApiEnvelope, ApiErrorBody } from "@/type/api";

interface ErrorContext { method?: string; endpoint?: string; requestId?: string; responseRequestId?: string; operation?: OperationKind; }
type OperationKind = "employee-list-read" | "master-import-upload";
// ponytail: operation-specific titles/explanations override the generic status copy;
// other workflows keep their own wording (e.g. payroll) untouched
const OPERATION_COPY: Record<OperationKind, { title?: string; explanation?: string; uncertain?: { title: string; explanation: string }; }> = {
  "employee-list-read": { title: "Unable to load employees", explanation: "The employee list could not be fetched from the server. Check your connection and try again." },
  "master-import-upload": { uncertain: { title: "The import result could not be confirmed", explanation: "The server may have received your files. Do not submit again until an administrator has checked the import result." } },
};

const statusCopy: Record<number, [string, string]> = {
  400: ["The request could not be processed", "Check the entered information and try again."],
  401: ["Your session has expired", "Sign in again, then return to this work."],
  402: ["The server rejected this request", "Contact the system administrator before trying again. ROLLPLEY has no frontend billing workflow."],
  403: ["You do not have permission", "Your account is signed in but is not allowed to perform this action. Contact an administrator."],
  404: ["The requested data was not found", "It may have been removed or changed by another administrator. Refresh the page."],
  409: ["The data changed before this action completed", "Refresh the latest server state and review it before submitting another decision."],
  413: ["The selected file is too large", "Choose a file within the configured size limit and try again."],
  415: ["The file type is not supported", "Choose a supported PDF or workbook format."],
  422: ["A business rule blocks this action", "Review the blocking reason and correct the related payroll or employee data."],
  429: ["Too many requests were sent", "Wait briefly, then retry only the safe read operation."],
  500: ["The server could not complete the request", "Keep your current inputs and try again later. Contact support if it continues."],
  502: ["The service gateway is unavailable", "The application could not reach a required service. Try again later."],
  503: ["The service is temporarily unavailable", "Wait for the service to recover, then retry a safe operation."],
  504: ["The server took too long to respond", "Check the current server state before retrying any action that changes payroll data."],
};

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function sanitizeText(value: string) {
  return value
    .replace(/Bearer\s+[\w.-]+/gi, "Bearer [redacted]")
    .replace(/((?:account[_\s-]?number|password|token|secret|authorization|cookie)\s*[:=]\s*)[^,;\s]+/gi, "$1[redacted]")
    .replace(/\b\d{8,20}\b/g, "[redacted-number]")
    .slice(0, 1000);
}
function safeText(value: unknown, fallback = "Request failed.") { return typeof value === "string" && value.trim() ? sanitizeText(value) : fallback; }
function safeEnvelope(value: unknown): Partial<ApiEnvelope<unknown, unknown>> | undefined {
  if (!isRecord(value)) return undefined;
  const backendError = isRecord(value.error) && typeof value.error.code === "string" ? { code: value.error.code.slice(0, 100), details: sanitizeErrorDetails(value.error.details) } satisfies ApiErrorBody : undefined;
  return { message: typeof value.message === "string" ? sanitizeText(value.message) : "", error: backendError ?? null, data: null, meta: sanitizeDiagnostic(value.meta) };
}

function sanitizeErrorDetails(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.blocked)) return sanitizeDiagnostic(value);
  return {
    ...sanitizeDiagnostic(Object.fromEntries(Object.entries(value).filter(([key]) => key !== "blocked"))) as Record<string, unknown>,
    blocked: value.blocked.slice(0, 1000).filter(isRecord).map((item) => ({
      id: typeof item.id === "string" ? sanitizeText(item.id).slice(0, 100) : "",
      code: typeof item.code === "string" ? sanitizeText(item.code).slice(0, 100) : "",
      reason: typeof item.reason === "string" ? sanitizeText(item.reason).slice(0, 300) : "",
    })),
  };
}

export function sanitizeDiagnostic(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[truncated]";
  if (typeof value === "string") return sanitizeText(value).slice(0, 1200);
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeDiagnostic(item, depth + 1));
  if (!isRecord(value)) return String(value).slice(0, 200);
  const blocked = /token|password|secret|authorization|cookie|database|account_number/i;
  return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, item]) => [key, blocked.test(key) ? "[redacted]" : sanitizeDiagnostic(item, depth + 1)]));
}

export function normalizeApiError(error: FetchBaseQueryError, context: ErrorContext = {}): ApiClientError {
  const timestamp = new Date().toISOString();
  const method = context.method?.toUpperCase() ?? "GET";
  const endpoint = context.endpoint;
  const requestId = context.responseRequestId || context.requestId;
  const operation = context.operation ? OPERATION_COPY[context.operation] : undefined;
  if (typeof error.status === "number") {
    const envelope = safeEnvelope(error.data);
    const [baseTitle, baseExplanation] = statusCopy[error.status] ?? ["The request failed", "Review the technical details and try again only when it is safe."];
    const title = operation?.title ?? baseTitle;
    const explanation = operation?.explanation ?? baseExplanation;
    const backendMessage = safeText(envelope?.message, "");
    const isMutation = method !== "GET" && method !== "HEAD";
    return { status: error.status, code: envelope?.error?.code ?? `HTTP_${error.status}`, message: backendMessage || title, title, explanation, kind: "http", method, endpoint, requestId, timestamp, backendMessage: backendMessage || undefined, backendError: envelope?.error ?? undefined, meta: envelope?.meta, retryable: !isMutation && [404, 409, 429, 500, 502, 503, 504].includes(error.status), uncertainMutation: isMutation && [500, 502, 503, 504].includes(error.status) };
  }
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const timeout = error.status === "TIMEOUT_ERROR";
  const malformed = error.status === "PARSING_ERROR";
  const interrupted = error.status === "CUSTOM_ERROR" && "error" in error && /interrupt|abort/i.test(error.error);
  const isMutation = method !== "GET" && method !== "HEAD";
  const uncertain = isMutation && (timeout || interrupted || error.status === "FETCH_ERROR");
  // Uncertain outcome: use operation-specific copy when available; the generic
  // "financial action" wording is kept only for workflows that still rely on it.
  let title = offline ? "You appear to be offline" : timeout ? "The request timed out" : interrupted ? "The request was interrupted" : malformed ? "The server returned an unreadable response" : "The server could not be reached";
  let explanation = offline ? "Reconnect to the internet. Your current form values have been kept." : timeout ? "Check the current server state before retrying an action that changes data." : interrupted ? "Your current inputs have been kept. Check the latest server state before submitting this action again." : malformed ? "Do not retry a financial action automatically. Contact support with the technical details." : "Check the API service and network connection, then retry a safe read operation.";
  if (uncertain && operation?.uncertain) { title = operation.uncertain.title; explanation = operation.uncertain.explanation; }
  return { status: error.status, code: String(error.status), message: safeText("error" in error ? error.error : undefined, title), title, explanation, kind: offline ? "offline" : timeout ? "timeout" : malformed ? "malformed" : "network", method, endpoint, requestId, timestamp, retryable: !isMutation, uncertainMutation: uncertain };
}

export function toApiClientError(error: unknown, context: ErrorContext = {}): ApiClientError {
  if (isRecord(error) && typeof error.title === "string" && typeof error.timestamp === "string") return error as unknown as ApiClientError;
  if (isRecord(error) && "status" in error) return normalizeApiError(error as unknown as FetchBaseQueryError, context);
  const timestamp = new Date().toISOString(); const message = error instanceof Error ? safeText(error.message) : "An unexpected error occurred.";
  return { status: "CUSTOM_ERROR", code: "UNEXPECTED_ERROR", message, title: "Something unexpected happened", explanation: "Your current work has been kept. Try again or contact support with the technical details.", kind: "unknown", method: context.method, endpoint: context.endpoint, requestId: context.requestId, timestamp, retryable: false };
}

export function diagnosticSummary(error: ApiClientError) {
  return JSON.stringify(sanitizeDiagnostic({ timestamp: error.timestamp, method: error.method, endpoint: error.endpoint, status: error.status, code: error.code, request_id: error.requestId, backend_message: error.backendMessage, backend_error: error.backendError, meta: error.meta }), null, 2);
}
