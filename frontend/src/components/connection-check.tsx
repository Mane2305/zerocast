"use client";
import { Hint } from "@/components/ui/feedback";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, LoaderCircle, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiConfigured, getHealth } from "@/lib/api/client";
export function ConnectionCheck() {
  const health = useQuery({
    queryKey: ["connection-check-health"],
    queryFn: ({ signal }) => getHealth(signal),
    enabled: false,
  });
  const unreachable = health.error instanceof TypeError;
  if (!apiConfigured)
    return (
      <Hint role="status">
        Demo mode · upload needs the backend. Saved datasets work without the
        API.
      </Hint>
    );
  return (
    <div className="connection">
      <div className="connection-heading">
        <PlugZap size={18} />
        <h3>Connection check</h3>
      </div>
      <p>Check the configured API before connecting your data.</p>
      <Button
        variant="outline"
        onClick={() => health.refetch()}
        disabled={health.isFetching}
      >
        {health.isFetching ? (
          <LoaderCircle className="animate-spin" size={16} />
        ) : (
          <ArrowRight size={16} />
        )}{" "}
        {health.isFetching
          ? "Connecting · cold start may take 20–40 s"
          : "Check connection"}
      </Button>
      <div aria-live="polite" className="connection-result">
        {health.isFetching ? (
          <p role="status">Waiting for the API response…</p>
        ) : health.isError ? (
          <div role="alert" className="error-text">
            <strong>
              {unreachable ? "Backend unreachable" : "Connection check failed"}
            </strong>
            <p>
              {unreachable
                ? "Start the backend at the configured API URL, then check the connection again."
                : health.error.message}
            </p>
          </div>
        ) : health.data ? (
          <p>
            <strong>
              {health.data.status === "ok"
                ? "API reachable"
                : "API reports degraded status"}
            </strong>
            <br />
            {health.data.model_loaded === true
              ? "API reports the model is loaded."
              : "API reports the model is not loaded."}
            <br />
            <span>Reported by {process.env.NEXT_PUBLIC_API_URL}/health.</span>
          </p>
        ) : (
          <p>Not checked yet. No forecast has been run.</p>
        )}
      </div>
    </div>
  );
}
