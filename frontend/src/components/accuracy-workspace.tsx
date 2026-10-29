"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { loadHealth, HealthError, type Dataset } from "@/lib/data-health";
import { findDemo } from "@/lib/demos";
import { validAccuracy, type Accuracy } from "@/lib/accuracy";
import { getAccuracyJob, submitAccuracy } from "@/lib/api/accuracy";
import { useDatasetPreferences } from "@/lib/preferences";
import { AccuracyResults } from "./accuracy-results";
import { Button } from "./ui/button";
import { MultiSelect } from "./ui/multi-select";
import { NumberField } from "./ui/number-field";
import { horizonPresets, horizonUnit, seriesOptions } from "@/lib/pickers";

export function AccuracyDemo({ id }: { id: string }) {
  const preferences = useDatasetPreferences(id);
  const query = useQuery({
    queryKey: ["accuracy-demo", id],
    queryFn: async ({ signal }) => {
      const [dataset, response] = await Promise.all([
        loadHealth(id, "demo", signal),
        fetch(`/demo/${encodeURIComponent(id)}/accuracy.json`, { signal }),
      ]);
      if (!response.ok)
        throw new Error(
          `Saved accuracy report unavailable (HTTP ${response.status}).`,
        );
      const result: unknown = await response.json();
      if (
        !validAccuracy(result) ||
        result.series.some(
          (item) =>
            !dataset.series?.some((s) => s.series_id === item.series_id),
        )
      )
        throw new Error(
          "The saved accuracy report is invalid or belongs to different items.",
        );
      return { dataset, result };
    },
    staleTime: Infinity,
  });
  if (query.isPending) return <Loading />;
  if (query.isError)
    return (
      <AccuracyError
        message={query.error.message}
        retry={() => query.refetch()}
      />
    );
  return (
    <div className="accuracy-page">
      <header className="page-heading">
        <h1>Accuracy</h1>
        <p>{query.data.dataset.name} · saved backtest</p>
      </header>
      <AccuracyResults
        result={query.data.result}
        selected={preferences.selected || ""}
        setSelected={(selected) => preferences.update({ selected })}
        frequency={query.data.dataset.frequency}
        country={query.data.dataset.holiday_country}
        unit={query.data.dataset.unit || findDemo(id)?.unit}
      />
      <p className="accuracy-source">
        <a href={`/demo/${id}/accuracy.json`} className="text-link" download>
          Source accuracy JSON ↗
        </a>
        <Link href={`/forecast/${id}`} className="text-link">
          Open forecast ↗
        </Link>
      </p>
    </div>
  );
}
function Loading() {
  return (
    <section className="route-state" role="status">
      <h1>Accuracy</h1>
      <p>Loading accuracy inputs…</p>
    </section>
  );
}
function AccuracyError({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <section className="route-state" role="alert">
      <h1>Accuracy unavailable</h1>
      <p>{message}</p>
      <Button onClick={retry}>Retry accuracy</Button>
      <Link className="text-link accuracy-back" href="/data">
        Choose dataset
      </Link>
    </section>
  );
}
export function AccuracyWorkspace({
  id,
  initialJob,
}: {
  id: string;
  initialJob?: string;
}) {
  const dataset = useQuery({
    queryKey: ["data-health", "api", id],
    queryFn: ({ signal }) => loadHealth(id, "api", signal),
  });
  if (dataset.isPending) return <Loading />;
  if (dataset.isError)
    return (
      <AccuracyError
        message={`${dataset.error instanceof HealthError ? dataset.error.title + ". " : ""}${dataset.error.message}`}
        retry={() => dataset.refetch()}
      />
    );
  return (
    <AccuracyRunner
      key={id}
      dataset={dataset.data}
      id={id}
      initialJob={initialJob}
    />
  );
}
function AccuracyRunner({
  dataset,
  id,
  initialJob,
}: {
  dataset: Dataset;
  id: string;
  initialJob?: string;
}) {
  const preferences = useDatasetPreferences(id);
  const [picked, setPicked] = useState<string[]>([]);
  const [horizonInput, setHorizonInput] = useState<string>();
  const horizon = horizonInput ?? String(preferences.horizon ?? 28);
  const setHorizon = (value: string) => {
    setHorizonInput(value);
    if (
      Number.isInteger(Number(value)) &&
      Number(value) >= 1 &&
      Number(value) <= 256
    )
      preferences.update({ horizon: Number(value) });
  };
  const [origins, setOrigins] = useState("8");
  const [newJob, setNewJob] = useState("");
  const jobId = newJob || initialJob || preferences.accuracyJob || "";
  const [submitting, setSubmitting] = useState(false),
    [paused, setPaused] = useState(false),
    [error, setError] = useState("");
  const [request, setRequest] = useState<{ ids: string[]; horizon: number }>();
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const job = useQuery({
    queryKey: ["accuracy-job", jobId],
    queryFn: ({ signal }) => getAccuracyJob(jobId, signal),
    enabled: !!jobId && !paused,
    refetchInterval: (query) =>
      query.state.error ||
      !query.state.data ||
      !["queued", "running"].includes(query.state.data.status)
        ? false
        : 1200,
  });
  const result =
    job.data?.status === "succeeded" && validAccuracy(job.data.result)
      ? job.data.result
      : undefined;
  const mismatch =
    !!result &&
    (result.series.some(
      (item) => !dataset.series?.some((s) => s.series_id === item.series_id),
    ) ||
      (!!request &&
        (result.horizon !== request.horizon ||
          result.series.length !== request.ids.length ||
          result.series.some(
            (item) => !request.ids.includes(item.series_id),
          ))));
  const active =
    submitting ||
    (!!jobId &&
      !job.isError &&
      (!job.data || ["queued", "running"].includes(job.data.status)));
  const issue = !dataset.health.ready
    ? "No items are ready. Review data quality."
    : !picked.length || picked.length > 20
      ? "Select 1–20 eligible items."
      : !Number.isInteger(Number(horizon)) ||
          Number(horizon) < 1 ||
          Number(horizon) > 256
        ? "Forecast horizon must be 1–256 whole periods."
        : !Number.isInteger(Number(origins)) ||
            Number(origins) < 1 ||
            Number(origins) > 52
          ? "Backtest origins must be 1–52."
          : "";
  async function run() {
    if (issue || active) return;
    setSubmitting(true);
    setError("");
    controller.current = new AbortController();
    const signal = controller.current.signal;
    const snapshot = { ids: [...picked], horizon: Number(horizon) };
    try {
      const ref = await submitAccuracy(
        {
          dataset_id: id,
          series_ids: snapshot.ids,
          horizon: snapshot.horizon,
          origins: Number(origins),
        },
        signal,
      );
      if (signal.aborted) return;
      setRequest(snapshot);
      setPaused(false);
      setNewJob(ref.job_id);
      preferences.update({ accuracyJob: ref.job_id });
      const url = new URL(window.location.href);
      url.searchParams.set("job", ref.job_id);
      window.history.replaceState(null, "", url);
    } catch (e) {
      if (!signal.aborted)
        setError(
          `${e instanceof Error ? e.message : "Request failed."} The request may have been accepted; check before submitting again.`,
        );
    } finally {
      if (!signal.aborted) setSubmitting(false);
    }
  }
  return (
    <div className="accuracy-page">
      <header className="page-heading">
        <h1>Accuracy</h1>
        <p>{dataset.name}</p>
      </header>
      <details className="accuracy-run-panel" open={!result || mismatch}>
        <summary>Backtest settings</summary>
        <div className="accuracy-run-grid">
          <fieldset disabled={active}>
            <legend className="sr-only">Items to score</legend>
            <MultiSelect
              label="Items to score"
              placeholder="Choose items…"
              options={seriesOptions(dataset.series)}
              value={picked}
              onChange={setPicked}
              max={20}
              disabled={active}
            />
          </fieldset>
          <div className="accuracy-run-fields">
            <NumberField
              label="Forecast horizon"
              value={horizon}
              onChange={setHorizon}
              min={1}
              max={256}
              unit={horizonUnit(dataset.frequency)}
              presets={horizonPresets(dataset.frequency)}
              disabled={active}
            />
            <div className="zc-field">
              <NumberField
                label="Backtest windows"
                value={origins}
                onChange={setOrigins}
                min={1}
                max={52}
                presets={[
                  { value: 4, label: "4" },
                  { value: 8, label: "8" },
                  { value: 12, label: "12" },
                ]}
                disabled={active}
              />
              <small className="muted">
                Past forecast windows to test, one horizon apart. Fewer are used
                if history is short.
              </small>
            </div>
            <Button onClick={run} disabled={!!issue || active}>
              {submitting ? "Submitting…" : "Run accuracy"}
            </Button>
            <p className="health-note">
              {issue || "Ready to run · no new job until you click Run."}
            </p>
          </div>
        </div>
      </details>
      {error && (
        <p role="alert" className="upload-error">
          {error}
        </p>
      )}
      {!jobId && !submitting && (
        <p className="accuracy-empty">
          Choose items and run an accuracy backtest.
        </p>
      )}
      {jobId && (
        <section className="accuracy-job" aria-label="Accuracy job">
          <div>
            <span>Job {jobId}</span>
            {job.isError ? (
              <div role="alert">
                <p>{job.error.message}</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPaused(false);
                    job.refetch();
                  }}
                >
                  Retry job status
                </Button>
              </div>
            ) : (
              <p role="status">
                {paused
                  ? "Status checks paused"
                  : job.data?.status || "Loading job…"}
                {job.data?.message ? ` · ${job.data.message}` : ""}
              </p>
            )}
          </div>
          {job.data && (
            <label>
              Progress: {job.data.progress}%
              <progress
                max="100"
                value={job.data.progress}
                aria-label="Accuracy progress"
              />
            </label>
          )}
          {active && (
            <Button variant="outline" onClick={() => setPaused(!paused)}>
              {paused ? "Resume status checks" : "Pause status checks"}
            </Button>
          )}
          {paused && <small>The server job keeps running.</small>}
          {job.data?.status === "failed" && (
            <p role="alert">
              {job.data.error?.message ||
                "The accuracy job failed. Review the settings and run again."}
            </p>
          )}
        </section>
      )}
      {mismatch && (
        <p role="alert" className="upload-error">
          The returned accuracy report does not match the requested items or
          horizon. Results are hidden.
        </p>
      )}
      {result && !mismatch && (
        <AccuracyResults
          result={result as Accuracy}
          selected={preferences.selected || ""}
          setSelected={(selected) => preferences.update({ selected })}
          frequency={dataset.frequency}
          unit={dataset.unit || findDemo(id)?.unit}
          country={dataset.holiday_country}
        />
      )}
    </div>
  );
}
