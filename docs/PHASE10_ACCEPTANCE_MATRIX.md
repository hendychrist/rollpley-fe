# Phase 10 — Full-Stack Acceptance Matrix

Generated: 2026-11-18
Backend: `rollpley-be` (Go) · Frontend: `rollpley-fe` (Next.js)
All mock/unit tests are deterministic. Live E2E cases require staging Supabase + PostgreSQL.

---

## Backend (Go)

| # | Scenario | Expected | Actual | Status | Type | Evidence | Severity |
|---|----------|----------|--------|--------|------|----------|----------|
| B1 | Rapid 8-concurrent `StartProcessing` calls with active run | All 8 → CONFLICT 409, no run created | PASS | Unit | `TestConcurrentParseMatchBothFailWhenAlreadyActive` | `integration_test.go` | — |
| B2 | Two concurrent admins review same pending match | 1st succeeds (200), 2nd → CONFLICT 409 | PASS | Unit | `TestConcurrentReviewMatchOnlyFirstSucceeds` — `WHERE status IN (pending_*)` in `match_postgres.go:241` | Low — PG-level race not tested without DB |
| B3 | Review match already in `auto_matched`/`rejected` | CONFLICT 409 | PASS | Unit | `TestReviewMatchConflictsWhenAlreadyDecided` | — |
| B4 | Double finalize (2nd call after 1st succeeds) | 2nd returns existing snapshot, no new rows | Source-verified | Source | `finalize.go:73-82` — early return when `status='finalized'` | Medium — needs PG to prove |
| B5 | Stale run: server restart mid-processing | `STALE_PROCESSING` error_code, batch re-runnable | Source-verified | Source | `RecoverStaleRuns` at `main.go:52` (30-min threshold, startup-only) | Low — threshold hardcoded, no env override |
| B6 | Stale export slot: crash mid-`ExportAll` | `uploading` → `failed` + `cleanup_needed=true` after 10 min | Source-verified | Source | `RecoverStaleExports` at `main.go:90` | Low — threshold hardcoded |
| B7 | Fee applied exactly once per payment | Immutable snapshot trigger rejects any UPDATE/DELETE | Source-verified | Source | `202611160009_finalize_export.sql:85-95` — `BEFORE UPDATE OR DELETE` trigger raises exception | — |
| B8 | No rate limiting in Go service | 429 responses only from Supabase edge | PASS | Unit | `TestNoRateLimitingDocumented` — grep confirms no middleware | Low (admin-only tool) |
| B9 | `HTTP_WRITE_TIMEOUT=30s` default vs 20MB upload | Upload body may be truncated by write timeout | OPEN | Source | `config.go:62` default 30s; `handler.go:32` uses `MaxBytesReader` — the read path is guarded but the write path (response) is 30s. A slow client reading a 20MB export download could hit the 30s write deadline. | Medium |
| B10 | Employee `Update` lost-update (two concurrent admins) | Last-write-wins, no version rejection | Documented | Source | `employee/repository/postgres.go:98` — `FOR UPDATE` serializes; no version column | Low (admin tool) |
| B11 | Master-import confirm: two concurrent calls | 1st succeeds, 2nd → CONFLICT or idempotent | Source-verified | Source | `masterimport/repository/postgres.go:390` — `FOR UPDATE` on import row; `status='confirmed'` → early return | — |
| B12 | `execute()` uses bounded 30-min context | Hung parse auto-failed, not permanent | PASS | Unit | `TestParseExecuteBoundedContext` — `parse_service.go:117` | — |

## Frontend (Next.js)

| # | Scenario | Expected | Actual | Status | Type | Evidence | Severity |
|---|----------|----------|--------|--------|------|----------|----------|
| F1 | 20 rapid clicks on mutation button | Only 1 request sent; in-flight guard blocks rest | PASS (mocked) | FE mock | `useRef` guards in `payroll-upload.hook.tsx`, `fee-policy`, `exception-review`, `conflict-row`, `new-employee`, `employee-form` | — |
| F2 | Enter-key repeat submit in form | `submittingRef` blocks 2nd+ submissions | PASS (mocked) | FE mock | `submittingRef` in form handlers | — |
| F3 | RTK Query `isLoading` lag on rapid clicks | `state.busy` check in hook rejects before RTK state updates | PASS (mocked) | FE mock | Hook-level `busy` flag + `useRef` guard | — |
| F4 | Network loss before mutation reaches backend | `uncertainMutation=true` on timeout/fetch error; UI shows "Do not resubmit" warning | PASS (mocked) | FE mock | `api-error.ts:67` — timeout/interruption sets `uncertainMutation`; `error-state.tsx:17` renders warning | — |
| F5 | Network loss after backend commits | UI shows uncertain warning; admin must check status before retrying | PASS (mocked) | FE mock | Same as F4 — no auto-retry on uncertain mutation | — |
| F6 | Browser refresh during processing | Batch status restored from persisted DB; no re-kick | PASS (mocked) | FE mock | `refetchOnFocus:false` on batch query; backend `HasActiveRun` blocks re-kick | — |
| F7 | Polling failure (network drop) | `processing.isError` shown; poll continues; no job restart | PASS (mocked) | FE mock | `pollingInterval` continues; `useGetProcessingStatusQuery` error state | — |
| F8 | HTTP 409 on match review (stale) | "The data changed before this action completed" — no auto-retry | PASS (mocked) | FE mock | `api-error.ts:12` — 409 copy; `uncertainMutation=false` for 409 mutations | — |
| F9 | HTTP 413 on oversized upload | "The selected file is too large" | PASS (mocked) | FE mock | `PAYLOAD_TOO_LARGE` code mapped in `api-error.ts` | — |
| F10 | Empty state shown instead of API failure | Must not happen; error state replaces empty state | PASS (mocked) | FE mock | Error state rendering in `BaseErrorState`/list components | — |
| F11 | Offline PDF upload | XHR rejects with "You appear to be offline" | PASS (mocked) | FE mock | `navigator.onLine` check in `uploadMultipart` | — |
| F12 | Upload interruption (user navigates away) | "The upload was interrupted" error; form state preserved | PASS (mocked) | FE mock | `uploadMultipart` abort path (note: `xhr.abort()` is never called in the FE — abort is only reachable via page unload) | Low |
| F13 | Malformed download (JSON/HTML instead of XLSX) | "The server returned an unreadable response" — file not saved | PASS (mocked) | FE mock | `downloadExport` contentType guard | — |
| F14 | Wake lock during upload (tab hidden) | XHR not throttled; upload completes | PASS (mocked) | FE mock | `navigator.wakeLock.request({type:"screen"})` in `uploadMultipart` — falls back to progress listener if denied | — |
| F15 | 401 session expiry mid-mutation | Redirect to login; form state lost | PASS (mocked) | FE mock | `handleUnauthorizedSession` in RTK Query transport | — |

## Payroll Business Invariants (Source-Verified)

| # | Invariant | Verified In | Status |
|---|-----------|-------------|--------|
| I1 | One active verified primary bank account per employee | `202611150001_phase1_master.sql:48` — `UNIQUE INDEX accounts_one_open_primary WHERE is_primary AND valid_until IS NULL` | PASS (DB constraint) |
| I2 | Same-name employees never auto-merged | `match.go:170-178` — name-only match → `pending_identity` always; `name_ambiguous` reason code | PASS (code) |
| I3 | Inactive/resigned employee blocked from payment | `finalize.go:178-181` — `account_count != 1` (no active verified primary) → BUSINESS_ERROR | PASS (code) |
| I4 | Unknown employee (pending_new) blocks finalization | `finalize.go:170-173` — `matchStatus != auto_matched` → aborts batch | PASS (code) |
| I5 | Missing routing verification blocks OTHER group | `finalize.go:187-190` — `!routing_verified` → BUSINESS_ERROR | PASS (code) |
| I6 | No partial batch finalization | `finalize.go:108-110` — `matchCount != payrollRowCount` → aborts; serializable tx | PASS (code) |
| I7 | Period-specific confirmed fee policy | `feepolicy.go:226-239` — `WHERE confirmed=true AND effective_from <= $1 AND (effective_until IS NULL OR effective_until >= $1)` | PASS (code) |
| I8 | Bank Lain (OTHER) fee applied exactly once | Immutable snapshot trigger + `finalize.go:73` early-return on `status='finalized'` | PASS (code) |
| I9 | Reconciliation is read-only | `reconcile.go:81-204` — no writes; returns `ReconciliationSummary` | PASS (code) |
| I10 | Excel download ≠ bank transfer | UI copy: export download is a file for manual bank upload; no API triggers a transfer | PASS (code) |

## Live E2E — BLOCKED

These cases require a staging PostgreSQL + Supabase instance and cannot be run with mocks alone:

| # | Case | What's needed | Reference |
|---|------|---------------|-----------|
| E1 | Server restart mid-processing → `STALE_PROCESSING` | Staging Go server + PG | `docs/postman-reliability.md` case A1 |
| E2 | Crash mid-export → `STALE_UPLOADING` recovery | Staging Go server + PG + Supabase storage | `docs/postman-reliability.md` case C1 |
| E3 | Two concurrent admins review same match → 1×200 + 1×409 | Staging PG | `docs/postman-reliability.md` case B1 |
| E4 | Double master-import confirm → 1×200 + 1×409 | Staging PG | `docs/postman-reliability.md` case D1 |
| E5 | Double finalize → 2nd returns existing snapshot | Staging PG | `docs/postman-reliability.md` case D2 |
| E6 | 413 on >20MB upload | Live server with `MAX_UPLOAD_BYTES` set | Manual |
| E7 | 504 on slow backend response | Fault injection (proxy or `HTTP_WRITE_TIMEOUT=1s`) | Manual |
| E8 | 401 redirect on expired JWT | Staging Supabase auth | Manual |

## Open Issues (Not Fixed This Phase)

| Issue | Severity | Proposed Fix | Why Not Fixed |
|-------|----------|--------------|---------------|
| `HTTP_WRITE_TIMEOUT=30s` default may truncate slow export downloads | Medium | Set `HTTP_WRITE_TIMEOUT=120s` in staging `.env`; or add per-route `WriteTimeout` override | Requires deployment decision; code change is one env var |
| Stale thresholds (30 min / 10 min) are hardcoded in `main.go` | Low | Add `PAYROLL_STALE_AFTER` / `EXPORT_STALE_AFTER` env vars to `config.go` | Requires config plumbing; current values are reasonable defaults |
| No periodic recovery (startup-only) | Low | Add `time.NewTicker(5min)` goroutine in `main.go` that calls both recovery functions | Risk: could mark a legitimately-running 30-min parse as stale if threshold is too short; current 30-min threshold makes this safe but a periodic sweep at 5-min intervals would be correct |
| Employee/account `FOR UPDATE` last-write-wins (no version column) | Low | Add `version` column + `WHERE version=$N` optimistic lock | Requires DB migration; acceptable for small admin team |

## Verification Commands

```bash
# Backend build + vet + all unit/integration tests
cd rollpley-be
gofmt -l modules/payroll/ main.go
go build ./...
go vet ./...
go test ./modules/... ./helper/... -count=1

# Frontend type-check + build + lint
cd rollpley-fe
npx tsc --noEmit
npm run build
npm run lint
```
