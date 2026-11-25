# Error-state test matrix

This matrix separates source-level verification from tests that require an authenticated API and an authorized synthetic dataset. `BaseErrorState` always exposes a sanitized diagnostic with the available method, endpoint, status, code, request ID, timestamp, backend message/error, and meta. Financial mutations are not automatically retried.

| Trigger or mocked response | Expected visible title and action | Preserve state | Retry | Result |
|---|---|---:|---:|---|
| HTTP 400 | “The request could not be processed”; correct inputs | Yes | No | PASS — centralized mapping and upload validation inspected |
| HTTP 401 | “Your session has expired”; sign in again | Yes where mounted | No; guarded redirect | PASS — transport and direct upload/download paths inspected; live auth BLOCKED |
| HTTP 402 | “The server rejected this request”; contact administrator; explicitly no frontend billing flow | Yes | No | PASS — fallback mapping only; backend does not currently document 402 |
| HTTP 403 | “You do not have permission”; contact administrator without logout | Yes | No | PASS — mapping/transport inspected; live role test BLOCKED |
| HTTP 404 | “The requested data was not found”; refresh latest state | Yes | Safe read only | PASS — mapping inspected; live test BLOCKED |
| HTTP 409 | “The data changed before this action completed”; refresh before another decision | Yes | Safe read only | PASS — mapping inspected; concurrent-admin E2E BLOCKED |
| HTTP 413 | “The selected file is too large”; select a smaller file | Selected file remains visible | No | PASS — client and server mapping paths inspected |
| HTTP 415 | “The file type is not supported”; select supported format | Selected file remains visible | No | PASS — client and server mapping paths inspected |
| HTTP 422 / reconciliation blocker | “A business rule blocks this action”; correct related data; exact backend blockers remain visible | Yes | No | PASS — mapping and reconciliation rendering inspected; live blocker E2E BLOCKED |
| HTTP 429 | “Too many requests were sent”; wait | Yes | Safe read only | PASS — mapping inspected; live throttling test BLOCKED |
| HTTP 500 / 502 / 503 | Server/service unavailable; keep inputs and retry later | Yes | Safe read only | PASS — mapping inspected; live fault injection BLOCKED |
| HTTP 504 / RTK timeout | Server/request timed out; check server state before mutation retry | Yes | Safe read only | PASS — 60-second transport timeout and uncertain-mutation guard inspected |
| Offline / fetch failure / connection refused | Offline or server unreachable; reconnect/check API | Yes | Safe read only | PASS — browser and transport paths inspected; browser manual test BLOCKED |
| Malformed or non-JSON response | “The server returned an unreadable response”; contact support | Yes | No for mutations | PASS — RTK, upload, and download guards inspected |
| Invalid PDF / missing period / missing unit | Correct the specific input; no request sent | File and form fields | No | PASS — validation paths inspected |
| Upload progress / interruption | Real loaded/total bytes; interrupted upload warning | File and fields | Manual resubmit | PASS — XHR progress/abort/timeout paths inspected; real upload BLOCKED |
| Processing polling failure | Request error is distinct from processing state | Batch remains loaded | Safe polling read | PASS — rendering inspected; live polling fault BLOCKED |
| Backend processing status `failed` | “Payroll processing failed”; inspect actual backend code | Batch remains loaded | Manual after review | PASS — status rendering inspected; live processing BLOCKED |
| Candidate/evidence query failure | Error state, never “no candidates/accounts/aliases” | Review inputs | Safe read only | PASS — query branches inspected; live review E2E BLOCKED |
| Finalization timeout or 5xx | Uncertain mutation warning; inspect latest batch before resubmitting | Entire batch | No blind retry | PASS — transport policy inspected; live finalization BLOCKED |
| Export unavailable | True empty state with create-export action/context | Batch | N/A | PASS — empty-state branch inspected |
| Export generation failure | Typed inline error with diagnostic | Batch | No blind retry | PASS — mutation path inspected; live export BLOCKED |
| Download returns JSON/HTML | Unreadable-response error; never save as workbook | Batch | Safe read after review | PASS — content-type guard inspected; live download BLOCKED |
| Keyboard navigation / screen reader | Native controls; alert/status live regions; collapsible details | N/A | N/A | BLOCKED — requires manual browser + assistive-technology pass |
| Mobile responsiveness | Error details and layouts remain readable at narrow widths | N/A | N/A | BLOCKED — CSS source inspected; manual device/browser pass required |

## Manual fault-injection rule

Use a local proxy, browser request override, or non-production API instance. Never add production-visible demo buttons and never run these cases against real payroll or the 414-row master import.
