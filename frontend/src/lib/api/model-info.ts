import { api } from "./client";
import { validModelInfo, validModelHealth } from "../model-info";
function failure(e: unknown) {
  return e instanceof TypeError
    ? new Error(
        "Backend unreachable. Start the configured API or mock server, then retry.",
      )
    : e instanceof SyntaxError
      ? new Error("The API returned unreadable JSON.")
      : e instanceof Error
        ? e
        : new Error("The request failed.");
}
function configured() {
  if (!process.env.NEXT_PUBLIC_API_URL)
    throw new Error(
      "Set NEXT_PUBLIC_API_URL and restart the app to load deployment information.",
    );
}
export async function loadModelInfo(signal: AbortSignal) {
  try {
    configured();
    const { data, response } = await api.GET("/model/info", { signal });
    if (!response.ok)
      throw new Error(`Model details unavailable (HTTP ${response.status}).`);
    if (!validModelInfo(data))
      throw new Error(
        "The model response does not match the API contract. Reported details are unavailable.",
      );
    return data;
  } catch (e) {
    throw failure(e);
  }
}
export async function loadModelHealth(signal: AbortSignal) {
  try {
    configured();
    const { data, response } = await api.GET("/health", { signal });
    if (!response.ok)
      throw new Error(`Model status unavailable (HTTP ${response.status}).`);
    if (!validModelHealth(data))
      throw new Error("The health response does not match the API contract.");
    return data;
  } catch (e) {
    throw failure(e);
  }
}
