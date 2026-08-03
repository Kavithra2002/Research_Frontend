"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type TruncatedDescriptionCellProps = {
  label: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
  labelClassName?: string;
};

function isLabelTruncated(el: HTMLElement | null): boolean {
  if (!el) return false;
  return el.scrollWidth > el.clientWidth + 1;
}

export function TruncatedDescriptionCell({
  label,
  leading,
  trailing,
  className,
  labelClassName,
}: TruncatedDescriptionCellProps) {
  const cellRef = React.useRef<HTMLDivElement>(null);
  const labelRef = React.useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [tooltipPos, setTooltipPos] = React.useState({ top: 0, left: 0 });

  const showTooltip = truncated || label.length > 34;

  React.useLayoutEffect(() => {
    const el = labelRef.current;
    if (!el) return;

    const update = () => {
      setTruncated(isLabelTruncated(el));
    };

    update();
    const raf = requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [label]);

  const updateTooltipPosition = React.useCallback(() => {
    const el = cellRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTooltipPos({
      top: rect.top,
      left: rect.left,
    });
  }, []);

  const handlePointerInside = React.useCallback(() => {
    if (!showTooltip) return;
    updateTooltipPosition();
    setOpen(true);
  }, [showTooltip, updateTooltipPosition]);

  const handlePointerLeave = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) {
        return;
      }
      setOpen(false);
    },
    [],
  );

  React.useEffect(() => {
    if (!open) return;

    const onReposition = () => updateTooltipPosition();
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open, updateTooltipPosition]);

  return (
    <>
      <div
        ref={cellRef}
        className={cn(
          "flex w-full min-w-0 items-center gap-2",
          showTooltip && "cursor-default",
          className,
        )}
        onMouseOver={handlePointerInside}
        onMouseOut={handlePointerLeave}
        onFocus={handlePointerInside}
        onBlur={handlePointerLeave}
      >
        {leading}
        <span
          ref={labelRef}
          className={cn("min-w-0 flex-1 truncate", labelClassName)}
        >
          {label}
        </span>
        {trailing}
      </div>

      {open && showTooltip
        ? createPortal(
            <div
              role="tooltip"
              className={cn(
                "pointer-events-none fixed z-[100] max-w-xs rounded-md",
                "bg-foreground px-3 py-1.5 text-xs leading-snug text-background shadow-md",
              )}
              style={{
                top: tooltipPos.top,
                left: tooltipPos.left,
                transform: "translateY(calc(-100% - 6px))",
              }}
            >
              {label}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** @deprecated Use TruncatedDescriptionCell */
export function TruncatedTableLabel({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return <TruncatedDescriptionCell label={label} labelClassName={className} />;
}
