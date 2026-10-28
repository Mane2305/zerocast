import { notFound } from "next/navigation";
import { DataHealthView } from "@/components/data-health";
import { findDemo } from "@/lib/demos";
export const metadata = { title: "Demo data health · ZeroCast" };
export default async function Page({
  params,
}: {
  params: Promise<{ datasetId: string }>;
}) {
  const { datasetId } = await params;
  if (!findDemo(datasetId)) notFound();
  return <DataHealthView key={datasetId} id={datasetId} source="demo" />;
}
