import type { PaymentAccount } from "@/type/employee";

export interface ApiErrorBody {
  code: string;
  details?: unknown;
}

export interface ApiEnvelope<T, M = null> {
  message: string;
  data: T;
  error: ApiErrorBody | null;
  meta: M;
}

export interface ApiClientError {
  status: number | "FETCH_ERROR" | "PARSING_ERROR" | "CUSTOM_ERROR" | "TIMEOUT_ERROR";
  code: string;
  message: string;
  title: string;
  explanation: string;
  kind: "http" | "network" | "offline" | "timeout" | "malformed" | "unknown";
  method?: string;
  endpoint?: string;
  requestId?: string;
  timestamp: string;
  backendMessage?: string;
  backendError?: ApiErrorBody;
  meta?: unknown;
  retryable: boolean;
  uncertainMutation?: boolean;
}

export interface PageMeta {
  page: number;
  total: number;
}

export interface StandardPageMeta extends PageMeta {
  page_size: number;
}

export interface EmployeePageMeta extends PageMeta {
  limit: number;
  /** Masked payment accounts keyed by employee id; employees without any are omitted. */
  accounts?: Record<string, PaymentAccount[]>;
}
