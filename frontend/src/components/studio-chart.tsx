"use client";
import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import * as echarts from "echarts/core";
import { ScatterChart, HeatmapChart, BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CalendarComponent,
  VisualMapComponent,
  DataZoomComponent,
  AriaComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
echarts.use([
  ScatterChart,
  HeatmapChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CalendarComponent,
  VisualMapComponent,
  DataZoomComponent,
  AriaComponent,
  SVGRenderer,
]);
export default function StudioChart({
  option,
  label,
  onSelect,
  height = 340,
}: {
  option: EChartsOption;
  label: string;
  onSelect?: (name: string) => void;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "svg" });
    chart.setOption({
      animation: false,
      aria: { enabled: true },
      textStyle: { color: resolvedTheme === "dark" ? "#b4c7bb" : "#526259" },
      ...option,
    });
    chart.on("click", (event) => {
      if (typeof event.name === "string") onSelect?.(event.name);
    });
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(ref.current);
    return () => {
      resize.disconnect();
      chart.dispose();
    };
  }, [option, onSelect, resolvedTheme]);
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
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "zerocast-chart.png";
    a.click();
  }
  return (
    <div className="studio-chart-wrap">
      <button
        className="accuracy-export"
        aria-label={`Export ${label} PNG`}
        onClick={download}
      >
        PNG ↗
      </button>
      <div
        ref={ref}
        className="studio-chart"
        style={{ height }}
        role="img"
        aria-label={label}
      />
    </div>
  );
}
