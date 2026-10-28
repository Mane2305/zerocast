import { api } from "./client";
import type { components } from "./schema";
import { object, validForecast, validHistory } from "../forecast";
const states = ["queued", "running", "succeeded", "failed"];
function failure(error: unknown): Error {
  if (error instanceof TypeError)
    return new Error(
      "Backend unreachable. Check the API connection and try again.",
    );
  if (error instanceof SyntaxError)
    return new Error("The API returned unreadable JSON.");
  return error instanceof Error ? error : new Error("The request failed.");
}
export async function submitForecast(
  body: components["schemas"]["ForecastRequest"],
  signal: AbortSignal,
) {
  try {
    const { data, response } = await api.POST("/jobs/forecast", {
      body,
      signal,
    });
    if (!response.ok)
      throw new Error(`Forecast request rejected (HTTP ${response.status}).`);
    if (
      !data ||
      typeof data.job_id !== "string" ||
      !data.job_id ||
      data.job_type !== "forecast" ||
      !states.includes(data.status)
    )
      throw new Error("The API returned an invalid forecast job reference.");
    return data;
  } catch (e) {
    throw failure(e);
  }
}
export async function getForecastJob(id: string, signal: AbortSignal) {
  try {
    const { data, response, error } = await api.GET("/jobs/{job_id}", {
      params: { path: { job_id: id } },
      signal,
    });
    if (!response.ok)
      throw new Error(
        error?.message || `Could not read job (HTTP ${response.status}).`,
      );
    if (
      !data ||
      data.job_id !== id ||
      data.job_type !== "forecast" ||
      !states.includes(data.status) ||
      !Number.isFinite(data.progress) ||
      data.progress < 0 ||
      data.progress > 100 ||
      (data.message !== undefined && typeof data.message !== "string") ||
      (data.error != null &&
        (!object(data.error) || typeof data.error.message !== "string"))
    )
      throw new Error("The API returned an invalid forecast job.");
    if (data.status === "succeeded" && !validForecast(data.result))
      throw new Error(
        "The completed job has an invalid forecast result. Check percentile shapes and ordering.",
      );
    return data;
  } catch (e) {
    throw failure(e);
  }
}
export async function getHistory(
  dataset: string,
  series: string,
  signal: AbortSignal,
) {
  try {
    const { data, response } = await api.GET(
      "/datasets/{dataset_id}/series/{series_id}",
      { params: { path: { dataset_id: dataset, series_id: series } }, signal },
    );
    if (!response.ok)
      throw new Error(`History unavailable (HTTP ${response.status}).`);
    if (!validHistory(data) || data.series_id !== series)
      throw new Error(
        "The series history is invalid or belongs to another series.",
      );
    return data;
  } catch (e) {
    throw failure(e);
  }
}
