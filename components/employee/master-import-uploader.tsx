"use client";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { BaseInlineError } from "@/components/base/error-state";
import { Button } from "@/components/base/button";
import { Panel } from "@/components/base/panel";
import { StatusBadge } from "@/components/base/status-badge";
import { useMasterImport } from "@/hooks/use-master-import";
import { formatBytes } from "@/utils/format";
import { MASTER_TEMPLATE_LIMIT, MASTER_TEMPLATE_LABELS, masterFileIdentity, masterTemplateKey } from "@/validations/master-import-files";
import { MasterImportReview } from "@/components/employee/master-import-review";

const TEMPLATE_ORDER = ["xlsx", "xlsm", "xls"] as const;
const SHORT_LABELS: Record<(typeof TEMPLATE_ORDER)[number], string> = { xlsx: "BCA", xlsm: "Bank Lain", xls: "Sumsel" };

export function MasterImportUploader() {
  const state = useMasterImport(); const session = state.session.data;
  const [dragging, setDragging] = useState(false);
  const [unresolvedDecisions, setUnresolvedDecisions] = useState(0);
  const dragDepth = useRef(0);
  // ponytail: no browser here ever lacks drag events; guard only protects SSR (document is undefined pre-hydration)
  const supportsDrag = typeof document !== "undefined" && "ondragstart" in document;

  function onDragEnter(event: React.DragEvent) {
    event.preventDefault();
    if (!event.dataTransfer || !event.dataTransfer.types.includes("Files")) return;
    dragDepth.current += 1;
    setDragging(true);
  }
  function onDragOver(event: React.DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }
  function onDragLeave(event: React.DragEvent) {
    event.preventDefault();
    if (!event.dataTransfer || !event.dataTransfer.types.includes("Files")) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }
  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    state.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  const dropzone = supportsDrag ? { onDragEnter, onDragOver, onDragLeave, onDrop } : {};
  const count = state.files.length;
  const owned = new Set(state.files.map((file) => masterTemplateKey(file)).filter(Boolean));
  const full = count === MASTER_TEMPLATE_LIMIT;
  const empty = count === 0;
  const missing = TEMPLATE_ORDER.filter((key) => !owned.has(key));

  return <Panel className="import-panel"><div className="import-panel__heading">
      <h2>Impor master awal</h2>
      <div className="import-panel__heading__meta">
        <span className="import-panel__count" aria-label={`${count} dari ${MASTER_TEMPLATE_LIMIT} berkas dipilih`}>{count}/{MASTER_TEMPLATE_LIMIT}</span>
        {session ? <StatusBadge label={session.status === "confirmed" ? "Sudah dikonfirmasi" : "Pratinjau"} tone={session.status === "confirmed" ? "success" : "warning"} /> : null}
      </div>
    </div>
    <div className="import-panel__body">
      {state.session.isError ? <BaseInlineError error={state.session.error} /> : null}
      {state.error ? <BaseInlineError error={state.error} /> : null}
      {session ? <div className="import-summary"><div><strong>{session.total_rows}</strong><span>baris kandidat</span></div><div><strong>{session.counts?.conflict ?? 0}</strong><span>konflik identitas</span></div><div><strong>{session.files?.length ?? 0}</strong><span>berkas sumber</span></div><p>{unresolvedDecisions ? `${unresolvedDecisions} keputusan identitas belum terselesaikan — selesaikan di "Konflik identitas" sebelum konfirmasi.` : "Baris kandidat belum menjadi karyawan aktif sebelum impor dikonfirmasi. Masalah routing BSI perlu diselesaikan sebelum finalisasi payroll Bank Lain, tetapi tidak memblokir konfirmasi impor."}</p>{session.status !== "confirmed" ? <Button onClick={() => void state.confirmImport()} disabled={unresolvedDecisions > 0} loading={state.confirming} loadingLabel="Mengonfirmasi impor…">Konfirmasi impor</Button> : null}</div> : <>
        {!full ? <div {...dropzone} className={`import-dropzone${dragging ? " import-dropzone--dragging" : ""}`}>
          <div className="import-dropzone__prompt">
            <Upload aria-hidden size={20} />
            <span className="import-dropzone__text">
              <strong>{empty ? "Tarik file Excel ke sini atau pilih berkas." : "Tambah berkas."}</strong>
              {empty ? <small>{MASTER_TEMPLATE_LABELS.xlsx} · {MASTER_TEMPLATE_LABELS.xlsm} · {MASTER_TEMPLATE_LABELS.xls}</small> : missing.length ? <small>Belum: {missing.map((key) => SHORT_LABELS[key]).join(" · ")}</small> : null}
            </span>
            <Button type="button" variant="secondary" onClick={state.openPicker} disabled={state.uploading}>{empty ? "Pilih berkas" : "Tambah berkas"}</Button>
            <input
              ref={state.inputRef}
              type="file"
              multiple
              accept=".xlsx,.xlsm,.xls"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => { state.addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }}
            />
          </div>
          {state.notice ? <p className="import-dropzone__notice" role="status">{state.notice}</p> : null}
        </div> : null}
        {state.files.length ? <div className="import-files">
          <ul className="import-files__list" aria-label={`Berkas dipilih (${state.files.length}/${MASTER_TEMPLATE_LIMIT})`}>{state.files.map((file) => <li key={masterFileIdentity(file)}><FileSpreadsheet aria-hidden size={18} /><strong className="import-files__name" title={file.name}>{file.name}</strong><span className="import-files__size">{formatBytes(file.size)}</span><Button type="button" variant="ghost" onClick={() => state.removeFile(masterFileIdentity(file))} disabled={state.uploading} aria-label={`Hapus ${file.name}`} className="import-files__remove"><X aria-hidden size={15} />Hapus</Button></li>)}</ul>
          {full ? <p className="import-files__hint">Untuk mengganti, hapus salah satu berkas dulu.</p> : null}
        </div> : null}
        <div className="import-actions">{state.uploading && state.progress != null ? <span className="import-actions__progress">Mengunggah {state.progress}%</span> : null}<Button onClick={() => void state.upload()} disabled={!state.canSubmit} loading={state.uploading} loadingLabel="Memvalidasi berkas…">Validasi berkas</Button></div>
      </>}
    </div>
    {state.importId ? <MasterImportReview importId={state.importId} onUnresolvedChange={setUnresolvedDecisions} /> : null}
  </Panel>;
}
