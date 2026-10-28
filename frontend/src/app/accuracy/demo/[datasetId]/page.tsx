import { notFound } from "next/navigation";
import { findDemo } from "@/lib/demos";
import { AccuracyDemo } from "@/components/accuracy-workspace";
export const metadata = { title: "Accuracy · ZeroCast" };
export default async function Page({
  params,
}: {
  params: Promise<{ datasetId: string }>;
}) {
  const { datasetId } = await params;
  if (!findDemo(datasetId)) notFound();
  return <AccuracyDemo key={datasetId} id={datasetId} />;
}
