"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export type CompactSelectOption = {
  value: number;
  label: string;
};

type DateCompactSelectProps = {
  value: number | null;
  options: CompactSelectOption[];
  onChange: (value: number | null) => void;
  disabled?: boolean;
  emptyLabel?: string;
  "aria-label"?: string;
  className?: string;
};

/** Compact select with a scrollable list capped to ~5 visible rows. */
export function DateCompactSelect({
  value,
  options,
  onChange,
  disabled = false,
  emptyLabel = "Any",
  "aria-label": ariaLabel,
  className,
}: DateCompactSelectProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  React.useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const label =
    value == null
      ? emptyLabel
      : (options.find((option) => option.value === value)?.label ??
        String(value));

  const pick = (next: number | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
        className={cn(
          "inline-flex h-8 w-full items-center justify-between gap-1 rounded-md border border-input bg-background px-2 text-left text-xs font-medium shadow-sm transition-colors",
          "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open && "ring-1 ring-ring",
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-50 mt-1 max-h-[8.75rem] w-full overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <li role="option" aria-selected={value == null}>
            <button
              type="button"
              className={cn(
                "flex h-7 w-full items-center rounded-sm px-2 text-left text-xs",
                value == null
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted",
              )}
              onClick={() => pick(null)}
            >
              {emptyLabel}
            </button>
          </li>
          {options.map((option) => {
            const selected = value === option.value;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={selected}
              >
                <button
                  type="button"
                  className={cn(
                    "flex h-7 w-full items-center rounded-sm px-2 text-left text-xs",
                    selected
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted",
                  )}
                  onClick={() => pick(option.value)}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
