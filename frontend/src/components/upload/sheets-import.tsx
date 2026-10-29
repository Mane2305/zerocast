"use client";
import { Disclosure } from "@/components/ui/controls";
import { Hint } from "@/components/ui/feedback";
import { useEffect, useRef, useState } from "react";
import { publishedSheetUrl } from "@/lib/import/sheets";
import { Button } from "../ui/button";
export function SheetsImport({
  disabled,
  onFile,
}: {
  disabled: boolean;
  onFile: (file: File) => void;
}) {
  const [url, setUrl] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function load() {
    setError("");
    try {
      const target = publishedSheetUrl(url);
      setLoading(true);
      controller.current = new AbortController();
      const response = await fetch(target, {
        credentials: "omit",
        signal: AbortSignal.any([
          controller.current.signal,
          AbortSignal.timeout(45000),
        ]),
      });
      if (!response.ok || !response.body)
        throw new Error(
          "The published sheet could not be read. Download its CSV and choose the file instead.",
        );
      if (Number(response.headers.get("content-length")) > 50_000_000)
        throw new Error("Published CSV imports are limited to 50 MB.");
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let size = 0;
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 50_000_000) {
          await reader.cancel();
          throw new Error("Published CSV imports are limited to 50 MB.");
        }
        chunks.push(new Uint8Array(value));
      }
      const file = new File(chunks, "google-sheet.csv", { type: "text/csv" });
      if (!size) throw new Error("The sheet is empty.");
      onFile(file);
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "The browser could not access this published sheet (network or CORS). Download its CSV and choose the file instead."
          : e instanceof Error
            ? e.message
            : "Sheet import failed.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <Disclosure
      className="sheets-import"
      summary={<>Import a published Google Sheet</>}
    >
      <Hint>
        Public CSV export link · up to 50 MB · no Google sign-in or private
        sheets
      </Hint>
      <label>
        Published CSV URL
        <input
          aria-label="Published Google Sheets CSV URL"
          type="url"
          value={url}
          disabled={disabled || loading}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <Button onClick={load} disabled={disabled || loading || !url.trim()}>
        {loading ? "Reading published sheet…" : "Load published CSV"}
      </Button>
      {loading && (
        <Button variant="outline" onClick={() => controller.current?.abort()}>
          Cancel
        </Button>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </Disclosure>
  );
}
