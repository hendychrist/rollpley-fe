type Variant = "upload" | "history" | "employees" | "search" | "review" | "export" | "server" | "access";

export function StateIllustration({ variant, size = 96 }: { variant: Variant; size?: number }) {
  const symbol = { upload: "M32 46h32M48 62V28m0 0-11 11m11-11 11 11", history: "M48 25a23 23 0 1 1-20 12M24 25v15h15M48 36v14l10 6", employees: "M31 62c1-11 8-17 17-17s16 6 17 17M48 39a10 10 0 1 0 0-20 10 10 0 0 0 0 20", search: "M41 61a20 20 0 1 1 14-6l12 12", review: "M26 24h44v48H26zm10 14h24M36 49h18M36 60h13", export: "M28 22h29l11 11v41H28zm29 0v12h11M48 62V42m0 0-9 9m9-9 9 9", server: "M25 25h46v17H25zm0 29h46v17H25M34 34h1m-1 29h1m13-1 8-8m0 8-8-8", access: "M31 43h34v29H31zm8 0v-8a9 9 0 0 1 18 0v8" }[variant];
  return <svg className="state-illustration" width={size} height={size} viewBox="0 0 96 96" role="img" aria-hidden="true"><circle cx="48" cy="48" r="42" fill="var(--brand-primary-soft)" /><path d={symbol} fill="none" stroke="var(--brand-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><circle cx="74" cy="23" r="7" fill="var(--brand-accent)" /></svg>;
}
