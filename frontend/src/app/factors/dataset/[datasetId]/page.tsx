import { FactorWorkspace } from "@/components/factor-workspace";
export const metadata = { title: "Drivers · ZeroCast" };
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
    <FactorWorkspace
      id={datasetId}
      initialJob={typeof job === "string" ? job : undefined}
    />
  );
}
