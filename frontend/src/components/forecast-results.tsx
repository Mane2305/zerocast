"use client";
import { Download } from "lucide-react";
import { RouteState } from "@/components/ui/route-state";
import { Disclosure } from "@/components/ui/controls";
import { Hint } from "@/components/ui/feedback";
import { useMemo, useState } from "react";
import { formatPeriod, type Frequency } from "@/lib/dates";
import { valueFormatter, countUnits } from "@/lib/numbers";
import { ForecastStory } from "./forecast-story";
import { InfoTip } from "./info-tip";
import { suppliedPaths, type ReviewSeries } from "@/lib/forecast-story";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { itemLabel, horizonUnit } from "@/lib/pickers";
import { lastBacktest, type Accuracy } from "@/lib/accuracy";
import {
  forecastCsv,
  probabilityBounds,
  probabilityText,
  type Forecast,
  type History,
} from "@/lib/forecast";
const Chart = dynamic(() => import("./forecast-chart"), {
  ssr: false,
  loading: () => <p role="status">Loading chart…</p>,
});
const CapacityChart = dynamic(() => import("./capacity-chart"), {
  ssr: false,
  loading: () => <p role="status">Loading capacity chart…</p>,
});
export function ForecastResults({
  parameters,
  accuracy,
  forecast,
  frequency,
  history,
  historyNote,
  review,
  reviewNote,
  country,
  unit,
  average = false,
  synthetic = false,
  saved = false,
  device,
  level,
  setLevel,
  selected,
  setSelected,
}: {
  parameters?: React.ReactNode;
  accuracy?: Accuracy;
  forecast: Forecast;
  frequency: Frequency;
  history?: History;
  historyNote?: string;
  review?: ReviewSeries;
  reviewNote?: string;
  country?: string | null;
  unit?: string;
  average?: boolean;
  synthetic?: boolean;
  saved?: boolean;
  device?: string;
  level: number;
  setLevel: (v: number) => void;
  selected: string;
  setSelected: (id: string) => void;
}) {
  const [target, setTarget] = useState("");
  const [capacity, setCapacity] = useState("");
  const [showPaths, setShowPaths] = useState(false);
  const [showBacktest, setShowBacktest] = useState(false);
  const [showLastYear, setShowLastYear] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const series =
    forecast.series.find((s) => s.series_id === selected) ?? forecast.series[0];
  const paths = useMemo(
    () => (series ? suppliedPaths(series, series.dates.length) : []),
    [series],
  );
  const points = useMemo(
    () =>
      series ? lastBacktest(accuracy, series.series_id, series.dates[0]) : [],
    [accuracy, series],
  );
  if (!series || !series.dates.length)
    return (
      <RouteState kind="empty">
        <h2>No forecast periods returned</h2>
        <p>
          The job finished without usable periods. Review the input and run
          again.
        </p>
      </RouteState>
    );
  const format = (v: number) =>
    valueFormatter({
      country,
      unit,
    }).format(v);
  const total = series.total_distribution.percentiles;
  if (series.total_distribution.aggregation !== (average ? "mean" : "sum"))
    return (
      <RouteState kind="error">
        <h2>Forecast aggregation does not match the dataset</h2>
        <p>Reload corrected results before planning with this forecast.</p>
      </RouteState>
    );
  const grid = series.step_exceedance_grid?.percentiles;
  const targetNumber = target.trim() ? Number(target) : NaN;
  const capacityNumber = capacity.trim() ? Number(capacity) : NaN;
  function download() {
    const url = URL.createObjectURL(
      new Blob([forecastCsv(forecast)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "zerocast-forecast.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section
      className="forecast-results forecast-dashboard"
      aria-label="Forecast results"
    >
      <ForecastStory
        series={series}
        review={review}
        accuracy={accuracy?.series.find(
          (item) => item.series_id === series.series_id,
        )}
        frequency={frequency}
        country={country}
        unit={unit}
        average={average}
        synthetic={synthetic}
        level={level}
      />
      {parameters || (
        <aside
          className={`planning-panel ${controlsOpen ? "planning-expanded" : ""}`}
          aria-label="Planning controls"
        >
          <button
            className="planning-toggle"
            onClick={() => setControlsOpen(!controlsOpen)}
            aria-expanded={controlsOpen}
          >
            Planning controls · {series.series_id}
            <span>{controlsOpen ? "−" : "+"}</span>
          </button>
          <div className="planning-fields">
            <h2>Planning controls</h2>
            <Select
              label="Item"
              options={forecast.series.map((s) => ({
                value: s.series_id,
                label: itemLabel(s.series_id),
              }))}
              value={series.series_id}
              onChange={setSelected}
            />
            <div className="zc-field">
              <span className="zc-static-label">
                Forecast horizon{" "}
                <InfoTip label="Forecast horizon definition">
                  How many periods ahead the forecast covers. Saved forecasts
                  have a fixed horizon.
                </InfoTip>
              </span>
              <span
                className="zc-static-value"
                aria-label="Saved forecast horizon"
              >
                {series.dates.length} {horizonUnit(frequency)}
                {saved && <span className="zc-badge">Saved · fixed</span>}
              </span>
            </div>
            <label htmlFor="service-level">
              Service level <strong>{level}%</strong>{" "}
              <InfoTip label="Service level definition">
                How often the plan should cover demand. 80% means 8 times out of
                10.
              </InfoTip>
            </label>
            <input
              id="service-level"
              type="range"
              min="50"
              max="90"
              value={level}
              onChange={(event) => setLevel(Number(event.target.value))}
            />
            <dl className="planning-buffer">
              <dt>
                Safety buffer{" "}
                <InfoTip label="Safety buffer definition">
                  Recommended plan minus base case: extra quantity for
                  uncertainty.
                </InfoTip>
              </dt>
              <dd>
                {format(total[level] - total[50])}
                {average
                  ? " average per period"
                  : ` ${unit || "dataset units"}`}
              </dd>
            </dl>
          </div>
        </aside>
      )}
      {parameters && (
        <Select
          className="result-item"
          label="Item"
          options={forecast.series.map((item) => ({
            value: item.series_id,
            label: itemLabel(item.series_id),
          }))}
          value={series.series_id}
          onChange={setSelected}
        />
      )}
      <div className="chart-heading">
        <div>
          <h3>
            Past demand & forecast{" "}
            <InfoTip label="Forecast chart definition">
              Grey shows recorded demand. Green shows the base case (P50), with
              a shaded low-to-high range (P10–P90). Use the slider for full
              history.
            </InfoTip>
          </h3>
        </div>
        <Disclosure
          className="forecast-comparisons"
          summary={
            <>
              Compare
              {showLastYear || showBacktest || showPaths
                ? ` · ${Number(showLastYear && !!series.last_year) + Number(showBacktest && points.length > 0) + Number(showPaths && paths.length > 0)} on`
                : ""}
            </>
          }
        >
          <div className="chart-toggles">
            {series.last_year && (
              <label>
                <input
                  type="checkbox"
                  checked={showLastYear}
                  onChange={(event) => setShowLastYear(event.target.checked)}
                />
                Last year
              </label>
            )}
            {paths.length > 0 && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={showPaths && paths.length > 0}
                    disabled={!paths.length}
                    onChange={(event) => setShowPaths(event.target.checked)}
                  />
                  {paths.length
                    ? `${paths.length} possible futures`
                    : "Possible futures unavailable"}
                </label>
                <InfoTip label="About possible futures">
                  {paths.length
                    ? `${paths.length} genuine supplied sample paths. Each thin line is one possible trajectory, not an observed result or another quantile.`
                    : "Genuine sample paths have not been supplied. The frontend does not invent paths from quantiles."}
                </InfoTip>
              </>
            )}
            {points.length > 0 && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={showBacktest && points.length > 0}
                    disabled={!points.length}
                    onChange={(event) => setShowBacktest(event.target.checked)}
                  />
                  Last backtest
                </label>
                <InfoTip label="About the recent backtest">
                  {points.length
                    ? `Forecasts versus actuals for the last supplied backtest horizon: ${formatPeriod(points[0].date, frequency)}–${formatPeriod(points.at(-1)!.date, frequency)}. Markers identify actuals outside the supplied P10–P90 backtest range.`
                    : "Full dated backtest points have not been supplied for this item. Ranked exception events cannot replace a complete backtest."}
                </InfoTip>
              </>
            )}
            {!series.last_year && !paths.length && !points.length && (
              <span>No comparisons supplied for this item.</span>
            )}
          </div>
        </Disclosure>
      </div>
      <Chart
        series={series}
        frequency={frequency}
        country={country}
        unit={unit}
        levels={forecast.quantile_levels}
        history={history?.series_id === series.series_id ? history : undefined}
        paths={showPaths ? paths : []}
        backtest={showBacktest ? points : []}
        review={review}
        showLastYear={showLastYear}
      />
      <div className="chart-caption">
        <span>
          {formatPeriod(series.dates[0], frequency)}–
          {formatPeriod(series.dates.at(-1), frequency)} ·{" "}
          {synthetic
            ? "Illustrative data"
            : saved
              ? "Saved model output"
              : "Model forecast"}
        </span>
        <InfoTip label="Chart data and display">
          {historyNote ||
            (history
              ? "Starts at the latest 90 history points; use the slider for full supplied history. Blanks remain gaps."
              : "History is unavailable.")}{" "}
          Last year uses the supplied seasonal alignment.{" "}
          {countUnits(unit)
            ? "Counts are rounded for display; CSV retains supplied precision. "
            : ""}
          Device: {device || "not reported"}.
        </InfoTip>
        <Button
          onClick={download}
          variant="outline"
          size="sm"
          aria-label="Export forecast CSV"
        >
          <Download size={14} />
          Export CSV
        </Button>
      </div>
      {historyNote && <Hint role="status">{historyNote}</Hint>}
      {reviewNote && <Hint className="review-note">{reviewNote}</Hint>}
      <div
        className="forecast-risk-grid"
        style={average ? { gridTemplateColumns: "minmax(0, 1fr)" } : undefined}
      >
        {!average && (
          <section>
            <h3>
              Chance to hit target{" "}
              <InfoTip label="Chance to hit target definition">
                Probability that demand over the forecast horizon reaches your
                target.
              </InfoTip>
            </h3>
            <label>
              Target total
              <input
                aria-label="Target total"
                type="number"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Enter a horizon total"
              />
            </label>
            <p aria-live="polite">
              {Number.isFinite(targetNumber)
                ? `${probabilityText(probabilityBounds(total, targetNumber, 0, true))} chance of reaching at least ${format(targetNumber)}.`
                : "Enter a finite target to estimate its probability."}
            </p>
          </section>
        )}
        <section>
          <h3>
            Capacity breach risk{" "}
            <InfoTip label="Capacity breach risk definition">
              Probability that demand in a period exceeds your available
              capacity. Bars show the upper bound of the supplied
              percentile-grid estimate.
            </InfoTip>
          </h3>
          <label>
            Capacity per period
            <input
              aria-label="Capacity per period"
              type="number"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="Enter available capacity"
              disabled={!grid}
            />
          </label>
          {!grid ? (
            <p>
              The source did not provide the period exceedance grid. Capacity
              risk is unavailable.
            </p>
          ) : !Number.isFinite(capacityNumber) ? (
            <p>
              Enter a finite capacity to see the chance of demand exceeding it.
            </p>
          ) : (
            <CapacityChart
              dates={series.dates}
              frequency={frequency}
              bounds={series.dates.map((_, i) =>
                probabilityBounds(
                  grid.map((row) => row[i]),
                  capacityNumber,
                  1,
                  false,
                ),
              )}
            />
          )}
        </section>
      </div>
      <Disclosure className="provenance" summary={<>Why these numbers?</>}>
        <p>
          Scenario cards and the plan use total_distribution.percentiles[10, 50,
          90] and [{level}] from sample paths. Per-period quantiles are never
          added.{" "}
          {average
            ? "The backend supplies average-per-period percentiles for this non-additive dataset; they are displayed unchanged, without dividing by the horizon. "
            : "Target probability brackets the threshold using the total percentile grid. "}
          Capacity uses each column of step_exceedance_grid (percentiles 1–99).
          Ranges reflect grid resolution and tied values. Beyond the capacity
          grid, tail bounds remain 0–1% or 99–100%, with no extrapolation. These
          are approximate model probabilities, not calibrated guarantees.
        </p>
        <p>
          Chart forecast ranges use quantile_levels and quantiles at P10, P30,
          P50, P70 and P90. History is observed data; last_year is the source’s
          seasonal alignment. Latency is per item, not total job wait time.
          Values are in the dataset’s units.
        </p>
      </Disclosure>
      <Disclosure
        className="forecast-values"
        summary={<>View forecast values</>}
      >
        <div className="health-table-scroll" tabIndex={0}>
          <table>
            <caption>Per-period values · {itemLabel(series.series_id)}</caption>
            <thead>
              <tr>
                <th>Date</th>
                {[10, 30, 50, 70, 90].map((p) => (
                  <th key={p}>P{p}</th>
                ))}
                <th>Last year</th>
              </tr>
            </thead>
            <tbody>
              {series.dates.map((d, i) => (
                <tr key={d}>
                  <th>{formatPeriod(d, frequency)}</th>
                  {[0.1, 0.3, 0.5, 0.7, 0.9].map((p) => (
                    <td key={p}>
                      {format(
                        series.quantiles[forecast.quantile_levels.indexOf(p)][
                          i
                        ],
                      )}
                    </td>
                  ))}
                  <td>
                    {series.last_year?.[i] == null
                      ? "Unavailable"
                      : format(series.last_year[i]!)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Disclosure>
    </section>
  );
}
