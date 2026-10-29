"use client";
import { PageHeader } from "@/components/ui/layout";
import { Badge, Callout, Hint } from "@/components/ui/feedback";
import { StatCard, StatGrid } from "@/components/ui/stat";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  FileUp,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select } from "@/components/ui/select";
import {
  fileError,
  fileSize,
  guessMapping,
  mappingError,
  type Inspection,
  type Mapping,
  type Prepared,
} from "@/lib/import/types";
import type { FileProcessor } from "@/lib/import/processor";
import { uploadDataset } from "@/lib/api/upload";
import { apiConfigured } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { SheetsImport } from "./sheets-import";

function ColumnOptionPicker({
  label,
  columns,
  selected,
  maxSelected,
  onChange,
  placeholder,
}: {
  label: string;
  columns: string[];
  selected: string[];
  maxSelected?: number;
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  return (
    <MultiSelect
      label={label}
      placeholder={placeholder ?? `Choose ${label.toLocaleLowerCase()}…`}
      options={columns.map((column) => ({ value: column }))}
      value={selected}
      onChange={onChange}
      max={maxSelected}
      maxChips={6}
      emptyText="No columns match. Try another search."
    />
  );
}

function Preview({ rows }: { rows: Record<string, string>[] }) {
  if (!rows.length) return null;
  const columns = Object.keys(rows[0]);
  return (
    <div className="upload-preview-wrap">
      {columns.length > 3 && (
        <p className="upload-preview-hint">
          {columns.length.toLocaleString("en-US")} columns · Scroll horizontally
          to review all fields.
        </p>
      )}
      <div
        className="table-scroll upload-preview"
        tabIndex={0}
        role="region"
        aria-label={`File preview · ${columns.length} columns · first ${rows.length} rows`}
      >
        <table>
          <caption>First {rows.length} rows · blanks stay unknown</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th scope="col" key={c} title={c}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((c) => (
                  <td key={c} title={row[c] || undefined}>
                    {row[c] || <span className="muted">blank</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
export function UploadFlow() {
  const [file, setFile] = useState<File>();
  const [inspection, setInspection] = useState<Inspection>();
  const [mapping, setMapping] = useState<Mapping>(guessMapping([]));
  const [prepared, setPrepared] = useState<Prepared>();
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [unit, setUnit] = useState("");
  const [additive, setAdditive] = useState(true);
  const [sheet, setSheet] = useState("");
  const [busy, setBusy] = useState<"inspect" | "convert" | "upload" | null>(
    null,
  );
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [dataset, setDataset] = useState<components["schemas"]["Dataset"]>();
  const engine = useRef<FileProcessor | null>(null);
  const abort = useRef<AbortController | null>(null);
  const operation = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const [download, setDownload] = useState("");
  useEffect(
    () => () => {
      if (download) URL.revokeObjectURL(download);
    },
    [download],
  );
  useEffect(
    () => () => {
      operation.current++;
      abort.current?.abort();
      void engine.current?.dispose();
    },
    [],
  );
  function selectFile(selected?: File) {
    operation.current++;
    void engine.current?.dispose();
    engine.current = null;
    setFile(selected);
    setInspection(undefined);
    setPrepared(undefined);
    setDownload("");
    setDataset(undefined);
    setSheet("");
    setStatus("");
    setError(selected ? (fileError(selected) ?? "") : "");
    setName(selected?.name.replace(/\.[^.]+$/, "") ?? "");
  }
  function cancel() {
    operation.current++;
    abort.current?.abort();
    if (busy !== "upload") {
      void engine.current?.dispose();
      engine.current = null;
      setInspection(undefined);
      setPrepared(undefined);
    }
    setStatus(
      busy === "upload"
        ? "Upload cancelled. The server may already have received the file; check before retrying."
        : "Processing cancelled. You can run the file check again.",
    );
    setBusy(null);
  }
  async function inspect(selectedSheet = "") {
    if (!file) return;
    const ticket = ++operation.current;
    setBusy("inspect");
    setError("");
    setDataset(undefined);
    setPrepared(undefined);
    setInspection(undefined);
    try {
      await engine.current?.dispose();
      const { FileProcessor, processingMessage } =
        await import("@/lib/import/processor");
      if (ticket !== operation.current) return;
      const processor = new FileProcessor();
      engine.current = processor;
      try {
        const result = await processor.inspect(file, selectedSheet, (text) => {
          if (ticket === operation.current) setStatus(text);
        });
        if (ticket !== operation.current) return;
        setInspection(result);
        setSheet(result.sheet);
        setMapping(guessMapping(result.columns));
        setStatus(
          "File checked locally. Confirm the suggested mappings below.",
        );
      } catch (error) {
        throw new Error(processingMessage(error));
      }
    } catch (error) {
      if (ticket === operation.current) {
        setStatus("");
        setError(
          error instanceof Error
            ? error.message
            : "The file processor could not start. Refresh and try again.",
        );
      }
    } finally {
      if (ticket === operation.current) setBusy(null);
    }
  }
  async function convert() {
    if (!engine.current || !inspection) return;
    const invalid = mappingError(mapping, inspection.columns);
    if (invalid) {
      setError(invalid);
      return;
    }
    const ticket = ++operation.current;
    setBusy("convert");
    setError("");
    setPrepared(undefined);
    setDataset(undefined);
    try {
      const result = await engine.current.convert(mapping, (text) => {
        if (ticket === operation.current) setStatus(text);
      });
      if (ticket === operation.current) {
        setPrepared(result);
        setDownload(URL.createObjectURL(result.file));
        setStatus("Your Parquet file is ready. Review it before uploading.");
      }
    } catch (error) {
      const { processingMessage } = await import("@/lib/import/processor");
      if (ticket === operation.current) {
        setStatus("");
        setError(processingMessage(error));
      }
    } finally {
      if (ticket === operation.current) setBusy(null);
    }
  }
  async function upload() {
    if (!prepared) return;
    if (!additive && mapping.aggregation === "sum") {
      setError(
        "Choose average or reject duplicates for a non-additive dataset, then convert again.",
      );
      return;
    }
    const ticket = ++operation.current;
    abort.current = new AbortController();
    setBusy("upload");
    setError("");
    setProgress(0);
    setStatus("Uploading prepared Parquet…");
    try {
      const result = await uploadDataset(
        prepared.file,
        name,
        country,
        abort.current.signal,
        (value) => {
          if (ticket === operation.current) {
            setProgress(value);
            if (value === 100)
              setStatus(
                "File transferred. Waiting for the API’s data health check…",
              );
          }
        },
        { additive, unit, idColumns: prepared.idColumns },
      );
      if (ticket === operation.current) {
        setDataset(result);
        setStatus("The API accepted your dataset.");
      }
    } catch (error) {
      if (ticket === operation.current) {
        setStatus("");
        setError(
          error instanceof Error
            ? error.message
            : "Upload failed. Please try again.",
        );
      }
    } finally {
      if (ticket === operation.current) setBusy(null);
    }
  }
  function updateMapping(value: Partial<Mapping>) {
    setMapping((current) => {
      const next = { ...current, ...value };
      if (next.format === "wide") next.factors = [];
      next.factors = next.factors.filter(
        (f) =>
          ![
            next.date,
            next.series,
            next.target,
            ...(next.idColumns || []),
          ].includes(f),
      );
      return next;
    });
    setPrepared(undefined);
    setDataset(undefined);
    setError("");
    setStatus("");
  }
  const mappingIssue = inspection
    ? mappingError(mapping, inspection.columns)
    : null;
  return (
    <>
      <section className="intro preview-intro">
        <Link href="/data" className="text-link">
          <ArrowLeft size={15} />
          Connect data
        </Link>
        <PageHeader eyebrow="Bring Your Own History" title={<>Upload file</>} />
        <p className="lede">
          Prepare your file locally; upload the converted Parquet when ready.
        </p>
      </section>
      <SheetsImport disabled={!!busy} onFile={selectFile} />
      <Callout tone="info">
        <strong>File limits</strong>
        <p>
          CSV, Excel, Parquet or JSON · raw file ≤ 1 GB · uploaded Parquet ≤ 50
          MB · at least 30 known points per item · up to 10 drivers. Forecast
          runs later allow up to 100 items and 256 periods.
        </p>
      </Callout>
      <section className="upload-panel">
        <div className="section-title">
          <h2>Choose your file</h2>
          <a
            href="/templates/zerocast-example.csv"
            download
            className="text-link"
          >
            Download an example <Download size={15} />
          </a>
        </div>
        <label
          className={`file-drop ${busy ? "is-busy" : ""}`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (!busy) selectFile(event.dataTransfer.files[0]);
          }}
        >
          <FileUp size={28} />
          <strong>{file ? file.name : "Choose a file or drop it here"}</strong>
          <span>
            {file
              ? `${fileSize(file.size)} · stays local until Upload`
              : "CSV, XLSX, XLS, Parquet or JSON"}
          </span>
          <input
            ref={input}
            type="file"
            aria-label="Choose data file"
            accept=".csv,.xlsx,.xls,.parquet,.json"
            disabled={!!busy}
            onChange={(event) => {
              selectFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
        <div className="download-actions">
          <Button
            onClick={() => inspect()}
            disabled={!file || !!busy || !!(file && fileError(file))}
          >
            Run file check <ArrowRight size={15} />
          </Button>
          {file && (
            <Button
              variant="ghost"
              disabled={!!busy}
              onClick={() => selectFile()}
            >
              Clear file
            </Button>
          )}
        </div>
      </section>
      <div aria-live="polite" className="upload-status">
        {busy && <LoaderCircle size={18} className="animate-spin" />}
        <p>{status}</p>
        {busy && (
          <Button variant="outline" onClick={cancel}>
            Cancel
          </Button>
        )}
      </div>
      {error && (
        <Callout tone="danger">
          <strong>
            {error.startsWith("Backend unreachable")
              ? "Backend unreachable"
              : "We couldn’t complete this period"}
          </strong>
          <p>{error}</p>
          <p>Your original file has not been changed.</p>
        </Callout>
      )}
      {inspection && (
        <section className="upload-panel">
          <div className="section-title">
            <h2>Confirm your columns</h2>
            <Badge>{inspection.rows.toLocaleString("en-US")} source rows</Badge>
          </div>
          {inspection.sheets.length > 0 && (
            <div className="sheet-choice">
              <Select
                label="Worksheet"
                options={inspection.sheets.map((s) => ({ value: s }))}
                value={sheet}
                disabled={!!busy}
                onChange={(value) => {
                  setSheet(value);
                  setPrepared(undefined);
                }}
              />
              <Button
                variant="outline"
                disabled={!!busy || sheet === inspection.sheet}
                onClick={() => inspect(sheet)}
              >
                Run sheet check
              </Button>
              <p>
                Excel formulas use saved results. Recalculate and save your
                workbook before importing. Store IDs with leading zeros as text.
              </p>
            </div>
          )}
          <p className="muted">
            Confirm the suggestions. Unselected columns are left out of the
            prepared file.
          </p>
          <fieldset disabled={!!busy || sheet !== inspection.sheet}>
            <div className="upload-v2-fields">
              <div className="zc-field">
                <span className="zc-static-label">Source layout</span>
                <div
                  className="zc-segmented"
                  role="radiogroup"
                  aria-label="Source layout"
                >
                  {(
                    [
                      ["long", "Long", "One row per item and date"],
                      ["wide", "Wide", "One column per item"],
                    ] as const
                  ).map(([value, title, help]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={(mapping.format || "long") === value}
                      onClick={() => updateMapping({ format: value })}
                    >
                      <strong>{title}</strong>
                      <span>{help}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mapping-grid">
              {(
                [
                  ["date", "Date column"],
                  ["series", "Item ID column"],
                  ["target", "Target column"],
                ] as const
              ).map(
                ([key, label]) =>
                  (mapping.format !== "wide" || key === "date") && (
                    <Select
                      key={key}
                      label={label}
                      placeholder="Choose a column…"
                      options={inspection.columns.map((c) => ({ value: c }))}
                      value={mapping[key]}
                      onChange={(value) =>
                        updateMapping({
                          [key]: value,
                          ...(key === "series" ? { idColumns: undefined } : {}),
                        })
                      }
                    />
                  ),
              )}
            </div>
            {mapping.format === "wide" ? (
              <div className="zc-stack">
                <ColumnOptionPicker
                  label="Item columns"
                  placeholder="Choose the columns that hold items…"
                  columns={inspection.columns.filter((c) => c !== mapping.date)}
                  selected={mapping.wideColumns || []}
                  onChange={(wideColumns) => updateMapping({ wideColumns })}
                />
                {(mapping.wideColumns?.length || 0) > 100 && (
                  <p className="field-help">
                    Forecast runs support up to 100 items at once. You can keep
                    more items in this dataset and choose a smaller run later.
                  </p>
                )}
                <p className="field-help">Unselected columns are left out.</p>
              </div>
            ) : (
              <div className="zc-stack">
                <ColumnOptionPicker
                  label="Hierarchy ID columns (optional)"
                  placeholder="e.g. store and product, combined as store|product"
                  columns={inspection.columns.filter(
                    (c) => ![mapping.date, mapping.target].includes(c),
                  )}
                  selected={mapping.idColumns || []}
                  onChange={(idColumns) => updateMapping({ idColumns })}
                />
              </div>
            )}
            <p className="field-help">
              Use ISO dates (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS). Target and
              drivers must be plain finite numbers; leave unknown values blank.
            </p>
            {mapping.format !== "wide" && (
              <div className="zc-stack factor-fields">
                <ColumnOptionPicker
                  label="Drivers (optional)"
                  placeholder="Up to 10 numeric columns, e.g. price, promo"
                  columns={inspection.columns.filter(
                    (c) =>
                      ![
                        mapping.date,
                        mapping.series,
                        mapping.target,
                        ...(mapping.idColumns || []),
                      ].includes(c),
                  )}
                  selected={mapping.factors}
                  maxSelected={10}
                  onChange={(factors) => updateMapping({ factors })}
                />
              </div>
            )}
            <div className="mapping-grid">
              <Select
                label="Time period"
                options={[
                  { value: "original", label: "Keep original dates" },
                  { value: "day", label: "Daily" },
                  { value: "week", label: "Weekly", hint: "Monday start" },
                  { value: "month", label: "Monthly", hint: "first day" },
                ]}
                value={mapping.period}
                onChange={(value) =>
                  updateMapping({ period: value as Mapping["period"] })
                }
              />
              <Select
                label="Rows sharing a period and item"
                options={[
                  { value: "reject", label: "Reject duplicates" },
                  { value: "sum", label: "Sum target · average drivers" },
                  { value: "avg", label: "Average target & drivers" },
                ]}
                value={mapping.aggregation}
                onChange={(value) =>
                  updateMapping({
                    aggregation: value as Mapping["aggregation"],
                  })
                }
              />
            </div>
            <p className="field-help">
              Roll-ups change the meaning of your data. A group with any unknown
              input stays blank for that column. No dates are filled and no
              negative values are removed here.
            </p>
            <Preview rows={inspection.sample} />
            {mappingIssue && <p className="error-text">{mappingIssue}</p>}
            <Button onClick={convert} disabled={!!mappingIssue}>
              Run conversion <ArrowRight size={15} />
            </Button>
          </fieldset>
        </section>
      )}
      {prepared && (
        <section className="upload-panel">
          <div className="section-title">
            <h2>Review & upload</h2>
            <Badge>Parquet ready · {fileSize(prepared.file.size)}</Badge>
          </div>
          <StatGrid>
            <StatCard
              label="Prepared rows"
              value={<>{prepared.rows.toLocaleString("en-US")}</>}
              hint={
                <>
                  {prepared.collapsed.toLocaleString("en-US")} source rows
                  combined
                </>
              }
            />
            <StatCard
              label="Items"
              value={<>{prepared.series.toLocaleString("en-US")}</>}
              hint={<>{prepared.shortSeries} with fewer than 30 known points</>}
            />
            <StatCard
              label="Unknown targets"
              value={<>{prepared.missingTargets.toLocaleString("en-US")}</>}
              hint={<>Preserved as blanks</>}
            />
          </StatGrid>
          {prepared.shortSeries > 0 && (
            <Callout tone="warning">
              {prepared.shortSeries} item have insufficient history. The backend
              health check will determine which item can be forecast.
            </Callout>
          )}
          <Preview rows={prepared.sample} />
          <div className="mapping-grid">
            <label>
              Display unit (optional)
              <input
                aria-label="Dataset unit"
                value={unit}
                disabled={!!busy || !!dataset}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="units, tonnes, index points, INR"
              />
            </label>
            <Select
              label="Do values add over time?"
              options={[
                { value: "yes", label: "Yes", hint: "units, revenue, tonnes" },
                { value: "no", label: "No", hint: "index, price, rate" },
              ]}
              value={additive ? "yes" : "no"}
              disabled={!!busy || !!dataset}
              onChange={(value) => setAdditive(value === "yes")}
            />
            <label>
              Dataset name
              <input
                value={name}
                disabled={!!busy || !!dataset}
                onChange={(event) => setName(event.target.value)}
                maxLength={200}
              />
            </label>
            <Select
              label="Holiday calendar (optional)"
              options={[
                { value: "", label: "Not selected" },
                { value: "IN", label: "India" },
                { value: "EC", label: "Ecuador" },
                { value: "US", label: "United States" },
                { value: "GB", label: "United Kingdom" },
              ]}
              value={country}
              disabled={!!busy || !!dataset}
              onChange={setCountry}
            />
          </div>
          <div className="download-actions">
            <Button
              onClick={upload}
              disabled={!apiConfigured || !!busy || !!dataset}
            >
              Upload prepared file <ArrowRight size={15} />
            </Button>
            {download && (
              <Button asChild variant="outline">
                <a href={download} download="zerocast-prepared.parquet">
                  <Download size={15} />
                  Download Parquet
                </a>
              </Button>
            )}
          </div>
          {!apiConfigured && (
            <Hint role="status">
              Demo mode · upload needs the backend. You can download your
              prepared Parquet.
            </Hint>
          )}
          {busy === "upload" && (
            <div className="upload-progress">
              <label htmlFor="upload-progress">
                {progress < 100
                  ? `Uploading · ${progress}%`
                  : "Transferred · waiting for server validation"}
              </label>
              <progress id="upload-progress" max={100} value={progress} />
            </div>
          )}
          {dataset && (
            <Callout tone="success" role="status">
              <Check size={20} />
              <div>
                <h3>Dataset accepted</h3>
                <p>
                  {dataset.name} · {dataset.series_count} items · ID:{" "}
                  {dataset.dataset_id}
                </p>
                <p>
                  {dataset.health.ready
                    ? "The API reports at least one item is ready to forecast."
                    : "The API reports this dataset is not ready to forecast. Review its data health before running a forecast."}
                </p>
                <Button asChild>
                  <Link
                    href={`/data-health/${encodeURIComponent(dataset.dataset_id)}`}
                  >
                    Review data health <ArrowRight size={15} />
                  </Link>
                </Button>
              </div>
            </Callout>
          )}
        </section>
      )}
    </>
  );
}
