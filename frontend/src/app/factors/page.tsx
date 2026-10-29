import Link from "next/link";
import { PageHeader } from "@/components/ui/layout";
import { RouteState } from "@/components/ui/route-state";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Drivers · ZeroCast" };
export default function Factors() {
  return (
    <RouteState kind="empty">
      <PageHeader
        eyebrow="Drivers"
        title={<>Drivers</>}
        description={<>Compare historical links and forecast lift.</>}
      />

      <div className="download-actions">
        <Button asChild variant="outline">
          <Link href="/factors/demo">Open cement driver demo</Link>
        </Button>
        <Button asChild>
          <Link href="/data-health">Choose uploaded data</Link>
        </Button>
      </div>
    </RouteState>
  );
}
