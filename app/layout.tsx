import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@/styles/globals.css";
import "@/styles/logo.css";
import "@/styles/master-import/features.css";
import "@/styles/master-import/detail.css";
import "@/styles/payroll/payroll-detail.css";
import "@/styles/payroll/conflict.css";
import "@/styles/payroll/fee-policy.css";
import "@/styles/payroll/payroll-async-states.css";
import "@/styles/payroll/inline-review.css";
import "@/styles/payroll/exception-review.css";
import "@/styles/payroll/guided-review.css";
import "@/styles/payroll/quality-states.css";
import type { Metadata } from "next";
import { ReduxProvider } from "@/redux/provider";

export const metadata: Metadata = {
  title: { default: "ROLLPLEY", template: "%s · ROLLPLEY" },
  description: "Workspace administrasi payroll ROLLPLEY",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body><ReduxProvider>{children}</ReduxProvider></body></html>;
}
