"use client";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import type { FactorResult } from "@/lib/factors";
import { InfoTip } from "./info-tip";
const Chart = dynamic(() => import("./studio-chart"), {
  ssr: false,
  loading: () => <p role="status">Loading driver chart…</p>,
});

const GOOD = "#347e61";
const BAD = "#c36b66";
const NEUTRAL = "#8fa39a";

/** One horizontal bar per driver, so drivers compare at a glance. */
function barOption(
  rows: { name: string; value: number; color: string; note: string }[],
  axisName: string,
): EChartsOption {
  return {
    grid: { left: 8, right: 56, top: 8, bottom: 28, containLabel: true },
    tooltip: {
      trigger: "item",
      renderMode: "richText",
      formatter: (p) => {
        const v = Array.isArray(p) ? p[0] : p;
        return `${v.name}\n${rows[v.dataIndex ?? 0]?.note ?? ""}`;
      },
    },
    xAxis: {
      type: "value",
      name: axisName,
      nameLocation: "middle",
      nameGap: 22,
      nameTextStyle: { fontSize: 11 },
      splitLine: { lineStyle: { color: "#e3e8e5" } },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: rows.map((r) => r.name),
      axisTick: { show: false },
      axisLabel: { fontSize: 12 },
    },
    series: [
      {
        type: "bar",
        barMaxWidth: 18,
        data: rows.map((r) => ({
          value: r.value,
          itemStyle: { color: r.color, borderRadius: 4 },
        })),
        label: {
          show: true,
          position: "right",
          fontSize: 11,
          formatter: (p) =>
            new Intl.NumberFormat("en-US", {
              maximumFractionDigits: 2,
              signDisplay: axisName.includes("%") ? "always" : "auto",
            }).format(Number(p.value)),
        },
      },
    ],
  };
}

export function DriverCharts({ result }: { result: FactorResult }) {
  const linked = result.factors
    .filter((f) => f.related.effect !== undefined)
    .map((f) => ({
      name: f.factor,
      value: f.related.effect!,
      color: NEUTRAL,
      note: `Standardized effect at lag ${f.related.best_lag ?? "?"}`,
    }));
  const lift = result.factors
    .filter((f) => f.helps_yug.change_pct !== undefined)
    .map((f) => ({
      name: f.factor,
      value: f.helps_yug.change_pct!,
      color: f.helps_yug.change_pct! < 0 ? GOOD : BAD,
      note:
        f.helps_yug.change_pct! < 0
          ? "Lower forecast error with this driver"
          : "Higher forecast error with this driver",
    }));
  const height = (n: number) => Math.max(140, 48 + n * 34);
  return (
    <section className="driver-multiples">
      <h2>
        Driver evidence at a glance{" "}
        <InfoTip label="Driver chart source">
          Historical link is the API’s standardized effect at its reported best
          lag (no full lag profile is supplied). Forecast lift is the change in
          backtest error when the driver is added: green (negative) means lower
          error. Neither establishes causation.
        </InfoTip>
      </h2>
      <div className="driver-compare">
        <article className="module-chart-card">
          <h3>Historical link</h3>
          <p className="muted">Standardized effect at the best reported lag</p>
          {linked.length ? (
            <Chart
              option={barOption(linked, "Effect")}
              label="Historical link by driver"
              height={height(linked.length)}
            />
          ) : (
            <p>Effects unavailable.</p>
          )}
        </article>
        <article className="module-chart-card">
          <h3>Forecast lift</h3>
          <p className="muted">Backtest error change · negative is better</p>
          {lift.length ? (
            <Chart
              option={barOption(lift, "Error change (%)")}
              label="Forecast lift by driver"
              height={height(lift.length)}
            />
          ) : (
            <p>Backtest change unavailable.</p>
          )}
        </article>
      </div>
    </section>
  );
}
