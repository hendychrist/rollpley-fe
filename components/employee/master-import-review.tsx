"use client";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { BaseInlineError } from "@/components/base/error-state";
import { Button } from "@/components/base/button";
import { StatusBadge } from "@/components/base/status-badge";
import { SuccessDialog } from "@/components/base/success-dialog";
import { useMasterImportReview } from "@/hooks/use-master-import";
import type { MasterImportFile, MasterImportRow } from "@/type/master-import";

interface ComparisonSource {
  id: string;
  row: MasterImportRow;
  filename: string;
  job: string;
  news: string;
  sourceQualifier?: string;
}

function sourceText(value: string | undefined) {
  return value?.trim() ? value : "-";
}

function groupRows(rows: MasterImportRow[], files: MasterImportFile[] = []) {
  const fileById = new Map(files.map((file) => [file.id, file]));
  const groups = new Map<string, MasterImportRow[]>();
  for (const row of rows) {
    const key = row.raw_name.trim().toLowerCase();
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([, items]) => {
    const sources: ComparisonSource[] = items.map((row) => {
      const sourceFile = fileById.get(row.source_file_id);
      const isSumsel = sourceFile?.kind === "SUMSEL";
      const isBcaTemplate = sourceFile?.kind === "BCA" || sourceFile?.kind === "OTHER";
      const sourceQualifier = isSumsel ? row.job_qualifier?.trim() : undefined;
      return {
        id: row.id,
        row,
        filename: sourceFile?.original_filename ?? "Berkas sumber tidak tersedia",
        job: isSumsel ? sourceText(row.raw_note) : "-",
        news: isBcaTemplate ? sourceText(row.raw_note) : "-",
        sourceQualifier,
      };
    });
    return { name: items[0].raw_name, rows: items, sources };
  });
}

type ConflictGroupData = ReturnType<typeof groupRows>[number];

// ponytail: a group is resolved only when every row in it has an explicit decision
function unresolvedCount(rows: MasterImportRow[]) {
  return rows.filter((row) => !row.decision).length;
}

function SourceCard({ groupName, source, showQualifier }: { groupName: string; source: ComparisonSource; showQualifier: boolean }) {
  const bankAndAccount = `${source.row.raw_bank_label || "Bank tidak tersedia"} · ${source.row.masked_account || "Rekening tidak tersedia"}`;
  return <article className="conflict-source-card">
    <header><h4>{groupName}</h4><span>Baris {source.row.source_row}</span></header>
    <dl>
      <div className="conflict-source-card__job-news"><div><dt>Jabatan</dt><dd>{source.job}</dd></div><div><dt>Berita</dt><dd>{source.news}</dd></div></div>
      <div><dt>Bank dan rekening</dt><dd>{bankAndAccount}</dd></div>
      <div><dt>Berkas Excel</dt><dd>{source.filename}</dd></div>
      <div><dt>Sheet</dt><dd>{source.row.source_sheet || "Tidak tersedia"}</dd></div>
      {showQualifier ? <div><dt>Kualifikasi sumber</dt><dd>{source.sourceQualifier ?? "Tidak tersedia"}</dd></div> : null}
    </dl>
  </article>;
}

function SourceCards({ group }: { group: ConflictGroupData }) {
  const showQualifier = group.sources.some((source) => source.sourceQualifier);
  const minimumWidth = group.sources.length * 320 + Math.max(0, group.sources.length - 1) * 16;
  return <div className="conflict-source-region" tabIndex={0} role="region" aria-label={`Perbandingan sumber untuk ${group.name}`}>
    <div className="conflict-source-cards" style={{ gridTemplateColumns: `repeat(${group.sources.length}, minmax(320px, 1fr))`, minWidth: `${minimumWidth}px` }}>
      {group.sources.map((source) => <SourceCard key={source.id} groupName={group.name} source={source} showQualifier={showQualifier} />)}
    </div>
  </div>;
}

function DistinctEmployeesForm({ group, note, save, saving, onSaved }: {
  group: ConflictGroupData;
  note?: string;
  save: ReturnType<typeof useMasterImportReview>["saveDistinct"];
  saving: boolean;
  onSaved: (name: string) => void;
}) {
  const submittingRef = useRef(false);
  async function submit() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try { if (await save(group.rows.map((row) => row.id), note)) onSaved(group.name); }
    finally { submittingRef.current = false; }
  }
  return <div className="conflict-form">
    <strong>Dua karyawan berbeda</strong>
    <p className="field-help">Buat satu identitas karyawan untuk setiap catatan sumber. Rekening tetap belum terverifikasi sampai ditinjau sesuai alur admin.</p>
    <div className="review-actions"><Button type="button" onClick={() => void submit()} loading={saving} disabled={saving} loadingLabel="Menyimpan dua keputusan…">Catat sebagai 2 karyawan berbeda</Button></div>
  </div>;
}

function RowForm({ row, save, saving, onSaved }: {
  row: MasterImportRow;
  save: ReturnType<typeof useMasterImportReview>["save"];
  saving: boolean;
  onSaved: () => void;
}) {
  const submittingRef = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      const data = new FormData(event.currentTarget);
      const value = (key: string) => String(data.get(key) ?? "").trim() || undefined;
      await save(row.id, { decision: value("decision")!, reason: value("reason"), employee_id: value("employee_id"), source_row_id: value("source_row_id"), effective_date: value("effective_date"), identity_evidence: value("identity_evidence") });
      onSaved();
    } finally { submittingRef.current = false; }
  }
  return <form className="conflict-form" onSubmit={submit}>
    <div className="conflict-form__row">
      <strong className="conflict-form__row-title">{row.masked_account} · baris {row.source_row}</strong>
      <label>Keputusan<select name="decision" required defaultValue={row.decision ?? ""}><option value="" disabled>Pilih keputusan</option>{row.available_decisions.map((decision) => <option key={decision} value={decision}>{decision}</option>)}</select></label>
      <label>Alasan<textarea name="reason" required defaultValue={row.decision_reason} /></label>
      <label>ID karyawan<input name="employee_id" defaultValue={row.selected_employee_id} placeholder="Untuk link / replace" /></label>
      <label>ID baris sumber<input name="source_row_id" defaultValue={row.selected_source_row_id} /></label>
      <label>Tanggal efektif<input name="effective_date" type="date" defaultValue={row.effective_date?.slice(0, 10)} /></label>
      <label>Bukti identitas<textarea name="identity_evidence" defaultValue={row.identity_evidence} /></label>
    </div>
    <div className="review-actions"><Button type="submit" loading={saving} loadingLabel="Menyimpan keputusan…">Simpan keputusan</Button></div>
  </form>;
}

function ConflictGroup({ group, save, saveDistinct, saving, onResolve, onDistinctSaved }: {
  group: ConflictGroupData;
  save: ReturnType<typeof useMasterImportReview>["save"];
  saveDistinct: ReturnType<typeof useMasterImportReview>["saveDistinct"];
  saving: boolean;
  onResolve: () => void;
  onDistinctSaved: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [distinctNote, setDistinctNote] = useState("");
  const [formRevision, setFormRevision] = useState(0);
  const disclosureId = useId();
  const triggerId = `${disclosureId}-trigger`;
  const panelRef = useRef<HTMLDivElement>(null);
  const unresolved = unresolvedCount(group.rows);

  function setDisclosure(nextOpen: boolean) {
    if (!nextOpen) {
      if (panelRef.current?.contains(document.activeElement)) {
        document.getElementById(triggerId)?.focus({ preventScroll: true });
      }
      // The previous conditional render reset uncontrolled fields on close.
      // Keep that behaviour while retaining the panel for its exit motion.
      setFormRevision((value) => value + 1);
    }
    setOpen(nextOpen);
  }

  return <section className={`conflict-row${unresolved ? " conflict-row--open" : ""}`} data-unresolved={unresolved}>
    <header className="conflict-row__head">
      <div><small>{group.rows.length} catatan sumber</small><strong>{group.name}</strong></div>
      <div><StatusBadge label={unresolved ? "Belum diputuskan" : "Terdapat keputusan"} tone={unresolved ? "warning" : "success"} /><Button id={triggerId} className="conflict-row__toggle" variant="secondary" onClick={() => setDisclosure(!open)} aria-expanded={open} aria-controls={disclosureId}>{open ? "Tutup" : "Periksa"}</Button></div>
    </header>
    <p className="conflict-row__instruction">Periksa apakah kedua catatan ini milik orang yang sama atau berbeda.</p>
    <div id={disclosureId} ref={panelRef} className={`conflict-disclosure${open ? " conflict-disclosure--open" : ""}`} aria-hidden={!open} inert={!open}>
      <div className="conflict-disclosure__clip">
        <div className="conflict-row__body">
          <SourceCards group={group} />
          {group.rows.some((row) => row.identity_evidence) ? <p className="identity-evidence"><strong>Bukti dari backend:</strong> {group.rows.map((row) => row.identity_evidence).filter(Boolean).join(" · ")}</p> : null}
          {group.rows.length === 2 && unresolved ? <DistinctEmployeesForm group={group} note={distinctNote} save={saveDistinct} saving={saving} onSaved={onDistinctSaved} /> : null}
          <Button type="button" variant="ghost" onClick={() => setAdvanced((value) => !value)} aria-expanded={advanced}>{advanced ? "Tutup pilihan lanjutan" : "Pilihan admin lainnya"}</Button>
          {advanced ? <><label>Catatan opsional untuk keputusan dua karyawan berbeda<textarea value={distinctNote} onChange={(event) => setDistinctNote(event.target.value)} maxLength={500} placeholder="Catatan internal reviewer (opsional)" /></label>{group.rows.map((row) => <RowForm key={`${row.id}-${formRevision}`} row={row} save={save} saving={saving} onSaved={onResolve} />)}</> : null}
          <div className="review-actions"><Button type="button" variant="ghost" onClick={() => setDisclosure(false)}>Periksa nanti</Button></div>
        </div>
      </div>
    </div>
  </section>;
}

export function MasterImportReview({ importId, onUnresolvedChange }: { importId: string; onUnresolvedChange?: (count: number) => void }) {
  const state = useMasterImportReview(importId);
  const [successName, setSuccessName] = useState<string | null>(null);
  const groups = useMemo(() => groupRows(state.rows.data?.rows ?? [], state.importSession.data?.files), [state.rows.data?.rows, state.importSession.data?.files]);
  const unresolved = useMemo(() => groups.reduce((sum, group) => sum + unresolvedCount(group.rows), 0) + Math.max(0, (state.rows.data?.meta.total ?? 0) - (state.rows.data?.rows.length ?? 0)), [groups, state.rows.data?.meta.total, state.rows.data?.rows.length]);

  useEffect(() => { onUnresolvedChange?.(unresolved); }, [onUnresolvedChange, unresolved]);

  if (state.rows.isError) return <BaseInlineError error={state.rows.error} />;
  if (!state.rows.data?.rows.length) return successName ? <SuccessDialog open title="Keputusan tersimpan" message={`${successName} dicatat sebagai dua karyawan berbeda di pratinjau impor.`} onClose={() => setSuccessName(null)} /> : null;
  return <div className="conflict-review" data-unresolved={unresolved}>
    <h3>Perlu diperiksa</h3>
    <p>Setiap konflik memerlukan keputusan eksplisit untuk tiap baris sebelum impor dikonfirmasi.</p>
    {state.importSession.isError ? <BaseInlineError error={state.importSession.error} /> : null}
    {state.error ? <BaseInlineError error={state.error} /> : null}
    {groups.map((group) => <ConflictGroup key={group.name} group={group} save={state.save} saveDistinct={state.saveDistinct} saving={state.saving} onResolve={() => state.invalidateRows?.()} onDistinctSaved={setSuccessName} />)}
    <SuccessDialog open={successName !== null} title="Keputusan tersimpan" message={`${successName ?? "Karyawan"} dicatat sebagai dua karyawan berbeda di pratinjau impor.`} onClose={() => setSuccessName(null)} />
  </div>;
}
