import type { ReactNode } from "react";
import { StateIllustration } from "@/components/base/state-illustration";

export function EmptyState({ title, description, action, illustration = "history", compact = false }: { title: string; description: string; action?: ReactNode; illustration?: "upload" | "history" | "employees" | "search" | "review" | "export"; compact?: boolean }) {
  return <div className={`empty-state ${compact ? "empty-state--compact" : ""}`}><StateIllustration variant={illustration} size={compact ? 68 : 92} /><h3>{title}</h3><p>{description}</p>{action}</div>;
}
