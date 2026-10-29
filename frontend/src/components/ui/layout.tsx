import * as React from "react";
import { cn } from "@/lib/utils";

/** Page title block: optional eyebrow, title, description, meta line and actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("zc-page-header", className)}>
      <div className="zc-page-header-text">
        {eyebrow && <p className="zc-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="zc-page-description">{description}</p>}
        {meta && <div className="zc-page-meta">{meta}</div>}
      </div>
      {actions && <div className="zc-page-actions">{actions}</div>}
    </header>
  );
}

/** A titled region of a page (no card chrome). */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  ...rest
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, "title">) {
  return (
    <section className={cn("zc-section", className)} {...rest}>
      {(title || actions) && (
        <div className="zc-section-head">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="zc-section-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Bordered surface. Use CardHeader for a title row. */
export function Card({
  children,
  className,
  padded = true,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return (
    <div
      className={cn("zc-card", padded && "zc-card-padded", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("zc-card-header", className)}>
      <div>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="zc-card-actions">{actions}</div>}
    </div>
  );
}
