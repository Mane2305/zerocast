import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";

type Job = {
  status: string;
  progress: number;
  message?: string | null;
  error?: { message: string } | null;
};

/**
 * One status line for a model job: what is happening, how far along, and a
 * plain retry when something goes wrong. Job IDs stay out of the UI (they are
 * in the URL and the element's title for support).
 */
export function JobStatus({
  jobId,
  noun,
  job,
  readError,
  onRetry,
}: {
  jobId: string;
  /** What the job produces, e.g. "forecast", "accuracy backtest". */
  noun: string;
  job?: Job;
  readError?: string;
  onRetry: () => void;
}) {
  if (readError)
    return (
      <Callout
        tone="danger"
        title={`Couldn’t check the ${noun}`}
        actions={
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        }
      >
        {readError}
      </Callout>
    );
  if (job?.status === "failed")
    return (
      <Callout tone="danger" title={`The ${noun} didn’t finish`}>
        {job.error?.message ||
          "The server gave no reason. Check the inputs and run again."}
      </Callout>
    );
  if (job?.status === "succeeded")
    return (
      <p className="zc-job zc-job-done" role="status" title={`Job ${jobId}`}>
        <CheckCircle2 size={15} aria-hidden />
        {noun.charAt(0).toUpperCase() + noun.slice(1)} ready
      </p>
    );
  const progress = job?.progress ?? 0;
  return (
    <div className="zc-job" role="status" title={`Job ${jobId}`}>
      <div className="zc-job-line">
        <Loader2 size={15} className="zc-spin" aria-hidden />
        <span>
          {job?.status === "queued"
            ? `Waiting to start the ${noun}…`
            : `Running the ${noun}…`}
        </span>
        <span className="zc-job-pct">{progress}%</span>
      </div>
      <div
        className="zc-job-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label={`${noun} progress`}
      >
        <span style={{ width: `${Math.max(progress, 4)}%` }} />
      </div>
      {job?.message && <p className="zc-job-msg">{job.message}</p>}
    </div>
  );
}
