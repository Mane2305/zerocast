import { DataHealthView } from "@/components/data-health";
export const metadata = { title: "Data quality · ZeroCast" };
export default async function Page({
  params,
}: {
  params: Promise<{ datasetId: string }>;
}) {
  const { datasetId } = await params;
  return <DataHealthView key={datasetId} id={datasetId} source="api" />;
}
