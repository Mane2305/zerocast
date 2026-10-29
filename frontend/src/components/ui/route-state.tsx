import * as React from "react";
import { AlertTriangle, Inbox, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Whole-page or whole-panel state: loading, error or empty. Children carry the
 * heading, explanation and any actions.
 */
export function RouteState({
  kind = "empty",
  children,
  className,
  ...rest
}: {
  kind?: "loading" | "error" | "empty";
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLElement>) {
  const Icon =
    kind === "loading"
      ? LoaderCircle
      : kind === "error"
        ? AlertTriangle
        : Inbox;
  return (
    <section
      className={cn("zc-route-state", `zc-route-${kind}`, className)}
      role={
        kind === "error" ? "alert" : kind === "loading" ? "status" : undefined
      }
      aria-live={kind === "loading" ? "polite" : undefined}
      {...rest}
    >
      <span className="zc-route-icon" aria-hidden>
        <Icon size={22} className={kind === "loading" ? "animate-spin" : ""} />
      </span>
      <div className="zc-route-body">{children}</div>
    </section>
  );
}
