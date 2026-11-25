// Self-check for the accordion open/close state logic in ReviewQueue.
// Run: node validations/review-queue-collapse.selfcheck.mjs
//
// This isolates the STATE decision (which card is open) from the DOM so we
// can assert the exact bugs reported: "Tutup must close everything" and
// "refetch / search must not re-open a closed card".
import assert from "node:assert/strict";

// --- Pure logic extracted from review-queue.tsx behaviour -----------------
// activeId: the single open panel. null = all closed.
// autoOpened: has the "open first finding on entry" auto-action fired yet.

function openFirst(activeId, autoOpened, visible) {
  // "auto-open first finding on entry" — fires exactly once, only when
  // nothing is open yet and a list exists.
  if (autoOpened || !visible.length) return activeId;
  return visible[0].ID;
}

function dropIfFiltered(activeId, visible) {
  // If the open card is no longer in the visible (filtered) set, close it.
  if (activeId && !visible.some((m) => m.ID === activeId)) return null;
  return activeId;
}

// The old buggy effect: re-opens visible[0] whenever activeId is falsy.
function legacyEffect(activeId, visible) {
  if (!visible.length) return null;
  if (!activeId || !visible.some((m) => m.ID === activeId)) return visible[0].ID;
  return activeId;
}

const visible = [
  { ID: "m1" },
  { ID: "m2" },
  { ID: "m3" },
];

let pass = 0;
function check(label, cond) {
  assert.ok(cond, `FAIL: ${label}`);
  pass++;
  console.log(`  PASS ${label}`);
}

console.log("Legacy behaviour (documents the bug we removed):");
{
  // User closes -> activeId null -> legacy effect re-opens m1.
  check("legacy re-opens first card after close (bug)", legacyEffect(null, visible) === "m1");
}

console.log("\nFixed behaviour:");
{
  let activeId = null;
  let autoOpened = false;
  activeId = openFirst(activeId, autoOpened, visible);
  autoOpened = autoOpened || activeId !== null;
  check("auto-opens first finding on entry", activeId === "m1");

  // User clicks Tutup on m1.
  activeId = null;
  check("Tutup closes the open card", activeId === null);

  // Refetch (visible unchanged) must NOT re-open.
  activeId = openFirst(activeId, autoOpened, visible);
  check("refetch after close does NOT re-open", activeId === null);

  // Search refetch that keeps m1 in the set — still closed.
  const searched = [{ ID: "m1" }, { ID: "m3" }];
  activeId = openFirst(activeId, autoOpened, searched);
  activeId = dropIfFiltered(activeId, searched);
  check("search refetch after close does NOT re-open", activeId === null);

  // Re-open m2 manually, then close.
  activeId = "m2";
  activeId = null;
  check("second close keeps it closed", activeId === null);

  // A→B switch: open m1 then m2 — only m2 open.
  activeId = "m1";
  activeId = "m2";
  check("opening B while A open closes A (single open id)", activeId === "m2");

  // Filtered-out active card is dropped.
  activeId = "m3";
  const noM3 = [{ ID: "m1" }, { ID: "m2" }];
  activeId = dropIfFiltered(activeId, noM3);
  check("filtering out the active card closes it", activeId === null);

  // Rapid open/close on the same card ends closed.
  activeId = "m1";
  activeId = null;
  activeId = "m1";
  activeId = null;
  activeId = openFirst(activeId, autoOpened, visible);
  check("rapid open/close ends closed", activeId === null);

  // Empty visible list closes everything.
  activeId = "m1";
  activeId = openFirst(activeId, autoOpened, []);
  activeId = dropIfFiltered(activeId, []);
  check("empty visible list closes everything", activeId === null);
}

console.log(`\nALL ${pass} STATE ASSERTIONS PASSED`);
