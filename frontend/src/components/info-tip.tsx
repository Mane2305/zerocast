"use client";
import { useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Info } from "lucide-react";

/**
 * Small ⓘ button with an explanation. The text renders in a portal and flips or
 * shifts to stay on screen, so no card, table or scrolling panel can clip it.
 * Opens on hover, keyboard focus or tap; Escape or moving away closes it.
 */
export function InfoTip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  // A short delay lets the pointer travel from the button onto the text.
  const hide = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <span className="info-tip">
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={label}
            onPointerEnter={(e) => e.pointerType === "mouse" && show()}
            onPointerLeave={(e) => e.pointerType === "mouse" && hide()}
            onFocus={show}
            onBlur={hide}
          >
            <Info size={14} aria-hidden />
          </button>
        </Popover.Trigger>
      </span>
      <Popover.Portal>
        <Popover.Content
          role="tooltip"
          className="zc-tooltip"
          side="top"
          align="center"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onPointerEnter={show}
          onPointerLeave={hide}
        >
          {children}
          <Popover.Arrow className="zc-tooltip-arrow" width={12} height={6} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
