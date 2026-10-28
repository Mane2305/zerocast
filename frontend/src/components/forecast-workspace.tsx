"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { loadHealth, type Dataset } from "@/lib/data-health";
import { api } from "@/lib/api/client";
import { submitForecast, getForecastJob, getHistory } from "@/lib/api/forecast";
import { validForecast, type Forecast } from "@/lib/forecast";
import { ForecastResults } from "./forecast-results";
import { averagePerPeriod } from "@/lib/numbers";
import { findDemo } from "@/lib/demos";
import { getReviewJob } from "@/lib/api/review";
import { validReview } from "@/lib/review";
import { useDatasetPreferences } from "@/lib/preferences";
import { getAccuracyJob } from "@/lib/api/accuracy";
import { validAccuracy } from "@/lib/accuracy";
export function ForecastWorkspace({
  id,
  initialJob,
  initialSeries,
}: {
  id: string;
  initialJob?: string;
  initialSeries?: string;
}) {
  const query = useQuery({
    queryKey: ["data-health", "api", id],
    queryFn: ({ signal }) => loadHealth(id, "api", signal),
  });
  if (query.isPending)
    return (
      <section className="route-state" role="status">
        <h1>Loading forecast inputs…</h1>
        <p>Reading dataset readiness and available item.</p>
      </section>
    );
  if (query.isError)
    return (
      <section className="route-state" role="alert">
        <h1>Forecast inputs unavailable</h1>
        <p>{query.error.message}</p>
        <Button onClick={() => query.refetch()}>Retry inputs</Button>
      </section>
    );
  return (
    <ForecastRunner
      key={id}
      dataset={query.data}
      id={id}
      initialJob={initialJob}
      initialSeries={initialSeries}
    />
  );
}
function ForecastRunner({
  dataset,
  id,
  initialJob,
  initialSeries,
}: {
  dataset: Dataset;
  id: string;
  initialJob?: string;
  initialSeries?: string;
}) {
  const preferences = useDatasetPreferences(id);
  const picked = (preferences.picked || []).filter((item) =>
    dataset.series?.some(
      (s) => s.series_id === item && s.status !== "excluded",
    ),
  );
  const setPicked = (items: string[]) => preferences.update({ picked: items });
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
  const level = preferences.level ?? 80;
  const setLevel = (value: number) => preferences.update({ level: value });
  const [jobId, setJobId] = useState(initialJob || "");
  const [paused, setPaused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [selectedInput, setSelectedInput] = useState(initialSeries);
  const selected = selectedInput || preferences.selected || "";
  const setSelected = (value: string) => {
    setSelectedInput(value);
    preferences.update({ selected: value });
  };
  const [reviewJob] = useState(() => {
    try {
      return typeof window === "undefined"
        ? ""
        : sessionStorage.getItem(`zerocast-review:${id}`) || "";
    } catch {
      return "";
    }
  });
  const [request, setRequest] = useState<{ ids: string[]; horizon: number }>();
  const controller = useRef<AbortController | null>(null);
  const client = useQueryClient();
  useEffect(() => () => controller.current?.abort(), []);
  const job = useQuery({
    queryKey: ["forecast-job", jobId],
    queryFn: ({ signal }) => getForecastJob(jobId, signal),
    enabled: !!jobId && !paused,
    refetchInterval: (q) =>
      q.state.error ||
      !q.state.data ||
      ["succeeded", "failed"].includes(q.state.data.status)
        ? false
        : 1000,
  });
  const result =
    job.data?.status === "succeeded" && validForecast(job.data.result)
      ? job.data.result
      : undefined;
  const mismatch =
    !!result &&
    !!request &&
    (result.series.length !== request.ids.length ||
      result.series.some(
        (s) =>
          !request.ids.includes(s.series_id) ||
          s.dates.length !== request.horizon,
      ));
  const active =
    submitting ||
    (!!jobId &&
      !job.isError &&
      (!job.data || ["queued", "running"].includes(job.data.status)));
  const current =
    result?.series.find((s) => s.series_id === selected)?.series_id ??
    result?.series[0]?.series_id;
  const history = useQuery({
    queryKey: ["series-history", id, current],
    queryFn: ({ signal }) => getHistory(id, current!, signal),
    enabled: !!current && !mismatch,
  });
  const review = useQuery({
    queryKey: ["forecast-review", id, reviewJob],
    queryFn: ({ signal }) => getReviewJob(reviewJob, signal),
    enabled: !!reviewJob && !!current,
    refetchInterval: (query) =>
      query.state.data &&
      ["queued", "running"].includes(query.state.data.status)
        ? 1500
        : false,
  });
  const matchedReview =
    review.data?.status === "succeeded" && validReview(review.data.result)
      ? review.data.result.series.find((item) => item.series_id === current)
      : undefined;
  const accuracy = useQuery({
    queryKey: ["accuracy-job", preferences.accuracyJob || ""],
    queryFn: ({ signal }) => getAccuracyJob(preferences.accuracyJob!, signal),
    enabled: !!preferences.accuracyJob && !!current && !mismatch,
    refetchInterval: (query) =>
      query.state.data &&
      ["queued", "running"].includes(query.state.data.status)
        ? 1500
        : false,
  });
  const matchedAccuracy =
    accuracy.data?.status === "succeeded" &&
    validAccuracy(accuracy.data.result) &&
    accuracy.data.result.horizon ===
      result?.series.find((item) => item.series_id === current)?.dates.length &&
    accuracy.data.result.series.some((item) => item.series_id === current)
      ? accuracy.data.result
      : undefined;
  const model = useQuery({
    queryKey: ["forecast-model-info"],
    queryFn: async ({ signal }) => {
      const r = await api.GET("/model/info", { signal });
      if (!r.response.ok) throw new Error("Model details unavailable");
      return r.data ?? null;
    },
    enabled: !!jobId,
    staleTime: 60000,
  });
  const invalid = !dataset.health.ready
    ? "No item are ready to forecast. Review data health first."
    : !picked.length
      ? "Select at least one item."
      : picked.length > 100
        ? "Choose at most 100 item."
        : !Number.isInteger(Number(horizon)) ||
            Number(horizon) < 1 ||
            Number(horizon) > 256
          ? "Horizon must be a whole number from 1 to 256."
          : "";
  async function run() {
    if (invalid || active) return;
    setSubmitting(true);
    setSubmitError("");
    controller.current = new AbortController();
    const signal = controller.current.signal;
    const snapshot = { ids: [...picked], horizon: Number(horizon) };
    try {
      const ref = await submitForecast(
        {
          dataset_id: id,
          series_ids: snapshot.ids,
          horizon: snapshot.horizon,
          seed: 0,
          return_paths: 30,
        },
        signal,
      );
      if (signal.aborted) return;
      setRequest(snapshot);
      setSelected(snapshot.ids[0]);
      setPaused(false);
      setJobId(ref.job_id);
      preferences.update({ job: ref.job_id });
      const url = new URL(window.location.href);
      url.searchParams.set("job", ref.job_id);
      window.history.replaceState(null, "", url);
      await client.invalidateQueries({
        queryKey: ["forecast-job", ref.job_id],
      });
    } catch (e) {
      if (!signal.aborted)
        setSubmitError(
          (e instanceof Error ? e.message : "Request failed.") +
            " The request may have reached the server. Check before submitting again.",
        );
    } finally {
      if (!signal.aborted) setSubmitting(false);
    }
  }
  const parameters = (
    <aside className="planning-panel api-planning-panel">
      {" "}
      <details className="forecast-input-panel" open>
        <summary>
          {result ? "Change forecast inputs" : "Forecast inputs"}
        </summary>
        <section
          className="forecast-parameters"
          aria-label="Forecast parameters"
        >
          <fieldset disabled={active}>
            <legend>item · {picked.length}/100 selected</legend>
            <div className="forecast-series-picker">
              {dataset.series?.map((s) => (
                <label key={s.series_id}>
                  <input
                    type="checkbox"
                    checked={picked.includes(s.series_id)}
                    disabled={
                      s.status === "excluded" ||
                      (!picked.includes(s.series_id) && picked.length >= 100)
                    }
                    onChange={(e) =>
                      setPicked(
                        e.target.checked
                          ? [...picked, s.series_id]
                          : picked.filter((v) => v !== s.series_id),
                      )
                    }
                  />
                  {s.series_id}
                  <small>{s.status}</small>
                </label>
              ))}
            </div>
            {!dataset.series?.length && (
              <p>
                No item summaries are available. Selection requires the API’s
                item list.
              </p>
            )}
          </fieldset>
          <div className="forecast-controls">
            <label>
              Forecast horizon (periods)
              <input
                aria-label="Forecast horizon (periods)"
                type="number"
                min="1"
                max="256"
                step="1"
                value={horizon}
                disabled={active}
                onChange={(e) => setHorizon(e.target.value)}
              />
            </label>
            <label>
              Service level: {level}%
              <input
                aria-label="Initial service level"
                type="range"
                min="50"
                max="90"
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
              />
            </label>
            <Button onClick={run} disabled={!!invalid || active}>
              {submitting ? "Submitting…" : "Run forecast"}
            </Button>
          </div>
          <p className="health-note">
            {invalid ||
              "Ready to run. Maximum 256 periods and 100 item. drivers are not used."}
          </p>
        </section>
        {submitError && (
          <div role="alert" className="health-table-empty">
            {submitError}
          </div>
        )}
        {!jobId && !submitting && (
          <section className="forecast-empty">
            <h2>Your forecast starts here.</h2>
          </section>
        )}
        {jobId && (
          <section className="forecast-job" aria-label="Forecast job">
            <p>Job: {jobId}</p>
            {job.isError ? (
              <div role="alert">
                <h2>Could not read the forecast job</h2>
                <p>{job.error.message}</p>
                <Button
                  onClick={() => {
                    setPaused(false);
                    job.refetch();
                  }}
                >
                  Retry job status
                </Button>
              </div>
            ) : (
              <>
                <p role="status">
                  {paused
                    ? "Polling paused"
                    : (job.data?.status ?? "Loading job status…")}
                  {job.data?.message ? ` · ${job.data.message}` : ""}
                </p>
                {job.data && (
                  <>
                    <label htmlFor="forecast-progress">
                      Progress: {job.data.progress}%
                    </label>
                    <progress
                      id="forecast-progress"
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
                        client.cancelQueries({
                          queryKey: ["forecast-job", jobId],
                        });
                      }
                    }}
                  >
                    {paused ? "Resume polling" : "Pause polling"}
                  </Button>
                )}
                <p className="health-note">
                  Pausing stops status checks, not the server job. This URL
                  retains the job ID for reload.
                </p>
              </>
            )}
            {job.data?.status === "failed" && (
              <div role="alert">
                <h2>Forecast failed</h2>
                <p>
                  {job.data.error?.message ||
                    "The server did not provide a reason. Review the inputs and run again."}
                </p>
              </div>
            )}
          </section>
        )}
        {mismatch && (
          <div role="alert" className="health-table-empty">
            The returned item or horizon does not match the submitted request.
            Results are hidden to avoid showing the wrong forecast.
          </div>
        )}
      </details>
    </aside>
  );
  return (
    <div className="health-page forecast-workspace">
      <p className="eyebrow">FORECAST · SALES HISTORY ONLY</p>
      <h1 className="forecast-title">Forecast</h1>
      <p>{dataset.name}</p>
      <Link
        className="text-link"
        href={`/data-health/${encodeURIComponent(id)}`}
      >
        Review data health
      </Link>
      {result && !mismatch && (
        <>
          <Button asChild variant="outline">
            <Link
              href={`/portfolio/dataset/${encodeURIComponent(id)}?${new URLSearchParams({ job: jobId })}`}
            >
              View portfolio risk
            </Link>
          </Button>
          <p className="health-note">
            Results belong to job {jobId}. Changes to item or horizon apply when
            you click Run forecast again.
          </p>
          <ForecastResults
            parameters={parameters}
            forecast={result as Forecast}
            accuracy={matchedAccuracy}
            frequency={dataset.frequency}
            history={history.data}
            review={matchedReview}
            reviewNote={
              matchedAccuracy
                ? undefined
                : !reviewJob
                  ? "Run Exceptions for this dataset to measure historical coverage. No review is started automatically."
                  : review.isError
                    ? review.error.message
                    : !matchedReview
                      ? "The matched review has not supplied results for this item yet."
                      : undefined
            }
            historyNote={
              history.isPending
                ? "Loading history…"
                : history.isError
                  ? history.error.message
                  : undefined
            }
            country={dataset.holiday_country}
            unit={dataset.unit || findDemo(dataset.dataset_id)?.unit}
            average={averagePerPeriod(dataset)}
            device={
              typeof model.data?.device === "string"
                ? model.data.device
                : undefined
            }
            level={level}
            setLevel={setLevel}
            selected={current || ""}
            setSelected={setSelected}
          />
          {history.isError && (
            <Button variant="outline" onClick={() => history.refetch()}>
              Retry history
            </Button>
          )}
        </>
      )}
      {(!result || mismatch) && parameters}
    </div>
  );
}
