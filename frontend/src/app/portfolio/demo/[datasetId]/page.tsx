import { notFound } from "next/navigation";
import { findDemo } from "@/lib/demos";
import { PortfolioDemo } from "@/components/portfolio";
export const metadata = { title: "Demo portfolio risk · ZeroCast" };
export default async function Page({
  params,
}: {
  params: Promise<{ datasetId: string }>;
}) {
  const { datasetId } = await params;
  if (!findDemo(datasetId)) notFound();
  return <PortfolioDemo key={datasetId} id={datasetId} />;
}
