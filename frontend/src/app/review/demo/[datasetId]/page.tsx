import { notFound } from "next/navigation";
import { findDemo } from "@/lib/demos";
import { ReviewDemo } from "@/components/review-workspace";
export const metadata = { title: "Review demo · ZeroCast" };
export default async function Page({
  params,
}: {
  params: Promise<{ datasetId: string }>;
}) {
  const { datasetId } = await params;
  if (!findDemo(datasetId)) notFound();
  return <ReviewDemo key={datasetId} id={datasetId} />;
}
