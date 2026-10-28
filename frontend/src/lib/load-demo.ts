import type { components } from "./api/schema";
import type { Demo } from "./demos";
import { validHistory } from "./forecast";
import { validReview, type Review } from "./review";
import { validAccuracy, type Accuracy } from "./accuracy";
type Dataset = components["schemas"]["Dataset"];
type Forecast = components["schemas"]["ForecastResult"];
type History = components["schemas"]["SeriesHistory"];
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";
const numbers = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.every((v) => typeof v === "number" && Number.isFinite(v));
const dates = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((v) => typeof v === "string" && Number.isFinite(Date.parse(v)));

async function readFile(
  demo: Demo,
  file: string,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(`/demo/${demo.id}/${file}.json`, { signal });
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? "A demo file is missing. Please try again after the demo files are restored."
        : `Demo files could not be loaded (HTTP ${response.status}).`,
    );
  try {
    return await response.json();
  } catch {
    throw new Error(
      "A demo file is unreadable. Please restore the original demo files.",
    );
  }
}
export async function loadDemo(demo: Demo, signal: AbortSignal) {
  const [dataset, forecast, history] = await Promise.all([
    readFile(demo, "dataset", signal),
    readFile(demo, "forecast", signal),
    readFile(demo, "history", signal),
  ]);
  const invalid = () =>
    new Error(
      "The demo data is incomplete or inconsistent. Please restore the original demo files.",
    );
  if (
    !object(dataset) ||
    dataset.dataset_id !== demo.id ||
    typeof dataset.name !== "string" ||
    typeof dataset.frequency !== "string" ||
    typeof dataset.additive !== "boolean" ||
    !Number.isInteger(dataset.series_count) ||
    !Array.isArray(dataset.series)
  )
    throw invalid();
  if (
    !object(history) ||
    typeof history.series_id !== "string" ||
    !dates(history.dates) ||
    !Array.isArray(history.target) ||
    history.target.length !== history.dates.length ||
    !history.target.every(
      (v) => v === null || (typeof v === "number" && Number.isFinite(v)),
    )
  )
    throw invalid();
  if (
    !object(forecast) ||
    !numbers(forecast.quantile_levels) ||
    ![0.1, 0.5, 0.9].every(
      (p) =>
        forecast.quantile_levels instanceof Array &&
        forecast.quantile_levels.includes(p),
    ) ||
    !Array.isArray(forecast.series)
  )
    throw invalid();
  for (const series of forecast.series) {
    if (
      !object(series) ||
      !dataset.series.some(
        (item) => object(item) && item.series_id === series.series_id,
      ) ||
      !dates(series.dates) ||
      !Array.isArray(series.quantiles) ||
      series.quantiles.length !== forecast.quantile_levels.length ||
      !series.quantiles.every(
        (row) =>
          numbers(row) && row.length === (series.dates as string[]).length,
      )
    )
      throw invalid();
    if (
      !object(series.total_distribution) ||
      series.total_distribution.aggregation !==
        (dataset.additive ? "sum" : "mean") ||
      !numbers(series.total_distribution.percentiles) ||
      series.total_distribution.percentiles.length !== 101
    )
      throw invalid();
  }
  if (
    !forecast.series.some((s) => object(s) && s.series_id === history.series_id)
  )
    throw invalid();
  let histories: History[] = [history as History];
  if (forecast.series.length > 1) {
    const response = await fetch(`/demo/${demo.id}/histories.json`, { signal });
    if (response.ok) {
      const supplied: unknown = await response.json();
      if (
        !Array.isArray(supplied) ||
        !supplied.every(validHistory) ||
        new Set(supplied.map((h) => h.series_id)).size !== supplied.length
      )
        throw invalid();
      histories = supplied;
    } else if (response.status !== 404)
      throw new Error(
        `Saved series histories unavailable (HTTP ${response.status}).`,
      );
  }
  return {
    dataset: dataset as Dataset,
    forecast: forecast as Forecast,
    history: history as History,
    histories,
    ...(await (async (): Promise<{ accuracy?: Accuracy }> => {
      try {
        const response = await fetch(`/demo/${demo.id}/accuracy.json`, {
          signal,
        });
        if (!response.ok) return {};
        const value: unknown = await response.json();
        return validAccuracy(value) ? { accuracy: value } : {};
      } catch (error) {
        if (signal.aborted) throw error;
        return {};
      }
    })()),
    ...(await (async (): Promise<{ review?: Review; reviewNote?: string }> => {
      try {
        const response = await fetch(`/demo/${demo.id}/review.json`, {
          signal,
        });
        if (!response.ok)
          return {
            reviewNote: `Saved review unavailable (HTTP ${response.status}).`,
          };
        const value: unknown = await response.json();
        return validReview(value)
          ? { review: value }
          : { reviewNote: "Saved review is invalid; coverage is unavailable." };
      } catch (error) {
        if (signal.aborted) throw error;
        return {
          reviewNote:
            "Saved review could not be loaded; coverage is unavailable.",
        };
      }
    })()),
  };
}
