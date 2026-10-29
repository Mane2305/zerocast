"use client";
import { itemLabel } from "@/lib/pickers";
import { SortHeader } from "@/components/ui/table";
import { RouteState } from "@/components/ui/route-state";
import { Disclosure } from "@/components/ui/controls";
import { Select } from "./ui/select";
import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { InfoTip } from "./info-tip";
import { Button } from "./ui/button";
import { formatPeriod, type Frequency } from "@/lib/dates";
import { valueFormatter } from "@/lib/numbers";
import type { Accuracy } from "@/lib/accuracy";
const Chart = dynamic(() => import("./accuracy-charts"), {
  ssr: false,
  loading: () => <p role="status">Loading accuracy chart…</p>,
});
export function AccuracyResults({
  result,
  selected,
  setSelected,
  frequency,
  unit,
  country,
}: {
  result: Accuracy;
  selected: string;
  setSelected: (id: string) => void;
  frequency: Frequency;
  unit?: string;
  country?: string | null;
}) {
  const [sort, setSort] = useState<
    "series_id" | "wape" | "bias_pct" | "coverage_p10_p90"
  >("wape");
  const [descending, setDescending] = useState(true);
  const [search, setSearch] = useState("");
  const percent = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  });
  const signed = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    signDisplay: "always",
  });
  const value = valueFormatter({ country, unit });
  const metric = result.portfolio,
    item =
      result.series.find((item) => item.series_id === selected) ||
      result.series[0];
  const rows = [...result.series]
    .filter((item) =>
      item.series_id.toLowerCase().includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        (sort === "series_id"
          ? a.series_id.localeCompare(b.series_id)
          : a[sort] - b[sort]) * (descending ? -1 : 1) ||
        a.series_id.localeCompare(b.series_id),
    );
  const pct = (v: number) => `${percent.format(v)}%`;
  function csv() {
    const cell = (v: unknown) =>
      '"' +
      (typeof v === "string"
        ? v.replace(/^[=+@\-\t\r]/, "'$&")
        : String(v ?? "")
      ).replaceAll('"', '""') +
      '"';
    const body = [
      [
        "item",
        "wape_pct",
        "bias_pct",
        "range_accuracy_share",
        "naive_wape_pct",
        "improvement_vs_naive_pct",
      ],
      ...rows.map((item) => [
        item.series_id,
        item.wape,
        item.bias_pct,
        item.coverage_p10_p90,
        item.naive_wape,
        item.improvement_vs_naive_pct,
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n");
    const href = URL.createObjectURL(
      new Blob([body], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = href;
    link.download = "zerocast-accuracy.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  if (!item)
    return (
      <RouteState kind="empty">
        <p>No item scores returned.</p>
        <Button asChild>
          <Link href="/data">Choose dataset</Link>
        </Button>
      </RouteState>
    );
  return (
    <div className="accuracy-results">
      <div className="accuracy-summary">
        <span>
          All {result.series.length} returned items · {result.origins} backtest
          origins · {result.horizon} periods per forecast
        </span>
        <InfoTip label="Pooled accuracy source">
          The API pools all returned items by actual demand volume. These scores
          are supplied directly, not averages of the rows below. Origins
          actually used may be fewer than requested.
        </InfoTip>
      </div>
      <dl className="accuracy-kpis" aria-label="Pooled accuracy">
        <div>
          <dt>
            Forecast error{" "}
            <InfoTip label="Forecast error WAPE definition">
              Total absolute forecast error divided by total absolute actual
              demand. Lower is better.
            </InfoTip>
          </dt>
          <dd data-testid="accuracy-wape">{pct(metric.wape)}</dd>
          <small>WAPE · all returned items</small>
        </div>
        <div>
          <dt>
            Bias{" "}
            <InfoTip label="Bias definition">
              Signed over-forecasting (+) or under-forecasting (−), relative to
              actual demand. The API supplies this score.
            </InfoTip>
          </dt>
          <dd data-testid="accuracy-bias">{signed.format(metric.bias_pct)}%</dd>
          <small>
            {metric.bias_pct > 0
              ? "Over-forecast"
              : metric.bias_pct < 0
                ? "Under-forecast"
                : "No net bias"}
          </small>
        </div>
        <div
          className={metric.coverage_p10_p90 < 0.8 ? "accuracy-caution" : ""}
        >
          <dt>
            Range accuracy{" "}
            <InfoTip label="Range accuracy definition">
              Share of historical actuals inside the low-to-high forecast range.
              Target ≈ 80%.
            </InfoTip>
          </dt>
          <dd data-testid="accuracy-coverage">
            {pct(metric.coverage_p10_p90 * 100)}
          </dd>
          <small>P10–P90 · target 80%</small>
        </div>
        <div>
          <dt>
            Vs naive baseline{" "}
            <InfoTip label="Naive baseline definition">
              The same-as-last-season forecast is the benchmark. Improvement is
              supplied by the API; no percentage is invented when the benchmark
              is unavailable.
            </InfoTip>
          </dt>
          <dd data-testid="accuracy-improvement">
            {metric.improvement_vs_naive_pct == null
              ? "Unavailable"
              : pct(Math.abs(metric.improvement_vs_naive_pct))}
          </dd>
          <small>
            {metric.improvement_vs_naive_pct == null
              ? "No usable benchmark supplied"
              : metric.improvement_vs_naive_pct === 0
                ? "Same error as baseline"
                : metric.improvement_vs_naive_pct > 0
                  ? "Lower error than baseline"
                  : "Higher error than baseline"}
          </small>
        </div>
      </dl>
      <div className="accuracy-selection">
        <Select
          label="Chart item"
          options={result.series.map((item) => ({
            value: item.series_id,
            label: itemLabel(item.series_id),
          }))}
          value={item.series_id}
          onChange={setSelected}
        />
        <span>
          {item.backtest.dates.length
            ? `${formatPeriod(item.backtest.dates[0], frequency)} – ${formatPeriod(item.backtest.dates.at(-1), frequency)}`
            : "No dated backtest points"}
        </span>
      </div>
      <div className="accuracy-chart-grid">
        <section>
          <h2>
            Range calibration{" "}
            <InfoTip label="Calibration chart definition">
              Promised versus observed coverage at each supplied forecast level.
              The diagonal is a perfect match. This chart belongs to the
              selected item.
            </InfoTip>
          </h2>
          {item.quantile_coverage.some(
            (p) => p.level >= 0.1 && p.level <= 0.9,
          ) ? (
            <Chart item={item} kind="calibration" frequency={frequency} />
          ) : (
            <p className="accuracy-empty">
              No supported calibration points supplied.
            </p>
          )}
        </section>
        <section>
          <h2>
            Backtest: forecast vs actual{" "}
            <InfoTip label="Backtest definition">
              Past forecasts use only earlier history. Grey is actual demand;
              the dashed base case and shaded forecast range are supplied model
              results. Missing actuals stay blank.
            </InfoTip>
          </h2>
          {item.backtest.dates.length ? (
            <Chart
              item={item}
              kind="backtest"
              frequency={frequency}
              unit={unit}
              country={country}
            />
          ) : (
            <p className="accuracy-empty">No dated backtest points supplied.</p>
          )}
        </section>
      </div>
      <section className="accuracy-items">
        <div className="accuracy-table-heading">
          <h2>
            Item accuracy{" "}
            <InfoTip label="Item accuracy definition">
              Scores for each returned item, over that item’s supplied backtest
              periods.
            </InfoTip>
          </h2>
          <label>
            Find item{" "}
            <input
              aria-label="Filter accuracy items"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <Button variant="outline" onClick={csv} disabled={!rows.length}>
            Export visible CSV
          </Button>
        </div>
        <div className="health-table-scroll" tabIndex={0}>
          <table>
            <caption className="sr-only">
              Per-item accuracy scores; select an item to update both charts
            </caption>
            <thead>
              <tr>
                {(
                  [
                    ["series_id", "Item"],
                    ["wape", "WAPE"],
                    ["bias_pct", "Bias"],
                    ["coverage_p10_p90", "Range accuracy"],
                  ] as const
                ).map(([key, label]) => (
                  <SortHeader
                    key={key}
                    label={label}
                    active={sort === key}
                    descending={descending}
                    onSort={() => {
                      setSort(key);
                      setDescending(
                        sort === key ? !descending : key !== "series_id",
                      );
                    }}
                  />
                ))}
                <th>Naive WAPE</th>
                <th>Vs baseline</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.series_id}
                  className={
                    row.series_id === item.series_id
                      ? "accuracy-row-selected"
                      : ""
                  }
                >
                  <th scope="row">
                    <button
                      className="text-link"
                      onClick={() => setSelected(row.series_id)}
                      aria-pressed={row.series_id === item.series_id}
                    >
                      {itemLabel(row.series_id)}
                    </button>
                  </th>
                  <td>{pct(row.wape)}</td>
                  <td>{signed.format(row.bias_pct)}%</td>
                  <td>{pct(row.coverage_p10_p90 * 100)}</td>
                  <td>
                    {row.naive_wape == null
                      ? "Unavailable"
                      : pct(row.naive_wape)}
                  </td>
                  <td>
                    {row.improvement_vs_naive_pct == null
                      ? "Unavailable"
                      : `${pct(Math.abs(row.improvement_vs_naive_pct))} ${row.improvement_vs_naive_pct >= 0 ? "lower" : "higher"} error`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <p className="accuracy-empty">No items match this filter.</p>
        )}
      </section>
      <Disclosure
        className="accuracy-values"
        summary={<>Chart values · {itemLabel(item.series_id)}</>}
      >
        <div className="health-table-scroll">
          <table>
            <caption>Supplied calibration points</caption>
            <thead>
              <tr>
                <th>Promised</th>
                <th>Observed</th>
              </tr>
            </thead>
            <tbody>
              {item.quantile_coverage
                .filter((p) => p.level >= 0.1 && p.level <= 0.9)
                .map((p) => (
                  <tr key={p.level}>
                    <th>{pct(p.level * 100)}</th>
                    <td>{pct(p.observed * 100)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="health-table-scroll">
          <table>
            <caption>Supplied backtest values</caption>
            <thead>
              <tr>
                <th>Period</th>
                <th>Actual</th>
                <th>Low case (P10)</th>
                <th>Base case (P50)</th>
                <th>High case (P90)</th>
              </tr>
            </thead>
            <tbody>
              {item.backtest.dates.map((date, i) => (
                <tr key={date}>
                  <th>{formatPeriod(date, frequency)}</th>
                  <td>
                    {item.backtest.actual[i] == null
                      ? "Missing"
                      : value.format(item.backtest.actual[i]!)}
                  </td>
                  <td>{value.format(item.backtest.p10[i])}</td>
                  <td>{value.format(item.backtest.p50[i])}</td>
                  <td>{value.format(item.backtest.p90[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Disclosure>
    </div>
  );
}
