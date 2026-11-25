"use client";
import { CircleCheck, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/base/button";

export function SuccessDialog({ open, title, message, onClose }: { open: boolean; title: string; message: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);
  if (!open) return null;
  return <div className="dialog-backdrop success-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="success-dialog" role="dialog" aria-modal="true" aria-labelledby="success-dialog-title" aria-describedby="success-dialog-message">
      <button ref={closeRef} type="button" className="success-dialog__close" onClick={onClose} aria-label="Tutup dialog"><X size={19} /></button>
      <CircleCheck className="success-dialog__icon" size={58} aria-hidden />
      <h2 id="success-dialog-title">{title}</h2>
      <p id="success-dialog-message">{message}</p>
      <Button type="button" onClick={onClose}>Tutup</Button>
    </section>
  </div>;
}
