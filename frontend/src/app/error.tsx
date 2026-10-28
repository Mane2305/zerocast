"use client";
import { Button } from "@/components/ui/button";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="route-state">
      <p className="eyebrow">SOMETHING WENT WRONG</p>
      <h1>We couldn’t load this view.</h1>
      <p>Please try opening the workspace again.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
