import { BaseLoadingState } from "@/components/base/loading-state";
import { Panel } from "@/components/base/panel";
import { Skeleton } from "@/components/base/skeleton";

// Route loading boundary for /payroll/[id]: shown immediately on navigation
// while middleware + the server render run. No data fetching here; the real
// BatchDetail replaces it once the route is ready.
export default function PayrollBatchLoading() {
  return <div className="content-wrap" aria-busy="true" style={{ display: "grid", gap: 24 }}>
    <BaseLoadingState compact label="Membuka batch payroll…" />
    <Skeleton lines={1} />
    <Panel><Skeleton lines={3} /></Panel>
    <Panel><Skeleton lines={4} /></Panel>
  </div>;
}
