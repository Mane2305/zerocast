import { RouteState } from "@/components/ui/route-state";
export default function Loading() {
  return (
    <RouteState kind="loading">
      <div className="skeleton" />
      <h1>Loading workspace…</h1>
      <p>Preparing your view.</p>
    </RouteState>
  );
}
