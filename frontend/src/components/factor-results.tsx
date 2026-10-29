"use client";
import { SortHeader } from "@/components/ui/table";
import { Disclosure } from "@/components/ui/controls";
import { Callout, Hint } from "@/components/ui/feedback";
import { Select } from "./ui/select";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DriverCharts } from "./driver-charts";
import {
  evidenceLabel,
  factorsCsv,
  verdicts,
  type FactorResult,
  type Factor,
} from "@/lib/factors";
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
    [descending, setDescending] = useState(false);
  const number = (v: number | undefined) =>
    v === undefined
      ? "Not reported"
      : new Intl.NumberFormat(country === "IN" ? "en-IN" : undefined, {
          maximumSignificantDigits: 4,
        }).format(v);
  const signed = (v: number) =>
    new Intl.NumberFormat(country === "IN" ? "en-IN" : undefined, {
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
  function statistics(f: Factor) {
    return (
      <Disclosure
        className="factor-evidence"
        summary={<>Statistical details</>}
      >
        <dl>
          <div>
            <dt>Best lag (periods)</dt>
            <dd>{number(f.related.best_lag)}</dd>
          </div>
          <div>
            <dt>Standardised effect</dt>
            <dd>{number(f.related.effect)}</dd>
          </div>
          <div>
            <dt>p-value</dt>
            <dd>{number(f.related.p_value)}</dd>
          </div>
        </dl>
        <Hint>
          Historical association after detrending and deseasonalising.
          Association does not establish causation.
        </Hint>
      </Disclosure>
    );
  }
  function backtest(f: Factor) {
    return (
      <Disclosure className="factor-evidence" summary={<>Backtest details</>}>
        <dl>
          <div>
            <dt>Sales-only error (WQL)</dt>
            <dd>{number(result.baseline_wql)}</dd>
          </div>
          <div>
            <dt>With-driver error (WQL)</dt>
            <dd>{number(f.helps_yug.wql_with_factor)}</dd>
          </div>
          <div>
            <dt>Reported interval, lower</dt>
            <dd>{number(f.helps_yug.ci_low)}</dd>
          </div>
          <div>
            <dt>Reported interval, upper</dt>
            <dd>{number(f.helps_yug.ci_high)}</dd>
          </div>
        </dl>
        <Hint>
          Lower backtest error is better. Interval scale and confidence level
          were not specified by the source.
        </Hint>
      </Disclosure>
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
      <div
        className="health-table-scroll factor-table"
        role="region"
        aria-label="Two-lens driver results"
        tabIndex={0}
      >
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
              <th>What it means</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.factor}>
                <th scope="row">{f.factor}</th>
                <td>
                  <strong>
                    {evidenceLabel(
                      f.related.is_related,
                      "Related",
                      "No detected relationship",
                    )}
                  </strong>
                  {statistics(f)}
                </td>
                <td>
                  <strong>
                    {evidenceLabel(
                      f.helps_yug.helps,
                      "Helped in this backtest",
                      "No demonstrated improvement",
                    )}
                  </strong>
                  <p
                    className={
                      f.helps_yug.change_pct !== undefined &&
                      f.helps_yug.change_pct < 0
                        ? "factor-gain"
                        : "health-note"
                    }
                  >
                    {f.helps_yug.change_pct === undefined
                      ? "Error change: not reported"
                      : `Error change: ${signed(f.helps_yug.change_pct)}%`}
                  </p>
                  {backtest(f)}
                </td>
                <td>
                  <strong>{verdicts[f.verdict].label}</strong>
                  <p>{verdicts[f.verdict].meaning}</p>
                  {f.explanation && <Hint>Source note: {f.explanation}</Hint>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
