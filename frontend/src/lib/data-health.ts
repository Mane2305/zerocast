import type { components } from "./api/schema";
import { api } from "./api/client";
export type Dataset = components["schemas"]["Dataset"];
export type Check = components["schemas"]["HealthCheck"];
export const checkLabels: Record<Check["id"], string> = {
  missing_dates: "Missing periods",
  duplicates: "Duplicates",
  negative_values: "Negative values",
  zero_values: "Zero values",
  non_finite: "Non-numeric",
  too_short: "Too short",
  constant_series: "Constant",
  irregular_spacing: "Irregular spacing",
  too_many_factors: "Too many drivers",
  closed_periods_zero: "Closed periods filled as 0",
};
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
const integer = (v: unknown) => typeof v === "number" && Number.isInteger(v);
const optional = (v: unknown, test: (v: unknown) => boolean) =>
  v === undefined || test(v);
const date = (v: unknown) =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
export function isDataset(v: unknown): v is Dataset {
  if (
    !object(v) ||
    typeof v.dataset_id !== "string" ||
    typeof v.name !== "string" ||
    typeof v.additive !== "boolean" ||
    !optional(v.hierarchy, strings) ||
    !optional(v.unit, (x) => x === null || typeof x === "string") ||
    !optional(v.input_format, (x) => x === "long" || x === "wide") ||
    ![
      "hourly",
      "daily",
      "weekly",
      "monthly",
      "quarterly",
      "yearly",
      "unknown",
    ].includes(String(v.frequency)) ||
    !integer(v.series_count) ||
    !strings(v.factor_columns) ||
    !optional(v.holiday_country, (x) => x === null || typeof x === "string") ||
    !optional(
      v.date_range,
      (x) => object(x) && optional(x.start, date) && optional(x.end, date),
    ) ||
    !object(v.health) ||
    typeof v.health.ready !== "boolean" ||
    !Array.isArray(v.health.checks)
  )
    return false;
  if (
    !v.health.checks.every(
      (c) =>
        object(c) &&
        Object.hasOwn(checkLabels, String(c.id)) &&
        typeof c.label === "string" &&
        ["info", "warning", "error"].includes(String(c.severity)) &&
        integer(c.count) &&
        optional(
          c.percent,
          (x) => typeof x === "number" && Number.isFinite(x),
        ) &&
        optional(c.action_taken, (x) => typeof x === "string") &&
        optional(c.affected_series, strings),
    )
  )
    return false;
  return optional(
    v.series,
    (x) =>
      Array.isArray(x) &&
      x.every(
        (s) =>
          object(s) &&
          typeof s.series_id === "string" &&
          integer(s.length) &&
          ["ready", "warning", "excluded"].includes(String(s.status)) &&
          optional(s.start, date) &&
          optional(s.end, date) &&
          optional(s.missing_count, integer) &&
          optional(s.issues, strings) &&
          optional(
            s.attributes,
            (x) =>
              object(x) &&
              Object.values(x).every((value) => typeof value === "string"),
          ),
      ),
  );
}
export class HealthError extends Error {
  constructor(
    public title: string,
    message: string,
  ) {
    super(message);
  }
}
export async function loadHealth(
  id: string,
  source: "api" | "demo",
  signal: AbortSignal,
): Promise<Dataset> {
  let data: unknown;
  try {
    if (source === "demo") {
      const response = await fetch(
        `/demo/${encodeURIComponent(id)}/dataset.json`,
        { signal },
      );
      if (!response.ok)
        throw new HealthError(
          "Demo unavailable",
          "The saved dataset file could not be loaded. Try again or choose another dataset.",
        );
      data = await response.json();
    } else {
      if (!process.env.NEXT_PUBLIC_API_URL)
        throw new HealthError(
          "Backend not configured",
          "Set NEXT_PUBLIC_API_URL and restart the app to load uploaded datasets.",
        );
      const result = await api.GET("/datasets/{dataset_id}", {
        params: { path: { dataset_id: id } },
        signal,
      });
      if (!result.response.ok)
        throw new HealthError(
          result.response.status === 404
            ? "Dataset not found"
            : "Health report unavailable",
          result.error?.message ||
            `The server returned HTTP ${result.response.status}. Try again shortly.`,
        );
      data = result.data;
    }
  } catch (error) {
    if (signal.aborted || error instanceof HealthError) throw error;
    if (error instanceof SyntaxError)
      throw new HealthError(
        "Invalid health report",
        "The response was not readable JSON. Try again or ask the server owner to check the response.",
      );
    throw new HealthError(
      source === "api" ? "Backend unreachable" : "Demo unavailable",
      source === "api"
        ? "Could not reach the API. Check that the backend or mock server is running, then retry."
        : "Could not load the saved demo. Check your connection and retry.",
    );
  }
  if (!isDataset(data))
    throw new HealthError(
      "Invalid health report",
      "The response does not match the dataset contract. No readiness or issue counts can be shown safely.",
    );
  return data;
}
