const currencyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

export function formatCurrency(value: number | null | undefined) {
  return value == null ? "—" : currencyFormatter.format(value).replace(/\s/g, "");
}

export function formatSignedCurrency(value: number | null | undefined) {
  if (value == null) return "—";
  const formatted = currencyFormatter.format(Math.abs(value)).replace(/\s/g, "");
  if (value === 0) return `Rp0`;
  return `${value < 0 ? "−" : "+"}Rp${formatted.replace(/^Rp/, "")}`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return dateFormatter.format(new Date(value));
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

const timeAgoFormatter = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });

/** Indonesian relative time ("12 menit lalu"). Returns null when the value is not a valid date. */
export function timeAgo(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = date.getTime() - Date.now();
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 1) return timeAgoFormatter.format(0, "minute");
  if (Math.abs(minutes) < 60) return timeAgoFormatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return timeAgoFormatter.format(hours, "hour");
  return timeAgoFormatter.format(Math.round(hours / 24), "day");
}

export function periodLabel(period: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return period;
  const [, year, month] = match;
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(
    new Date(Number(year), Number(month) - 1, 1),
  );
}
