"use client";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import type { DragEvent, FormEvent } from "react";
import { BaseInlineError } from "@/components/base/error-state";
import { Button } from "@/components/base/button";
import { StateIllustration } from "@/components/base/state-illustration";
import { usePayrollUpload } from "@/hooks/use-payroll-upload";
import { formatBytes } from "@/utils/format";

export function PayrollUploader() {
  const state = usePayrollUpload();
  function drop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); state.setDragging(false); state.selectFile(event.dataTransfer.files.item(0)); }
  function submit(event: FormEvent) { event.preventDefault(); void state.upload(); }
  return <form onSubmit={submit} className="upload-workspace">
    <div className={`dropzone ${state.dragging ? "dropzone--dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); state.setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) state.setDragging(false); }} onDrop={drop}>
      <input ref={state.inputRef} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(event) => state.selectFile(event.target.files?.item(0) ?? null)} /><StateIllustration variant="upload" size={72} /><h2>{state.dragging ? "Lepaskan PDF di sini" : "Unggah PDF payroll"}</h2><p>{state.dragging ? "PDF akan divalidasi sebelum diunggah" : "Tarik berkas ke sini atau pilih PDF rekap payroll"}</p><Button type="button" variant="secondary" onClick={() => state.inputRef.current?.click()}><Paperclip size={17} />Pilih PDF</Button>
    </div>
    {state.file ? <div className="file-row"><span className="file-row__icon"><FileText size={20} /></span><span><strong>{state.file.name}</strong><small>{formatBytes(state.file.size)}</small></span>{state.uploading && state.progress != null ? <span className="file-row__progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.progress.percent} aria-label={`Unggahan ${state.progress.percent}%`}><i style={{ width: `${state.progress.percent}%` }} /><span>{formatBytes(state.progress.loaded)} / {formatBytes(state.progress.total)} · {state.progress.percent}%</span></span> : null}<button type="button" onClick={() => state.selectFile(null)} disabled={state.uploading} aria-label="Hapus berkas"><Trash2 size={18} /></button></div> : null}
    {state.error ? <BaseInlineError error={state.error} /> : null}<div className="upload-action"><Button type="submit" loading={state.uploading} loadingLabel="Mengunggah PDF…" disabled={!state.fileIsValid}>Proses payroll</Button></div>
  </form>;
}
