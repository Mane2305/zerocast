"use client";
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
      <section className="route-state" role="status" aria-live="polite">
        <p className="eyebrow">DATA QUALITY</p>
        <h1>Loading your health report…</h1>
        <p>Reading dataset checks and item history summaries.</p>
      </section>
    );
  if (query.isError)
    return (
      <section className="route-state" role="alert">
        <p className="eyebrow">DATA QUALITY</p>
        <h1>
          {query.error instanceof HealthError
            ? query.error.title
            : "Health report unavailable"}
        </h1>
        <p>{query.error.message}</p>
        <div className="download-actions">
          <Button onClick={() => query.refetch()} disabled={query.isFetching}>
            Retry
          </Button>
          <Button asChild variant="outline">
            <Link href="/data-health">Choose another dataset</Link>
          </Button>
        </div>
      </section>
    );
  return (
    <HealthReport
      key={query.dataUpdatedAt}
      dataset={query.data}
      source={source}
      refreshing={query.isFetching}
      refresh={() => query.refetch()}
    />
  );
}

function HealthReport({
  dataset,
  source,
  refreshing,
  refresh,
}: {
  dataset: Dataset;
  source: "api" | "demo";
  refreshing: boolean;
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
  const lastRow = Math.min(firstRow + HEALTH_PAGE_SIZE, rows.length);
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
          <p className="eyebrow">
            DATA QUALITY ·{" "}
            {source === "demo"
              ? findDemo(dataset.dataset_id)?.synthetic
                ? "SAVED SYNTHETIC DEMO"
                : "SAVED REAL DATA DEMO"
              : "UPLOADED DATASET"}
          </p>
          <h1>
            Data quality{" "}
            <InfoTip label="Data quality definition">
              Checks on the uploaded history before forecasting.
            </InfoTip>
          </h1>
          <p>{dataset.name}</p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={refreshing}>
          <RefreshCw size={15} />
          {refreshing ? "Refreshing…" : "Refresh report"}
        </Button>
      </section>

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
            <p className="health-note">
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
            </p>
          )}
        </div>
      </section>
      <div className="health-stats">
        <article>
          <span>item in dataset</span>
          <strong>{number(dataset.series_count)}</strong>
          <small>
            {series
              ? `${number(series.length)} summaries supplied`
              : "Item summaries not supplied"}
          </small>
        </article>
        <article>
          <span>Detected frequency</span>
          <strong className="capitalize">{dataset.frequency}</strong>
          <small>Dataset-level detection</small>
        </article>
        <article>
          <span>History coverage</span>
          <strong className="health-date">
            {date(dataset.date_range?.start)}
            <br />→ {date(dataset.date_range?.end)}
          </strong>
          <small>As reported by the source</small>
        </article>
      </div>
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
          <p className="health-note">
            No individual checks were supplied. Readiness above comes directly
            from the report.
          </p>
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
          className="health-tabs"
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
          ].map((t) => (
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
              <span>{number(t.count)}</span>
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
            <label>
              Status
              <select
                aria-label="Status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">All statuses</option>
                <option value="ready">Ready</option>
                <option value="warning">Warning</option>
                <option value="excluded">Excluded</option>
              </select>
            </label>
          </div>
          {linkageMissing ? (
            <p className="health-table-empty">
              This check does not identify affected item. Its count is available
              above; a filtered list cannot be inferred.
            </p>
          ) : !series ? (
            <p className="health-table-empty">
              Item summaries were not supplied by the source.
            </p>
          ) : (
            <>
              <p className="health-note" role="status">
                {number(rows.length)} of {number(series.length)} supplied item
                shown{selected ? ` · ${labels(selected.id)}` : ""}.
              </p>
              {selected?.affected_series?.some(
                (id) => !suppliedSeriesIds.has(id),
              ) && (
                <p className="health-note">
                  Some affected item have no supplied summary and cannot be
                  displayed in this table.
                </p>
              )}
              <div className="health-table-scroll">
                <table>
                  <caption className="sr-only">Item quality summaries</caption>
                  <thead>
                    <tr>
                      <th
                        aria-sort={
                          sort === "series_id"
                            ? descending
                              ? "descending"
                              : "ascending"
                            : "none"
                        }
                      >
                        <button onClick={() => toggleSort("series_id")}>
                          Item{" "}
                          {sort === "series_id"
                            ? descending
                              ? "↓"
                              : "↑"
                            : "↕"}
                        </button>
                      </th>
                      <th
                        aria-sort={
                          sort === "length"
                            ? descending
                              ? "descending"
                              : "ascending"
                            : "none"
                        }
                      >
                        <button onClick={() => toggleSort("length")}>
                          History points{" "}
                          {sort === "length" ? (descending ? "↓" : "↑") : "↕"}
                        </button>
                      </th>
                      <th>Period</th>
                      <th>Missing</th>
                      <th>Status</th>
                      <th>Reported issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((s, i) => (
                      <tr key={`${s.series_id}-${i}`}>
                        <th scope="row">{s.series_id}</th>
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
              {rows.length > HEALTH_PAGE_SIZE && (
                <nav
                  className="health-pagination"
                  aria-label="Item table pages"
                >
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
                <p className="health-table-empty">
                  No items match. Clear your filters.
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
