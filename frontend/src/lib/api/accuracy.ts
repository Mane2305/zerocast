import { api } from "./client";
import type { components } from "./schema";
import { object } from "../forecast";
import { validAccuracy } from "../accuracy";
function failure(error: unknown) {
  return error instanceof TypeError
    ? new Error("Backend unreachable. Check the API connection and retry.")
    : error instanceof SyntaxError
      ? new Error("The API returned unreadable accuracy data.")
      : error instanceof Error
        ? error
        : new Error("Accuracy request failed.");
}
const states = ["queued", "running", "succeeded", "failed"];
export async function submitAccuracy(
  body: components["schemas"]["AccuracyRequest"],
  signal: AbortSignal,
) {
  try {
    const { data, response } = await api.POST("/jobs/accuracy", {
      body,
      signal,
    });
    if (!response.ok)
      throw new Error(`Accuracy request rejected (HTTP ${response.status}).`);
    if (
      !data ||
      typeof data.job_id !== "string" ||
      !data.job_id ||
      data.job_type !== "accuracy" ||
      !states.includes(data.status)
    )
      throw new Error("The API returned an invalid accuracy job reference.");
    return data;
  } catch (error) {
    throw failure(error);
  }
}
export async function getAccuracyJob(id: string, signal: AbortSignal) {
  try {
    const { data, response, error } = await api.GET("/jobs/{job_id}", {
      params: { path: { job_id: id } },
      signal,
    });
    if (!response.ok)
      throw new Error(
        error?.message || `Accuracy job unavailable (HTTP ${response.status}).`,
      );
    if (
      !data ||
      data.job_id !== id ||
      data.job_type !== "accuracy" ||
      !states.includes(data.status) ||
      !Number.isFinite(data.progress) ||
      data.progress < 0 ||
      data.progress > 100 ||
      (data.message !== undefined && typeof data.message !== "string") ||
      (data.error != null &&
        (!object(data.error) || typeof data.error.message !== "string"))
    )
      throw new Error("The API returned an invalid accuracy job.");
    if (data.status === "succeeded" && !validAccuracy(data.result))
      throw new Error(
        "The completed job has invalid accuracy data. No scores can be shown safely.",
      );
    return data;
  } catch (error) {
    throw failure(error);
  }
}
