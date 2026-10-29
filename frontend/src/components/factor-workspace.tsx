"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import { NumberField } from "@/components/ui/number-field";
import { Select } from "@/components/ui/select";
import { horizonPresets, horizonUnit, seriesOptions } from "@/lib/pickers";
import { isDataset, loadHealth, type Dataset } from "@/lib/data-health";
import { getFactorJob, submitFactors } from "@/lib/api/factors";
import { validFactors } from "@/lib/factors";
import { FactorResults } from "./factor-results";
export function FactorDemo() {
  const query = useQuery({
    queryKey: ["factor-demo", "manufacturing"],
    queryFn: async ({ signal }) => {
      const read = async (file: string) => {
        const r = await fetch(`/demo/manufacturing/${file}.json`, { signal });
        if (!r.ok)
          throw new Error(
            `Saved factor ${file} unavailable (HTTP ${r.status}).`,
          );
        return r.json() as Promise<unknown>;
      };
      const [dataset, result] = await Promise.all([
        read("dataset"),
        read("factors"),
      ]);
      if (
        !isDataset(dataset) ||
        dataset.dataset_id !== "manufacturing" ||
        !validFactors(result) ||
        !dataset.series?.some((s) => s.series_id === result.series_id) ||
        result.factors.some((f) => !dataset.factor_columns.includes(f.factor))
      )
        throw new Error(
          "The saved driver example does not match the dataset and driver contract.",
        );
      return { dataset, result };
    },
    staleTime: Infinity,
  });
  if (query.isPending)
    return (
      <section className="route-state" role="status">
        <h1>Opening the driver example…</h1>
        <p>No backend or model run is needed.</p>
      </section>
    );
  if (query.isError)
    return (
      <section className="route-state" role="alert">
        <h1>driver example unavailable</h1>
        <p>{query.error.message}</p>
        <Button onClick={() => query.refetch()}>Retry example</Button>
      </section>
    );
  return (
    <div className="health-page">
      <p className="eyebrow">DRIVERS · PRECOMPUTED CEMENT DEMO</p>
      <h1 className="forecast-title">Drivers</h1>
      <p>{query.data.dataset.name}</p>
      <p className="demo-notice">
        Saved cement driver checks · no new model run.
      </p>
      <FactorResults
        result={query.data.result}
        country={query.data.dataset.holiday_country}
      />
    </div>
  );
}
export function FactorWorkspace({
  id,
  initialJob,
}: {
  id: string;
  initialJob?: string;
}) {
  const query = useQuery({
    queryKey: ["data-health", "api", id],
    queryFn: ({ signal }) => loadHealth(id, "api", signal),
  });
  if (query.isPending)
    return (
      <section className="route-state" role="status">
        <h1>Loading driver inputs…</h1>
        <p>Reading the available item and driver columns.</p>
      </section>
    );
  if (query.isError)
    return (
      <section className="route-state" role="alert">
        <h1>driver inputs unavailable</h1>
        <p>{query.error.message}</p>
        <Button onClick={() => query.refetch()}>Retry inputs</Button>
      </section>
    );
  return (
    <FactorRunner
      key={id}
      id={id}
      dataset={query.data}
      initialJob={initialJob}
    />
  );
}
function FactorRunner({
  id,
  dataset,
  initialJob,
}: {
  id: string;
  dataset: Dataset;
  initialJob?: string;
}) {
  const [series, setSeries] = useState(""),
    [factors, setFactors] = useState<string[]>([]),
    [horizon, setHorizon] = useState("28"),
    [lag, setLag] = useState("3");
  const [jobId, setJobId] = useState(initialJob || ""),
    [paused, setPaused] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [error, setError] = useState("");
  const [requested, setRequested] = useState<{
    series: string;
    factors: string[];
  }>();
  const controller = useRef<AbortController | null>(null);
  const client = useQueryClient();
  useEffect(() => () => controller.current?.abort(), []);
  const job = useQuery({
    queryKey: ["factor-job", jobId],
    queryFn: ({ signal }) => getFactorJob(jobId, signal),
    enabled: !!jobId && !paused,
    refetchInterval: (q) =>
      q.state.error ||
      !q.state.data ||
      ["succeeded", "failed"].includes(q.state.data.status)
        ? false
        : 1000,
  });
  const active =
    submitting ||
    (!!jobId &&
      !job.isError &&
      (!job.data || ["queued", "running"].includes(job.data.status)));
  const available = [...new Set(dataset.factor_columns)];
  const invalid = !dataset.health.ready
    ? "No item are ready. Review data health first."
    : !available.length
      ? "This dataset has no driver columns. Upload numeric driver history and select the columns during mapping."
      : !dataset.series?.some(
            (s) => s.series_id === series && s.status !== "excluded",
          )
        ? "Choose one eligible item."
        : !factors.length || factors.length > 10
          ? "Select 1–10 drivers."
          : !Number.isInteger(Number(horizon)) ||
              Number(horizon) < 1 ||
              Number(horizon) > 64
            ? "Backtest horizon must be a whole number from 1 to 64."
            : !lag.trim() ||
                !Number.isSafeInteger(Number(lag)) ||
                Number(lag) < 0
              ? "Maximum lag must be a non-negative whole number."
              : "";
  const result =
    job.data?.status === "succeeded" && validFactors(job.data.result)
      ? job.data.result
      : undefined;
  const mismatch =
    !!result &&
    !!requested &&
    (result.series_id !== requested.series ||
      result.factors.length !== requested.factors.length ||
      result.factors.some((f) => !requested.factors.includes(f.factor)));
  async function run() {
    if (invalid || active) return;
    setSubmitting(true);
    setError("");
    controller.current = new AbortController();
    const signal = controller.current.signal;
    const snapshot = { series, factors: [...factors] };
    try {
      const ref = await submitFactors(
        {
          dataset_id: id,
          series_id: series,
          factors: snapshot.factors,
          horizon: Number(horizon),
          max_lag: Number(lag),
        },
        signal,
      );
      if (signal.aborted) return;
      setRequested(snapshot);
      setJobId(ref.job_id);
      setPaused(false);
      const url = new URL(window.location.href);
      url.searchParams.set("job", ref.job_id);
      window.history.replaceState(null, "", url);
      await client.invalidateQueries({ queryKey: ["factor-job", ref.job_id] });
    } catch (e) {
      if (!signal.aborted)
        setError(
          (e instanceof Error ? e.message : "Drivers submission failed.") +
            " The request may have reached the server. Check before submitting again.",
        );
    } finally {
      if (!signal.aborted) setSubmitting(false);
    }
  }
  return (
    <div className="health-page">
      <p className="eyebrow">DRIVERS · HISTORICAL VALUES ONLY</p>
      <h1 className="forecast-title">Drivers</h1>
      <p>
        Check a statistical relationship and forecast usefulness separately.
      </p>
      <Link
        className="text-link"
        href={`/data-health/${encodeURIComponent(id)}`}
      >
        Review data health →
      </Link>
      <section className="forecast-parameters" aria-label="Drivers parameters">
        <fieldset disabled={active}>
          <legend className="sr-only">Choose one item and up to ten drivers</legend>
          <div className="zc-form-grid">
            <Select
              label="Item"
              placeholder="Choose an item…"
              options={seriesOptions(dataset.series)}
              value={series}
              onChange={setSeries}
              disabled={active}
            />
            <MultiSelect
              label="Drivers"
              placeholder="Choose drivers…"
              options={available.map((f) => ({ value: f }))}
              value={factors}
              onChange={setFactors}
              max={10}
              disabled={active}
              emptyText="No driver columns in this dataset"
            />
            <NumberField
              label="Backtest horizon"
              value={horizon}
              onChange={setHorizon}
              min={1}
              max={64}
              unit={horizonUnit(dataset.frequency)}
              presets={horizonPresets(dataset.frequency, 64)}
              disabled={active}
            />
            <NumberField
              label="Maximum lag"
              value={lag}
              onChange={setLag}
              min={0}
              max={52}
              unit={horizonUnit(dataset.frequency)}
              disabled={active}
            />
          </div>
          <Button onClick={run} disabled={!!invalid || active}>
            {submitting ? "Submitting…" : "Run driver check"}
          </Button>
        </fieldset>
        <p className="health-note">
          {invalid ||
            "Ready to check. The backtest compares sales-only with one driver at a time."}
        </p>
        <p className="health-note">
          Sales-only remains the default. Historical drivers cannot describe the
          effect of future promotions or planned changes.
        </p>
      </section>
      {error && (
        <p role="alert" className="health-table-empty">
          {error}
        </p>
      )}
      {!jobId && !submitting && (
        <section className="forecast-empty">
          <h2>Start with two separate questions.</h2>
        </section>
      )}
      {jobId && (
        <section className="forecast-job" aria-label="driver job">
          <p>driver job: {jobId}</p>
          {job.isError ? (
            <div role="alert">
              <h2>driver status unavailable</h2>
              <p>{job.error.message}</p>
              <Button
                onClick={() => {
                  setPaused(false);
                  job.refetch();
                }}
              >
                Retry driver status
              </Button>
            </div>
          ) : (
            <>
              <p role="status">
                {paused
                  ? "Polling paused"
                  : job.data?.status || "Loading driver status…"}
                {job.data?.message ? ` · ${job.data.message}` : ""}
              </p>
              {job.data && (
                <>
                  <label htmlFor="factor-progress">
                    Progress: {job.data.progress}%
                  </label>
                  <progress
                    id="factor-progress"
                    max="100"
                    value={job.data.progress}
                  />
                </>
              )}
              {active && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (paused) {
                      setPaused(false);
                      job.refetch();
                    } else {
                      setPaused(true);
                      client.cancelQueries({ queryKey: ["factor-job", jobId] });
                    }
                  }}
                >
                  {paused ? "Resume driver polling" : "Pause driver polling"}
                </Button>
              )}
              <p className="health-note">
                Pausing stops status checks, not the server job. Reload this URL
                to resume the same job.
              </p>
            </>
          )}
          {job.data?.status === "failed" && (
            <div role="alert">
              <h2>Drivers failed</h2>
              <p>
                {job.data.error?.message ||
                  "No failure reason was supplied. Review the inputs and run again."}
              </p>
            </div>
          )}
        </section>
      )}
      {mismatch && (
        <p role="alert">
          The returned item or drivers do not match this request. Results are
          hidden.
        </p>
      )}
      {result && !mismatch && (
        <>
          <p className="health-note">
            Results belong to job {jobId}. Changed settings apply when you run
            another check.
          </p>
          <FactorResults
            key={jobId}
            result={result}
            country={dataset.holiday_country}
          />
        </>
      )}
    </div>
  );
}
