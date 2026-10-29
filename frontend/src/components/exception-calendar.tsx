"use client";
import { Card } from "@/components/ui/layout";
import { CHART } from "@/lib/chart-theme";
import { Select } from "./ui/select";
import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { validAccuracy } from "@/lib/accuracy";
import { getAccuracyJob } from "@/lib/api/accuracy";
import { useDatasetPreferences } from "@/lib/preferences";
import { formatPeriod, type Frequency } from "@/lib/dates";
import type { ReviewSeries } from "@/lib/forecast-story";
import { InfoTip } from "./info-tip";
import type { EChartsOption } from "echarts";
const Chart = dynamic(() => import("./studio-chart"), {
  ssr: false,
  loading: () => <p role="status">Loading exception calendar…</p>,
});
export function ExceptionCalendar({
  id,
  series,
  saved,
  frequency,
}: {
  id: string;
  series: ReviewSeries;
  saved: boolean;
  frequency: Frequency;
}) {
  const preferences = useDatasetPreferences(id);
  const [pickedYear, setYear] = useState("");
  const query = useQuery({
    queryKey: ["exception-accuracy", id, saved, preferences.accuracyJob],
    queryFn: async ({ signal }) => {
      if (saved) {
        const r = await fetch(`/demo/${encodeURIComponent(id)}/accuracy.json`, {
          signal,
        });
        if (!r.ok) throw new Error("Complete backtest unavailable.");
        const value: unknown = await r.json();
        if (!validAccuracy(value)) throw new Error("Invalid backtest data.");
        return value;
      }
      const job = await getAccuracyJob(preferences.accuracyJob!, signal);
      return job.status === "succeeded" && validAccuracy(job.result)
        ? job.result
        : null;
    },
    enabled: saved || !!preferences.accuracyJob,
  });
  const item = query.data?.series.find(
    (item) => item.series_id === series.series_id,
  );
  const years = [
    ...new Set(item?.backtest.dates.map((date) => date.slice(0, 4)) || []),
  ].sort();
  const year = years.includes(pickedYear) ? pickedYear : years.at(-1);
  const events = new Map(
    [...series.positive_surprises, ...series.misses]
      .filter((e) => e.calendar_events?.length)
      .map((e) => [e.date.slice(0, 10), e.calendar_events!.join(", ")]),
  );
  const b = item?.backtest;
  const points =
    b?.dates.flatMap((date, i) =>
      b.actual[i] === null || date.slice(0, 4) !== year
        ? []
        : [
            {
              name: `${formatPeriod(date, frequency)} · ${events.get(date.slice(0, 10)) || "No supplied calendar event"}`,
              value: [
                date.slice(0, 10),
                b.actual[i]! < b.p10[i] ? -1 : b.actual[i]! > b.p90[i] ? 1 : 0,
              ],
              label: events.has(date.slice(0, 10))
                ? { show: true, formatter: "◊", color: CHART.event }
                : { show: false },
            },
          ],
    ) || [];
  const daily = ["daily", "weekly"].includes(frequency);
  // Show only the months that have data (a backtest rarely spans a full year).
  const shown = points.map((p) => p.value[0] as string).sort();
  const range: string | string[] =
    shown.length && year
      ? [
          shown[0].slice(0, 8) + "01",
          lastDayOfMonth(shown[shown.length - 1].slice(0, 7)),
        ]
      : year || "";
  const option: EChartsOption = {
    tooltip: {
      trigger: "item",
      renderMode: "richText",
      formatter: (p) => {
        const v = Array.isArray(p) ? p[0] : p;
        return `${v.name}\n${Array.isArray(v.value) && Number(v.value.at(-1)) < 0 ? "Below forecast range" : Array.isArray(v.value) && Number(v.value.at(-1)) > 0 ? "Above forecast range" : "Inside forecast range"}`;
      },
    },
    visualMap: {
      type: "piecewise",
      orient: "horizontal",
      left: "center",
      bottom: 0,
      pieces: [
        { value: -1, label: "Demand drop", color: CHART.bad },
        { value: 0, label: "Inside range", color: CHART.neutral },
        { value: 1, label: "Demand spike", color: CHART.good },
      ],
    },
    ...(daily
      ? {
          calendar: {
            top: 35,
            left: 45,
            right: 15,
            range,
            cellSize: ["auto", 22],
            splitLine: { show: false },
            yearLabel: { show: false },
          },
          series: [
            { type: "heatmap", coordinateSystem: "calendar", data: points },
          ],
        }
      : {
          grid: { top: 25, left: 25, right: 25, bottom: 70 },
          xAxis: {
            type: "category",
            data: points.map((p) => p.name.split(" · ")[0]),
            axisLabel: { hideOverlap: true },
          },
          yAxis: { type: "category", data: [year || "Periods"] },
          series: [
            {
              type: "heatmap",
              data: points.map((p, i) => ({ ...p, value: [i, 0, p.value[1]] })),
            },
          ],
        }),
  };
  return (
    <Card className="module-chart-card">
      <div className="module-chart-heading">
        <h2>
          Exceptions calendar{" "}
          <InfoTip label="Exception calendar definition">
            Colors compare actuals with the supplied P10–P90 backtest range.
            Unreported periods remain blank. ◊ marks a supplied calendar event,
            not a cause. Hourly records show their source date.
          </InfoTip>
        </h2>
        {years.length > 1 && (
          <Select
            label="Calendar year"
            hideLabel
            options={years.map((year) => ({ value: String(year) }))}
            value={String(year)}
            onChange={setYear}
          />
        )}
      </div>
      {item && points.length ? (
        <Chart
          option={option}
          label="Exceptions calendar heatmap"
          height={240}
        />
      ) : (
        <p role="status">
          {query.isFetching
            ? "Loading the backtest…"
            : "The calendar colours each day by how far it was from the forecast. It needs an accuracy backtest for this item. "}
          {!query.isFetching && (
            <Link
              className="text-link"
              href={saved ? `/accuracy/demo/${id}` : `/accuracy/dataset/${id}`}
            >
              Run Accuracy →
            </Link>
          )}
        </p>
      )}
      {item && points.length > 0 && (
        <small>Only periods in the backtest are coloured · {year}</small>
      )}
    </Card>
  );
}

function lastDayOfMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
