import Link from "next/link";
import { PageHeader } from "@/components/ui/layout";
import { RouteState } from "@/components/ui/route-state";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <RouteState kind="empty">
      <PageHeader
        eyebrow="Page Not Found"
        title={<>Let’s get you back.</>}
        description={<>This workspace page does not exist.</>}
      />
      <Button asChild>
        <Link href="/data">Back to workspace</Link>
      </Button>
    </RouteState>
  );
}
