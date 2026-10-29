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
        fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
      },
      legend: { textStyle: { color: s.text, fontSize: 12 } },
      tooltip: {
        backgroundColor: s.surface,
        borderColor: s.axis,
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
      dataZoom: {
        borderColor: s.axis,
        textStyle: { color: s.subtle },
        fillerColor: dark ? "rgba(141,215,180,0.15)" : "rgba(47,125,91,0.12)",
        handleStyle: { color: s.surface, borderColor: s.axis },
        dataBackground: {
          lineStyle: { color: s.axis },
          areaStyle: { color: s.grid },
        },
      },
    });
  }
}

export const themeName = (dark: boolean) => (dark ? "zc-dark" : "zc-light");
