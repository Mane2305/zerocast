import Link from "next/link";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Drivers · ZeroCast" };
export default function Factors() {
  return (
    <section className="route-state">
      <p className="eyebrow">DRIVERS</p>
      <h1>Drivers</h1>
      <p>Compare historical links and forecast lift.</p>

      <div className="download-actions">
        <Button asChild variant="outline">
          <Link href="/factors/demo">Open cement driver demo</Link>
        </Button>
        <Button asChild>
          <Link href="/data-health">Choose uploaded data</Link>
        </Button>
      </div>
    </section>
  );
}
