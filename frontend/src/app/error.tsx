"use client";
import { PageHeader } from "@/components/ui/layout";
import { RouteState } from "@/components/ui/route-state";
import { Button } from "@/components/ui/button";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <RouteState kind="error">
      <PageHeader
        eyebrow="Something Went Wrong"
        title={<>We couldn’t load this view.</>}
        description={<>Please try opening the workspace again.</>}
      />
      <Button onClick={reset}>Try again</Button>
    </RouteState>
  );
}
