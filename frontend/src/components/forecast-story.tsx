"use client";
import { InfoTip } from "./info-tip";
import { periodUnit, type ReviewSeries } from "@/lib/forecast-story";
import type { SeriesForecast } from "@/lib/forecast";
import { valueFormatter } from "@/lib/numbers";
import type { AccuracySeries } from "@/lib/accuracy";
export function ForecastStory({
  series,
  review,
  accuracy,
  frequency,
  country,
  unit,
  average,
  synthetic,
  level,
}: {
  series: SeriesForecast;
  review?: ReviewSeries;
  accuracy?: AccuracySeries;
  frequency: string;
  country?: string | null;
  unit?: string;
  average: boolean;
  synthetic: boolean;
  level: number;
}) {
  const format = valueFormatter({ country, unit });
  const metric = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
  const distribution = series.total_distribution.percentiles;
  const coverage = accuracy?.coverage_p10_p90 ?? review?.band_coverage;
  return (
    <>
      <header className="forecast-story">
        <h2 className="plan-headline">
          Plan{" "}
          <strong data-testid="plan-value">
            {format.format(distribution[level])}{" "}
            <span>{unit || "dataset units"}</span>
          </strong>
          {average ? " average per period" : ""} for the next{" "}
          {periodUnit(frequency, series.dates.length)}{" "}
          <span className="plan-service">· {level}% service level</span>
          <InfoTip label="Recommended plan">
            Quantity from the supplied{" "}
            {average ? "average-per-period" : "horizon-total"} distribution at
            the chosen service level. A model estimate, not a guarantee.
          </InfoTip>
        </h2>
        {synthetic && <span className="badge">Synthetic example</span>}
      </header>
      <dl className="forecast-kpis" aria-label="Forecast overview">
        <div>
          <dt>
            Base case (P50)
            <InfoTip label="Base case definition">
              The middle forecast: actual demand is equally likely to be above
              or below it. Uses the supplied horizon distribution.
            </InfoTip>
          </dt>
          <dd data-testid="total-50">{format.format(distribution[50])}</dd>
          <small>{average ? "Average per period" : "Horizon total"}</small>
        </div>
        <div>
          <dt>
            Forecast range
            <InfoTip label="Forecast range definition">
              Low case (P10) to high case (P90); intended to cover about 8 in 10
              outcomes.
            </InfoTip>
          </dt>
          <dd className="kpi-range">
            <span data-testid="total-10">
              {format.format(distribution[10])}
            </span>
            –
            <span data-testid="total-90">
              {format.format(distribution[90])}
            </span>
          </dd>
          <small>
            {average ? "Average per period" : "Horizon total"} · P10–P90
          </small>
        </div>
        {coverage !== undefined && (
          <div className={coverage < 0.8 ? "kpi-caution" : ""}>
            <dt>
              Range accuracy
              <InfoTip label="Range accuracy definition">
                Share of past actuals inside the forecast range. Target ≈ 80%.
                Supplied historical backtest coverage, not a guarantee.
              </InfoTip>
            </dt>
            <dd data-testid="review-coverage">
              {metric.format(coverage * 100)}%
            </dd>
            <small>Target 80%</small>
          </div>
        )}
        {!synthetic && (
          <>
            {accuracy && (
              <div>
                <dt>
                  Forecast error{" "}
                  <InfoTip label="Forecast error WAPE definition">
                    Total absolute error divided by total absolute actual
                    demand, in %. Lower is better. Supplied by the backtest; not
                    recalculated from ranked exceptions.
                  </InfoTip>
                </dt>
                <dd data-testid="forecast-error">
                  {metric.format(accuracy.wape)}%
                </dd>
                <small>WAPE · backtest</small>
              </div>
            )}
            <div>
              <dt>
                Run time
                <InfoTip label="Zero-shot definition">
                  The model forecasts your data without being trained on it.
                  Recorded model call time excludes queue wait; saved demos do
                  not start a new run.
                </InfoTip>
              </dt>
              <dd>
                {series.latency_ms < 1000
                  ? metric.format(series.latency_ms) + " ms"
                  : metric.format(series.latency_ms / 1000) + " s"}
              </dd>
              <small>Zero-shot · no training</small>
            </div>
          </>
        )}
      </dl>
    </>
  );
}
