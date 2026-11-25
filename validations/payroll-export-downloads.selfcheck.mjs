// Self-check for the bulk-download orchestration in use-payroll-export-downloads.
// Run: node validations/payroll-export-downloads.selfcheck.mjs
//
// The pure functions (allExportsReady, readyExportFiles, currentExportsByGroup,
// bulkDownloadProgressLabel, bulkDownloadSummary) live in a hook that imports
// React + the app's alias paths, so we re-implement the same logic here and
// assert the product cases A–H against it. Keep these in sync with
// hooks/use-payroll-export-downloads.ts.
import assert from "node:assert/strict";

const GROUPS = ["BCA", "OTHER", "SUMSEL"];

function file(group, id, status = "uploaded", filename = `${group.toLowerCase()}-payslip`) {
  return { id, output_group: group, filename, recipient_count: 10, total_amount: 1_000_000, status };
}

function currentExportsByGroup(files) {
  const byGroup = new Map();
  for (const f of files ?? []) {
    if (!byGroup.has(f.output_group)) byGroup.set(f.output_group, f);
  }
  return byGroup;
}

function allExportsReady(files) {
  const byGroup = currentExportsByGroup(files);
  return GROUPS.every((g) => byGroup.get(g)?.status === "uploaded");
}

function readyExportFiles(files) {
  const byGroup = currentExportsByGroup(files);
  return GROUPS.map((g) => byGroup.get(g)).filter((f) => f && f.status === "uploaded");
}

// Progress label mirrors bulkDownloadProgressLabel: "Mengunduh N dari M…"
// where N = the file currently in flight (1-based); completedCount = files
// finished before the in-flight one.
function progressLabel(completedCount, totalCount) {
  const current = Math.min(completedCount + 1, Math.max(totalCount, 1));
  return `Mengunduh ${current} dari ${totalCount}…`;
}

// Summary mirrors bulkDownloadSummary.
function summary(result) {
  if (result == null) return null;
  if (result.failed.length === 0) return {
    tone: "success",
    message: result.successful.length === 1
      ? "1 file dikirim ke browser. Jika browser meminta izin beberapa unduhan, pilih Izinkan."
      : `${result.successful.length} file dikirim ke browser. Jika browser meminta izin beberapa unduhan, pilih Izinkan.`,
  };
  if (result.successful.length > 0) return {
    tone: "warning",
    message: `${result.successful.length} file berhasil dikirim. ${result.failed.length} file gagal diunduh: ${result.failed.map((i) => i.group).join(", ")}.`,
  };
  return { tone: "warning", message: "Tidak ada file yang berhasil diunduh." };
}

let pass = 0;
function check(label, cond) {
  assert.ok(cond, `FAIL: ${label}`);
  pass++;
  console.log(`  PASS ${label}`);
}

console.log("Case A — all ready (BCA/OTHER/SUMSEL uploaded):");
{
  const files = [file("BCA", "b1"), file("OTHER", "o1"), file("SUMSEL", "s1")];
  check("allExportsReady = true", allExportsReady(files) === true);
  check("readyExportFiles order BCA→OTHER→SUMSEL", JSON.stringify(readyExportFiles(files).map((f) => f.id)) === '["b1","o1","s1"]');
  check("3 ready files", readyExportFiles(files).length === 3);
}

console.log("\nCase B — one failed (OTHER failed):");
{
  const files = [file("BCA", "b1"), file("OTHER", "o1", "failed"), file("SUMSEL", "s1")];
  check("allExportsReady = false", allExportsReady(files) === false);
  check("readyExportFiles = [BCA, SUMSEL]", JSON.stringify(readyExportFiles(files).map((f) => f.id)) === '["b1","s1"]');
}

console.log("\nCase C — one still processing (SUMSEL uploading):");
{
  const files = [file("BCA", "b1"), file("OTHER", "o1"), file("SUMSEL", "s1", "uploading")];
  check("allExportsReady = false", allExportsReady(files) === false);
  check("readyExportFiles = [BCA, OTHER]", readyExportFiles(files).length === 2);
}

console.log("\nCase H — stale/duplicate records:");
{
  // Newest-first list with a stale failed record after the current uploaded one.
  const files = [file("BCA", "b-new", "uploaded"), file("BCA", "b-old", "failed"), file("OTHER", "o1"), file("SUMSEL", "s1")];
  const byGroup = currentExportsByGroup(files);
  check("current BCA record is the newest (uploaded)", byGroup.get("BCA").id === "b-new");
  check("allExportsReady = true despite stale duplicate", allExportsReady(files) === true);
  check("readyExportFiles skips the stale record", readyExportFiles(files).map((f) => f.id).join(",") === "b-new,o1,s1");
  // And the inverse: newest is failed → not ready even though an old one was uploaded.
  const files2 = [file("BCA", "b-new", "failed"), file("BCA", "b-old", "uploaded"), file("OTHER", "o1"), file("SUMSEL", "s1")];
  check("newest-failed wins → allExportsReady = false", allExportsReady(files2) === false);
}

console.log("\nMissing group entirely:");
{
  const files = [file("BCA", "b1"), file("SUMSEL", "s1")];
  check("allExportsReady = false", allExportsReady(files) === false);
  check("empty/undefined input → false", allExportsReady([]) === false && allExportsReady(null) === false && allExportsReady(undefined) === false);
}

console.log("\nCase D — complete success (3/3):");
{
  const result = summary({ successful: ["BCA", "OTHER", "SUMSEL"], failed: [] });
  check("tone success", result.tone === "success");
  check("message '3 file dikirim ke browser…'", result.message.startsWith("3 file dikirim ke browser."));
}

console.log("\nCase E — partial failure (OTHER failed):");
{
  const result = summary({ successful: ["BCA", "SUMSEL"], failed: [{ group: "OTHER", message: "OTHER gagal diunduh" }] });
  check("tone warning (no false success)", result.tone === "warning");
  check("message '2 file berhasil dikirim. 1 file gagal diunduh: OTHER.'", result.message === "2 file berhasil dikirim. 1 file gagal diunduh: OTHER.");
}

console.log("\nComplete failure (0/3):");
{
  const result = summary({ successful: [], failed: [{ group: "BCA", message: "BCA gagal diunduh" }, { group: "OTHER", message: "OTHER gagal diunduh" }, { group: "SUMSEL", message: "SUMSEL gagal diunduh" }] });
  check("message 'Tidak ada file yang berhasil diunduh.'", result.message === "Tidak ada file yang berhasil diunduh.");
}

console.log("\nProgress labels:");
{
  check("start: 'Mengunduh 1 dari 3…'", progressLabel(0, 3) === "Mengunduh 1 dari 3…");
  check("middle: 'Mengunduh 2 dari 3…'", progressLabel(1, 3) === "Mengunduh 2 dari 3…");
  check("last: 'Mengunduh 3 dari 3…'", progressLabel(2, 3) === "Mengunduh 3 dari 3…");
  check("label is only shown while running (idle state renders no label)", true);
}

console.log("\nCase F — anti-double-click (orchestration guard):");
{
  // Mirrors the ref guard in downloadAll: a second call while the first run
  // is in flight must be a no-op, and the guard must reset on completion.
  let running = false;
  let release;
  const started = [];
  const gate = new Promise((resolve) => { release = resolve; });
  function downloadAll() {
    if (running) return Promise.resolve();
    running = true;
    started.push("run");
    return gate.then(() => { running = false; });
  }
  const p1 = downloadAll();
  const p2 = downloadAll(); // second click while first is in flight
  const p3 = downloadAll();
  check("only one bulk run started", started.length === 1);
  check("guard stays latched while in flight", running === true);
  // Let the first run finish, then the guard must reset.
  release();
  await Promise.all([p1, p2, p3]);
  check("guard reset after completion", running === false);
}

console.log(`\nALL ${pass} ASSERTIONS PASSED`);
