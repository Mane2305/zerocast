import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <div className="route-state">
      <p className="eyebrow">PAGE NOT FOUND</p>
      <h1>Let’s get you back.</h1>
      <p>This workspace page does not exist.</p>
      <Button asChild>
        <Link href="/data">Back to workspace</Link>
      </Button>
    </div>
  );
}
