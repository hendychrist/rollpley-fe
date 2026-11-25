import { AlertCircle, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

const icons = { error: AlertCircle, warning: TriangleAlert, success: CircleCheck, info: Info };

export function Alert({ tone = "info", title, children }: { tone?: keyof typeof icons; title?: string; children: ReactNode }) {
  const Icon = icons[tone];
  return (
    <div className={`alert alert--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon aria-hidden size={18} />
      <div>{title ? <strong>{title}</strong> : null}<div>{children}</div></div>
    </div>
  );
}
