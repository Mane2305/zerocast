import { ForecastWorkspace } from "@/components/forecast-workspace";
export const metadata = { title: "Forecast · ZeroCast" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ datasetId: string }>;
  searchParams: Promise<{
    job?: string | string[];
    series?: string | string[];
  }>;
}) {
  const { datasetId } = await params;
  const { job, series } = await searchParams;
  return (
    <ForecastWorkspace
      id={datasetId}
      initialJob={typeof job === "string" ? job : undefined}
      initialSeries={typeof series === "string" ? series : undefined}
    />
  );
}
