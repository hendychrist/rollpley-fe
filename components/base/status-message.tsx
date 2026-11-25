import { Alert } from "@/components/base/alert";
import type { ReactNode } from "react";
export function BaseStatusMessage({ title, children, tone = "info" }: { title?: string; children: ReactNode; tone?: "info" | "success" | "warning" }) { return <Alert title={title} tone={tone}>{children}</Alert>; }
