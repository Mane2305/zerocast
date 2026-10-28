import createClient from "openapi-fetch";
import type { paths } from "./schema";
import { validModelHealth } from "../model-info";
export class ApiStartingError extends Error {}

export const apiConfigured = Boolean(process.env.NEXT_PUBLIC_API_URL?.trim());
export const api = createClient<paths>({
  baseUrl: process.env.NEXT_PUBLIC_API_URL,
});
api.use({
  onRequest() {
    if (!apiConfigured)
      throw new Error(
        "Demo mode · upload needs the backend. Configure NEXT_PUBLIC_API_URL to use your own data.",
      );
  },
});
export async function getHealth(signal?: AbortSignal) {
  if (!process.env.NEXT_PUBLIC_API_URL)
    throw new Error(
      "Set NEXT_PUBLIC_API_URL in frontend/.env.local and restart the app.",
    );
  const healthSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
    : AbortSignal.timeout(45000);
  const { data, response } = await api.GET("/health", { signal: healthSignal });
  if ([502, 503, 504].includes(response.status))
    throw new ApiStartingError(
      "API starting or temporarily unavailable. A cold start can take 20–40 seconds; retry shortly.",
    );
  if (!response.ok || !data)
    throw new Error(
      `The health check returned HTTP ${response.status}. Try again shortly.`,
    );
  if (!validModelHealth(data))
    throw new Error(
      "The health response does not match the API contract. Model status is unavailable.",
    );
  return data;
}
