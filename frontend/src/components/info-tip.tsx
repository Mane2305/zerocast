"use client";
import { useId, useState } from "react";
export function InfoTip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const [dismissed, setDismissed] = useState(false);
  return (
    <span
      className={`info-tip${dismissed ? " is-dismissed" : ""}`}
      onMouseLeave={() => setDismissed(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        onFocus={() => setDismissed(false)}
        onMouseEnter={() => setDismissed(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setDismissed(true);
        }}
      >
        ⓘ
      </button>
      <span id={id} role="tooltip" className="info-tip-content">
        {children}
      </span>
    </span>
  );
}
