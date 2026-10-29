"use client";
import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/** Scrollable, keyboard-focusable wrapper that gives every table one style. */
export function TableContainer({
  children,
  label,
  className,
}: {
  children: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn("zc-table-wrap health-table-scroll", className)}
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      {children}
    </div>
  );
}

/** Column header that sorts on click and reports aria-sort. */
export function SortHeader({
  label,
  active,
  descending,
  onSort,
  info,
  className,
}: {
  label: React.ReactNode;
  active: boolean;
  descending: boolean;
  onSort: () => void;
  info?: React.ReactNode;
  className?: string;
}) {
  const Icon = !active ? ChevronsUpDown : descending ? ArrowDown : ArrowUp;
  return (
    <th
      className={cn("zc-sort-th", className)}
      aria-sort={active ? (descending ? "descending" : "ascending") : "none"}
    >
      <button type="button" onClick={onSort} className="zc-sort">
        {label}
        <Icon size={13} aria-hidden className="zc-sort-icon" />
      </button>
      {info}
    </th>
  );
}

/** "Rows 51–100 of 130" with previous/next buttons. */
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const first = page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);
  const fmt = (n: number) => n.toLocaleString("en-US");
  return (
    <nav className={cn("zc-pagination", className)} aria-label="Table pages">
      <span aria-live="polite">
        Rows {fmt(first)}–{fmt(last)} of {fmt(total)}
      </span>
      <div>
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 0}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <span className="zc-page-of">
          Page {fmt(page + 1)} of {fmt(pages)}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages - 1}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
