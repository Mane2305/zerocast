import type { PickerOption } from "@/components/ui/multi-select";

type SeriesLike = { series_id: string; status?: string | null };

/** Dataset items as picker options; excluded items stay visible but disabled. */
export function seriesOptions(
  series: SeriesLike[] | null | undefined,
): PickerOption[] {
  return (series ?? []).map((s) => ({
    value: s.series_id,
    hint: s.status === "ready" ? undefined : (s.status ?? undefined),
    disabled: s.status === "excluded",
  }));
}

const PRESETS: Record<string, number[]> = {
  hourly: [24, 48, 168],
  daily: [7, 14, 28, 90],
  weekly: [4, 8, 13, 26, 52],
  monthly: [3, 6, 12, 24],
  quarterly: [2, 4, 8],
  yearly: [1, 2, 5],
};
const UNIT: Record<string, [string, string]> = {
  hourly: ["hour", "hours"],
  daily: ["day", "days"],
  weekly: ["week", "weeks"],
  monthly: ["month", "months"],
  quarterly: ["quarter", "quarters"],
  yearly: ["year", "years"],
};

/** Horizon unit for a dataset frequency ("days", "months"…); "periods" if unknown. */
export function horizonUnit(frequency?: string | null): string {
  return UNIT[frequency ?? ""]?.[1] ?? "periods";
}

/** Common horizons for a frequency, within the allowed maximum. */
export function horizonPresets(frequency?: string | null, max = 256) {
  const unit = UNIT[frequency ?? ""];
  return (PRESETS[frequency ?? ""] ?? [7, 14, 28])
    .filter((v) => v <= max)
    .map((v) => ({
      value: v,
      label: unit ? `${v} ${v === 1 ? unit[0] : unit[1]}` : String(v),
    }));
}
