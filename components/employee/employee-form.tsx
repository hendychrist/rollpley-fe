"use client";
import { type FormEvent, useRef } from "react";
import { BaseInlineError } from "@/components/base/error-state";
import { Button } from "@/components/base/button";
import { useEmployeeCreate } from "@/hooks/use-employee";

export function EmployeeForm({ onClose }: { onClose: () => void }) {
  const { submit, loading, error } = useEmployeeCreate(onClose);
  const submittingRef = useRef(false);
  function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (submittingRef.current) return; submittingRef.current = true; try { const data = new FormData(event.currentTarget); const nullable = (key: string) => String(data.get(key) ?? "").trim() || null; void submit({ official_name: String(data.get("official_name") ?? "").trim(), employee_number: nullable("employee_number"), nik: nullable("nik"), position: nullable("position"), unit: nullable("unit") }); } finally { submittingRef.current = false; } }
  return <form className="employee-form" onSubmit={handleSubmit}>{error ? <BaseInlineError error={error} /> : null}<div className="form-grid"><label className="span-2">Nama resmi<input name="official_name" required autoFocus /></label><label>NIK<input name="nik" inputMode="numeric" /><span className="field-help">Disimpan sebagai teks agar nol di depan tidak hilang.</span></label><label>Nomor karyawan<input name="employee_number" /></label><label>Jabatan<input name="position" /></label><label>Unit<input name="unit" /></label></div><div className="dialog-actions"><Button type="button" variant="secondary" onClick={onClose}>Batal</Button><Button type="submit" loading={loading} loadingLabel="Menyimpan karyawan…">Simpan karyawan</Button></div></form>;
}
