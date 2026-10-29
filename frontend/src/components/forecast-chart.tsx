"use client";
import {
  CHART,
  chartStructure,
  primaryFor,
  registerChartThemes,
  themeName,
} from "@/lib/chart-theme";
import { useEffect, useRef } from "react";
import { valueFormatter, countUnits } from "@/lib/numbers";
import { formatPeriod, type Frequency } from "@/lib/dates";
import { useTheme } from "next-themes";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  AriaComponent,
  MarkLineComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { EChartsOption, LineSeriesOption } from "echarts";
import type { SeriesForecast, History } from "@/lib/forecast";
import {
  periodKey,
  type BacktestPoint,
  type ReviewSeries,
} from "@/lib/forecast-story";
echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  AriaComponent,
  MarkLineComponent,
  SVGRenderer,
]);
export default function ForecastChart({
  series,
  levels,
  history,
  frequency,
  country,
  unit,
  currency,
  paths = [],
  backtest = [],
  review,
  showLastYear = false,
}: {
  series: SeriesForecast;
  levels: number[];
  history?: History;
  frequency: Frequency;
  country?: string | null;
  unit?: string;
  currency?: "INR";
  paths?: number[][];
  backtest?: BacktestPoint[];
  review?: ReviewSeries;
  showLastYear?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!ref.current) return;
    registerChartThemes();
    const chart = echarts.init(
      ref.current,
      themeName(resolvedTheme === "dark"),
      {
        renderer: "svg",
      },
    );
    const historyMap = new Map(
      history?.dates.map((date, i) => [periodKey(date), history.target[i]]) ??
        [],
    );
    const dates = [
      ...new Map(
        [
          ...(history?.dates ?? []),
          ...backtest
            .filter((p) => periodKey(p.date) < periodKey(series.dates[0]))
            .map((p) => p.date),
        ].map((date) => [periodKey(date), date]),
      ).values(),
    ].sort((a, b) => periodKey(a).localeCompare(periodKey(b)));
    const targets = dates.map(
      (date) => historyMap.get(periodKey(date)) ?? null,
    );
    const allDates = [...dates, ...series.dates];
    const replayMap = new Map(backtest.map((p) => [periodKey(p.date), p]));
    const surpriseMarkers = backtest.flatMap((point) => {
      if (
        point.actual === null ||
        point.expected_p10 === undefined ||
        point.expected_p90 === undefined ||
        (point.actual >= point.expected_p10 &&
          point.actual <= point.expected_p90)
      )
        return [];
      const index = allDates.findIndex(
        (date) => periodKey(date) === periodKey(point.date),
      );
      return index < 0
        ? []
        : [
            {
              name:
                point.actual > point.expected_p90
                  ? "Demand spike"
                  : "Demand drop",
              coord: [index, point.actual] as [number, number],
              value: point.actual,
              itemStyle: {
                color:
                  point.actual > point.expected_p90 ? CHART.good : CHART.bad,
              },
            },
          ];
    });
    const format = valueFormatter({ country, unit, currency });
    const startValue = Math.max(0, dates.length - 90);
    const endValue = dates.length + series.dates.length - 1;
    const pad = (values: (number | null)[]) => [
      ...dates.map(() => null),
      ...values,
    ];
    const q = (level: number) => series.quantiles[levels.indexOf(level)];
    const green = primaryFor(resolvedTheme === "dark");
    const muted = chartStructure(resolvedTheme === "dark").text;
    const band = (
      low: number,
      high: number,
      opacity: number,
    ): LineSeriesOption[] => [
      {
        type: "line",
        data: pad(q(low)),
        stack: String(low),
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
        data: pad(q(high).map((v, i) => v - q(low)[i])),
        stack: String(low),
        stackStrategy: "all",
        symbol: "none",
        lineStyle: { opacity: 0 },
        areaStyle: { color: green, opacity },
        itemStyle: { color: green },
        tooltip: { show: false },
        silent: true,
      },
    ];
    const option: EChartsOption = {
      animation: false,
      aria: {
        enabled: true,
        label: {
          description:
            "Past demand in grey, the base-case forecast in green, and a shaded low-to-high forecast range (P10 to P90). Comparisons are optional. Exact values are in the table below.",
        },
      },
      textStyle: { color: muted },
      grid: {
        left: 65,
        right: 20,
        top: ref.current.clientWidth < 600 ? 75 : 55,
        bottom: 75,
      },
      legend: {
        top: 0,
        left: 10,
        right: 10,
        itemWidth: 14,
        itemHeight: 8,
        itemGap: 8,
        textStyle: { color: muted, fontSize: 11 },
        data: [
          "Past demand",
          "Forecast",
          "Forecast range",
          ...(showLastYear && series.last_year ? ["Last year"] : []),
          ...(paths.length ? ["Possible futures"] : []),
          ...(backtest.length ? ["Backtest forecast", "Backtest actual"] : []),
        ],
        selectedMode: false,
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line" },
        renderMode: "richText",
        formatter: (params) => {
          const items = Array.isArray(params) ? params : [params];
          const index = items[0]?.dataIndex;
          if (index === undefined) return "";
          const lines = [formatPeriod(allDates[index], frequency)];
          const actual = targets[index];
          if (actual !== null && actual !== undefined)
            lines.push(`Past demand: ${format.format(actual)}`);
          const step = index - dates.length;
          if (step >= 0) {
            lines.push(`Forecast: ${format.format(q(0.5)[step])}`);
            lines.push(
              `Low–high: ${format.format(q(0.1)[step])} – ${format.format(q(0.9)[step])}`,
            );
          }
          for (const item of items) {
            if (
              ["Last year", "Backtest forecast", "Backtest actual"].includes(
                item.seriesName ?? "",
              ) &&
              typeof item.value === "number"
            )
              lines.push(`${item.seriesName}: ${format.format(item.value)}`);
          }
          return lines.join("\n");
        },
      },
      xAxis: {
        type: "category",
        data: allDates.map((d) => formatPeriod(d, frequency)),
        boundaryGap: false,
        axisLabel: {
          hideOverlap: true,
        },
      },
      yAxis: {
        type: "value",
        scale: true,
        minInterval: countUnits(unit) && !currency ? 1 : undefined,
        axisLabel: { formatter: (v: number) => format.format(v) },
        splitLine: {
          lineStyle: {
            color: chartStructure(resolvedTheme === "dark").grid,
          },
        },
      },
      dataZoom: [
        {
          type: "slider",
          left: 65,
          right: 20,
          bottom: 6,
          height: 22,
          startValue,
          endValue,
        },
        { type: "inside", startValue, endValue },
      ],
      series: [
        ...paths.map((path): LineSeriesOption => ({
          name: "Possible futures",
          type: "line",
          data: pad(path),
          symbol: "none",
          silent: true,
          tooltip: { show: false },
          lineStyle: { color: green, width: 1, opacity: 0.12 },
          itemStyle: { color: green },
          z: 1,
        })),
        ...band(0.1, 0.9, 0.18),
        ...(backtest.length
          ? ([
              {
                name: "Backtest forecast",
                type: "line",
                data: allDates.map(
                  (date) =>
                    replayMap.get(periodKey(date))?.expected_p50 ?? null,
                ),
                connectNulls: false,
                symbol: "none",
                lineStyle: {
                  color: resolvedTheme === "dark" ? CHART.infoSoft : CHART.info,
                  width: 2,
                  type: "dashed",
                },
                z: 5,
              },
              {
                name: "Backtest actual",
                type: "line",
                data: allDates.map(
                  (date) => replayMap.get(periodKey(date))?.actual ?? null,
                ),
                connectNulls: false,
                symbol: "circle",
                symbolSize: 4,
                lineStyle: {
                  color: resolvedTheme === "dark" ? CHART.infoSoft : CHART.info,
                  width: 1.4,
                },
                itemStyle: {
                  color: resolvedTheme === "dark" ? CHART.infoSoft : CHART.info,
                },
                markPoint: {
                  data: surpriseMarkers,
                  symbol: "triangle",
                  symbolSize: 12,
                  label: { show: false },
                },
                z: 6,
              },
            ] as LineSeriesOption[])
          : []),
        {
          name: "Past demand",
          type: "line",
          data: [...targets, ...series.dates.map(() => null)],
          symbol: "none",
          connectNulls: false,
          lineStyle: { color: muted, width: 1.8 },
          itemStyle: { color: muted },
        },
        {
          name: "Forecast",
          type: "line",
          data: pad(q(0.5)),
          symbol: "none",
          lineStyle: { color: green, width: 3 },
          itemStyle: { color: green },
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: muted, type: "dashed", opacity: 0.5 },
            label: { formatter: "Forecast start", fontSize: 10, color: muted },
            data: [{ xAxis: dates.length }],
          },
        },
        ...(showLastYear && series.last_year
          ? [
              {
                name: "Last year",
                type: "line",
                data: pad(series.last_year ?? series.dates.map(() => null)),
                symbol: "none",
                connectNulls: false,
                lineStyle: { color: CHART.warning, type: "dashed" },
                itemStyle: { color: CHART.warning },
              } as LineSeriesOption,
            ]
          : []),
      ],
    };
    chart.setOption(option);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [
    series,
    levels,
    history,
    resolvedTheme,
    frequency,
    country,
    unit,
    currency,
    paths,
    backtest,
    review,
    showLastYear,
  ]);
  return (
    <div className="forecast-chart-wrap">
      <button
        className="chart-export"
        onClick={async () => {
          const chart = ref.current && echarts.getInstanceByDom(ref.current);
          if (!chart) return;
          const url = chart.getDataURL({
            type: "svg",
            backgroundColor: chartStructure(resolvedTheme === "dark").surface,
          });
          const img = new Image();
          img.src = url;
          await img.decode();
          const canvas = document.createElement("canvas");
          canvas.width = chart.getWidth() * 2;
          canvas.height = chart.getHeight() * 2;
          const context = canvas.getContext("2d");
          if (!context) return;
          context.drawImage(img, 0, 0, canvas.width, canvas.height);
          const link = document.createElement("a");
          link.download = "zerocast-forecast.png";
          link.href = canvas.toDataURL("image/png");
          link.click();
        }}
        aria-label="Export forecast chart PNG"
      >
        PNG ↗
      </button>
      <div
        ref={ref}
        className="forecast-chart"
        role="img"
        aria-label="Past demand, base-case forecast and low-to-high forecast range"
      />
    </div>
  );
}
