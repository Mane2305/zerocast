import { api } from "./client";
import type { components } from "./schema";
import { object } from "../forecast";
import { validFactors } from "../factors";
const states = ["queued", "running", "succeeded", "failed"];
function failure(e: unknown) {
  return e instanceof TypeError
    ? new Error("Backend unreachable. Check the API connection and retry.")
    : e instanceof SyntaxError
      ? new Error("The API returned unreadable JSON.")
      : e instanceof Error
        ? e
        : new Error("The request failed.");
}
export async function submitFactors(
  body: components["schemas"]["FactorRequest"],
  signal: AbortSignal,
) {
  try {
    const { data, response } = await api.POST("/jobs/factors", {
      body,
      signal,
    });
    if (!response.ok)
      throw new Error(
        `Factor check request rejected (HTTP ${response.status}).`,
      );
    if (
      !data ||
      typeof data.job_id !== "string" ||
      !data.job_id ||
      data.job_type !== "factors" ||
      !states.includes(data.status)
    )
      throw new Error("The API returned an invalid factor job reference.");
    return data;
  } catch (e) {
    throw failure(e);
  }
}
export async function getFactorJob(id: string, signal: AbortSignal) {
  try {
    const { data, response, error } = await api.GET("/jobs/{job_id}", {
      params: { path: { job_id: id } },
      signal,
    });
    if (!response.ok)
      throw new Error(
        error?.message || `Factor check unavailable (HTTP ${response.status}).`,
      );
    if (
      !data ||
      data.job_id !== id ||
      data.job_type !== "factors" ||
      !states.includes(data.status) ||
      !Number.isFinite(data.progress) ||
      data.progress < 0 ||
      data.progress > 100 ||
      (data.message !== undefined && typeof data.message !== "string") ||
      (data.error != null &&
        (!object(data.error) || typeof data.error.message !== "string"))
    )
      throw new Error("The API returned an invalid factor job.");
    if (data.status === "succeeded" && !validFactors(data.result))
      throw new Error("The completed job has an invalid factor result.");
    return data;
  } catch (e) {
    throw failure(e);
  }
}
