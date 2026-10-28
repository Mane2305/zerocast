import { ReviewWorkspace } from "@/components/review-workspace";
export const metadata = { title: "Exceptions · ZeroCast" };
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
    <ReviewWorkspace
      id={datasetId}
      initialJob={typeof job === "string" ? job : undefined}
    />
  );
}
