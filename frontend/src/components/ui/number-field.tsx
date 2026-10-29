"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type NumberFieldProps = {
  label: string;
  /** Kept as a string so the user can clear the box while typing. */
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  /** Quick picks shown as chips under the input (e.g. 7, 14, 28 days). */
  presets?: { value: number; label: string }[];
  unit?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
};

/** Number input with −/+ steppers, a unit suffix and optional preset chips. */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  presets,
  unit,
  disabled,
  id,
  className,
}: NumberFieldProps) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const n = Number(value);
  const clamp = (x: number) => Math.min(max, Math.max(min, x));
  const step = (d: number) =>
    onChange(String(clamp((Number.isFinite(n) && value !== "" ? n : min) + d)));

  return (
    <div className={cn("zc-field", className)}>
      <label htmlFor={inputId}>{label}</label>
      <div className="zc-number" data-disabled={disabled || undefined}>
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => step(-1)}
          disabled={disabled || n <= min}
        >
          <Minus size={15} />
        </button>
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={value}
          disabled={disabled}
          // Inline so older page-level input rules can't shift the digits.
          style={{ padding: 0, margin: 0, minHeight: 0, height: "100%" }}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            if (value !== "" && Number.isFinite(n))
              onChange(String(clamp(Math.round(n))));
          }}
        />
        {unit && <span className="zc-unit">{unit}</span>}
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => step(1)}
          disabled={disabled || n >= max}
        >
          <Plus size={15} />
        </button>
      </div>
      {presets && presets.length > 0 && (
        <div
          className="zc-presets"
          role="group"
          aria-label={`${label} presets`}
        >
          {presets.map((p) => (
            <button
              key={p.value}
              type="button"
              disabled={disabled}
              aria-pressed={n === p.value}
              onClick={() => onChange(String(p.value))}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
