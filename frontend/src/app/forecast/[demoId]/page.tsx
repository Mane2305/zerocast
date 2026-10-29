import { notFound, redirect } from "next/navigation";
import { demos, findDemo } from "@/lib/demos";
import { DemoPreview } from "@/components/demo-preview";
export function generateStaticParams() {
  return demos.map((demo) => ({ demoId: demo.id }));
}
export default async function DemoPage({
  params,
  searchParams,
}: {
  params: Promise<{ demoId: string }>;
  searchParams: Promise<{ series?: string | string[] }>;
}) {
  const { demoId } = await params;
  // Old synthetic demo links now open the real dataset of the same kind.
  if (demoId.endsWith("-mock")) redirect(`/forecast/${demoId.slice(0, -5)}`);
  const demo = findDemo(demoId);
  if (!demo) notFound();
  const { series } = await searchParams;
  return (
    <DemoPreview
      key={`${demoId}-${typeof series === "string" ? series : ""}`}
      demo={demo}
      initialSeries={typeof series === "string" ? series : undefined}
    />
  );
}
