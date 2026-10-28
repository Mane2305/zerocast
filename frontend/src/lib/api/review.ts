import { api } from "./client";
import type { components } from "./schema";
import { object } from "../forecast";
import { validReview, validAnnotation, eventKey } from "../review";
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
export async function submitReview(
  body: components["schemas"]["ReviewRequest"],
  signal: AbortSignal,
) {
  try {
    const { data, response } = await api.POST("/jobs/review", { body, signal });
    if (!response.ok)
      throw new Error(`Review request rejected (HTTP ${response.status}).`);
    if (
      !data ||
      typeof data.job_id !== "string" ||
      !data.job_id ||
      data.job_type !== "review" ||
      !states.includes(data.status)
    )
      throw new Error("The API returned an invalid review job reference.");
    return data;
  } catch (e) {
    throw failure(e);
  }
}
export async function getReviewJob(id: string, signal: AbortSignal) {
  try {
    const { data, response, error } = await api.GET("/jobs/{job_id}", {
      params: { path: { job_id: id } },
      signal,
    });
    if (!response.ok)
      throw new Error(
        error?.message || `Review job unavailable (HTTP ${response.status}).`,
      );
    if (
      !data ||
      data.job_id !== id ||
      data.job_type !== "review" ||
      !states.includes(data.status) ||
      !Number.isFinite(data.progress) ||
      data.progress < 0 ||
      data.progress > 100 ||
      (data.message !== undefined && typeof data.message !== "string") ||
      (data.error != null &&
        (!object(data.error) || typeof data.error.message !== "string"))
    )
      throw new Error("The API returned an invalid review job.");
    if (data.status === "succeeded" && !validReview(data.result))
      throw new Error("The completed job has an invalid review result.");
    return data;
  } catch (e) {
    throw failure(e);
  }
}
export async function getAnnotations(id: string, signal: AbortSignal) {
  try {
    const { data, response } = await api.GET(
      "/datasets/{dataset_id}/annotations",
      { params: { path: { dataset_id: id } }, signal },
    );
    if (!response.ok)
      throw new Error(`Saved notes unavailable (HTTP ${response.status}).`);
    if (!Array.isArray(data) || !data.every(validAnnotation))
      throw new Error("The API returned invalid saved notes.");
    return data;
  } catch (e) {
    throw failure(e);
  }
}
export async function saveAnnotation(
  id: string,
  body: components["schemas"]["AnnotationInput"],
) {
  try {
    const { data, response } = await api.POST(
      "/datasets/{dataset_id}/annotations",
      {
        params: { path: { dataset_id: id } },
        body,
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok)
      throw new Error(`Note could not be saved (HTTP ${response.status}).`);
    if (
      !validAnnotation(data) ||
      eventKey(data.series_id, data.date) !==
        eventKey(body.series_id, body.date) ||
      data.text !== body.text
    )
      throw new Error(
        "The API did not confirm the saved note. Reload notes before retrying.",
      );
    return data;
  } catch (e) {
    throw failure(e);
  }
}
