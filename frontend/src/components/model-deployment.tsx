"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { loadModelInfo, loadModelHealth } from "@/lib/api/model-info";
import { latencyState, phaseQuantiles } from "@/lib/model-info";
import { parameterFormatter } from "@/lib/numbers";
export function ModelDeployment() {
  const info = useQuery({
    queryKey: ["deployment-model-info"],
    queryFn: ({ signal }) => loadModelInfo(signal),
    staleTime: 0,
  });
  const health = useQuery({
    queryKey: ["deployment-model-health"],
    queryFn: ({ signal }) => loadModelHealth(signal),
    staleTime: 0,
  });
  const number = (v: number) =>
    new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(v);
  const data = info.data;
  const stats = data ? latencyState(data) : undefined;
  return (
    <section className="model-deployment" aria-labelledby="deployment-heading">
      <div className="health-section-heading">
        <div>
          <p className="eyebrow">CURRENT API REPORT</p>
          <h2 id="deployment-heading">This deployment</h2>
        </div>
        <Button
          variant="outline"
          disabled={info.isFetching || health.isFetching}
          onClick={() => {
            info.refetch();
            health.refetch();
          }}
        >
          {info.isFetching || health.isFetching
            ? "Refreshing…"
            : "Refresh deployment"}
        </Button>
      </div>
      <p className="health-note">
        These values are reported by the configured API. A mock server can
        supply synthetic metadata and timings. This page does not run a forecast
        or verify weights.
      </p>
      {health.isPending ? (
        <p role="status">Checking reported model status…</p>
      ) : health.isError ? (
        <div role="alert" className="health-table-empty">
          <h3>Model status unavailable</h3>
          <p>{health.error.message}</p>
          <Button variant="outline" onClick={() => health.refetch()}>
            Retry status
          </Button>
        </div>
      ) : (
        <div
          className={`model-status${health.data.status === "degraded" || !health.data.model_loaded ? " is-warning" : ""}`}
        >
          <strong>
            {health.data.status === "degraded"
              ? "API reports degraded status"
              : "API reachable"}
          </strong>
          <p>
            {health.data.model_loaded
              ? "API reports the model is loaded."
              : "API reports the model is not loaded."}
          </p>
          <p className="health-note">
            Device: {health.data.device || "Not reported"} · API version:{" "}
            {health.data.version || "Not reported"}
          </p>
        </div>
      )}
      {info.isPending ? (
        <div className="health-table-empty" role="status">
          <h3>Loading model details…</h3>
          <p>Reading model metadata and recent latency measurements.</p>
        </div>
      ) : info.isError ? (
        <div role="alert" className="health-table-empty">
          <h3>Deployment details unavailable</h3>
          <p>{info.error.message}</p>
          <Button onClick={() => info.refetch()}>Retry model details</Button>
        </div>
      ) : (
        data && (
          <>
            <dl className="model-metadata">
              <div>
                <dt>Reported model</dt>
                <dd>{data.name}</dd>
              </div>
              <div>
                <dt>Revision</dt>
                <dd>{data.revision || "Not reported"}</dd>
              </div>
              <div>
                <dt>Parameters</dt>
                <dd>{parameterFormatter.format(data.parameters)}</dd>
              </div>
              <div>
                <dt>Context length</dt>
                <dd>{number(data.max_context)} points</dd>
              </div>
              <div>
                <dt>Block size</dt>
                <dd>{number(data.block_size)} points</dd>
              </div>
              <div>
                <dt>Device</dt>
                <dd>{data.device || "Not reported"}</dd>
              </div>
              <div>
                <dt>Sample paths</dt>
                <dd>
                  {data.num_samples === undefined
                    ? "Not reported"
                    : number(data.num_samples)}
                </dd>
              </div>
              <div>
                <dt>Reported licence</dt>
                <dd>{data.license}</dd>
              </div>
              <div>
                <dt>Quantiles within Phase 1 range</dt>
                <dd>
                  {phaseQuantiles(data.quantile_levels).join(" · ") ||
                    "None reported in P10–P90"}
                </dd>
              </div>
            </dl>
            <section
              className="model-latency"
              aria-labelledby="latency-heading"
            >
              <h3 id="latency-heading">Recent latency</h3>
              {stats === "measured" ? (
                <div className="health-stats">
                  <article>
                    <span>Median model call</span>
                    <strong data-testid="model-latency">
                      {number(data.latency_ms!.p50!)} ms
                    </strong>
                    <small>Rolling median supplied by the API</small>
                  </article>
                  <article>
                    <span>Recorded calls</span>
                    <strong>
                      {data.latency_ms?.count === undefined
                        ? "Not reported"
                        : number(data.latency_ms.count)}
                    </strong>
                    <small>Count supplied with this snapshot</small>
                  </article>
                </div>
              ) : (
                <div className="health-table-empty">
                  <h4>
                    {stats === "empty"
                      ? "No measured model calls yet."
                      : "No latency measurements supplied."}
                  </h4>

                  <Link className="text-link" href="/forecast">
                    Open Forecast →
                  </Link>
                </div>
              )}
              <p className="health-note">
                Timings describe recent model calls, not upload, queue wait or
                complete job duration. Hardware, history length, horizon and
                sample count affect runtime. Missing measurements are not shown
                as zero. Metadata is refreshed on request; no benchmark runs
                automatically.
              </p>
            </section>
          </>
        )
      )}
    </section>
  );
}
