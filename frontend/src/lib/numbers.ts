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
    // One grouping style app-wide (the browser locale mixed 5,71,405 with 34,000);
    // Indian grouping only for INR or India-based datasets.
    currency === "INR" || country === "IN" ? "en-IN" : (locale ?? "en-US"),
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
