import Link from "next/link";
import { RouteState } from "@/components/ui/route-state";
import { PortfolioJob } from "@/components/portfolio";
export const metadata = { title: "Portfolio · ZeroCast" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ datasetId: string }>;
  searchParams: Promise<{ job?: string | string[] }>;
}) {
  const { datasetId } = await params;
  const { job } = await searchParams;
  if (typeof job !== "string" || !job.trim())
    return (
      <RouteState kind="empty">
        <h1>Choose a completed forecast.</h1>
        <p>
          Portfolio needs a forecast job. Open a result and choose Portfolio.
        </p>
        <Link
          className="text-link"
          href={`/forecast/dataset/${encodeURIComponent(datasetId)}`}
        >
          Set up a forecast →
        </Link>
      </RouteState>
    );
  return (
    <PortfolioJob key={`${datasetId}-${job}`} id={datasetId} jobId={job} />
  );
}
