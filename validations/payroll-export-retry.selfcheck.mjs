// Self-check: export retry refresh lifecycle
// Mirrors the gate logic in hooks/use-payroll-detail.ts to verify:
//   - retry arms the poller
//   - stale pre-retry terminal cache does NOT stop polling
//   - fresh terminal refetch disarms polling
//   - mutation error disarms polling
//   - no permanent OR with stale mutation result

// ── Simulated gate state ──────────────────────────────────────────────────────
// Mirrors the exact expressions from use-payroll-detail.ts.
//
//   hasActiveInCache = cache.some(f => f.status === "uploading" || f.status === "pending")
//   hasFreshRefetch  = retryGate !== null && fulfilledTs !== undefined && fulfilledTs > retryGate.startedAt
//   hasActiveExportRow = hasActiveInCache || (retryGate !== null && !hasFreshRefetch)
//   disarm condition   = retryGate && hasFreshRefetch && !hasActiveInCache

function evaluate({ cache, retryGate, fulfilledTs }) {
  const hasActiveInCache = (cache ?? []).some((f) => f.status === "uploading" || f.status === "pending");
  const hasFreshRefetch =
    retryGate !== null &&
    fulfilledTs !== undefined &&
    fulfilledTs > retryGate.startedAt;
  const hasActiveExportRow =
    hasActiveInCache ||
    (retryGate !== null && !hasFreshRefetch);
  const wouldDisarm = retryGate !== null && hasFreshRefetch && !hasActiveInCache;
  return { hasActiveInCache, hasFreshRefetch, hasActiveExportRow, wouldDisarm };
}

// ── Test helpers ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
function check(label, cond) {
  if (cond) {
    passed++;
    console.log(` PASS ${label}`);
  } else {
    failed++;
    console.log(` FAIL ${label}`);
  }
}

// ── Case 1: confirmed production bug ─────────────────────────────────────────
// Pre-retry: BCA=failed, OTHER=uploaded, SUMSEL=uploaded → terminal cache.
// User clicks retry → gate armed, fulfilledTs still old (pre-retry).
// → hasActiveExportRow must be TRUE (poller stays alive).
console.log("\nCase 1 — stale terminal cache does not stop poller after retry arm:");
{
  const retryGate = { startedAt: 2000 };
  // fulfilledTs = 1000 (pre-retry refetch, before retryGate.startedAt=2000)
  const r = evaluate({
    cache: [
      { output_group: "BCA", status: "failed" },
      { output_group: "OTHER", status: "uploaded" },
      { output_group: "SUMSEL", status: "uploaded" },
    ],
    retryGate,
    fulfilledTs: 1000, // old refetch timestamp
  });
  check("poller stays armed (gate active, no fresh refetch yet)", r.hasActiveExportRow === true);
  check("not yet a fresh refetch", r.hasFreshRefetch === false);
  check("cache has no active rows (all terminal)", r.hasActiveInCache === false);
  check("disarm not triggered yet", r.wouldDisarm === false);
}

// ── Case 2: retry returns pending → polling continues ───────────────────────
console.log("\nCase 2 — mutation returns pending, poller stays alive:");
{
  const retryGate = { startedAt: 2000 };
  // After upsertQueryData, cache now has BCA=pending
  const r = evaluate({
    cache: [
      { output_group: "BCA", status: "pending" },
      { output_group: "OTHER", status: "uploaded" },
      { output_group: "SUMSEL", status: "uploaded" },
    ],
    retryGate,
    fulfilledTs: 1000, // still old; the upsert doesn't update fulfilledTs
  });
  check("cache has active row (pending)", r.hasActiveInCache === true);
  check("poller stays armed", r.hasActiveExportRow === true);
}

// ── Case 3: retry returns failed again → poller stays armed until fresh refetch ──
console.log("\nCase 3 — retry fails again, poller stays armed until fresh refetch:");
{
  const retryGate = { startedAt: 2000 };
  const r = evaluate({
    cache: [
      { output_group: "BCA", status: "failed" },
      { output_group: "OTHER", status: "uploaded" },
      { output_group: "SUMSEL", status: "uploaded" },
    ],
    retryGate,
    fulfilledTs: 1000,
  });
  check("poller stays armed (gate active, stale refetch)", r.hasActiveExportRow === true);

  // Now the tag-invalidation refetch lands with fresh terminal data:
  const r2 = evaluate({
    cache: [
      { output_group: "BCA", status: "failed" },
      { output_group: "OTHER", status: "uploaded" },
      { output_group: "SUMSEL", status: "uploaded" },
    ],
    retryGate,
    fulfilledTs: 3000, // fresh refetch after retryGate.startedAt=2000
  });
  check("fresh refetch detected", r2.hasFreshRefetch === true);
  check("cache all terminal", r2.hasActiveInCache === false);
  check("poller disarms (all conditions met)", r2.wouldDisarm === true);
  check("after disarm, poller is off", r2.hasActiveExportRow === false);
}

// ── Case 4: all uploaded → no unnecessary polling ───────────────────────────
console.log("\nCase 4 — all uploaded, no gate, no polling:");
{
  const r = evaluate({
    cache: [
      { output_group: "BCA", status: "uploaded" },
      { output_group: "OTHER", status: "uploaded" },
      { output_group: "SUMSEL", status: "uploaded" },
    ],
    retryGate: null,
    fulfilledTs: 1000,
  });
  check("no active rows", r.hasActiveInCache === false);
  check("no gate armed", r.hasActiveExportRow === false);
}

// ── Case 5: generate mutation HTTP error → gate disarmed ────────────────────
console.log("\nCase 5 — mutation error disarms retry gate:");
{
  // After a failed mutation, handleGenerate sets exportRetryRef.current = null
  const r = evaluate({
    cache: [
      { output_group: "BCA", status: "failed" },
      { output_group: "OTHER", status: "uploaded" },
      { output_group: "SUMSEL", status: "uploaded" },
    ],
    retryGate: null, // disarmed on error
    fulfilledTs: 1000,
  });
  check("no active rows in cache", r.hasActiveInCache === false);
  check("gate disarmed → poller off", r.hasActiveExportRow === false);
}

// ── Case 6: no permanent OR with stale mutation result ───────────────────────
console.log("\nCase 6 — no permanent OR: stale mutation result does not keep poller alive after fresh terminal refetch:");
{
  // Scenario: mutation returned pending (gate armed at t=2000),
  // but server already transitioned to uploaded before the refetch.
  // Fresh refetch at t=3000 confirms all uploaded.
  const r = evaluate({
    cache: [
      { output_group: "BCA", status: "uploaded" },
      { output_group: "OTHER", status: "uploaded" },
      { output_group: "SUMSEL", status: "uploaded" },
    ],
    retryGate: { startedAt: 2000 },
    fulfilledTs: 3000,
  });
  check("fresh refetch confirms all terminal", r.hasFreshRefetch === true);
  check("no active rows", r.hasActiveInCache === false);
  check("disarm triggered → poller stops", r.wouldDisarm === true);
  check("no infinite polling", r.hasActiveExportRow === false);
}

// ── Case 7: double-click guard ───────────────────────────────────────────────
console.log("\nCase 7 — double-click: guard prevents duplicate mutation:");
{
  // Simulates the guard in batch-detail.tsx:
  //   if (state.busy) return Promise.reject(...)
  //   state.busy includes generateState.isLoading
  // The RTK Query mutation deduplicates concurrent calls with the same args.
  let busy = false;
  let calls = 0;
  function generateExports() {
    if (busy) return Promise.reject(new Error("Another payroll action is already in progress."));
    busy = true;
    calls++;
    return new Promise((resolve) => {
      setTimeout(() => {
        busy = false;
        resolve("ok");
      }, 0);
    });
  }
  const p1 = generateExports();
  const p2 = generateExports(); // second click while first is in flight
  p2.catch(() => {}); // swallow expected rejection
  const ok1 = await p1;
  check("first call succeeded", ok1 === "ok");
  check("exactly one mutation executed (double-click guard)", calls === 1);
}

// ── Case 8: partial processing — only BCA retries, OTHER/SUMSEL stay uploaded ──
console.log("\nCase 8 — partial retry: OTHER/SUMSEL remain uploaded:");
{
  // After upsertQueryData with mutation response:
  // BCA=pending, OTHER=uploaded, SUMSEL=uploaded
  const r = evaluate({
    cache: [
      { output_group: "BCA", status: "pending" },
      { output_group: "OTHER", status: "uploaded" },
      { output_group: "SUMSEL", status: "uploaded" },
    ],
    retryGate: { startedAt: 2000 },
    fulfilledTs: 1000,
  });
  check("BCA pending → poller active", r.hasActiveInCache === true);
  check("poller stays armed", r.hasActiveExportRow === true);

  // Later: BCA=uploaded, all terminal, fresh refetch landed:
  const r2 = evaluate({
    cache: [
      { output_group: "BCA", status: "uploaded" },
      { output_group: "OTHER", status: "uploaded" },
      { output_group: "SUMSEL", status: "uploaded" },
    ],
    retryGate: { startedAt: 2000 },
    fulfilledTs: 5000,
  });
  check("all terminal + fresh refetch → disarms", r2.wouldDisarm === true);
  check("poller stops", r2.hasActiveExportRow === false);
}

console.log(`\n${passed}/${passed + failed} assertions passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed > 0 ? 1 : 0);
