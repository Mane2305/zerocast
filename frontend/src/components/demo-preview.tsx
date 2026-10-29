"use client";
import { PageHeader } from "@/components/ui/layout";
import { RouteState } from "@/components/ui/route-state";
import { Disclosure } from "@/components/ui/controls";
import Link from "next/link";
import { useDatasetPreferences } from "@/lib/preferences";
import { useState, useSyncExternalStore } from "react";
import { formatPeriod } from "@/lib/dates";
import { averagePerPeriod } from "@/lib/numbers";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionCheck } from "@/components/connection-check";
import type { Demo } from "@/lib/demos";
import { loadDemo } from "@/lib/load-demo";
import { ForecastResults } from "./forecast-results";
import { validForecast } from "@/lib/forecast";
import { InfoTip } from "./info-tip";

const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function DemoPreview({
  demo,
  initialSeries,
}: {
  demo: Demo;
  initialSeries?: string;
}) {
  // The sidebar may fill the shared query cache before this boundary hydrates.
  // Keep its first browser render identical to the server's loading state.
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    clientSnapshot,
    serverSnapshot,
  );
  const preferences = useDatasetPreferences(demo.id);
  const level = preferences.level ?? 80;
  const [choice, setChoice] = useState("");
  const selected = choice || initialSeries || preferences.selected || "";
  const setLevel = (value: number) => preferences.update({ level: value });
  const setSelected = (value: string) => {
    setChoice(value);
    preferences.update({ selected: value });
    const url = new URL(window.location.href);
    url.searchParams.set("series", value);
    window.history.replaceState(null, "", url);
  };
  const query = useQuery({
    queryKey: ["demo", demo.id],
    queryFn: ({ signal }) => loadDemo(demo, signal),
    staleTime: Infinity,
  });
  const back = (
    <Button asChild variant="outline">
      <Link href="/data">Choose dataset</Link>
    </Button>
  );
  if (!hydrated || query.isPending)
    return (
      <RouteState kind="loading">
        <LoaderCircle size={26} className="animate-spin" />
        <h1>Opening your demo…</h1>
        <p>Loading the saved example. No model is running.</p>
      </RouteState>
    );
  if (query.isError)
    return (
      <RouteState kind="error">
        <PageHeader
          eyebrow="Demo Unavailable"
          title={<>We couldn’t open this demo.</>}
          description={
            query.error instanceof TypeError
              ? "The demo files are unreachable. Check your connection to this app and try again. These demos do not need the backend."
              : query.error.message
          }
        />
        <div className="download-actions">
          <Button onClick={() => query.refetch()}>Try again</Button>
          {back}
        </div>
      </RouteState>
    );
  const { dataset, forecast, histories } = query.data;
  const series =
    forecast.series.find((s) => s.series_id === selected) ?? forecast.series[0];
  const history = histories.find((h) => h.series_id === series?.series_id);
  if (!series || series.dates.length === 0)
    return (
      <RouteState kind="empty">
        <PageHeader
          eyebrow="No Saved Results"
          title={<>This demo has no forecast yet.</>}
        />
        {back}
      </RouteState>
    );
  return (
    <div className="forecast-workspace demo-workspace">
      <section className="forecast-context">
        <div>
          <div className="forecast-context-top">
            <InfoTip label="About this dataset">
              {demo.note} {demo.source}{" "}
              {history?.dates.length
                ? `History: ${formatPeriod(history.dates[0], dataset.frequency)}–${formatPeriod(history.dates.at(-1), dataset.frequency)}.`
                : "History is unavailable."}
            </InfoTip>
          </div>
          <h1>Forecast</h1>
          <p className="lede">
            {dataset.name} · {series.series_id}
          </p>
        </div>
        <div className="forecast-context-links">
          <Link href={`/portfolio/demo/${demo.id}`} className="text-link">
            Portfolio ↗
          </Link>
          <Link href={`/review/demo/${demo.id}`} className="text-link">
            Exceptions ↗
          </Link>
        </div>
      </section>
      {validForecast(forecast) ? (
        <ForecastResults
          forecast={forecast}
          accuracy={query.data.accuracy}
          frequency={dataset.frequency}
          history={history}
          review={query.data.review?.series.find(
            (item) => item.series_id === series.series_id,
          )}
          reviewNote={query.data.reviewNote}
          country={demo.country}
          unit={dataset.unit || demo.unit}
          average={averagePerPeriod(dataset)}
          synthetic={demo.synthetic}
          saved
          level={level}
          setLevel={setLevel}
          selected={selected}
          setSelected={setSelected}
        />
      ) : (
        <p role="alert">
          This saved forecast lacks the ordered quantiles required for planning.
        </p>
      )}
      <Disclosure className="forecast-source" summary={<>Source data</>}>
        <p>
          {demo.source || demo.note}{" "}
          {demo.sourceUrl && (
            <a href={demo.sourceUrl} className="text-link">
              Source details
            </a>
          )}
        </p>
        <div className="download-actions">
          <a
            href={`/demo/${demo.id}/forecast.json`}
            download
            className="text-link"
          >
            Forecast JSON
          </a>
          <a
            href={`/demo/${demo.id}/review.json`}
            download
            className="text-link"
          >
            Review JSON
          </a>
          {query.data.accuracy && (
            <a
              href={`/demo/${demo.id}/accuracy.json`}
              download
              className="text-link"
            >
              Accuracy JSON
            </a>
          )}
          <Link href="/data" className="text-link">
            Choose another dataset
          </Link>
        </div>
      </Disclosure>
      <Disclosure
        className="api-details"
        summary={
          <>
            API connection status <span>Optional for saved demos</span>
          </>
        }
      >
        <ConnectionCheck />
      </Disclosure>
    </div>
  );
}
