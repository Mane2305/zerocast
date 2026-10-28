import { AccuracyWorkspace } from "@/components/accuracy-workspace";
export const metadata = { title: "Accuracy · ZeroCast" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ datasetId: string }>;
  searchParams: Promise<{ job?: string | string[] }>;
}) {
  const { datasetId } = await params;
  const { job } = await searchParams;
  return (
    <AccuracyWorkspace
      key={datasetId}
      id={datasetId}
      initialJob={typeof job === "string" ? job : undefined}
    />
  );
}
