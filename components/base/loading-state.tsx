import { LoaderCircle } from "lucide-react";
export function BaseLoadingState({ label = "Loading…", compact = false }: { label?: string; compact?: boolean }) { return <div className={`loading-state ${compact ? "loading-state--compact" : ""}`} role="status" aria-live="polite"><LoaderCircle className="spin" aria-hidden size={compact ? 18 : 24} /><span>{label}</span></div>; }
