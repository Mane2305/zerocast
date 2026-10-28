"use client";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  Activity,
  ChartNoAxesCombined,
  Layers,
  Crosshair,
  CalendarDays,
  SlidersHorizontal,
  Database,
  BookOpen,
  PanelLeftClose,
  Menu,
  Moon,
  Sun,
  Search,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { demos, findDemo } from "@/lib/demos";
import { loadDemo } from "@/lib/load-demo";
import { apiConfigured, getHealth, ApiStartingError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { loadHealth } from "@/lib/data-health";
import { useDatasetPreferences } from "@/lib/preferences";
export function Shell({ children }: { children: React.ReactNode }) {
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const segments = pathname.split("/").filter(Boolean);
  const id =
    segments.includes("demo") || segments.includes("dataset")
      ? segments[2]
      : segments[0] === "forecast" || segments[0] === "data-health"
        ? segments[1]
        : undefined;
  const demo = findDemo(id || "");
  const datasetId = id || "retail";
  const uploaded =
    segments.includes("dataset") ||
    (segments[0] === "data-health" && !!id && !demo);
  const data = useQuery({
    queryKey: ["demo", demo?.id || "retail"],
    queryFn: ({ signal }) => loadDemo(demo || demos[0], signal),
    enabled: !uploaded,
    staleTime: Infinity,
  });
  const uploadedData = useQuery({
    queryKey: ["data-health", "api", datasetId],
    queryFn: ({ signal }) => loadHealth(datasetId, "api", signal),
    enabled: uploaded && apiConfigured,
    staleTime: 30_000,
  });
  const preferences = useDatasetPreferences(datasetId);
  const items = uploaded
    ? uploadedData.data?.series
    : data.data?.forecast.series;
  const activeItem =
    items?.find((item) => item.series_id === preferences.selected)?.series_id ||
    items?.[0]?.series_id;
  const health = useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => getHealth(signal),
    enabled: apiConfigured,
    staleTime: 30_000,
    retry: (count, error) => error instanceof ApiStartingError && count < 2,
    retryDelay: 5000,
    refetchInterval: (query) =>
      query.state.data?.model_loaded === false &&
      query.state.dataUpdateCount < 12
        ? 3000
        : false,
  });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !(event.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true]",
        )
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const datasetPath = (module: string) =>
    uploaded
      ? module === "data-health"
        ? "/data-health/" + datasetId
        : "/" +
          module +
          "/dataset/" +
          datasetId +
          (module === "accuracy" && preferences.accuracyJob
            ? `?${new URLSearchParams({ job: preferences.accuracyJob })}`
            : preferences.job && ["forecast", "portfolio"].includes(module)
              ? `?${new URLSearchParams({ job: preferences.job })}`
              : "")
      : module === "forecast"
        ? "/forecast/" + datasetId
        : "/" + module + "/demo/" + datasetId;
  const links = [
    ["Forecast", datasetPath("forecast"), ChartNoAxesCombined, "forecast"],
    ["Portfolio", datasetPath("portfolio"), Layers, "portfolio"],
    ["Accuracy", datasetPath("accuracy"), Crosshair, "accuracy"],
    ["Exceptions", datasetPath("review"), CalendarDays, "review"],
    [
      "Drivers",
      uploaded ? datasetPath("factors") : "/factors/demo",
      SlidersHorizontal,
      "factors",
    ],
    ["Data", "/data", Database, "data"],
    ["Model & method", "/under-the-hood", BookOpen, "under-the-hood"],
  ] as const;
  const current =
    links.find((entry) => pathname.startsWith("/" + entry[3]))?.[0] ||
    (pathname === "/upload" ? "Data" : "Forecast");
  const status = !apiConfigured
    ? "Demo mode · upload needs the backend"
    : health.isPending
      ? "Connecting API · cold start may take 20–40 s"
      : health.isError
        ? health.error instanceof ApiStartingError
          ? "API starting or temporarily unavailable"
          : health.error instanceof TypeError
            ? "Backend unreachable"
            : "API check failed"
        : health.data?.model_loaded
          ? "API connected · model loaded"
          : "API connected · model not ready";
  return (
    <div
      className={
        "studio " +
        (collapsed ? "sidebar-collapsed " : "") +
        (mobileOpen ? "mobile-nav-open" : "")
      }
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="studio-sidebar" aria-label="Workspace sidebar">
        <Link href="/forecast/retail" className="brand">
          <span className="brand-icon">
            <Activity size={20} />
          </span>
          <span className="sidebar-label">ZeroCast</span>
        </Link>
        <label className="dataset-switcher">
          <span className="sidebar-label">Dataset</span>
          <select
            aria-label="Switch dataset"
            value={uploaded ? "uploaded" : demo?.id || "retail"}
            onChange={(event) =>
              router.push(
                event.target.value === "data"
                  ? "/data"
                  : current === "Accuracy"
                    ? "/accuracy/demo/" + event.target.value
                    : "/forecast/" + event.target.value,
              )
            }
          >
            {uploaded && <option value="uploaded">Uploaded dataset</option>}
            {demos.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
            <option value="data">Add dataset…</option>
          </select>
        </label>
        <nav aria-label="Main navigation">
          {links.map(([label, href, Icon, key]) => (
            <Link
              key={key}
              href={href}
              title={label}
              onClick={() => setMobileOpen(false)}
              aria-current={current === label ? "page" : undefined}
            >
              <Icon size={18} />
              <span className="sidebar-label">{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="sidebar-label">Decision studio</span>
          <Button
            variant="ghost"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            <PanelLeftClose size={18} />
          </Button>
        </div>
      </aside>
      <div className="studio-content">
        <header className="studio-topbar">
          <Button
            className="mobile-menu"
            variant="ghost"
            aria-label="Toggle navigation"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <Menu size={18} />
          </Button>
          <span className="studio-breadcrumb">
            {current}
            <span>
              {" "}
              / {demo?.title || (uploaded ? "Uploaded data" : "Workspace")}
              {activeItem && ` · ${activeItem}`}
            </span>
          </span>
          <form
            className="item-search"
            onSubmit={(event) => {
              event.preventDefault();
              const value = searchRef.current?.value.trim();
              const found = items?.find(
                (item) => item.series_id.toLowerCase() === value?.toLowerCase(),
              );
              if (found) {
                preferences.update({ selected: found.series_id });
                if (current === "Accuracy") {
                  if (searchRef.current) searchRef.current.value = "";
                  return;
                }
                if (uploaded) {
                  const url = new URL(window.location.href);
                  const query = new URLSearchParams();
                  const job = url.searchParams.get("job");
                  if (pathname.startsWith("/forecast/") && job)
                    query.set("job", job);
                  query.set("series", found.series_id);
                  router.push(`/forecast/dataset/${datasetId}?${query}`);
                  if (searchRef.current) searchRef.current.value = "";
                  return;
                }
                router.push(
                  "/forecast/" +
                    datasetId +
                    "?" +
                    new URLSearchParams({ series: found.series_id }),
                );
                if (searchRef.current) searchRef.current.value = "";
              }
            }}
          >
            <Search size={15} />
            <input
              ref={searchRef}
              aria-label="Search items"
              placeholder="Find item…"
              list="workspace-items"
              disabled={!items?.length}
              autoComplete="off"
            />
            <kbd>/</kbd>
            <datalist id="workspace-items">
              {items?.map((item) => (
                <option key={item.series_id} value={item.series_id} />
              ))}
            </datalist>
          </form>
          <span
            className={"api-status " + (health.isError ? "offline" : "")}
            title={status}
          >
            <span className="status-dot" />
            <span>{status}</span>
          </span>
          <Button
            variant="ghost"
            aria-label="Toggle color theme"
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
          >
            <Sun className="hidden dark:block" size={17} />
            <Moon className="dark:hidden" size={17} />
          </Button>
        </header>
        {demo && (
          <div className="studio-demo-banner">
            Demo data:{" "}
            {demo.synthetic
              ? "Synthetic example"
              : demo.id === "retail"
                ? "UCI Online Retail II"
                : "India cement production index"}{" "}
            · <Link href="/data">Switch dataset</Link>
          </div>
        )}
        <main id="main">{children}</main>
        <footer>
          <span>Non-commercial demo</span>
          <Link href="/under-the-hood">
            Powered by the Yug foundation model · Licence & method
          </Link>
        </footer>
      </div>
    </div>
  );
}
