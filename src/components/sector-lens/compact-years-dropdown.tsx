"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import type { DropdownProps } from "react-day-picker";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const VISIBLE_YEARS = 10;
const YEAR_ROW_HEIGHT_REM = 2;

export const SECTOR_LENS_YEAR_DROPDOWN_ATTR = "data-sector-lens-year-dropdown";
export const SECTOR_LENS_YEAR_TRIGGER_ATTR = "data-sector-lens-year-trigger";

export function isSectorLensYearDropdownInteraction(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        `[${SECTOR_LENS_YEAR_DROPDOWN_ATTR}], [${SECTOR_LENS_YEAR_TRIGGER_ATTR}]`,
      ),
    )
  );
}

type PanelPosition = {
  left: number;
  top: number;
  minWidth: number;
};

function getPanelPosition(trigger: HTMLElement): PanelPosition {
  const rect = trigger.getBoundingClientRect();
  return {
    left: rect.left + rect.width / 2,
    top: rect.bottom + 4,
    minWidth: Math.max(rect.width, 64),
  };
}

export function CompactYearsDropdown({
  options,
  value,
  onChange,
  disabled,
  className,
  "aria-label": ariaLabel,
}: DropdownProps) {
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<PanelPosition | null>(null);
  const rootRef = React.useRef<HTMLSpanElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const selected = options?.find((o) => o.value === value);

  const updatePosition = React.useCallback(() => {
    if (!buttonRef.current) return;
    setPosition(getPanelPosition(buttonRef.current));
  }, []);

  React.useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  React.useLayoutEffect(() => {
    if (!open || !panelRef.current) return;
    const selectedEl = panelRef.current.querySelector<HTMLElement>(
      '[data-selected-year="true"]',
    );
    selectedEl?.scrollIntoView({ block: "nearest" });
  }, [open, value, options]);

  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSelect = (year: number) => {
    onChange?.({
      target: { value: String(year) },
    } as React.ChangeEvent<HTMLSelectElement>);
    setOpen(false);
  };

  const panel =
    open && position
      ? createPortal(
          <div
            ref={panelRef}
            role="listbox"
            aria-label={ariaLabel}
            {...{ [SECTOR_LENS_YEAR_DROPDOWN_ATTR]: "" }}
            className="fixed z-[200] isolate overflow-y-auto rounded-lg border border-border bg-zinc-50 p-1 text-zinc-900 shadow-lg dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            style={{
              left: position.left,
              top: position.top,
              minWidth: position.minWidth,
              maxHeight: `calc(${YEAR_ROW_HEIGHT_REM}rem * ${VISIBLE_YEARS})`,
              transform: "translateX(-50%)",
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {options?.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                data-selected-year={opt.value === value ? "true" : undefined}
                disabled={opt.disabled}
                className={cn(
                  "flex w-full cursor-default items-center justify-center rounded-md bg-transparent px-2 py-1.5 text-sm tabular-nums outline-none transition-colors hover:bg-zinc-200 focus-visible:bg-zinc-200 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800 disabled:pointer-events-none disabled:opacity-50",
                  opt.value === value &&
                    "bg-zinc-200 font-medium dark:bg-zinc-800",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect(opt.value);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <span
        ref={rootRef}
        {...{ [SECTOR_LENS_YEAR_TRIGGER_ATTR]: "" }}
        className={cn("relative z-10 inline-flex items-center", className)}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          ref={buttonRef}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          onClick={() => setOpen((prev) => !prev)}
        >
          {selected?.label ?? value}
          <ChevronDownIcon className="size-3.5 text-muted-foreground" />
        </button>
      </span>
      {panel}
    </>
  );
}
