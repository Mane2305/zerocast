import * as React from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "./feedback";

/** Responsive grid of StatCards. */
export function StatGrid({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDListElement>) {
  return (
    <dl className={cn("zc-stat-grid", className)} {...rest}>
      {children}
    </dl>
  );
}

/** One KPI: label (with optional info tip), big value, short hint. */
export function StatCard({
  label,
  value,
  hint,
  info,
  tone,
  className,
  valueProps,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  info?: React.ReactNode;
  tone?: Tone;
  className?: string;
  valueProps?: React.HTMLAttributes<HTMLElement> & {
    "data-testid"?: string;
  };
}) {
  return (
    <div className={cn("zc-stat", tone && `zc-tone-${tone}`, className)}>
      <dt>
        {label}
        {info}
      </dt>
      <dd {...valueProps}>{value}</dd>
      {hint && <dd className="zc-stat-hint">{hint}</dd>}
    </div>
  );
}
