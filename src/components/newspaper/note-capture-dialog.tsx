"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, FileImage, Loader2, Table2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { NoteExtractedTable } from "@/lib/newspaper-db";
import {
  resolveNoteCaptureUrls,
  type NoteSourceMeta,
} from "@/lib/note-source-capture";
import { ExtractedNoteTables } from "@/components/newspaper/extracted-note-table";

export type NoteCaptureYearEntry = {
  year: string;
  source?: NoteSourceMeta | null;
  tables?: NoteExtractedTable[];
};

type NoteCaptureDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  companySlug?: string;
  years: NoteCaptureYearEntry[];
  initialYear?: string;
  /** When true, show every year slot (e.g. 2017–2025) even without a capture. */
  showAllYearSlots?: boolean;
};

type ContentView = "extracted" | "capture";

const YEAR_WINDOW = 3;
const YEAR_CARD_W = 80;
const YEAR_GAP = 8;
const YEAR_TRACK_STEP = YEAR_CARD_W + YEAR_GAP;
const YEAR_VIEWPORT_W =
  YEAR_WINDOW * YEAR_CARD_W + (YEAR_WINDOW - 1) * YEAR_GAP;

export function NoteCaptureDialog({
  open,
  onOpenChange,
  label,
  companySlug,
  years,
  initialYear,
  showAllYearSlots = false,
}: NoteCaptureDialogProps) {
  const chronological = React.useMemo(
    () => [...years].sort((a, b) => Number(a.year) - Number(b.year)),
    [years],
  );

  const [activeYear, setActiveYear] = React.useState(
    initialYear ?? chronological[chronological.length - 1]?.year ?? "",
  );
  const [contentView, setContentView] = React.useState<ContentView>("extracted");
  const [imageUrls, setImageUrls] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [contentDir, setContentDir] = React.useState<1 | -1 | 0>(0);
  const touchStartX = React.useRef<number | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const activeChronoIndex = chronological.findIndex((y) => y.year === activeYear);
  const activeEntry =
    activeChronoIndex >= 0
      ? chronological[activeChronoIndex]
      : chronological[chronological.length - 1];

  const hasExtractedTables = (activeEntry?.tables?.length ?? 0) > 0;
  const hasCaptureSource = Boolean(activeEntry?.source);
  const canSwitchView = hasExtractedTables && hasCaptureSource;

  const windowStart = React.useMemo(() => {
    if (chronological.length <= YEAR_WINDOW) return 0;
    const idx = Math.max(activeChronoIndex, 0);
    return Math.max(0, Math.min(idx - 1, chronological.length - YEAR_WINDOW));
  }, [activeChronoIndex, chronological.length]);

  const pickYear = React.useCallback(
    (year: string) => {
      const nextIdx = chronological.findIndex((y) => y.year === year);
      if (nextIdx > activeChronoIndex) setContentDir(1);
      else if (nextIdx < activeChronoIndex) setContentDir(-1);
      else setContentDir(0);
      setActiveYear(year);
    },
    [chronological, activeChronoIndex],
  );

  React.useEffect(() => {
    if (!open) return;
    const preferred =
      initialYear && chronological.some((y) => y.year === initialYear)
        ? initialYear
        : chronological.find((y) => y.source || (y.tables?.length ?? 0) > 0)
            ?.year ??
          chronological[chronological.length - 1]?.year ??
          "";
    setActiveYear(preferred);
    setContentView("extracted");
  }, [open, initialYear, chronological]);

  React.useEffect(() => {
    // Prefer extracted when available for the active year; otherwise capture image.
    if (hasExtractedTables) setContentView("extracted");
    else if (hasCaptureSource) setContentView("capture");
  }, [activeYear, hasExtractedTables, hasCaptureSource]);

  React.useEffect(() => {
    if (!open || !companySlug || !activeEntry?.source) {
      setImageUrls([]);
      setError(
        activeEntry && !activeEntry.source && !hasExtractedTables
          ? `No note capture saved for ${activeEntry.year} yet.`
          : null,
      );
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setImageUrls([]);

    void resolveNoteCaptureUrls({
      company: companySlug,
      year: activeEntry.year,
      source: activeEntry.source,
    })
      .then((urls) => {
        if (cancelled) return;
        if (urls.length > 0) {
          setImageUrls(urls);
        } else {
          setError(
            `No capture image found for ${activeEntry.year}. Re-run DB annual capture.`,
          );
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, companySlug, activeEntry, hasExtractedTables]);

  React.useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      scrollRef.current.scrollLeft = 0;
    }
  }, [open, activeYear, imageUrls, contentView]);

  const enableYearNavigation =
    showAllYearSlots && chronological.length > 1;

  const canGoOlder = enableYearNavigation && activeChronoIndex > 0;
  const canGoNewer =
    enableYearNavigation &&
    activeChronoIndex >= 0 &&
    activeChronoIndex < chronological.length - 1;

  const goOlder = () => {
    if (canGoOlder) {
      pickYear(chronological[activeChronoIndex - 1].year);
    }
  };

  const goNewer = () => {
    if (canGoNewer) {
      pickYear(chronological[activeChronoIndex + 1].year);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const endX = e.changedTouches[0]?.clientX ?? start;
    const delta = endX - start;
    if (Math.abs(delta) < 48) return;
    if (delta > 0) goOlder();
    else goNewer();
  };

  const noteRef = activeEntry?.source?.note_ref;
  const page = activeEntry?.source?.source_page;
  const showingCapture = contentView === "capture" || !hasExtractedTables;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex h-[min(96vh,980px)] w-[min(96vw,1280px)] !max-w-[min(96vw,1280px)] flex-col gap-2 overflow-hidden border bg-popover p-3 shadow-2xl sm:gap-3 sm:max-w-[min(96vw,1280px)] sm:p-4",
          "!top-[2vh] !z-[101] !translate-y-0",
        )}
        showCloseButton
      >
        <DialogHeader className="shrink-0 gap-1 bg-popover pr-10 text-left">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-base leading-snug sm:text-lg">
                {label}
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                {showingCapture
                  ? "Original report capture"
                  : "Extracted note table"}
                {noteRef ? ` · Note ${noteRef}` : ""}
                {page ? ` · Page ${page}` : ""}
                {showAllYearSlots
                  ? " · Use arrows to move between years"
                  : activeEntry?.year
                    ? ` · ${activeEntry.year}`
                    : ""}
              </DialogDescription>
            </div>
            {canSwitchView ? (
              <div
                className="inline-flex shrink-0 rounded-lg border bg-muted/40 p-0.5"
                role="group"
                aria-label="Switch between extracted data and capture image"
              >
                <button
                  type="button"
                  onClick={() => setContentView("extracted")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
                    contentView === "extracted"
                      ? "bg-teal-600 text-white shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  aria-pressed={contentView === "extracted"}
                >
                  <Table2 className="size-3.5" />
                  Extracted
                </button>
                <button
                  type="button"
                  onClick={() => setContentView("capture")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
                    contentView === "capture"
                      ? "bg-teal-600 text-white shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  aria-pressed={contentView === "capture"}
                >
                  <FileImage className="size-3.5" />
                  Capture
                </button>
              </div>
            ) : null}
          </div>
        </DialogHeader>

        {enableYearNavigation ? (
          <div className="flex shrink-0 items-center justify-center gap-3 bg-popover px-2 py-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!canGoOlder}
              onClick={goOlder}
              aria-label="Previous year"
              className="transition-transform active:scale-95"
            >
              <ChevronLeft className="size-5" />
            </Button>

            <div
              className="relative overflow-hidden"
              style={{ width: YEAR_VIEWPORT_W }}
            >
              <div
                className="pointer-events-none absolute inset-y-0 z-0 rounded-lg border border-yellow-500/60 bg-yellow-400/25 shadow-[0_0_20px_-4px_rgba(234,179,8,0.45)] transition-[transform,width] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform"
                style={{
                  width: YEAR_CARD_W,
                  transform: `translateX(${(activeChronoIndex - windowStart) * YEAR_TRACK_STEP}px)`,
                }}
                aria-hidden
              />

              <div
                className="relative z-10 flex transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform"
                style={{
                  gap: YEAR_GAP,
                  transform: `translateX(-${windowStart * YEAR_TRACK_STEP}px)`,
                }}
              >
                {chronological.map((entry) => {
                  const selected = entry.year === activeYear;
                  const hasCapture = Boolean(entry.source);
                  return (
                    <button
                      key={entry.year}
                      type="button"
                      onClick={() => pickYear(entry.year)}
                      style={{ width: YEAR_CARD_W, minWidth: YEAR_CARD_W }}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-center text-sm font-semibold tabular-nums transition-[transform,color,opacity,border-color,background-color] duration-300 ease-out",
                        "sm:text-base",
                        selected
                          ? "scale-[1.04] border-transparent bg-transparent text-foreground"
                          : "scale-100 border-border/70 bg-muted/40 text-muted-foreground hover:scale-[1.02] hover:bg-muted hover:text-foreground",
                        !hasCapture && !selected && "opacity-55",
                      )}
                    >
                      {entry.year}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!canGoNewer}
              onClick={goNewer}
              aria-label="Next year"
              className="transition-transform active:scale-95"
            >
              <ChevronRight className="size-5" />
            </Button>
          </div>
        ) : null}

        <div
          ref={scrollRef}
          className={cn(
            "relative isolate min-h-0 flex-1 overflow-auto rounded-lg border border-border",
            "bg-white dark:bg-neutral-950",
            "touch-pan-x touch-pan-y",
          )}
          onTouchStart={enableYearNavigation ? handleTouchStart : undefined}
          onTouchEnd={enableYearNavigation ? handleTouchEnd : undefined}
        >
          <div
            key={`${activeYear}-${contentView}-${contentDir}`}
            className={cn(
              "flex min-h-full min-w-full items-start justify-center bg-white p-2 dark:bg-neutral-950 sm:p-4",
              contentDir === 1 &&
                "animate-in fade-in slide-in-from-right-6 duration-300",
              contentDir === -1 &&
                "animate-in fade-in slide-in-from-left-6 duration-300",
              contentDir === 0 && "animate-in fade-in duration-200",
            )}
          >
            {!showingCapture && hasExtractedTables ? (
              <ExtractedNoteTables
                tables={activeEntry?.tables ?? []}
                yearLabel={activeEntry?.year}
                className="w-full p-2 sm:p-4"
              />
            ) : loading ? (
              <div className="flex min-h-[50vh] flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                Loading capture…
              </div>
            ) : error ? (
              <p className="flex min-h-[40vh] max-w-lg items-center justify-center px-6 text-center text-sm text-muted-foreground">
                {error}
              </p>
            ) : imageUrls.length > 0 ? (
              <div className="flex w-full max-w-none flex-col items-center gap-4">
                {imageUrls.map((url, index) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${activeYear}-${index}-${url}`}
                    src={url}
                    alt={`Note table capture for ${label} (${activeEntry?.year})${
                      imageUrls.length > 1 ? `, part ${index + 1}` : ""
                    }`}
                    className="block h-auto w-auto max-w-none select-none"
                    style={{ minWidth: "min(100%, 900px)" }}
                    draggable={false}
                  />
                ))}
              </div>
            ) : (
              <p className="flex min-h-[40vh] items-center text-sm text-muted-foreground">
                No capture to display.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
