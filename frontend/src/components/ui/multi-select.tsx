"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickerOption = {
  value: string;
  label?: string;
  /** Secondary text shown to the right (e.g. status, type). */
  hint?: string;
  /** Disabled options stay visible with their hint as the reason. */
  disabled?: boolean;
};

type MultiSelectProps = {
  options: PickerOption[];
  value: string[];
  onChange: (value: string[]) => void;
  /** Visible label above the trigger; also the accessible name. */
  label: string;
  placeholder?: string;
  /** Maximum selected values; further options are disabled. */
  max?: number;
  disabled?: boolean;
  /** Chips shown in the trigger before collapsing into "+N more". */
  maxChips?: number;
  id?: string;
  className?: string;
  emptyText?: string;
};

/**
 * Searchable multi-select dropdown with chips: replaces long checkbox lists.
 * Keyboard: type to filter, arrows to move, Enter to toggle, Esc to close.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  label,
  placeholder = "Select…",
  max,
  disabled,
  maxChips = 4,
  id,
  className,
  emptyText = "No matches",
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const autoId = React.useId();
  const triggerId = id ?? autoId;
  const selected = React.useMemo(() => new Set(value), [value]);
  const byValue = React.useMemo(
    () => new Map(options.map((o) => [o.value, o])),
    [options],
  );
  const full = max !== undefined && value.length >= max;

  // Filter ourselves: cmdk's fuzzy ranking reorders long ID lists unpredictably.
  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? options.filter((o) =>
          `${o.label ?? o.value} ${o.hint ?? ""}`.toLowerCase().includes(q),
        )
      : options;
    return list.slice(0, 500);
  }, [options, query]);
  const selectable = visible.filter((o) => !o.disabled);

  function toggle(v: string) {
    if (selected.has(v)) onChange(value.filter((x) => x !== v));
    else if (!full) onChange([...value, v]);
  }
  function selectVisible() {
    const next = [...value];
    for (const o of selectable) {
      if (max !== undefined && next.length >= max) break;
      if (!selected.has(o.value)) next.push(o.value);
    }
    onChange(next);
  }

  const chips = value.slice(0, maxChips);
  return (
    <div className={cn("zc-field", className)}>
      <div className="zc-field-head">
        <label htmlFor={triggerId}>{label}</label>
        <span className="zc-count" aria-live="polite">
          {value.length}
          {max !== undefined ? ` / ${max}` : ""} selected
        </span>
      </div>
      <Popover.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery("");
        }}
      >
        <Popover.Trigger asChild disabled={disabled}>
          <button
            id={triggerId}
            type="button"
            className="zc-trigger zc-trigger-multi"
          >
            <span className="zc-chips">
              {value.length === 0 && (
                <span className="zc-placeholder">{placeholder}</span>
              )}
              {chips.map((v) => (
                <span key={v} className="zc-chip">
                  <span className="zc-chip-text">
                    {byValue.get(v)?.label ?? v}
                  </span>
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${v}`}
                    className="zc-chip-x"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!disabled) toggle(v);
                    }}
                  >
                    <X size={12} />
                  </span>
                </span>
              ))}
              {value.length > maxChips && (
                <span className="zc-chip zc-chip-more">
                  +{value.length - maxChips} more
                </span>
              )}
            </span>
            <ChevronsUpDown size={16} className="zc-trigger-icon" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            className="zc-popover"
            style={{ width: "max(var(--radix-popover-trigger-width), 280px)" }}
          >
            <Command shouldFilter={false} label={label} loop>
              <div className="zc-search">
                <Search size={15} aria-hidden />
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder={`Search ${options.length.toLocaleString("en-US")} options…`}
                />
              </div>
              <div className="zc-bulk">
                <button
                  type="button"
                  onClick={selectVisible}
                  disabled={!selectable.length || full}
                >
                  {query ? "Select matches" : "Select all"}
                  {max !== undefined ? ` (max ${max})` : ""}
                </button>
                <button
                  type="button"
                  onClick={() => onChange([])}
                  disabled={!value.length}
                >
                  Clear
                </button>
              </div>
              <Command.List className="zc-list">
                <Command.Empty className="zc-empty">{emptyText}</Command.Empty>
                {visible.map((o) => {
                  const on = selected.has(o.value);
                  const off = o.disabled || (!on && full);
                  return (
                    <Command.Item
                      key={o.value}
                      value={o.value}
                      disabled={off}
                      onSelect={() => toggle(o.value)}
                      className="zc-option"
                      data-checked={on || undefined}
                    >
                      <span className="zc-check" aria-hidden>
                        {on && <Check size={13} strokeWidth={3} />}
                      </span>
                      <span className="zc-option-label">
                        {o.label ?? o.value}
                      </span>
                      {o.hint && <span className="zc-option-hint">{o.hint}</span>}
                    </Command.Item>
                  );
                })}
                {options.length > visible.length && !query && (
                  <p className="zc-empty">
                    Showing the first {visible.length}; search to find the rest.
                  </p>
                )}
              </Command.List>
            </Command>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
