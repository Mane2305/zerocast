"use client";
import { Card } from "@/components/ui/layout";
import { Hint } from "@/components/ui/feedback";
import { CHART } from "@/lib/chart-theme";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import type { SeriesForecast } from "@/lib/forecast";
import { InfoTip } from "./info-tip";
import { valueFormatter } from "@/lib/numbers";
import { sortRisk } from "@/lib/portfolio";
const MAX_PORTFOLIO_BUBBLES = 200;
const Chart = dynamic(() => import("./studio-chart"), {
  ssr: false,
  loading: () => <p role="status">Loading portfolio chart…</p>,
});
export function PortfolioBubbles({
  rows,
  additive,
  onSelect,
  unit,
  country,
}: {
  rows: SeriesForecast[];
  additive: boolean;
  onSelect: (id: string) => void;
  unit?: string;
  country?: string | null;
}) {
  const plottedRows =
    rows.length > MAX_PORTFOLIO_BUBBLES
      ? sortRisk(rows, "uncertainty", true).slice(0, MAX_PORTFOLIO_BUBBLES)
      : rows;
  const rowsById = new Map(plottedRows.map((row) => [row.series_id, row]));
  const max = Math.max(
    1,
    ...plottedRows.map((s) => Math.abs(s.total_distribution.percentiles[50])),
  );
  const option: EChartsOption = {
    grid: { left: 65, right: 25, top: 45, bottom: 65 },
    legend: { top: 0 },
    tooltip: {
      trigger: "item",
      renderMode: "richText",
      formatter: (params) => {
        const point = Array.isArray(params) ? params[0] : params;
        const item = rowsById.get(String(point.name));
        if (!item) return "";
        const format = valueFormatter({ unit, country });
        const metric = new Intl.NumberFormat("en-US", {
          maximumFractionDigits: 1,
        });
        return `${item.series_id}\nBase case per period: ${format.format(additive ? item.total_distribution.percentiles[50] / item.dates.length : item.total_distribution.percentiles[50])}\nVariability: ${metric.format(item.risk.uncertainty_score * 100)}%`;
      },
    },
    xAxis: {
      type: "value",
      name: "Base case per period",
      nameLocation: "middle",
      nameGap: 35,
      axisLabel: {
        formatter: (v: number) => valueFormatter({ unit, country }).format(v),
      },
    },
    yAxis: { type: "value", name: "Variability (%)" },
    series: (["upside", "downside", "balanced"] as const).map((risk, i) => ({
      name: risk,
      type: "scatter",
      itemStyle: {
        color: [CHART.good, CHART.bad, CHART.neutral][i],
        opacity: 0.75,
      },
      data: plottedRows
        .filter((s) => s.risk.risk_direction === risk)
        .map((s) => ({
          name: s.series_id,
          value: [
            additive
              ? s.total_distribution.percentiles[50] / s.dates.length
              : s.total_distribution.percentiles[50],
            s.risk.uncertainty_score * 100,
          ],
          symbolSize:
            10 +
            40 *
              Math.sqrt(Math.abs(s.total_distribution.percentiles[50]) / max),
        })),
    })),
  };
  return (
    <Card className="module-chart-card">
      <h2>
        Portfolio demand risk{" "}
        <InfoTip label="Portfolio bubble definition">
          Each bubble is one item. X is the base case per period, Y is the full
          relative forecast range width, and area scales with absolute{" "}
          {additive ? "horizon base case" : "average per period"}. Grouping
          filters items; no joint group distribution is invented. Select a
          bubble to open its forecast.
        </InfoTip>
      </h2>
      {rows.length ? (
        <>
          {rows.length > MAX_PORTFOLIO_BUBBLES && (
            <Hint role="status">
              Showing the {MAX_PORTFOLIO_BUBBLES} most variable items on this
              chart. The table and export include all {rows.length} matching
              items.
            </Hint>
          )}
          <Chart
            option={option}
            label="Portfolio bubble chart"
            onSelect={onSelect}
          />
        </>
      ) : (
        <p>No items match this view.</p>
      )}
    </Card>
  );
}
