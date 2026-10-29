"use client";
import { useEffect, useState } from "react";
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
import { Select } from "@/components/ui/select";
import { loadHealth } from "@/lib/data-health";
import { useDatasetPreferences } from "@/lib/preferences";
export function Shell({ children }: { children: React.ReactNode }) {
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const segments = pathname.split("/").filter(Boolean);
  // The saved driver demo (/factors/demo) is the cement dataset; say so in the
  // switcher instead of falling back to Retail.
  const id =
    pathname === "/factors/demo"
      ? "manufacturing"
      : segments.includes("demo") || segments.includes("dataset")
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
    const updateOnline = () => setIsOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
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
        document.getElementById("item-search")?.click();
      }
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
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
  // Only these pages show one item at a time; elsewhere the item is noise.
  const itemScoped = current === "Forecast" || current === "Accuracy";
  function goToItem(seriesId: string) {
    preferences.update({ selected: seriesId });
    if (current === "Accuracy") return;
    if (uploaded) {
      const query = new URLSearchParams();
      const job = new URL(window.location.href).searchParams.get("job");
      if (pathname.startsWith("/forecast/") && job) query.set("job", job);
      query.set("series", seriesId);
      router.push(`/forecast/dataset/${datasetId}?${query}`);
      return;
    }
    router.push(
      "/forecast/" +
        datasetId +
        "?" +
        new URLSearchParams({ series: seriesId }),
    );
  }
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
        <Select
          className="dataset-switcher sidebar-label"
          label="Dataset"
          options={[
            ...(uploaded
              ? [{ value: "uploaded", label: "Uploaded dataset" }]
              : []),
            ...demos.map((item) => ({
              value: item.id,
              label: item.title,
            })),
            { value: "data", label: "＋ Add dataset…" },
          ]}
          value={uploaded ? "uploaded" : demo?.id || "retail"}
          onChange={(value) => {
            if (value === "uploaded") return;
            router.push(
              value === "data"
                ? "/data"
                : current === "Accuracy"
                  ? "/accuracy/demo/" + value
                  : "/forecast/" + value,
            );
          }}
        />
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
              {activeItem && itemScoped && ` · ${activeItem}`}
            </span>
          </span>
          <div className="item-search">
            <Search size={15} aria-hidden />
            <Select
              id="item-search"
              label="Find item"
              hideLabel
              placeholder="Find item…"
              searchAbove={0}
              options={(items ?? []).map((item) => ({
                value: item.series_id,
              }))}
              value=""
              disabled={!items?.length}
              onChange={goToItem}
            />
            <kbd>/</kbd>
          </div>
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
        {!isOnline && (
          <div className="offline-banner" role="status" aria-live="polite">
            <span aria-hidden="true" />
            You’re offline. Saved demo pages remain available; uploads and live
            reports will reconnect when your connection returns.
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
