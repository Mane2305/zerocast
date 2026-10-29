import * as echarts from "echarts/core";

/**
 * One chart palette for the whole app. Series colors are mid-tones that read
 * on both light and dark backgrounds; structural colors (text, axes, grid,
 * tooltip) come from the registered "zc-light" / "zc-dark" themes below.
 */
export const CHART = {
  primary: "#1f7a57", // forecast, base case, positive lift
  primaryDark: "#5fd4a0", // primary on dark backgrounds
  range: "#1f7a57", // forecast range band (use with opacity)
  history: "#6b7a72", // recorded demand
  good: "#2f8f66", // spike / better
  bad: "#c4605a", // drop / worse
  neutral: "#94a39b", // inside range / balanced / no direction
  info: "#3b6fb6", // last year, comparison lines
  infoSoft: "#9cbcf0",
  warning: "#b9873f", // capacity, caution markers
  event: "#7a4f16", // calendar event marker
} as const;

type Structural = {
  text: string;
  subtle: string;
  axis: string;
  grid: string;
  surface: string;
  empty: string;
};

export function chartStructure(dark: boolean): Structural {
  return dark
    ? {
        text: "#b4bfba",
        subtle: "#9ba7a1",
        axis: "#313a36",
        grid: "#1f2623",
        surface: "#121614",
        empty: "#191e1c",
      }
    : {
        text: "#5b6661",
        subtle: "#7b8681",
        axis: "#d2d7d4",
        grid: "#eceeed",
        surface: "#ffffff",
        empty: "#f1f3f2",
      };
}

/** Primary series color for the current theme. */
export const primaryFor = (dark: boolean) =>
  dark ? CHART.primaryDark : CHART.primary;

/**
 * The page's real font stack (next/font gives Inter a generated family name).
 * ECharts measures text with this string, so a CSS variable here would make it
 * measure a fallback font and overlap or clip the wider Inter labels.
 */
function bodyFont() {
  if (typeof document === "undefined") return "system-ui, sans-serif";
  return getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
}

let registered = false;
export function registerChartThemes() {
  if (registered) return;
  registered = true;
  for (const dark of [false, true]) {
    const s = chartStructure(dark);
    const axis = {
      axisLine: { lineStyle: { color: s.axis } },
      axisTick: { lineStyle: { color: s.axis } },
      axisLabel: { color: s.text, fontSize: 11 },
      splitLine: { lineStyle: { color: s.grid } },
      nameTextStyle: { color: s.subtle, fontSize: 11 },
    };
    echarts.registerTheme(dark ? "zc-dark" : "zc-light", {
      color: [
        primaryFor(dark),
        CHART.info,
        CHART.warning,
        CHART.bad,
        CHART.neutral,
      ],
      backgroundColor: "transparent",
      textStyle: {
        color: s.text,
        fontFamily: bodyFont(),
      },
      legend: {
        itemGap: 20,
        itemWidth: 12,
        itemHeight: 12,
        textStyle: { color: s.text, fontSize: 12 },
      },
      tooltip: {
        backgroundColor: s.surface,
        borderColor: s.axis,
        borderRadius: 8,
        padding: [8, 12],
        textStyle: { color: s.text, fontSize: 12 },
      },
      categoryAxis: axis,
      valueAxis: axis,
      timeAxis: axis,
      calendar: {
        itemStyle: { color: "transparent", borderColor: s.grid },
        dayLabel: { color: s.subtle },
        monthLabel: { color: s.text },
      },
      visualMap: { textStyle: { color: s.text } },
      // Theme values are merged into every slider, so no chart falls back
      // to ECharts' default blue-purple handles.
      dataZoom: {
        borderColor: s.axis,
        borderRadius: 4,
        backgroundColor: "transparent",
        textStyle: { color: s.subtle },
        fillerColor: dark ? "rgba(95,212,160,0.14)" : "rgba(31,122,87,0.10)",
        handleIcon: "path://M2,0 h2 v12 h-2 z",
        handleSize: "70%",
        handleStyle: { color: primaryFor(dark), borderColor: primaryFor(dark) },
        moveHandleSize: 5,
        moveHandleStyle: { color: s.axis, opacity: 1 },
        dataBackground: {
          lineStyle: { color: s.axis, width: 1 },
          areaStyle: { color: s.grid, opacity: 1 },
        },
        selectedDataBackground: {
          lineStyle: { color: primaryFor(dark), width: 1 },
          areaStyle: { color: primaryFor(dark), opacity: 0.12 },
        },
        emphasis: {
          handleStyle: { borderColor: primaryFor(dark) },
          moveHandleStyle: { color: primaryFor(dark) },
        },
        brushStyle: {
          color: dark ? "rgba(95,212,160,0.2)" : "rgba(31,122,87,0.15)",
        },
      },
    });
  }
}

export const themeName = (dark: boolean) => (dark ? "zc-dark" : "zc-light");
