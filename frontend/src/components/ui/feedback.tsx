import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const ICONS: Record<Tone, LucideIcon> = {
  neutral: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

/** Inline message: replaces the ad-hoc note / warning / error boxes. */
export function Callout({
  tone = "neutral",
  title,
  children,
  actions,
  icon = true,
  className,
  role,
  ...rest
}: {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: boolean;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "title">) {
  const Icon = ICONS[tone];
  return (
    <div
      className={cn("zc-callout", `zc-tone-${tone}`, className)}
      role={role ?? (tone === "danger" ? "alert" : undefined)}
      {...rest}
    >
      {icon && <Icon size={18} className="zc-callout-icon" aria-hidden />}
      <div className="zc-callout-body">
        {title && <strong className="zc-callout-title">{title}</strong>}
        {children && <div className="zc-callout-text">{children}</div>}
        {actions && <div className="zc-callout-actions">{actions}</div>}
      </div>
    </div>
  );
}

/** Small muted helper line under a control or section. */
export function Hint({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("zc-hint", className)} {...rest}>
      {children}
    </p>
  );
}

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("zc-badge", `zc-tone-${tone}`, className)}>
      {children}
    </span>
  );
}

/** Ready / warning / excluded and similar statuses. */
export function StatusPill({ status }: { status?: string | null }) {
  const tone: Tone =
    status === "ready"
      ? "success"
      : status === "warning"
        ? "warning"
        : status === "excluded"
          ? "danger"
          : "neutral";
  return (
    <Badge tone={tone} className="zc-status">
      <span className="zc-status-dot" aria-hidden />
      {status ?? "unknown"}
    </Badge>
  );
}

export function EmptyState({
  icon: Icon = Info,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("zc-empty-state", className)}>
      <span className="zc-empty-icon" aria-hidden>
        <Icon size={22} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="zc-empty-action">{action}</div>}
    </div>
  );
}

export function Skeleton({
  className,
  height = 16,
  width,
}: {
  className?: string;
  height?: number | string;
  width?: number | string;
}) {
  return (
    <span
      className={cn("zc-skeleton", className)}
      style={{ height, width }}
      aria-hidden
    />
  );
}

/** Placeholder for a loading page: header, stat row and a large panel. */
export function PageSkeleton({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="zc-page-skeleton" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Skeleton height={28} width="32%" />
      <Skeleton height={14} width="48%" />
      <div className="zc-stat-grid">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={92} />
        ))}
      </div>
      <Skeleton height={320} />
    </div>
  );
}
