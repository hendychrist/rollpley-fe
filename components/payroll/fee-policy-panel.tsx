"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/base/button";
import { BaseInlineError } from "@/components/base/error-state";
import { Panel } from "@/components/base/panel";
import { Skeleton } from "@/components/base/skeleton";
import { StatusBadge } from "@/components/base/status-badge";
import { useFeePolicy } from "@/hooks/use-fee-policy";
import { formatCurrency } from "@/utils/format";

export function FeePolicyPanel() {
  const state = useFeePolicy();
  const [editing, setEditing] = useState(false);
  const submittingRef = useRef(false);
  // Synchronous lock for "Konfirmasi versi ini"; held until the refreshed
  // policy shows the confirmed state, so the button cannot be re-activated.
  const confirmingRef = useRef(false);
  const [confirmPending, setConfirmPending] = useState(false);
  const policy = state.policy.data;

  async function confirmVersion(id: string) {
    if (confirmingRef.current || submittingRef.current) return;
    confirmingRef.current = true;
    setConfirmPending(true);
    try {
      if (await state.confirm(id)) await state.policy.refetch();
    } finally {
      confirmingRef.current = false;
      setConfirmPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || confirmingRef.current) return;
    submittingRef.current = true;
    try {
      const data = new FormData(event.currentTarget);
      const until = String(data.get("effective_until") ?? "");
      if (await state.create({ bca_fee: Number(data.get("bca_fee")), sumsel_fee: Number(data.get("sumsel_fee")), other_fee: Number(data.get("other_fee")), effective_from: String(data.get("effective_from")), effective_until: until || null })) setEditing(false);
    } finally {
      submittingRef.current = false;
    }
  }

  return <Panel className="fee-policy">
    <div className="section-heading"><div><h2>Kebijakan biaya</h2><p>Ini adalah versi administrasi terbaru. Finalisasi tetap memilih kebijakan terkonfirmasi berdasarkan periode batch.</p></div><Button variant="secondary" onClick={() => setEditing((value) => !value)}>{editing ? "Tutup" : "Buat versi baru"}</Button></div>
    {state.policy.isError ? <BaseInlineError error={state.policy.error} /> : null}
    {state.error ? <BaseInlineError error={state.error} /> : null}
    {state.policy.isLoading ? <div className="fee-policy-loading" role="status"><span>Memuat kebijakan biaya…</span><Skeleton lines={1} /></div> : null}
    {policy && state.policy.isFetching ? <p className="fee-policy-refresh" role="status">Memperbarui kebijakan biaya…</p> : null}
    {policy ? <div className="policy-summary"><span>Versi {policy.version}</span><strong>BCA {formatCurrency(policy.bca_fee)} · Sumsel {formatCurrency(policy.sumsel_fee)} · Bank Lain {formatCurrency(policy.other_fee)}</strong><span>{policy.effective_from} sampai {policy.effective_until ?? "tanpa batas"}</span><StatusBadge label={policy.confirmed ? "Terkonfirmasi" : "Belum dikonfirmasi"} tone={policy.confirmed ? "success" : "warning"} />{!policy.confirmed ? <Button onClick={() => void confirmVersion(policy.id)} loading={state.confirming || confirmPending} disabled={state.creating} loadingLabel="Mengonfirmasi versi…">Konfirmasi versi ini</Button> : null}</div> : null}
    {editing ? <form className="policy-form" onSubmit={submit}><label>Biaya BCA<input name="bca_fee" type="number" min="0" defaultValue="0" required /></label><label>Biaya Sumsel<input name="sumsel_fee" type="number" min="0" defaultValue="0" required /></label><label>Biaya Bank Lain<input name="other_fee" type="number" min="0" defaultValue="2900" required /></label><label>Efektif mulai<input name="effective_from" type="date" required /></label><label>Efektif sampai<input name="effective_until" type="date" /></label><Button type="submit" loading={state.creating} disabled={state.confirming || confirmPending} loadingLabel="Menyimpan versi…">Simpan versi</Button></form> : null}
  </Panel>;
}
