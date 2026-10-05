export function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatSar(amount?: { halalas?: number; sar?: number } | number | null) {
  const halalas = typeof amount === "number" ? amount : amount?.halalas;
  if (halalas == null || Number.isNaN(halalas)) return "";
  const negative = halalas < 0;
  const abs = Math.abs(Math.round(halalas));
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const frac = String(abs % 100).padStart(2, "0");
  return `SAR ${negative ? "-" : ""}${whole}.${frac}`;
}

export function formatKm(value?: number | null) {
  if (value == null) return "";
  return `${value.toLocaleString("en-US")} km`;
}

export function statusClass(code?: string) {
  if (!code) return "bg-status-muted-bg text-status-muted";
  if (["ok", "valid", "paid", "active", "approved", "delivered", "sent"].includes(code)) {
    return "bg-status-ok-bg text-status-ok";
  }
  if (["due_soon", "expiring_soon", "unpaid", "pending", "submitted", "queued", "open"].includes(code)) {
    return "bg-status-warn-bg text-status-warn";
  }
  if (["overdue", "expired", "rejected", "failed", "suspended"].includes(code)) {
    return "bg-status-danger-bg text-status-danger";
  }
  return "bg-status-muted-bg text-status-muted";
}
