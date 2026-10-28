import type { components } from "./api/schema";
export type NumberDisplay = {
  country?: string | null;
  unit?: string;
  currency?: "INR";
};
export function countUnits(unit?: string) {
  return /^(units?|items?|pieces?|counts?)$/i.test(unit?.trim() ?? "");
}
export function valueFormatter(
  { country, unit, currency }: NumberDisplay = {},
  locale?: string,
) {
  currency ??= /^(INR|₹|rupees?)$/i.test(unit?.trim() ?? "")
    ? "INR"
    : undefined;
  return new Intl.NumberFormat(
    currency === "INR" || country === "IN" ? "en-IN" : locale,
    {
      maximumFractionDigits:
        !currency && countUnits(unit)
          ? 0
          : !currency && /index/i.test(unit || "")
            ? 1
            : 2,
      ...(currency ? { style: "currency", currency } : {}),
    },
  );
}
export const parameterFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});
export function averagePerPeriod(
  dataset: Pick<components["schemas"]["Dataset"], "additive">,
) {
  return dataset.additive === false;
}
