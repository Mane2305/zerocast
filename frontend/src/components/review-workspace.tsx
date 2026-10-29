"use client";
import { Sparkles } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/layout";
import { RouteState } from "@/components/ui/route-state";
import { Callout, Hint } from "@/components/ui/feedback";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { JobStatus } from "@/components/ui/job-status";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import { defaultItems, seriesOptions } from "@/lib/pickers";
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
      <RouteState kind="loading">
        <h1>Opening your saved review…</h1>
        <p>No backend or model run is needed.</p>
      </RouteState>
    );
  if (query.isError)
    return (
      <RouteState kind="error">
        <h1>Review demo unavailable</h1>
        <p>{query.error.message}</p>
        <Button onClick={() => query.refetch()}>Retry demo</Button>
      </RouteState>
    );
  return (
    <div className="health-page">
      <PageHeader
        eyebrow={
          <>
            EXCEPTIONS ·{" "}
            {findDemo(id)?.synthetic ? "SYNTHETIC DEMO" : "PRECOMPUTED REVIEW"}
          </>
        }
        title={<>Exceptions</>}
        description={query.data.dataset.name}
      />
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
      <RouteState kind="loading">
        <h1>Loading review inputs…</h1>
        <p>Reading the dataset and available item.</p>
      </RouteState>
    );
  if (query.isError)
    return (
      <RouteState kind="error">
        <h1>Review inputs unavailable</h1>
        <p>{query.error.message}</p>
        <Button onClick={() => query.refetch()}>Retry inputs</Button>
      </RouteState>
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
  const [picked, setPicked] = useState<string[]>(() =>
    defaultItems(dataset.series),
  ),
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
      <PageHeader
        eyebrow="Exceptions · Historical Replay"
        title={<>Exceptions</>}
        description={dataset.name}
      />
      <Link
        className="text-link"
        href={`/data-health/${encodeURIComponent(id)}`}
      >
        Review data health →
      </Link>
      <Hint>
        Holiday calendar:{" "}
        {dataset.holiday_country || "not selected for this dataset"}. Calendar
        matches come from the review service.
      </Hint>
      <section className="forecast-parameters" aria-label="Review parameters">
        <fieldset disabled={active}>
          <legend className="sr-only">Items to review</legend>
          <MultiSelect
            label="Items to review"
            placeholder="Choose items…"
            options={seriesOptions(dataset.series)}
            value={picked}
            onChange={setPicked}
            max={20}
            disabled={active}
          />
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
                placeholder="Default (≈12 months)"
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
                placeholder="Default"
              />
            </label>
            <Button onClick={run} disabled={!!invalid || active}>
              {submitting ? "Submitting…" : "Run review"}
            </Button>
          </div>
        </fieldset>
        <Hint>
          {invalid ||
            "Ready to replay. Up to five positive exceptions and five demand drops per item."}{" "}
          Replay can take longer than a single forecast.
        </Hint>
      </section>
      {error && (
        <Callout tone="neutral" role="alert">
          {error}
        </Callout>
      )}
      {!jobId && !submitting && (
        <EmptyState icon={Sparkles} title={<>Look back with perspective.</>} />
      )}
      {jobId && (
        <JobStatus
          jobId={jobId}
          noun="exceptions review"
          job={job.data}
          readError={job.isError ? job.error.message : undefined}
          onRetry={() => {
            setPaused(false);
            job.refetch();
          }}
        />
      )}
      {mismatch && (
        <p role="alert">
          The returned item do not match this review request. Results are
          hidden.
        </p>
      )}
      {result && !mismatch && (
        <>
          <Hint>
            Showing your last run. Changed replay options apply to the
            next run.
          </Hint>
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
