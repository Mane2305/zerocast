"use client";
import { Disclosure } from "@/components/ui/controls";
import {
  CHART,
  primaryFor,
  registerChartThemes,
  themeName,
} from "@/lib/chart-theme";
import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  AriaComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { formatPeriod, type Frequency } from "@/lib/dates";
import { probabilityText } from "@/lib/forecast";
echarts.use([
  BarChart,
  GridComponent,
  TooltipComponent,
  AriaComponent,
  SVGRenderer,
]);
export default function CapacityChart({
  dates,
  frequency,
  bounds,
}: {
  dates: string[];
  frequency: Frequency;
  bounds: [number, number][];
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
    const color = primaryFor(resolvedTheme === "dark");
    chart.setOption({
      animation: false,
      aria: { enabled: true },
      grid: { left: 45, right: 10, top: 15, bottom: 45 },
      xAxis: {
        type: "category",
        data: dates.map((date) => formatPeriod(date, frequency)),
        axisLabel: { hideOverlap: true },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 100,
        axisLabel: { formatter: "{value}%" },
      },
      tooltip: { trigger: "axis", renderMode: "richText" },

      series: [
        {
          type: "bar",
          name: "Upper probability bound",
          data: bounds.map((value) => ({
            value: value[1],
            tooltip: { formatter: probabilityText(value) },
            // Colour carries the severity: calm, watch, act.
            itemStyle: {
              color:
                value[1] >= 50
                  ? CHART.bad
                  : value[1] >= 20
                    ? CHART.warning
                    : color,
              borderRadius: [3, 3, 0, 0],
            },
          })),
          barMaxWidth: 18,
        },
      ],
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [dates, frequency, bounds, resolvedTheme]);
  return (
    <>
      <div
        ref={ref}
        className="capacity-chart"
        role="img"
        aria-label="Capacity breach risk per period; bars show upper probability bounds"
      />
      <Disclosure summary={<>Probability ranges by period</>}>
        <div className="health-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Chance above capacity</th>
              </tr>
            </thead>
            <tbody>
              {dates.map((date, i) => (
                <tr key={date}>
                  <th>{formatPeriod(date, frequency)}</th>
                  <td>{probabilityText(bounds[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Disclosure>
    </>
  );
}
