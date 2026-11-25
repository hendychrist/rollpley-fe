"use client";
import { AlertCircle, Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/base/button";
import { StateIllustration } from "@/components/base/state-illustration";
import type { ApiClientError } from "@/type/api";
import { diagnosticSummary, toApiClientError } from "@/utils/api-error";

export function BaseTechnicalDetails({ error }: { error: ApiClientError }) {
  const [copied, setCopied] = useState(false); const summary = diagnosticSummary(error);
  async function copy() { await navigator.clipboard.writeText(summary); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
  return <details className="technical-details"><summary>Technical details</summary><dl><div><dt>Method</dt><dd>{error.method ?? "Not available"}</dd></div><div><dt>Endpoint</dt><dd>{error.endpoint ?? "Not available"}</dd></div><div><dt>Status</dt><dd>{String(error.status)}</dd></div><div><dt>Code</dt><dd>{error.code}</dd></div><div><dt>Request ID</dt><dd>{error.requestId ?? "Not provided"}</dd></div><div><dt>Timestamp</dt><dd>{error.timestamp}</dd></div>{error.backendMessage ? <div><dt>Backend message</dt><dd>{error.backendMessage}</dd></div> : null}</dl><pre>{summary}</pre><Button type="button" variant="secondary" onClick={() => void copy()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy diagnostic summary"}</Button></details>;
}

export function BaseErrorState({ error: input, onRetry, compact = false }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const error = toApiClientError(input);
  return <section className={`base-error ${compact ? "base-error--compact" : ""}`} role="alert" aria-live="assertive">{compact ? <AlertCircle aria-hidden size={20} /> : <StateIllustration variant={error.status === 403 ? "access" : "server"} />}<div className="base-error__content"><h3>{error.title}</h3><p>{error.explanation}</p>{typeof error.status === "number" ? <span className="base-error__status">HTTP {error.status}</span> : null}{error.uncertainMutation ? <p className="base-error__warning">Do not submit this action again until the latest server state has been checked.</p> : null}{onRetry && error.retryable ? <Button type="button" variant="secondary" onClick={onRetry}>Try again</Button> : null}<BaseTechnicalDetails error={error} /></div></section>;
}

export function BaseInlineError({ error }: { error: unknown }) { return <BaseErrorState error={error} compact />; }
