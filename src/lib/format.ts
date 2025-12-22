export function formatCurrency(value: number) {
  return new Intl.NumberFormat("ko-KR").format(Math.round(value));
}

export function parseNumber(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return 0;
  return Number(normalized);
}

export function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const normalized = value.replace(/,/g, "").trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}
