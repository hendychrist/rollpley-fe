import { BatchDetail } from "@/components/payroll/batch-detail";
import { FeePolicyPanel } from "@/components/payroll/fee-policy-panel";
export default async function PayrollBatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const query = await searchParams;
  const reviewId = typeof query.review === "string" ? query.review : undefined;
  const rawPage = typeof query.reviewPage === "string" ? Number(query.reviewPage) : 1;
  const reviewPage = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const reviewFilter = query.reviewFilter === "identity" || query.reviewFilter === "account" ? query.reviewFilter : "all";
  return <><BatchDetail id={id} reviewId={reviewId} reviewPage={reviewPage} reviewFilter={reviewFilter} /><div className="content-wrap contextual-settings"><FeePolicyPanel /></div></>;
}
