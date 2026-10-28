import type { components } from "./api/schema";

export type Frequency = components["schemas"]["Frequency"];

// Series dates describe source periods. Preserve their calendar date and clock
// time rather than shifting them into the viewer's timezone.
export function formatPeriod(value?: string, frequency: Frequency = "unknown") {
  if (!value) return "Not supplied";
  const parts = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(value);
  if (!parts) return "Date unavailable";
  const [, year, month, day, hour = "00", minute = "00"] = parts;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  )
    return "Date unavailable";
  if (frequency === "yearly") return year;
  if (frequency === "quarterly")
    return `Q${Math.ceil(Number(month) / 3)} ${year}`;
  const label = new Intl.DateTimeFormat("en-GB", {
    ...(frequency === "monthly" ? {} : { day: "numeric" as const }),
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  return frequency === "hourly"
    ? `${label}, ${hour}:${minute}`
    : frequency === "weekly"
      ? `Wk of ${label}`
      : label;
}
