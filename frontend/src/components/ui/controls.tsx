"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Labelled text/search input. */
export function TextField({
  label,
  hideLabel,
  hint,
  className,
  id,
  ...input
}: {
  label: string;
  hideLabel?: boolean;
  hint?: React.ReactNode;
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const auto = React.useId();
  const inputId = id ?? auto;
  return (
    <div className={cn("zc-field", className)}>
      <label htmlFor={inputId} className={hideLabel ? "sr-only" : undefined}>
        {label}
      </label>
      <input id={inputId} className="zc-input" {...input} />
      {hint && <p className="zc-hint">{hint}</p>}
    </div>
  );
}

/** Accessible on/off switch with a visible label. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("zc-switch", className)}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="zc-switch-track" aria-hidden>
        <span className="zc-switch-thumb" />
      </span>
      <span className="zc-switch-label">{label}</span>
    </label>
  );
}

/** Pill tabs / segmented control for 2–8 mutually exclusive views. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: React.ReactNode; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("zc-tabs", className)} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count !== undefined && (
            <span className="zc-tab-count">
              {o.count.toLocaleString("en-US")}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Collapsible panel (styled <details>), e.g. advanced options. */
export function Disclosure({
  summary,
  children,
  defaultOpen,
  open,
  className,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  className?: string;
}) {
  return (
    <details
      className={cn("zc-disclosure", className)}
      open={open ?? defaultOpen}
    >
      <summary>
        <span>{summary}</span>
        <ChevronDown size={16} className="zc-disclosure-icon" aria-hidden />
      </summary>
      <div className="zc-disclosure-body">{children}</div>
    </details>
  );
}
