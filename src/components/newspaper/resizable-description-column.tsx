"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export const DESCRIPTION_COL_MIN = 180;
export const DESCRIPTION_COL_MAX = 720;
const STORAGE_KEY = "newspaper-db.descriptionColumnWidth";

function clampWidth(width: number): number {
  return Math.min(DESCRIPTION_COL_MAX, Math.max(DESCRIPTION_COL_MIN, width));
}

function readStoredWidth(fallback: number): number {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return fallback;
    const parsed = Number(stored);
    return Number.isFinite(parsed) ? clampWidth(parsed) : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredWidth(width: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    /* ignore quota / private mode */
  }
}

export function useResizableDescriptionWidth(defaultWidth: number) {
  const [width, setWidth] = React.useState(() =>
    readStoredWidth(defaultWidth),
  );
  const widthRef = React.useRef(width);
  widthRef.current = width;

  const resetWidth = React.useCallback(() => {
    const next = clampWidth(defaultWidth);
    setWidth(next);
    writeStoredWidth(next);
  }, [defaultWidth]);

  const onResizePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startWidth = widthRef.current;

      const onMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        setWidth(clampWidth(startWidth + delta));
      };

      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        writeStoredWidth(widthRef.current);
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [],
  );

  return { width, onResizePointerDown, resetWidth };
}

const RESIZE_HANDLE_CLASS = cn(
  "pointer-events-auto absolute top-0 bottom-0 z-50 cursor-col-resize touch-none",
  "hover:bg-primary/10",
  // Visual divider only on hover — sticky cells already own border-r.
  "after:pointer-events-none after:absolute after:inset-y-0 after:left-0 after:w-px",
  "after:bg-transparent hover:after:bg-primary/70",
);

type DescriptionColumnResizeOverlayProps = {
  width: number;
  onResizePointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onReset?: () => void;
};

/** Fixed overlay on the scroll viewport — does not move when year columns scroll. */
export function DescriptionColumnResizeOverlay({
  width,
  onResizePointerDown,
  onReset,
}: DescriptionColumnResizeOverlayProps) {
  return (
    <button
      type="button"
      aria-label="Resize description column"
      title="Drag to resize · double-click to reset"
      onPointerDown={onResizePointerDown}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onReset?.();
      }}
      className={RESIZE_HANDLE_CLASS}
      style={{ left: width, width: 8 }}
    />
  );
}

type DescriptionColumnResizeAreaProps = {
  children: React.ReactNode;
};

/** Table wrapper — resize handle is rendered outside scroll content via DescriptionColumnResizeOverlay. */
export function DescriptionColumnResizeArea({
  children,
}: DescriptionColumnResizeAreaProps) {
  // `block` (not inline-block) so sticky thead/column widths stay in sync with tbody.
  return <div className="block w-full min-w-0">{children}</div>;
}

type ResizableDescriptionHeaderProps = {
  width: number;
  className?: string;
  label?: string;
  style?: React.CSSProperties;
};

export function ResizableDescriptionHeader({
  width,
  className,
  label = "Description",
  style,
}: ResizableDescriptionHeaderProps) {
  return (
    <th
      className={cn("relative", className)}
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        ...style,
      }}
    >
      <span className="block truncate pr-2">{label}</span>
    </th>
  );
}

export function descriptionColumnStyle(width: number): React.CSSProperties {
  return {
    width,
    minWidth: width,
    maxWidth: width,
  };
}

/** Sticky description cell classes — opaque edge masks scrolling year columns. */
export const STICKY_DESCRIPTION_EDGE = cn(
  "isolate border-r border-border",
  "shadow-[4px_0_8px_-2px_rgba(0,0,0,0.18)]",
);
