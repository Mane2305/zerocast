"use client";
import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  AriaComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import type { AccuracySeries } from "@/lib/accuracy";
import { formatPeriod, type Frequency } from "@/lib/dates";
import { valueFormatter } from "@/lib/numbers";
echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  AriaComponent,
  SVGRenderer,
]);
export default function AccuracyChart({
  item,
  kind,
  frequency,
  unit,
  country,
}: {
  item: AccuracySeries;
  kind: "calibration" | "backtest";
  frequency: Frequency;
  unit?: string;
  country?: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "svg" });
    const color = resolvedTheme === "dark" ? "#8dd7b4" : "#23684f",
      muted = resolvedTheme === "dark" ? "#b4c7bb" : "#62706a";
    const format = valueFormatter({ country, unit });
    const points = [...item.quantile_coverage]
      .filter((p) => p.level >= 0.1 && p.level <= 0.9)
      .sort((a, b) => a.level - b.level);
    const common: EChartsOption = {
      animation: false,
      aria: { enabled: true },
      textStyle: { color: muted },
      grid: {
        left: 60,
        right: 18,
        top: 45,
        bottom: kind === "backtest" ? 75 : 60,
      },
      legend: {
        top: 0,
        textStyle: { color: muted, fontSize: 10 },
        itemWidth: 14,
        selectedMode: false,
      },
      tooltip: {
        trigger: "axis",
        renderMode: "richText",
        axisPointer: { type: "cross" },
      },
    };
    const option: EChartsOption =
      kind === "calibration"
        ? {
            ...common,
            tooltip: {
              trigger: "axis",
              renderMode: "richText",
              formatter: (params) => {
                const points = Array.isArray(params) ? params : [params];
                const point = points.find((p) => p.seriesName === "Observed");
                const values = point?.value;
                if (!Array.isArray(values)) return "";
                const number = new Intl.NumberFormat("en-US", {
                  maximumFractionDigits: 1,
                });
                return `Promised: ${number.format(Number(values[0]))}%\nObserved: ${number.format(Number(values[1]))}%`;
              },
            },
            xAxis: {
              type: "value",
              name: "Promised (%)",
              nameLocation: "middle",
              nameGap: 30,
              min: 0,
              max: 100,
              interval: 20,
            },
            yAxis: {
              type: "value",
              name: "Observed (%)",
              min: 0,
              max: 100,
              interval: 20,
            },
            series: [
              {
                name: "Perfect match",
                type: "line",
                data: [
                  [0, 0],
                  [100, 100],
                ],
                symbol: "none",
                lineStyle: { color: muted, type: "dashed", width: 1 },
                itemStyle: { color: muted },
                silent: true,
                tooltip: { show: false },
              },
              {
                name: "Observed",
                type: "line",
                data: points.map((p) => [p.level * 100, p.observed * 100]),
                symbolSize: 6,
                lineStyle: { color, width: 2 },
                itemStyle: { color },
              },
            ],
          }
        : {
            ...common,
            xAxis: {
              type: "category",
              data: item.backtest.dates.map((d) => formatPeriod(d, frequency)),
              boundaryGap: false,
              axisLabel: { hideOverlap: true },
            },
            yAxis: {
              type: "value",
              axisLabel: { formatter: (v: number) => format.format(v) },
            },
            tooltip: {
              ...common.tooltip,
              valueFormatter: (v) =>
                typeof v === "number" ? format.format(v) : String(v ?? ""),
            },
            dataZoom: [
              {
                type: "slider",
                startValue: Math.max(0, item.backtest.dates.length - 90),
                endValue: item.backtest.dates.length - 1,
                height: 20,
                bottom: 6,
              },
              {
                type: "inside",
                startValue: Math.max(0, item.backtest.dates.length - 90),
                endValue: item.backtest.dates.length - 1,
              },
            ],
            series: [
              {
                name: "Range floor",
                type: "line",
                data: item.backtest.p10,
                stack: "range",
                stackStrategy: "all",
                symbol: "none",
                lineStyle: { opacity: 0 },
                areaStyle: { opacity: 0 },
                tooltip: { show: false },
                silent: true,
              },
              {
                name: "Forecast range",
                type: "line",
                data: item.backtest.p90.map((v, i) => v - item.backtest.p10[i]),
                stack: "range",
                stackStrategy: "all",
                symbol: "none",
                lineStyle: { opacity: 0 },
                areaStyle: { color, opacity: 0.14 },
                itemStyle: { color },
                tooltip: { show: false },
                silent: true,
              },
              {
                name: "Base case (P50)",
                type: "line",
                data: item.backtest.p50,
                symbol: "none",
                lineStyle: { color, type: "dashed", width: 2 },
                itemStyle: { color },
              },
              {
                name: "Actual",
                type: "line",
                data: item.backtest.actual,
                connectNulls: false,
                symbolSize: 3,
                showSymbol: false,
                lineStyle: { color: muted, width: 2 },
                itemStyle: { color: muted },
              },
            ],
            legend: {
              ...common.legend,
              data: ["Actual", "Base case (P50)", "Forecast range"],
            },
          };
    chart.setOption(option);
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(ref.current);
    return () => {
      resize.disconnect();
      chart.dispose();
    };
  }, [item, kind, frequency, unit, country, resolvedTheme]);
  async function download() {
    const chart = ref.current && echarts.getInstanceByDom(ref.current);
    if (!chart) return;
    const img = new Image();
    img.src = chart.getDataURL({
      type: "svg",
      backgroundColor: resolvedTheme === "dark" ? "#17251d" : "#ffffff",
    });
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = chart.getWidth() * 2;
    canvas.height = chart.getHeight() * 2;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `zerocast-${kind}.png`;
    link.click();
  }
  return (
    <div className="accuracy-chart-wrap">
      <button
        className="accuracy-export"
        onClick={download}
        aria-label={`Export ${kind} chart PNG`}
      >
        PNG ↗
      </button>
      <div
        ref={ref}
        className="accuracy-chart"
        role="img"
        aria-label={
          kind === "calibration"
            ? `Promised versus observed coverage for ${item.series_id}`
            : `Backtest forecast versus actual for ${item.series_id}`
        }
      />
    </div>
  );
}
