"use client";
import { Card } from "@/components/ui/layout";
import { Hint } from "@/components/ui/feedback";
import { CHART } from "@/lib/chart-theme";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import type { SeriesForecast } from "@/lib/forecast";
import { InfoTip } from "./info-tip";
import { valueFormatter } from "@/lib/numbers";
import { itemLabel } from "@/lib/pickers";
const MAX_ROWS = 25;
// Direction is not good or bad, so no red/green: balanced is the normal case
// (accent), upside warns of stock-outs (amber), downside of overstock (blue).
const RISKS = {
  balanced: ["Balanced", CHART.primary],
  upside: ["Could run high", CHART.warning],
  downside: ["Could run low", CHART.info],
} as const;
const Chart = dynamic(() => import("./studio-chart"), {
  ssr: false,
  loading: () => <p role="status">Loading portfolio chart…</p>,
});

/**
 * One row per item, largest first: the bar spans the low to high case and the
 * dot marks the base case. Wide bars are the items that need the most buffer.
 */
export function PortfolioRanges({
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
  // Per period for additive data so items with any horizon compare fairly.
  const at = (s: SeriesForecast, q: 10 | 50 | 90) =>
    additive
      ? s.total_distribution.percentiles[q] / s.dates.length
      : s.total_distribution.percentiles[q];
  const shown = [...rows]
    .sort((a, b) => at(b, 50) - at(a, 50))
    .slice(0, MAX_ROWS);
  const byId = new Map(shown.map((s) => [s.series_id, s]));
  const format = valueFormatter({ unit, country });
  const pct = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const ids = shown.map((s) => s.series_id);
  const option: EChartsOption = {
    grid: { left: 24, right: 28, top: 36, bottom: 40, containLabel: true },
    legend: {
      top: 0,
      itemGap: 24,
      icon: "circle",
      data: Object.entries(RISKS)
        .filter(([risk]) => shown.some((s) => s.risk.risk_direction === risk))
        .map(([, [name]]) => name),
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      renderMode: "richText",
      formatter: (params) => {
        const point = Array.isArray(params) ? params[0] : params;
        const s = byId.get(String(point.name));
        if (!s) return "";
        return [
          itemLabel(s.series_id),
          `High case (P90): ${format.format(at(s, 90))}`,
          `Base case (P50): ${format.format(at(s, 50))}`,
          `Low case (P10): ${format.format(at(s, 10))}`,
          `Range width: ${pct.format(s.risk.uncertainty_score * 100)}% of base`,
          `${RISKS[s.risk.risk_direction][0]}`,
        ].join("\n");
      },
    },
    xAxis: {
      type: "value",
      min: 0,
      name: additive ? "Per period" : "Average per period",
      nameLocation: "middle",
      nameGap: 28,
      axisLabel: { formatter: (v: number) => format.format(v) },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: ids,
      axisTick: { show: false },
      axisLabel: {
        formatter: (id: string) => itemLabel(id),
        width: 180,
        overflow: "truncate",
      },
    },
    series: [
      {
        type: "bar",
        stack: "range",
        silent: true,
        itemStyle: { color: "transparent" },
        data: shown.map((s) => Math.max(0, at(s, 10))),
      },
      {
        type: "bar",
        stack: "range",
        barWidth: 12,
        cursor: "pointer",
        data: shown.map((s) => ({
          value: at(s, 90) - Math.max(0, at(s, 10)),
          itemStyle: {
            color: RISKS[s.risk.risk_direction][1],
            opacity: 0.22,
            borderRadius: 6,
          },
        })),
      },
      ...Object.entries(RISKS).map(([risk, [name, color]]) => ({
        name,
        type: "scatter" as const,
        symbolSize: 11,
        cursor: "pointer",
        itemStyle: { color, borderColor: "#fff", borderWidth: 1.5 },
        z: 3,
        data: shown
          .filter((s) => s.risk.risk_direction === risk)
          .map((s) => ({ name: s.series_id, value: [at(s, 50), s.series_id] })),
      })),
    ],
  };
  return (
    <Card className="module-chart-card">
      <h2>
        Demand range by item{" "}
        <InfoTip label="How to read the portfolio chart">
          Each row is one item, largest first. The bar runs from the low case
          (P10) to the high case (P90); the dot is the base case (P50). Wider
          bars need more safety stock. Colour shows which way the risk leans:
          amber items could run well above the base case (stock-out risk), blue
          items well below it (overstock risk). Select a row to open its
          forecast.
        </InfoTip>
      </h2>
      {shown.length ? (
        <>
          {rows.length > MAX_ROWS && (
            <Hint role="status">
              Showing the {MAX_ROWS} largest of {rows.length} items. The table
              and export include every item.
            </Hint>
          )}
          <Chart
            option={option}
            label="Demand range by item"
            onSelect={onSelect}
            height={Math.max(220, 90 + shown.length * 30)}
          />
        </>
      ) : (
        <p>No items match this view.</p>
      )}
    </Card>
  );
}
