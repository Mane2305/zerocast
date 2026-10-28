"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { isDataset, loadHealth, type Dataset } from "@/lib/data-health";
import { submitReview, getReviewJob } from "@/lib/api/review";
import { validReview } from "@/lib/review";
import { ReviewResults } from "./review-results";
import { findDemo } from "@/lib/demos";
export function ReviewDemo({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["review-demo", id],
    queryFn: async ({ signal }) => {
      const read = async (file: string) => {
        const r = await fetch(`/demo/${encodeURIComponent(id)}/${file}.json`, {
          signal,
        });
        if (!r.ok)
          throw new Error(`Saved ${file} file unavailable (HTTP ${r.status}).`);
        return r.json() as Promise<unknown>;
      };
      const [dataset, review] = await Promise.all([
        read("dataset"),
        read("review"),
      ]);
      if (
        !isDataset(dataset) ||
        dataset.dataset_id !== id ||
        !validReview(review)
      )
        throw new Error(
          "The saved review does not match the dataset and review contract.",
        );
      return { dataset, review };
    },
    staleTime: Infinity,
  });
  if (query.isPending)
    return (
      <section className="route-state" role="status">
        <h1>Opening your saved review…</h1>
        <p>No backend or model run is needed.</p>
      </section>
    );
  if (query.isError)
    return (
      <section className="route-state" role="alert">
        <h1>Review demo unavailable</h1>
        <p>{query.error.message}</p>
        <Button onClick={() => query.refetch()}>Retry demo</Button>
      </section>
    );
  return (
    <div className="health-page">
      <p className="eyebrow">
        EXCEPTIONS ·{" "}
        {findDemo(id)?.synthetic ? "SYNTHETIC DEMO" : "PRECOMPUTED REVIEW"}
      </p>
      <h1 className="forecast-title">Exceptions</h1>
      <p>{query.data.dataset.name}</p>
      <ReviewResults
        id={id}
        review={query.data.review}
        frequency={query.data.dataset.frequency}
        country={query.data.dataset.holiday_country}
        synthetic={findDemo(id)?.synthetic}
        readOnly
      />
    </div>
  );
}
export function ReviewWorkspace({
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
        <h1>Loading review inputs…</h1>
        <p>Reading the dataset and available item.</p>
      </section>
    );
  if (query.isError)
    return (
      <section className="route-state" role="alert">
        <h1>Review inputs unavailable</h1>
        <p>{query.error.message}</p>
        <Button onClick={() => query.refetch()}>Retry inputs</Button>
      </section>
    );
  return (
    <ReviewRunner
      key={id}
      dataset={query.data}
      id={id}
      initialJob={initialJob}
    />
  );
}
function ReviewRunner({
  dataset,
  id,
  initialJob,
}: {
  dataset: Dataset;
  id: string;
  initialJob?: string;
}) {
  const [picked, setPicked] = useState<string[]>([]),
    [lookback, setLookback] = useState(""),
    [step, setStep] = useState("");
  const [jobId, setJobId] = useState(initialJob || ""),
    [paused, setPaused] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [error, setError] = useState("");
  const [requested, setRequested] = useState<string[]>();
  const controller = useRef<AbortController | null>(null);
  const client = useQueryClient();
  useEffect(() => () => controller.current?.abort(), []);
  const job = useQuery({
    queryKey: ["review-job", jobId],
    queryFn: ({ signal }) => getReviewJob(jobId, signal),
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
  const optionalInteger = (v: string) =>
    !v || (Number.isSafeInteger(Number(v)) && Number(v) > 0);
  const invalid = !dataset.health.ready
    ? "No item are ready for review. Check data health first."
    : !picked.length
      ? "Select at least one item."
      : picked.length > 20
        ? "Select at most 20 item."
        : !optionalInteger(lookback) || !optionalInteger(step)
          ? "Lookback and origin spacing must be positive whole numbers, or blank for defaults."
          : "";
  const result =
    job.data?.status === "succeeded" && validReview(job.data.result)
      ? job.data.result
      : undefined;
  const mismatch =
    !!result &&
    !!requested &&
    (result.series.length !== requested.length ||
      result.series.some((s) => !requested.includes(s.series_id)));
  async function run() {
    if (invalid || active) return;
    setSubmitting(true);
    setError("");
    controller.current = new AbortController();
    const signal = controller.current.signal;
    const ids = [...picked];
    try {
      const ref = await submitReview(
        {
          dataset_id: id,
          series_ids: ids,
          top_n: 5,
          ...(lookback ? { lookback_periods: Number(lookback) } : {}),
          ...(step ? { step: Number(step) } : {}),
        },
        signal,
      );
      if (signal.aborted) return;
      setRequested(ids);
      setPaused(false);
      setJobId(ref.job_id);
      try {
        sessionStorage.setItem(`zerocast-review:${id}`, ref.job_id);
      } catch {
        /* Storage is optional; review execution still works. */
      }
      const url = new URL(window.location.href);
      url.searchParams.set("job", ref.job_id);
      window.history.replaceState(null, "", url);
      await client.invalidateQueries({ queryKey: ["review-job", ref.job_id] });
    } catch (e) {
      if (!signal.aborted)
        setError(
          (e instanceof Error ? e.message : "Review submission failed.") +
            " The request may have reached the server. Check before submitting again.",
        );
    } finally {
      if (!signal.aborted) setSubmitting(false);
    }
  }
  return (
    <div className="health-page">
      <p className="eyebrow">EXCEPTIONS · HISTORICAL REPLAY</p>
      <h1 className="forecast-title">Exceptions</h1>
      <p>{dataset.name}</p>
      <Link
        className="text-link"
        href={`/data-health/${encodeURIComponent(id)}`}
      >
        Review data health →
      </Link>
      <p className="health-note">
        Holiday calendar:{" "}
        {dataset.holiday_country || "not selected for this dataset"}. Calendar
        matches come from the review service.
      </p>
      <section className="forecast-parameters" aria-label="Review parameters">
        <fieldset disabled={active}>
          <legend>item · {picked.length}/20 selected</legend>
          <div className="forecast-series-picker">
            {dataset.series?.map((s) => (
              <label key={s.series_id}>
                <input
                  type="checkbox"
                  checked={picked.includes(s.series_id)}
                  disabled={
                    s.status === "excluded" ||
                    (!picked.includes(s.series_id) && picked.length >= 20)
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
          {!dataset.series?.length && <p>No item summaries were supplied.</p>}
          <div className="forecast-controls">
            <label>
              Lookback periods (optional)
              <input
                aria-label="Lookback periods"
                type="number"
                min="1"
                step="1"
                value={lookback}
                onChange={(e) => setLookback(e.target.value)}
                placeholder="Source default: about 12 months"
              />
            </label>
            <label>
              Origin spacing (optional)
              <input
                aria-label="Origin spacing"
                type="number"
                min="1"
                step="1"
                value={step}
                onChange={(e) => setStep(e.target.value)}
                placeholder="Use source default"
              />
            </label>
            <Button onClick={run} disabled={!!invalid || active}>
              {submitting ? "Submitting…" : "Run review"}
            </Button>
          </div>
        </fieldset>
        <p className="health-note">
          {invalid ||
            "Ready to replay. Up to five positive exceptions and five demand drops per item."}{" "}
          Replay can take longer than a single forecast.
        </p>
      </section>
      {error && (
        <p role="alert" className="health-table-empty">
          {error}
        </p>
      )}
      {!jobId && !submitting && (
        <section className="forecast-empty">
          <h2>Look back with perspective.</h2>
        </section>
      )}
      {jobId && (
        <section className="forecast-job" aria-label="Review job">
          <p>Review job: {jobId}</p>
          {job.isError ? (
            <div role="alert">
              <h2>Review status unavailable</h2>
              <p>{job.error.message}</p>
              <Button
                onClick={() => {
                  setPaused(false);
                  job.refetch();
                }}
              >
                Retry review status
              </Button>
            </div>
          ) : (
            <>
              <p role="status">
                {paused
                  ? "Polling paused"
                  : job.data?.status || "Loading review status…"}
                {job.data?.message ? ` · ${job.data.message}` : ""}
              </p>
              {job.data && (
                <>
                  <label htmlFor="review-progress">
                    Progress: {job.data.progress}%
                  </label>
                  <progress
                    id="review-progress"
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
                      client.cancelQueries({ queryKey: ["review-job", jobId] });
                    }
                  }}
                >
                  {paused ? "Resume review polling" : "Pause review polling"}
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
              <h2>Review failed</h2>
              <p>
                {job.data.error?.message ||
                  "No failure reason was supplied. Review inputs and run again."}
              </p>
            </div>
          )}
        </section>
      )}
      {mismatch && (
        <p role="alert">
          The returned item do not match this review request. Results are
          hidden.
        </p>
      )}
      {result && !mismatch && (
        <>
          <p className="health-note">
            Results belong to job {jobId}. Changed replay options apply to the
            next run.
          </p>
          <ReviewResults
            key={jobId}
            review={result}
            frequency={dataset.frequency}
            id={id}
            country={dataset.holiday_country}
          />
        </>
      )}
    </div>
  );
}
