"use client";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import type { FactorResult } from "@/lib/factors";
import { InfoTip } from "./info-tip";
const Chart = dynamic(() => import("./studio-chart"), {
  ssr: false,
  loading: () => <p role="status">Loading driver chart…</p>,
});
export function DriverCharts({ result }: { result: FactorResult }) {
  const option = (
    name: string,
    value: number,
    label: string,
  ): EChartsOption => ({
    grid: { left: 55, right: 15, top: 20, bottom: 35 },
    tooltip: { trigger: "axis", renderMode: "richText" },
    xAxis: { type: "category", data: [label] },
    yAxis: { type: "value" },
    series: [
      {
        type: "bar",
        name,
        data: [value],
        barMaxWidth: 50,
        itemStyle: { color: "#347e61" },
      },
    ],
  });
  return (
    <section className="driver-multiples">
      <h2>
        Driver evidence at a glance{" "}
        <InfoTip label="Driver chart source">
          Historical bars show the API’s standardized effect at its reported
          best lag. The API does not supply a full lag profile. Forecast lift
          shows the unchanged error change: negative means lower error. Neither
          establishes causation.
        </InfoTip>
      </h2>
      <div className="driver-cards">
        {result.factors.map((f) => (
          <article className="module-chart-card" key={f.factor}>
            <h3>{f.factor}</h3>
            <div className="driver-pair">
              <section>
                <h4>
                  Historical link · reported lag{" "}
                  {f.related.best_lag ?? "unavailable"}
                </h4>
                {f.related.effect === undefined ? (
                  <p>Effect unavailable</p>
                ) : (
                  <Chart
                    option={option(
                      "Standardized effect",
                      f.related.effect,
                      `Lag ${f.related.best_lag ?? "?"}`,
                    )}
                    label={`${f.factor} historical link`}
                    height={170}
                  />
                )}
              </section>
              <section>
                <h4>Forecast lift · error change (%)</h4>
                {f.helps_yug.change_pct === undefined ? (
                  <p>Backtest change unavailable</p>
                ) : (
                  <Chart
                    option={option(
                      "Error change (%)",
                      f.helps_yug.change_pct,
                      "Negative = better",
                    )}
                    label={`${f.factor} forecast lift`}
                    height={170}
                  />
                )}
              </section>
            </div>
          </article>
        ))}
      </div>
      <p className="health-note">
        Only the best lag is supplied; a full lag-by-lag profile is unavailable.
      </p>
    </section>
  );
}
