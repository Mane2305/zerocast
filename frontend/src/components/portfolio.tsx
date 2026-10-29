"use client";
import { itemLabel } from "@/lib/pickers";
import { SortHeader } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/layout";
import { RouteState } from "@/components/ui/route-state";
import { Disclosure } from "@/components/ui/controls";
import { Callout, Hint } from "@/components/ui/feedback";
import { StatCard, StatGrid } from "@/components/ui/stat";
import { Select } from "./ui/select";
import { InfoTip } from "./info-tip";
import { formatPeriod } from "@/lib/dates";
import { findDemo } from "@/lib/demos";
import { useDeferredValue, useMemo, useState } from "react";
import { PortfolioRanges } from "./portfolio-ranges";
import { validAccuracy } from "@/lib/accuracy";
import { getAccuracyJob } from "@/lib/api/accuracy";
import { useDatasetPreferences } from "@/lib/preferences";
import { valueFormatter } from "@/lib/numbers";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { getForecastJob } from "@/lib/api/forecast";
import { isDataset, loadHealth, type Dataset } from "@/lib/data-health";
import { validForecast, type Forecast } from "@/lib/forecast";
import {
  portfolioCsv,
  sortRisk,
  trustText,
  type RiskSort,
} from "@/lib/portfolio";

const PORTFOLIO_PAGE_SIZE = 50;

async function loadDemo(id: string, signal: AbortSignal) {
  const read = async (file: string) => {
    const r = await fetch(`/demo/${encodeURIComponent(id)}/${file}.json`, {
      signal,
    });
    if (!r.ok)
      throw new Error(
        `The saved demo ${file} file is unavailable (HTTP ${r.status}).`,
      );
    return r.json() as Promise<unknown>;
  };
  const [dataset, forecast] = await Promise.all([
    read("dataset"),
    read("forecast"),
  ]);
  if (
    !isDataset(dataset) ||
    dataset.dataset_id !== id ||
    !validForecast(forecast)
  )
    throw new Error(
      "The saved demo does not contain a valid dataset and forecast report.",
    );
  return { dataset, forecast };
}
export function PortfolioDemo({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["portfolio-demo", id],
    queryFn: ({ signal }) => loadDemo(id, signal),
    staleTime: Infinity,
  });
  if (query.isPending) return <PortfolioLoading />;
  if (query.isError)
    return (
      <PortfolioError
        message={query.error.message}
        retry={() => query.refetch()}
      />
    );
  return (
    <PortfolioTable
      dataset={query.data.dataset}
      forecast={query.data.forecast}
      source="demo"
      id={id}
    />
  );
}
export function PortfolioJob({ id, jobId }: { id: string; jobId: string }) {
  const dataset = useQuery({
    queryKey: ["data-health", "api", id],
    queryFn: ({ signal }) => loadHealth(id, "api", signal),
  });
  const job = useQuery({
    queryKey: ["forecast-job", jobId],
    queryFn: ({ signal }) => getForecastJob(jobId, signal),
  });
  if (dataset.isPending || job.isPending) return <PortfolioLoading />;
  if (dataset.isError || job.isError)
    return (
      <PortfolioError
        message={
          dataset.error?.message ||
          job.error?.message ||
          "Portfolio unavailable."
        }
        retry={() => {
          dataset.refetch();
          job.refetch();
        }}
      />
    );
  if (job.data.status !== "succeeded")
    return (
      <RouteState kind="empty">
        <PageHeader
          eyebrow="Portfolio"
          title={
            job.data.status === "failed"
              ? "This forecast failed."
              : "The forecast is still in progress."
          }
          description={
            job.data.error?.message ||
            job.data.message ||
            "Portfolio is available after a forecast completes."
          }
        />
        <p>Progress: {job.data.progress}%</p>
        <div className="download-actions">
          <Button asChild>
            <Link
              href={`/forecast/dataset/${encodeURIComponent(id)}?${new URLSearchParams({ job: jobId })}`}
            >
              Open forecast job
            </Link>
          </Button>
          <Button variant="outline" onClick={() => job.refetch()}>
            Refresh status
          </Button>
        </div>
      </RouteState>
    );
  if (!validForecast(job.data.result))
    return (
      <PortfolioError
        message="The job does not contain valid forecast risk metrics."
        retry={() => job.refetch()}
      />
    );
  return (
    <PortfolioTable
      dataset={dataset.data}
      forecast={job.data.result}
      source="api"
      id={id}
      jobId={jobId}
    />
  );
}
function PortfolioLoading() {
  return (
    <RouteState kind="loading">
      <PageHeader
        eyebrow="Portfolio"
        title={<>Loading portfolio risk…</>}
        description={<>Reading the supplied forecast risk metrics.</>}
      />
    </RouteState>
  );
}
function PortfolioError({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <RouteState kind="error">
      <PageHeader
        eyebrow="Portfolio"
        title={<>Portfolio unavailable</>}
        description={message}
      />
      <div className="download-actions">
        <Button onClick={retry}>Retry portfolio</Button>
        <Button asChild variant="outline">
          <Link href="/portfolio">Choose another forecast</Link>
        </Button>
      </div>
    </RouteState>
  );
}

function PortfolioTable({
  dataset,
  forecast,
  source,
  id,
  jobId,
}: {
  dataset: Dataset;
  forecast: Forecast;
  source: "api" | "demo";
  id: string;
  jobId?: string;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<RiskSort>("uncertainty");
  const [descending, setDescending] = useState(true);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState("all");
  const [label, setLabel] = useState("all");
  const [groupBy, setGroupBy] = useState("");
  const [groupValue, setGroupValue] = useState("");
  const attributes = useMemo(
    () => new Map(dataset.series?.map((s) => [s.series_id, s.attributes])),
    [dataset.series],
  );
  const groups = useMemo(
    () =>
      [
        ...new Set(
          dataset.series?.map((s) => s.attributes?.[groupBy] || "Not supplied"),
        ),
      ].sort(),
    [dataset.series, groupBy],
  );
  const preferences = useDatasetPreferences(id);
  const accuracy = useQuery({
    queryKey: ["portfolio-accuracy", source, id, preferences.accuracyJob],
    queryFn: async ({ signal }) => {
      if (source === "demo") {
        const r = await fetch(`/demo/${encodeURIComponent(id)}/accuracy.json`, {
          signal,
        });
        if (!r.ok) return null;
        const data: unknown = await r.json();
        return validAccuracy(data) ? data : null;
      }
      const job = await getAccuracyJob(preferences.accuracyJob!, signal);
      return job.status === "succeeded" && validAccuracy(job.result)
        ? job.result
        : null;
    },
    enabled: source === "demo" || !!preferences.accuracyJob,
  });
  const quantity = valueFormatter({
    country: dataset.holiday_country,
    unit: dataset.unit || findDemo(id)?.unit,
  });
  const number = (v: number) =>
    v.toLocaleString(dataset.holiday_country === "IN" ? "en-IN" : undefined, {
      maximumFractionDigits: 1,
    });
  const rows = useMemo(() => {
    const filtered = forecast.series.filter(
      (s) =>
        s.series_id
          .toLocaleLowerCase()
          .includes(deferredSearch.toLocaleLowerCase()) &&
        (!groupBy ||
          !groupValue ||
          (attributes.get(s.series_id)?.[groupBy] || "Not supplied") ===
            groupValue) &&
        (direction === "all" || direction === s.risk.risk_direction) &&
        (label === "all" ||
          (label === "unreported"
            ? s.risk.uncertainty_label === undefined
            : label === s.risk.uncertainty_label)),
    );
    const ordered = sortRisk(filtered, sort, descending);
    if (groupBy)
      ordered.sort((a, b) =>
        (
          attributes.get(a.series_id)?.[groupBy] || "Not supplied"
        ).localeCompare(
          attributes.get(b.series_id)?.[groupBy] || "Not supplied",
        ),
      );
    return ordered;
  }, [
    forecast.series,
    deferredSearch,
    groupBy,
    groupValue,
    attributes,
    direction,
    label,
    sort,
    descending,
  ]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PORTFOLIO_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const firstRow = currentPage * PORTFOLIO_PAGE_SIZE;
  const visibleRows = rows.slice(firstRow, firstRow + PORTFOLIO_PAGE_SIZE);
  const lastRow = Math.min(firstRow + PORTFOLIO_PAGE_SIZE, rows.length);
  const accuracyBySeries = useMemo(
    () =>
      new Map(
        accuracy.data?.series.map((item) => [item.series_id, item.wape]) ?? [],
      ),
    [accuracy.data],
  );
  const url = (seriesId: string) =>
    source === "demo"
      ? `/forecast/${encodeURIComponent(id)}?${new URLSearchParams({ series: seriesId })}`
      : `/forecast/dataset/${encodeURIComponent(id)}?${new URLSearchParams({ job: jobId!, series: seriesId })}`;
  const changeSort = (column: RiskSort) => {
    setSort(column);
    setDescending(sort === column ? !descending : column === "uncertainty");
  };
  function download() {
    const href = URL.createObjectURL(
      new Blob([portfolioCsv(rows, dataset.frequency)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = href;
    a.download = "zerocast-portfolio-risk.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  return (
    <section className="health-page portfolio-page">
      <div className="health-heading">
        <div>
          <PageHeader
            eyebrow={
              <>
                PORTFOLIO ·{" "}
                {source === "demo"
                  ? findDemo(id)?.synthetic
                    ? "SYNTHETIC DEMO"
                    : "PRECOMPUTED MODEL FORECAST"
                  : "COMPLETED FORECAST"}
              </>
            }
            title={<>Portfolio</>}
            description={dataset.name}
          />
        </div>
        <Button variant="outline" onClick={download} disabled={!rows.length}>
          Export visible rows
        </Button>
      </div>

      <StatGrid>
        <StatCard
          label="Items in forecast"
          value={<>{number(forecast.series.length)}</>}
          hint={<>{number(dataset.series_count)} items in dataset</>}
        />
        <StatCard
          label={
            <>
              High variability{" "}
              <InfoTip label="Forecast variability definition">
                Width of the forecast range relative to the base case. Higher
                means less predictable. The percentage is the full range width,
                not a plus/minus value.
              </InfoTip>
            </>
          }
          value={
            <>
              {number(
                forecast.series.filter(
                  (s) => s.risk.uncertainty_label === "volatile",
                ).length,
              )}
            </>
          }
          hint={<>Classification supplied by the source</>}
        />
        <StatCard
          label="Forecast frequency"
          value={<span className="capitalize">{dataset.frequency}</span>}
          hint={<>Reliable horizon uses this cadence</>}
        />
      </StatGrid>
      <div className="health-filters portfolio-filters">
        {!!dataset.hierarchy?.length && (
          <>
            <Select
              label="Group by"
              options={[
                { value: "", label: "No grouping" },
                ...dataset.hierarchy.map((column) => ({ value: column })),
              ]}
              value={groupBy}
              onChange={(value) => {
                setGroupBy(value);
                setGroupValue("");
                setPage(0);
              }}
            />
            {groupBy && (
              <Select
                label="Group"
                options={[
                  { value: "", label: "All groups" },
                  ...groups.map((name) => ({ value: name })),
                ]}
                value={groupValue}
                onChange={(value) => {
                  setGroupValue(value);
                  setPage(0);
                }}
              />
            )}
          </>
        )}
        <label>
          Search items
          <input
            aria-label="Search items"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Item ID"
          />
        </label>
        <Select
          label="Variability"
          options={[
            { value: "all", label: "All labels" },
            { value: "predictable", label: "Predictable" },
            { value: "moderate", label: "Moderate" },
            { value: "volatile", label: "Volatile" },
            { value: "unreported", label: "Not reported" },
          ]}
          value={label}
          onChange={(value) => {
            setLabel(value);
            setPage(0);
          }}
        />
        <Select
          label="Demand risk"
          options={[
            { value: "all", label: "All directions" },
            { value: "upside", label: "Upside" },
            { value: "downside", label: "Downside" },
            { value: "balanced", label: "Balanced" },
          ]}
          value={direction}
          onChange={(value) => {
            setDirection(value);
            setPage(0);
          }}
        />
        <Button
          variant="ghost"
          onClick={() => {
            setSearch("");
            setDirection("all");
            setLabel("all");
            setPage(0);
          }}
        >
          Clear filters
        </Button>
      </div>
      <Hint role="status">
        {number(rows.length)} of {number(forecast.series.length)} items shown.
      </Hint>
      <PortfolioRanges
        rows={rows}
        additive={dataset.additive}
        unit={dataset.unit || findDemo(id)?.unit}
        country={dataset.holiday_country}
        onSelect={(id) => router.push(url(id))}
      />
      <div
        className="health-table-scroll portfolio-table"
        tabIndex={0}
        role="region"
        aria-label="Portfolio table"
      >
        <table>
          <caption className="sr-only">
            Risk metrics for each forecast item
          </caption>
          <thead>
            <tr>
              {groupBy && <th>{groupBy}</th>}
              {(
                [
                  ["series_id", "Item"],
                  ["uncertainty", "Forecast variability"],
                  ["direction", "Demand risk"],
                  ["trust", "Reliable horizon"],
                ] as const
              ).map(([key, title]) => (
                <SortHeader
                  key={key}
                  label={title}
                  active={sort === key}
                  descending={descending}
                  onSort={() => {
                    changeSort(key);
                    setPage(0);
                  }}
                  info={
                    <>
                      <InfoTip label={`${title} definition`}>
                        {key === "series_id"
                          ? "The product, SKU, store × product, or plant being forecast."
                          : key === "uncertainty"
                            ? "Full forecast range width relative to the base case. Higher means less predictable; this is not a plus/minus percentage."
                            : key === "direction"
                              ? "Whether demand exceptions are more likely to be spikes (upside) or drops (downside), based on the supplied distribution."
                              : "How far ahead the forecast stays reasonably tight, under the model’s threshold."}
                      </InfoTip>
                    </>
                  }
                />
              ))}
              <th>
                {dataset.additive ? "Base case total" : "Base case average"}
              </th>
              <th>
                WAPE{" "}
                <InfoTip label="Portfolio WAPE source">
                  Supplied Accuracy scores for a matching item and forecast
                  horizon. Missing scores remain unavailable.
                </InfoTip>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((s) => (
              <tr
                key={s.series_id}
                onClick={(e) => {
                  if (
                    !(e.target as HTMLElement).closest("a,button") &&
                    !e.ctrlKey &&
                    !e.metaKey &&
                    !e.shiftKey &&
                    !e.altKey
                  )
                    router.push(url(s.series_id));
                }}
              >
                {groupBy && (
                  <td>
                    {attributes.get(s.series_id)?.[groupBy] || "Not supplied"}
                  </td>
                )}
                <th scope="row">
                  <Link className="text-link" href={url(s.series_id)}>
                    {itemLabel(s.series_id)} <span aria-hidden="true">↗</span>
                  </Link>
                  <small className="portfolio-period">
                    {s.dates.length
                      ? `${formatPeriod(s.dates[0], dataset.frequency)} → ${formatPeriod(s.dates.at(-1), dataset.frequency)}`
                      : "No forecast periods"}
                  </small>
                </th>
                <td>
                  <strong>
                    {number(s.risk.uncertainty_score * 100)}% range width
                  </strong>
                  <small className="portfolio-period">
                    {s.risk.uncertainty_label || "Label not reported"}
                  </small>
                </td>
                <td>
                  <span
                    className={`portfolio-direction direction-${s.risk.risk_direction}`}
                  >
                    {s.risk.risk_direction === "upside"
                      ? "↑"
                      : s.risk.risk_direction === "downside"
                        ? "↓"
                        : "↔"}{" "}
                    {s.risk.risk_direction}
                  </span>
                </td>
                <td>
                  <strong>
                    {trustText(s.risk.trust_horizon, dataset.frequency)}
                  </strong>
                  <small className="portfolio-period">
                    {number(s.risk.trust_horizon)} of {number(s.dates.length)}{" "}
                    forecast periods
                  </small>
                </td>
                <td>{quantity.format(s.total_distribution.percentiles[50])}</td>
                <td>
                  {accuracy.data?.horizon === s.dates.length &&
                  accuracyBySeries.has(s.series_id)
                    ? `${number(accuracyBySeries.get(s.series_id)!)}%`
                    : "Unavailable"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > PORTFOLIO_PAGE_SIZE && (
        <nav className="health-pagination" aria-label="Portfolio table pages">
          <span>
            Items {number(firstRow + 1)}–{number(lastRow)} of{" "}
            {number(rows.length)}
          </span>
          <div>
            <Button
              variant="outline"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </Button>
            <span aria-live="polite">
              Page {number(currentPage + 1)} of {number(pageCount)}
            </span>
            <Button
              variant="outline"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </nav>
      )}
      {!rows.length && (
        <Callout tone="neutral">
          <h2>
            {forecast.series.length
              ? "No item match these filters."
              : "No item returned."}
          </h2>
          <p>
            {forecast.series.length
              ? "Clear the filters to see every forecast item."
              : "Choose a forecast with item results to review portfolio risk."}
          </p>
        </Callout>
      )}
      <Disclosure className="provenance" summary={<>Metric definitions</>}>
        <p>
          Uncertainty is the supplied sum of (P90 − P10) divided by the sum of
          |P50| over forecast periods, shown as a percentage. It is the full
          forecast range width, not a plus/minus interval, and can exceed 100%
          when the median is near zero. Labels and direction are provided by the
          source; the page does not apply its own thresholds.
        </p>
        <p>
          Upside means the upper side is wider, downside means the lower side is
          wider, and balanced means neither side dominates under the source’s
          rule. These describe uncertainty, not whether sales are rising or
          falling.
        </p>
        <p>
          Reliable horizon is the supplied number of leading periods whose
          cumulative relative forecast range width stays within the source’s
          threshold. Zero means no reliable periods were reported. Time units
          come from the dataset frequency; unknown frequency stays in periods.
          Treat this as a model estimate, not a guarantee.
        </p>
        <p>
          Source fields: each forecast item’ risk.uncertainty_score, optional
          uncertainty_label, risk_direction, and trust_horizon. No portfolio
          aggregate distribution is computed.
        </p>
      </Disclosure>
    </section>
  );
}
