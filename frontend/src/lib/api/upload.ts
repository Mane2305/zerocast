import createClient from "openapi-fetch";
import type { paths } from "./schema";
import { UPLOAD_LIMIT } from "../import/types";

// Keep the generated client's request/response types; XHR supplies real upload progress.
export async function uploadDataset(
  file: File,
  name: string,
  country: string,
  signal: AbortSignal,
  progress: (percent: number) => void,
  options?: { additive: boolean; unit: string; idColumns?: string[] },
) {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl)
    throw new Error(
      "Demo mode · upload needs the backend. Configure NEXT_PUBLIC_API_URL to upload your prepared file.",
    );
  if (file.size > UPLOAD_LIMIT)
    throw new Error("The Parquet file exceeds the 50 MB upload limit.");
  const client = createClient<paths>({
    baseUrl,
    fetch: async (request: Request) => {
      const body = await request.blob();
      if (signal.aborted)
        throw new DOMException("Upload cancelled", "AbortError");
      return new Promise<Response>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const abort = () => xhr.abort();
        const clean = () => signal.removeEventListener("abort", abort);
        xhr.open(request.method, request.url);
        request.headers.forEach((value, key) =>
          xhr.setRequestHeader(key, value),
        );
        xhr.timeout = 120_000;
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable)
            progress(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onload = () => {
          clean();
          try {
            resolve(
              new Response(
                [204, 205, 304].includes(xhr.status) ? null : xhr.responseText,
                {
                  status: xhr.status,
                  headers: {
                    "Content-Type":
                      xhr.getResponseHeader("Content-Type") ??
                      "application/json",
                  },
                },
              ),
            );
          } catch {
            reject(
              new Error(
                "The API returned an unreadable response. Check whether the dataset was stored before retrying.",
              ),
            );
          }
        };
        xhr.onerror = () => {
          clean();
          reject(
            new Error(
              "Backend unreachable. Start the configured backend or mock server, check its CORS settings, and retry. Your prepared file is still available.",
            ),
          );
        };
        xhr.ontimeout = () => {
          clean();
          reject(
            new Error(
              "The upload timed out. The server may have received it; check before retrying to avoid a duplicate dataset.",
            ),
          );
        };
        xhr.onabort = () => {
          clean();
          reject(new DOMException("Upload cancelled", "AbortError"));
        };
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) {
          clean();
          reject(new DOMException("Upload cancelled", "AbortError"));
          return;
        }
        xhr.send(body);
      });
    },
  });
  const form = new FormData();
  form.append("file", file);
  if (name.trim()) form.append("name", name.trim());
  if (country) form.append("holiday_country", country);
  form.append("format", "long");
  form.append("additive", String(options?.additive ?? true));
  if (options?.unit.trim()) form.append("unit", options.unit.trim());
  if (options?.idColumns?.length)
    form.append("id_columns", JSON.stringify(options.idColumns));
  const { data, error, response } = await client
    .POST("/datasets", {
      body: {
        file: file.name,
        name: name.trim(),
        ...(country ? { holiday_country: country } : {}),
        format: "long",
        additive: options?.additive ?? true,
        ...(options?.unit.trim() ? { unit: options.unit.trim() } : {}),
        ...(options?.idColumns?.length
          ? { id_columns: JSON.stringify(options.idColumns) }
          : {}),
      },
      bodySerializer: () => form,
      signal,
    })
    .catch((cause: unknown) => {
      if (cause instanceof SyntaxError)
        throw new Error(
          "The API returned an unreadable response. Check whether the dataset was stored before retrying.",
        );
      throw cause;
    });
  if (!response.ok)
    throw new Error(
      error?.message ||
        (response.status === 413
          ? "The server rejected this file as too large. Reduce the dataset and try again."
          : `Upload failed (HTTP ${response.status}). Please try again.`),
    );
  if (
    !data ||
    typeof data.dataset_id !== "string" ||
    typeof data.name !== "string" ||
    !Number.isInteger(data.series_count) ||
    !data.health ||
    typeof data.health.ready !== "boolean"
  )
    throw new Error(
      "The API returned an unexpected response. It may have stored the dataset; check the server before retrying.",
    );
  return data;
}
