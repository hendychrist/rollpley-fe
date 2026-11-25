// Run: node validations/master-import-files.selfcheck.mjs
// Compiles the real TS module once, then exercises intakeMasterFiles against the acceptance edge cases.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "rollpley-selfcheck-"));
try {
  execFileSync("npx", [
    "tsc", "validations/master-import-files.ts",
    "--module", "commonjs", "--target", "es2017", "--strict",
    "--outDir", dir, "--skipLibCheck",
  ], { stdio: "inherit", cwd: process.cwd() });
  // tsc emits CJS; load via a temp CJS bridge
  const bridge = join(dir, "bridge.cjs");
  writeFileSync(bridge, `module.exports = require("./master-import-files.js");`);
  const req = (await import("node:module")).createRequire(import.meta.url);
  const lib = req(bridge);
  const { intakeMasterFiles, masterTemplateKey, masterFileIdentity, validateMasterFiles } = lib;

  const file = (name, size = 1024, lastModified = 1) => ({ name, size, lastModified, webkitRelativePath: "", type: "" });
  const bca = file("bca.xlsx"), lain = file("bank-lain.xlsm"), sumsel = file("sumsel.xls");
  let failed = 0;
  function check(label, actual, expected) {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    if (!pass) failed += 1;
    console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
    if (!pass) console.log(`  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
  const names = (list) => list.map((f) => f.name);

  // 1. picker 1 -> 2 -> 3 preserving previous selections
  let r = intakeMasterFiles([], [bca]);
  check("add bca -> 1 file, added=1, no rejects", [names(r.files), r.added, r.rejected.length], [["bca.xlsx"], 1, 0]);
  r = intakeMasterFiles(r.files, [lain]);
  check("then lain -> 2 files kept", names(r.files), ["bca.xlsx", "bank-lain.xlsm"]);
  r = intakeMasterFiles(r.files, [sumsel]);
  check("then sumsel -> 3 files, complete", [names(r.files), validateMasterFiles(r.files)], [["bca.xlsx", "bank-lain.xlsm", "sumsel.xls"], null]);

  // 2. picker three at once
  r = intakeMasterFiles([], [bca, lain, sumsel]);
  check("three at once -> accepted", [names(r.files), r.added, r.rejected.length], [["bca.xlsx", "bank-lain.xlsm", "sumsel.xls"], 3, 0]);

  // 3. drop three together
  r = intakeMasterFiles([], [bca, lain, sumsel]);
  check("drop three together -> accepted", r.added, 3);

  // 4. mixed picker/drop
  r = intakeMasterFiles([bca, lain], [sumsel]);
  check("mix: picker 2 then drop 1", [names(r.files), r.added], [["bca.xlsx", "bank-lain.xlsm", "sumsel.xls"], 1]);

  // 5. duplicate selection
  r = intakeMasterFiles([bca], [bca]);
  check("duplicate same file -> rejected, original kept", [names(r.files), r.added, r.rejected[0]?.reason], [["bca.xlsx"], 0, "DUPLICATE"]);

  // 6. fourth file (whole-set reject)
  const fourth = file("other-bank.xlsx", 2048);
  r = intakeMasterFiles([bca, lain, sumsel], [fourth]);
  check("fourth file (capacity full) -> CONFLICT, whole incoming set rejected, previous 3 kept", [names(r.files), r.added, r.rejected[0]?.reason], [["bca.xlsx", "bank-lain.xlsm", "sumsel.xls"], 0, "CONFLICT"]);

  // 7a. wrong format (whole-set reject)
  const wrong = file("scan.pdf");
  r = intakeMasterFiles([bca], [lain, wrong]);
  check("mixed valid+invalid -> whole incoming set rejected, bca kept, lain NOT added", [names(r.files), r.added, r.rejected.map(x => x.reason)], [["bca.xlsx"], 0, ["INVALID"]]);

  // 7a-2. the exact scenario from the spec: current=BCA, incoming=OTHER+SUMSEL+PDF
  r = intakeMasterFiles([bca], [lain, sumsel, wrong]);
  check("spec scenario: BCA current + (OTHER+SUMSEL+PDF) incoming -> whole rejected, BCA remains", [names(r.files), r.added, r.rejected.length, r.rejected[0]?.reason], [["bca.xlsx"], 0, 1, "INVALID"]);

  // 7b. duplicate template type (whole-set reject)
  const secondBca = file("bca-v2.xlsx", 4096, 2);
  r = intakeMasterFiles([bca], [secondBca, lain]);
  check("conflicting template type -> whole incoming set rejected, bca kept, lain NOT added", [names(r.files), r.added, r.rejected.map(x => x.reason)], [["bca.xlsx"], 0, ["CONFLICT"]]);

  // 7c. duplicate already-selected file (clear feedback, no state change)
  r = intakeMasterFiles([bca], [bca]);
  check("duplicate already-selected -> DUPLICATE reported, no duplication, selection unchanged", [names(r.files), r.added, r.rejected[0]?.reason, r.rejected[0]?.message], [["bca.xlsx"], 0, "DUPLICATE", `"bca.xlsx" sudah dipilih.`]);

  // 7d. duplicate + conflicting file in one incoming set
  const conflict = file("another-bca.xlsx", 8192, 5);
  r = intakeMasterFiles([bca, lain, sumsel], [bca, conflict]);
  check("duplicate + conflicting template -> DUPLICATE and CONFLICT reported, selection unchanged", [names(r.files), r.added, r.rejected.map(x => x.reason)], [["bca.xlsx", "bank-lain.xlsm", "sumsel.xls"], 0, ["DUPLICATE", "CONFLICT"]]);

  // 8. picker cancel = empty selection -> no change
  r = intakeMasterFiles([bca, lain], []);
  check("cancel picker -> unchanged", [names(r.files), r.added, r.rejected.length], [["bca.xlsx", "bank-lain.xlsm"], 0, 0]);

  // 9. remove and reselect same file (same identity)
  const kept = intakeMasterFiles([bca, lain, sumsel], []).files.filter((f) => f.name !== "sumsel.xls");
  let r2 = intakeMasterFiles(kept, [sumsel]);
  check("reselect after removal -> accepted", [names(r2.files), r2.added], [["bca.xlsx", "bank-lain.xlsm", "sumsel.xls"], 1]);
  // 9b. a same-named file with different metadata (size/mtime) is treated as a distinct selection
  // NOTE: this is metadata-based identity, not content hashing — two files with same name+size+mtime
  // but different bytes would be treated as the same selection.
  const sameNameDiffMetadata = file("sumsel.xls", 99999, 3);
  r2 = intakeMasterFiles(kept, [sameNameDiffMetadata]);
  check("same name, different metadata -> accepted as distinct selection (metadata identity, not content hash)", [names(r2.files), r2.added], [["bca.xlsx", "bank-lain.xlsm", "sumsel.xls"], 1]);

  // 10. validateMasterFiles gating
  check("0 files -> error", /Pilih tepat/.test(validateMasterFiles([]) ?? ""), true);
  check("2 files -> error", /Pilih tepat/.test(validateMasterFiles([bca, lain]) ?? ""), true);
  check("missing template -> error", /belum dipilih/.test(validateMasterFiles([bca, lain, fourth]) ?? ""), true);
  check("3 valid -> null", validateMasterFiles([bca, lain, sumsel]), null);
  check("3 wrong set -> error", /belum dipilih/.test(validateMasterFiles([bca, lain, fourth]) ?? ""), true);

  // key mapping sanity
  check("template keys", [masterTemplateKey(bca), masterTemplateKey(lain), masterTemplateKey(sumsel), masterTemplateKey(wrong)], ["xlsx", "xlsm", "xls", null]);
  check("identity differs when metadata differs", masterFileIdentity(bca) !== masterFileIdentity(file("bca.xlsx", 999)), true);

  process.exit(failed ? 1 : 0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
