import { Circle, CircleCheck, CircleX, Clock3, TriangleAlert } from "lucide-react";

const iconByTone = { neutral: Circle, success: CircleCheck, warning: TriangleAlert, danger: CircleX, pending: Clock3 };

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: keyof typeof iconByTone }) {
  const Icon = iconByTone[tone];
  return <span className={`status status--${tone}`}><Icon aria-hidden size={13} />{label}</span>;
}
