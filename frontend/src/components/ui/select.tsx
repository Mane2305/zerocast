"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PickerOption } from "./multi-select";

type SelectProps = {
  options: PickerOption[];
  value: string;
  onChange: (value: string) => void;
  /** Visible label; pass `hideLabel` to keep it for screen readers only. */
  label: string;
  hideLabel?: boolean;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Search box appears automatically above this many options. */
  searchAbove?: number;
};

/** Styled dropdown replacing native <select>; searchable for long lists. */
export function Select({
  options,
  value,
  onChange,
  label,
  hideLabel,
  placeholder = "Select…",
  disabled,
  id,
  className,
  searchAbove = 8,
}: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const autoId = React.useId();
  const triggerId = id ?? autoId;
  const current = options.find((o) => o.value === value);
  const searchable = options.length > searchAbove;
  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? options.filter((o) =>
          `${o.label ?? o.value} ${o.hint ?? ""}`.toLowerCase().includes(q),
        )
      : options;
    return list.slice(0, 500);
  }, [options, query]);

  return (
    <div className={cn("zc-field", className)}>
      <label htmlFor={triggerId} className={hideLabel ? "sr-only" : undefined}>
        {label}
      </label>
      <Popover.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery("");
        }}
      >
        <Popover.Trigger asChild disabled={disabled}>
          <button id={triggerId} type="button" className="zc-trigger">
            <span className={cn("zc-value", !current && "zc-placeholder")}>
              {current ? (current.label ?? current.value) : placeholder}
            </span>
            {current?.hint && (
              <span className="zc-option-hint">{current.hint}</span>
            )}
            <ChevronDown size={16} className="zc-trigger-icon" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            className="zc-popover"
            style={{ width: "max(var(--radix-popover-trigger-width), 220px)" }}
          >
            <Command shouldFilter={false} label={label} loop value={value}>
              {searchable && (
                <div className="zc-search">
                  <Search size={15} aria-hidden />
                  <Command.Input
                    value={query}
                    onValueChange={setQuery}
                    placeholder={`Search ${options.length.toLocaleString("en-US")} options…`}
                  />
                </div>
              )}
              <Command.List className="zc-list">
                <Command.Empty className="zc-empty">No matches</Command.Empty>
                {visible.map((o) => (
                  <Command.Item
                    key={o.value}
                    value={o.value}
                    disabled={o.disabled}
                    onSelect={() => {
                      onChange(o.value);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="zc-option"
                    data-checked={o.value === value || undefined}
                  >
                    <span className="zc-tick" aria-hidden>
                      {o.value === value && (
                        <Check size={14} strokeWidth={2.5} />
                      )}
                    </span>
                    <span className="zc-option-label">
                      {o.label ?? o.value}
                    </span>
                    {o.hint && <span className="zc-option-hint">{o.hint}</span>}
                  </Command.Item>
                ))}
              </Command.List>
            </Command>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
