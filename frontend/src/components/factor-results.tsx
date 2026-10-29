"use client";
import { ChevronDown } from "lucide-react";
import { SortHeader, TableContainer } from "@/components/ui/table";
import { Disclosure } from "@/components/ui/controls";
import { Badge, Callout, Hint, type Tone } from "@/components/ui/feedback";
import { Select } from "./ui/select";
import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import { DriverCharts } from "./driver-charts";
import {
  evidenceLabel,
  factorsCsv,
  verdicts,
  type FactorResult,
  type Factor,
} from "@/lib/factors";
const VERDICT_TONE: Record<Factor["verdict"], Tone> = {
  use_it: "success",
  real_driver_yug_cannot_use: "info",
  helps_yug_unclear_link: "warning",
  probably_drop: "neutral",
};

export function FactorResults({
  result,
  country,
  synthetic = false,
}: {
  result: FactorResult;
  country?: string | null;
  synthetic?: boolean;
}) {
  const [search, setSearch] = useState(""),
    [verdict, setVerdict] = useState("all"),
    [descending, setDescending] = useState(false),
    [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const number = (v: number | undefined) =>
    v === undefined
      ? "Not reported"
      : new Intl.NumberFormat(country === "IN" ? "en-IN" : "en-US", {
          maximumSignificantDigits: 4,
        }).format(v);
  const signed = (v: number) =>
    new Intl.NumberFormat(country === "IN" ? "en-IN" : "en-US", {
      maximumFractionDigits: 1,
      signDisplay: "always",
    }).format(v);
  const rows = result.factors
    .filter(
      (f) =>
        f.factor.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
        (verdict === "all" || f.verdict === verdict),
    )
    .sort((a, b) => a.factor.localeCompare(b.factor) * (descending ? -1 : 1));
  function download() {
    const url = URL.createObjectURL(
      new Blob([factorsCsv(result, rows)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "zerocast-factor-check.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function details(f: Factor) {
    return (
      <div className="factor-details">
        <section>
          <h4>Historical link</h4>
          <dl>
            <dt>Best lag</dt>
            <dd>
              {f.related.best_lag === undefined
                ? "Not reported"
                : `${number(f.related.best_lag)} ${f.related.best_lag === 1 ? "period" : "periods"}`}
            </dd>
            <dt>Standardised effect</dt>
            <dd>{number(f.related.effect)}</dd>
            <dt>p-value</dt>
            <dd>
              {f.related.p_value === 0 ? "< 0.0001" : number(f.related.p_value)}
            </dd>
          </dl>
          <Hint>
            After removing trend and seasonality. Association is not causation.
          </Hint>
        </section>
        <section>
          <h4>Backtest</h4>
          <dl>
            <dt>Sales-only error (WQL)</dt>
            <dd>{number(result.baseline_wql)}</dd>
            <dt>With this driver (WQL)</dt>
            <dd>{number(f.helps_yug.wql_with_factor)}</dd>
            <dt>Reported interval</dt>
            <dd>
              {number(f.helps_yug.ci_low)} to {number(f.helps_yug.ci_high)}
            </dd>
          </dl>
          <Hint>Lower error is better. Interval scale is not specified.</Hint>
        </section>
        {f.explanation && (
          <section>
            <h4>Source note</h4>
            <p>{f.explanation}</p>
          </section>
        )}
      </div>
    );
  }
  return (
    <section className="factor-results" aria-label="Drivers results">
      <div className="health-section-heading">
        <div>
          <p className="eyebrow">
            {synthetic ? "SYNTHETIC EXAMPLE" : "DRIVERS RESULT"} ·{" "}
            {result.series_id}
          </p>
          <h2>Driver evidence</h2>
        </div>
        <Button variant="outline" disabled={!rows.length} onClick={download}>
          Export visible drivers
        </Button>
      </div>
      {synthetic && (
        <p className="demo-notice">
          Invented driver results illustrate all four verdicts. No statistical
          test or model backtest was run.
        </p>
      )}
      {!synthetic && <DriverCharts result={result} />}
      <div className="factor-lenses">
        <article>
          <p className="eyebrow">HISTORICAL LINK</p>
          <h3>Correlation with demand</h3>
          <p>Historical link after removing trend and season.</p>
        </article>
        <article>
          <p className="eyebrow">BACKTEST EVIDENCE</p>
          <h3>Forecast lift</h3>
          <p>Accuracy change when a driver is added.</p>
        </article>
      </div>
      <Hint>
        Sales-only baseline WQL: <strong>{number(result.baseline_wql)}</strong>{" "}
        · Item: {result.series_id}. Negative error change means better
        performance than sales-only in this backtest.
      </Hint>
      <div className="health-filters driver-filters">
        <label>
          Search drivers
          <input
            aria-label="Search drivers"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Driver name"
          />
        </label>
        <Select
          label="Verdict"
          options={[
            { value: "all", label: "All verdicts" },
            ...Object.entries(verdicts).map(([key, value]) => ({
              value: key,
              label: value.label,
            })),
          ]}
          value={verdict}
          onChange={setVerdict}
        />
      </div>
      <Hint role="status">
        {rows.length} of {result.factors.length} drivers shown.
      </Hint>
      <TableContainer label="Two-lens driver results" className="factor-table">
        <table>
          <caption className="sr-only">
            Historical association and forecast backtest evidence by driver
          </caption>
          <thead>
            <tr>
              <SortHeader
                label="Driver"
                active
                descending={descending}
                onSort={() => setDescending(!descending)}
              />
              <th>Related to sales?</th>
              <th>Forecast lift</th>
              <th>Verdict</th>
              <th>
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const open = expanded.has(f.factor);
              const change = f.helps_yug.change_pct;
              return (
                <Fragment key={f.factor}>
                  <tr className={open ? "is-open" : undefined}>
                    <th scope="row">{f.factor}</th>
                    <td>
                      <Badge
                        tone={
                          f.related.is_related === true
                            ? "success"
                            : f.related.is_related === false
                              ? "neutral"
                              : "neutral"
                        }
                      >
                        {evidenceLabel(
                          f.related.is_related,
                          "Related",
                          "No link found",
                        )}
                      </Badge>
                      {f.related.effect !== undefined && (
                        <span className="factor-sub">
                          effect {number(f.related.effect)}
                          {f.related.best_lag !== undefined &&
                            ` · lag ${number(f.related.best_lag)}`}
                        </span>
                      )}
                    </td>
                    <td>
                      <Badge
                        tone={
                          f.helps_yug.helps === true ? "success" : "neutral"
                        }
                      >
                        {evidenceLabel(
                          f.helps_yug.helps,
                          "Improves forecast",
                          "No proven gain",
                        )}
                      </Badge>
                      <span
                        className={
                          "factor-sub factor-change " +
                          (change === undefined
                            ? ""
                            : change < 0
                              ? "is-better"
                              : "is-worse")
                        }
                      >
                        {change === undefined
                          ? "error change not reported"
                          : `${signed(change)}% error${
                              f.helps_yug.helps === true
                                ? ""
                                : change < 0
                                  ? " · within noise"
                                  : ""
                            }`}
                      </span>
                    </td>
                    <td>
                      <Badge tone={VERDICT_TONE[f.verdict]}>
                        {verdicts[f.verdict].label}
                      </Badge>
                      <span className="factor-advice">
                        {verdicts[f.verdict].meaning}
                      </span>
                    </td>
                    <td className="factor-toggle">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-expanded={open}
                        aria-label={`${open ? "Hide" : "Show"} details for ${f.factor}`}
                        onClick={() =>
                          setExpanded((current) => {
                            const next = new Set(current);
                            if (next.has(f.factor)) next.delete(f.factor);
                            else next.add(f.factor);
                            return next;
                          })
                        }
                      >
                        Details
                        <ChevronDown
                          size={15}
                          className={open ? "rotate-180" : undefined}
                        />
                      </Button>
                    </td>
                  </tr>
                  {open && (
                    <tr className="factor-details-row">
                      <td colSpan={5}>{details(f)}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </TableContainer>
      {!rows.length && (
        <Callout tone="neutral">
          <h3>
            {result.factors.length
              ? "No drivers match these filters."
              : "No driver results returned."}
          </h3>
          <p>Choose another filter or run a new driver check.</p>
        </Callout>
      )}
      <Disclosure
        className="provenance"
        summary={<>How to read these results</>}
      >
        <p>
          Both lens decisions and the combined verdict are supplied by the
          source. Missing fields stay unreported; the page does not infer a
          relationship from a p-value or a forecast gain from the reported
          interval. Results apply to this historical check. Sales-only remains
          the default forecast path, and this check does not estimate effects of
          future promotions or planned changes.
        </p>
        <p>
          Source: FactorResult.related and helps_yug. WQL and change_pct are
          reported backtest metrics; negative change_pct means better than
          sales-only. Interval endpoints are displayed as raw source values
          because their scale and confidence level are not defined in the
          contract.
        </p>
      </Disclosure>
    </section>
  );
}
