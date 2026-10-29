"use client";
import { StatCard, StatGrid } from "./ui/stat";
import { Badge } from "./ui/feedback";
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
        {synthetic && <Badge tone="info">Synthetic example</Badge>}
      </header>
      <StatGrid aria-label="Forecast overview">
        <StatCard
          label="Base case (P50)"
          info={
            <InfoTip label="Base case definition">
              The middle forecast: actual demand is equally likely to be above
              or below it. Uses the supplied horizon distribution.
            </InfoTip>
          }
          value={format.format(distribution[50])}
          valueProps={{ "data-testid": "total-50" }}
          hint={average ? "Average per period" : "Horizon total"}
        />
        <StatCard
          label="Forecast range"
          info={
            <InfoTip label="Forecast range definition">
              Low case (P10) to high case (P90); intended to cover about 8 in 10
              outcomes.
            </InfoTip>
          }
          value={
            <>
              <span data-testid="total-10">
                {format.format(distribution[10])}
              </span>
              {" – "}
              <span data-testid="total-90">
                {format.format(distribution[90])}
              </span>
            </>
          }
          hint={`${average ? "Average per period" : "Horizon total"} · P10–P90`}
        />
        {coverage !== undefined && (
          <StatCard
            label="Range accuracy"
            tone={coverage < 0.8 ? "warning" : undefined}
            info={
              <InfoTip label="Range accuracy definition">
                Share of past actuals inside the forecast range. Target ≈ 80%.
                Supplied historical backtest coverage, not a guarantee.
              </InfoTip>
            }
            value={`${metric.format(coverage * 100)}%`}
            valueProps={{ "data-testid": "review-coverage" }}
            hint="Target 80%"
          />
        )}
        {!synthetic && accuracy && (
          <StatCard
            label="Forecast error"
            info={
              <InfoTip label="Forecast error WAPE definition">
                Total absolute error divided by total absolute actual demand, in
                %. Lower is better. Supplied by the backtest; not recalculated
                from ranked exceptions.
              </InfoTip>
            }
            value={`${metric.format(accuracy.wape)}%`}
            valueProps={{ "data-testid": "forecast-error" }}
            hint="WAPE · backtest"
          />
        )}
        {!synthetic && (
          <StatCard
            label="Run time"
            info={
              <InfoTip label="Zero-shot definition">
                The model forecasts your data without being trained on it.
                Recorded model call time excludes queue wait; saved demos do not
                start a new run.
              </InfoTip>
            }
            value={
              series.latency_ms < 1000
                ? metric.format(series.latency_ms) + " ms"
                : metric.format(series.latency_ms / 1000) + " s"
            }
            hint="Zero-shot · no training"
          />
        )}
      </StatGrid>
    </>
  );
}
