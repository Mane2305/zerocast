"use client";
import { itemLabel } from "@/lib/pickers";
import { Pagination, SortHeader } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/layout";
import { RouteState } from "@/components/ui/route-state";
import { Callout, Hint } from "@/components/ui/feedback";
import { StatCard, StatGrid } from "@/components/ui/stat";
import { Select } from "./ui/select";
import { InfoTip } from "./info-tip";
import { useDeferredValue, useMemo, useState } from "react";
import { formatPeriod } from "@/lib/dates";
import { findDemo } from "@/lib/demos";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  checkLabels,
  HealthError,
  loadHealth,
  type Dataset,
  type Check,
} from "@/lib/data-health";

const HEALTH_PAGE_SIZE = 50;

export function DataHealthView({
  id,
  source,
}: {
  id: string;
  source: "api" | "demo";
}) {
  const query = useQuery({
    queryKey: ["data-health", source, id],
    queryFn: ({ signal }) => loadHealth(id, source, signal),
  });
  if (query.isPending)
    return (
      <RouteState kind="loading">
        <PageHeader
          eyebrow="Data Quality"
          title={<>Loading your health report…</>}
          description={<>Reading dataset checks and item history summaries.</>}
        />
      </RouteState>
    );
  if (query.isError && !query.data)
    return (
      <RouteState kind="error">
        <PageHeader
          eyebrow="Data Quality"
          title={
            query.error instanceof HealthError
              ? query.error.title
              : "Health report unavailable"
          }
          description={query.error.message}
        />
        <div className="download-actions">
          <Button onClick={() => query.refetch()} disabled={query.isFetching}>
            Retry
          </Button>
          <Button asChild variant="outline">
            <Link href="/data-health">Choose another dataset</Link>
          </Button>
        </div>
      </RouteState>
    );
  return (
    <HealthReport
      key={query.dataUpdatedAt}
      dataset={query.data}
      source={source}
      refreshing={query.isFetching}
      refreshError={query.isError ? query.error : null}
      refresh={() => query.refetch()}
    />
  );
}

function HealthReport({
  dataset,
  source,
  refreshing,
  refreshError,
  refresh,
}: {
  dataset: Dataset;
  source: "api" | "demo";
  refreshing: boolean;
  refreshError: Error | null;
  refresh: () => void;
}) {
  const [tab, setTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<"series_id" | "length">("series_id");
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(0);
  const [dismissed, setDismissed] = useState<number[]>([]);
  const deferredSearch = useDeferredValue(search);
  const number = (v: number) =>
    v.toLocaleString(dataset.holiday_country === "IN" ? "en-IN" : undefined, {
      maximumFractionDigits: 2,
    });
  const date = (v?: string) => formatPeriod(v, dataset.frequency);
  const checks = dataset.health.checks;
  const selected = tab === "all" ? undefined : checks[Number(tab)];
  const series = dataset.series;
  const affectedSeries = useMemo(
    () =>
      selected?.affected_series ? new Set(selected.affected_series) : undefined,
    [selected],
  );
  const suppliedSeriesIds = useMemo(
    () => new Set(series?.map((item) => item.series_id) ?? []),
    [series],
  );
  // Missing affected_series is not evidence that every series (or none) is affected.
  const linkageMissing = !!selected && selected.affected_series === undefined;
  const rows = useMemo(
    () =>
      (linkageMissing ? [] : (series ?? []))
        .filter(
          (s) =>
            (!selected || affectedSeries?.has(s.series_id)) &&
            s.series_id
              .toLocaleLowerCase()
              .includes(deferredSearch.toLocaleLowerCase()) &&
            (status === "all" || s.status === status),
        )
        .sort(
          (a, b) =>
            (sort === "length"
              ? a.length - b.length
              : a.series_id.localeCompare(b.series_id)) * (descending ? -1 : 1),
        ),
    [
      linkageMissing,
      series,
      selected,
      affectedSeries,
      deferredSearch,
      status,
      sort,
      descending,
    ],
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / HEALTH_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const firstRow = currentPage * HEALTH_PAGE_SIZE;
  const visibleRows = rows.slice(firstRow, firstRow + HEALTH_PAGE_SIZE);
  const toggleSort = (column: typeof sort) => {
    setSort(column);
    setDescending(sort === column ? !descending : false);
    setPage(0);
  };
  function exportRows() {
    // Neutralize spreadsheet formulas even in user-supplied items IDs/issues.
    const cell = (value: unknown) =>
      '"' +
      String(value ?? "")
        .replace(/^[=+@\-\t\r]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const csv = [
      [
        "series_id",
        "length",
        "start",
        "end",
        "missing_count",
        "status",
        "issues",
      ],
      ...rows.map((s) => [
        s.series_id,
        s.length,
        s.start,
        s.end,
        s.missing_count,
        s.status,
        s.issues?.join("; "),
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "zerocast-data-health.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const labels = (id: Check["id"]) => checkLabels[id];
  return (
    <div className="health-page">
      <section className="health-heading">
        <div>
          <PageHeader
            eyebrow={
              <>
                DATA QUALITY ·{" "}
                {source === "demo"
                  ? findDemo(dataset.dataset_id)?.synthetic
                    ? "SAVED SYNTHETIC DEMO"
                    : "SAVED REAL DATA DEMO"
                  : "UPLOADED DATASET"}
              </>
            }
            title={
              <>
                Data quality{" "}
                <InfoTip label="Data quality definition">
                  Checks on the uploaded history before forecasting.
                </InfoTip>
              </>
            }
            description={dataset.name}
          />
        </div>
        <Button variant="outline" onClick={refresh} disabled={refreshing}>
          <RefreshCw size={15} />
          {refreshing ? "Refreshing…" : "Refresh report"}
        </Button>
      </section>
      {refreshError && (
        <div className="health-notice severity-warning" role="alert">
          <div>
            <strong>Could not refresh this report</strong>
            <p>{refreshError.message}</p>
            <small>Showing the last successfully loaded report.</small>
          </div>
          <Button variant="outline" onClick={refresh} disabled={refreshing}>
            Retry
          </Button>
        </div>
      )}

      <section
        className={`health-readiness ${dataset.health.ready ? "is-ready" : "is-blocked"}`}
        aria-label="Forecast readiness"
      >
        {dataset.health.ready ? (
          <CheckCircle2 size={26} />
        ) : (
          <AlertTriangle size={26} />
        )}
        <div>
          <h2>
            {dataset.health.ready
              ? "Ready to forecast"
              : "Not ready to forecast"}
          </h2>
          <p>
            {dataset.health.ready
              ? "At least one item is ready; check warnings below."
              : "Resolve the issues and upload a corrected file."}
          </p>
          <div className="download-actions">
            <Button asChild variant="outline">
              <Link href="/upload">Upload a corrected file</Link>
            </Button>
            {source === "demo" && (
              <Button asChild>
                <Link href={`/forecast/${dataset.dataset_id}`}>
                  Open saved forecast
                </Link>
              </Button>
            )}
          </div>
          {source === "api" && (
            <p>
              <Link
                className="text-link"
                href={`/factors/dataset/${encodeURIComponent(dataset.dataset_id)}`}
              >
                Set up a driver check →
              </Link>
            </p>
          )}
          {source === "api" && dataset.health.ready && (
            <p>
              <Link
                className="text-link"
                href={`/review/dataset/${encodeURIComponent(dataset.dataset_id)}`}
              >
                Set up a year in review →
              </Link>
            </p>
          )}
          {source === "api" && (
            <Hint>
              {dataset.health.ready ? (
                <Link
                  className="text-link"
                  href={`/forecast/dataset/${encodeURIComponent(dataset.dataset_id)}`}
                >
                  Set up a forecast →
                </Link>
              ) : (
                "Resolve the reported issues before forecasting."
              )}
            </Hint>
          )}
        </div>
      </section>
      <StatGrid>
        <StatCard
          label="Items in dataset"
          value={<>{number(dataset.series_count)}</>}
          hint={
            <>
              {series
                ? `${number(series.length)} summaries supplied`
                : "Item summaries not supplied"}
            </>
          }
        />
        <StatCard
          label="Detected frequency"
          value={<span className="capitalize">{dataset.frequency}</span>}
          hint={<>Dataset-level detection</>}
        />
        <StatCard
          className="health-date"
          label="History coverage"
          value={
            <>
              {date(dataset.date_range?.start)}
              <br />→ {date(dataset.date_range?.end)}
            </>
          }
          hint={<>As reported by the source</>}
        />
      </StatGrid>
      <section aria-label="Data quality notices" className="health-notices">
        {checks.map(
          (c, i) =>
            c.count > 0 &&
            !dismissed.includes(i) && (
              <div key={i} className={`health-notice severity-${c.severity}`}>
                <div>
                  <strong>
                    {c.label || labels(c.id)}: {number(c.count)}
                    {c.percent !== undefined ? ` (${number(c.percent)}%)` : ""}
                  </strong>
                  <p>
                    {c.action_taken ||
                      "No action was reported. Review the affected items."}
                  </p>
                  <small>{c.severity} · Source: health check</small>
                </div>
                <button
                  aria-label={`Dismiss ${c.label || labels(c.id)} notice`}
                  onClick={() => setDismissed([...dismissed, i])}
                >
                  <X size={17} />
                </button>
              </div>
            ),
        )}
        {dismissed.length > 0 && (
          <Button variant="ghost" onClick={() => setDismissed([])}>
            Show dismissed notices ({dismissed.length})
          </Button>
        )}
        {checks.length === 0 && (
          <Hint>
            No individual checks were supplied. Readiness above comes directly
            from the report.
          </Hint>
        )}
      </section>
      <section className="health-series" aria-labelledby="series-heading">
        <div className="health-section-heading">
          <div>
            <h2 id="series-heading">Item quality</h2>
          </div>
          <Button
            variant="outline"
            onClick={exportRows}
            disabled={!rows.length}
          >
            <Download size={15} />
            Export filtered items
          </Button>
        </div>
        <div
          role="tablist"
          aria-label="Health checks"
          className="health-tabs zc-tabs"
          onKeyDown={(event) => {
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                '[role="tab"]',
              ),
            );
            const current = buttons.indexOf(event.target as HTMLButtonElement);
            const next =
              event.key === "ArrowRight"
                ? (current + 1) % buttons.length
                : event.key === "ArrowLeft"
                  ? (current - 1 + buttons.length) % buttons.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? buttons.length - 1
                      : -1;
            if (next >= 0) {
              event.preventDefault();
              buttons[next].focus();
              buttons[next].click();
            }
          }}
        >
          {[
            { id: "all", label: "All items", count: dataset.series_count },
            ...checks.map((c, i) => ({
              id: String(i),
              label: labels(c.id),
              count: c.count,
            })),
          ]
            // Checks with no hits are noise; keep the selected one visible.
            .filter((t) => t.id === "all" || t.count > 0 || tab === t.id)
            .map((t) => (
              <button
                key={t.id}
                id={`health-tab-${t.id}`}
                role="tab"
                aria-selected={tab === t.id}
                aria-controls="health-panel"
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => {
                  setTab(t.id);
                  setPage(0);
                }}
              >
                {t.label}
                <span className="zc-tab-count">{number(t.count)}</span>
              </button>
            ))}
        </div>
        <div
          id="health-panel"
          role="tabpanel"
          aria-labelledby={`health-tab-${tab}`}
          tabIndex={0}
        >
          <div className="health-filters">
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
              label="Status"
              options={[
                { value: "all", label: "All statuses" },
                { value: "ready", label: "Ready" },
                { value: "warning", label: "Warning" },
                { value: "excluded", label: "Excluded" },
              ]}
              value={status}
              onChange={(value) => {
                setStatus(value);
                setPage(0);
              }}
            />
          </div>
          {linkageMissing ? (
            <Callout tone="neutral">
              This check does not identify affected item. Its count is available
              above; a filtered list cannot be inferred.
            </Callout>
          ) : !series ? (
            <Callout tone="neutral">
              Item summaries were not supplied by the source.
            </Callout>
          ) : (
            <>
              <Hint role="status">
                {number(rows.length)} of {number(series.length)} supplied item
                shown{selected ? ` · ${labels(selected.id)}` : ""}.
              </Hint>
              {selected?.affected_series?.some(
                (id) => !suppliedSeriesIds.has(id),
              ) && (
                <Hint>
                  Some affected item have no supplied summary and cannot be
                  displayed in this table.
                </Hint>
              )}
              <div className="health-table-scroll">
                <table>
                  <caption className="sr-only">Item quality summaries</caption>
                  <thead>
                    <tr>
                      <SortHeader
                        label={<>Item</>}
                        active={sort === "series_id"}
                        descending={descending}
                        onSort={() => toggleSort("series_id")}
                      />
                      <SortHeader
                        label={<>History points</>}
                        active={sort === "length"}
                        descending={descending}
                        onSort={() => toggleSort("length")}
                      />
                      <th>Period</th>
                      <th>Missing</th>
                      <th>Status</th>
                      <th>Reported issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((s, i) => (
                      <tr key={`${s.series_id}-${i}`}>
                        <th scope="row">{itemLabel(s.series_id)}</th>
                        <td>{number(s.length)}</td>
                        <td>
                          {date(s.start)}
                          <br />→ {date(s.end)}
                        </td>
                        <td>
                          {s.missing_count === undefined
                            ? "Not supplied"
                            : number(s.missing_count)}
                        </td>
                        <td>
                          <span className={`health-status status-${s.status}`}>
                            {s.status}
                          </span>
                        </td>
                        <td>
                          {s.issues === undefined
                            ? "Not supplied"
                            : s.issues.length
                              ? s.issues
                                  .map(
                                    (issue) =>
                                      checkLabels[issue as Check["id"]] ||
                                      issue,
                                  )
                                  .join(" · ")
                              : "None reported"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={currentPage}
                pageSize={HEALTH_PAGE_SIZE}
                total={rows.length}
                onPage={setPage}
              />
              {!rows.length && series.length > 0 && (
                <Callout tone="neutral">
                  No items match. Clear your filters.
                </Callout>
              )}
              {!rows.length && series.length === 0 && (
                <Callout tone="neutral">
                  This dataset has no item summaries to display.
                </Callout>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
