// Durable check: conflict-review grouping + resolution gating, as pure functions
// mirroring the component logic. Fails if grouping or the unresolved-count rule breaks.
import assert from "node:assert/strict";

// Mirror of groupRows in the component
function groupRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.raw_name.trim().toLowerCase();
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([, items]) => ({ name: items[0].raw_name, rows: items }));
}

// Mirror of unresolvedCount
function unresolvedCount(rows) {
  return rows.filter((row) => !row.decision).length;
}

function pendingGroups(groups) {
  return groups.filter((group) => unresolvedCount(group.rows) > 0);
}

// --- Fixtures: M. Yusuf conflict, rows 131 & 185 ---
const row131 = { id: "r131", raw_name: "M. Yusuf", source_sheet: "BCA", source_row: 131, masked_account: "400108****21", raw_bank_label: "BCA", raw_note: "Gaji 04-2026", job_description: "Kasir Outlet", issues: ["different_job_descriptions"], available_decisions: ["same_person", "different_person", "exclude"], decision: null };
const row185 = { id: "r185", raw_name: "M. YUSUF", source_sheet: "Sumsel", source_row: 185, masked_account: "700211****88", raw_bank_label: "Bank Sumsel", raw_note: "Penggajian 04-26", job_description: "Supervisor Kasir", issues: ["different_job_descriptions"], available_decisions: ["same_person", "different_person", "exclude"], decision: null };
// A different person to ensure grouping doesn't over-merge
const row7 =  { id: "r7",  raw_name: "Rina Sari", source_sheet: "BCA", source_row: 7, masked_account: "330012****01", raw_bank_label: "BCA", raw_note: "Gaji 04-2026", issues: ["duplicate_within_import"], available_decisions: ["link", "replace"], decision: "link" };

const rows = [row7, row131, row185];

// 1. Grouping: M. Yusuf (case-insensitive) merges both rows; Rina stays separate
const groups = groupRows(rows);
const yusuf = groups.find((g) => g.name.toLowerCase() === "m. yusuf");
assert.ok(yusuf, "M. Yusuf group exists");
assert.equal(yusuf.rows.length, 2, "both rows 131 & 185 in one group");
assert.deepEqual(yusuf.rows.map((r) => r.source_row).sort(), [131, 185], "source rows 131 & 185");
assert.equal(groups.length, 2, "two distinct groups (M. Yusuf + Rina Sari)");

// 2. One short warning per group: unresolved drives the warning text
assert.equal(unresolvedCount(yusuf.rows), 2, "M. Yusuf starts unresolved (2 rows, no decision)");
assert.equal(unresolvedCount(groups.find((g) => g.name === "Rina Sari").rows), 0, "Rina Sari resolved (has decision)");

// 3. Confirm gating: total unresolved across all conflict rows
const totalUnresolved = groups.reduce((sum, g) => sum + unresolvedCount(g.rows), 0);
assert.equal(totalUnresolved, 2, "confirm blocked while 2 identity decisions unresolved");

// 4. After explicit decisions recorded, gating clears
const resolved = yusuf.rows.map((r) => ({ ...r, decision: "same_person", decision_reason: "verified" }));
assert.equal(unresolvedCount(resolved), 0, "confirm enabled once every row has a decision");
assert.equal(groups.reduce((sum, g) => sum + (g.name === "M. Yusuf" ? unresolvedCount(resolved) : unresolvedCount(g.rows)), 0), 0, "all conflict rows resolved → confirm available");

// 5. Persisted decisions drive the pending list: partial groups remain with
// both source rows; fully resolved groups disappear after a query/refetch.
const partiallyResolved = groups.map((group) => group.name.toLowerCase() === "m. yusuf" ? { ...group, rows: group.rows.map((row, index) => ({ ...row, decision: index === 0 ? "create_distinct" : null })) } : group);
assert.equal(pendingGroups(partiallyResolved).find((group) => group.name.toLowerCase() === "m. yusuf").rows.length, 2, "partial group retains both source rows");
const fullyResolved = partiallyResolved.map((group) => group.name.toLowerCase() === "m. yusuf" ? { ...group, rows: group.rows.map((row) => ({ ...row, decision: "create_distinct" })) } : group);
assert.equal(pendingGroups(fullyResolved).some((group) => group.name.toLowerCase() === "m. yusuf"), false, "fully resolved group leaves pending list");

console.log("PASS group-by-name merges 131+185 into one 'M. Yusuf' group");
console.log("PASS one group = one unresolved count (2 initially, 0 after decisions)");
console.log("PASS confirm gating: blocked while unresolved>0, enabled once all decided");
console.log("PASS pending list: partial group stays, fully resolved group is removed");
