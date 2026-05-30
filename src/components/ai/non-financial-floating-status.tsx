"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Loader2, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  cancelAnalysis as storeCancelAnalysis,
  getServerSnapshot,
  getSnapshot,
  subscribe as subscribeNonFinancialStore,
} from "@/components/ai/non-financial-store";

export function NonFinancialFloatingStatus() {
  const state = React.useSyncExternalStore(
    subscribeNonFinancialStore,
    getSnapshot,
    getServerSnapshot,
  );
  const pathname = usePathname();
  const [confirmingCancel, setConfirmingCancel] = React.useState(false);

  // Reset the confirm prompt whenever the analysis stops (finished on its own).
  React.useEffect(() => {
    if (!state.running) setConfirmingCancel(false);
  }, [state.running]);

  // Only show while an analysis is running and the user is NOT already on the
  // /ai/non-financial page (where the full panel is visible).
  if (!state.running) return null;
  if (pathname === "/ai/non-financial") return null;

  const hasCount =
    state.progress &&
    typeof state.progress.current === "number" &&
    typeof state.progress.total === "number" &&
    state.progress.total > 0;

  const progressPct = hasCount
    ? Math.min(
        100,
        Math.round(
          (state.progress!.current! / state.progress!.total!) * 100,
        ),
      )
    : null;

  const headline = state.company
    ? `Analysing ${state.company}`
    : "Analysing report";

  const subtitle = state.progress?.message
    ? hasCount
      ? `${state.progress.message} (${state.progress!.current}/${
          state.progress!.total
        })`
      : state.progress.message
    : "Starting report analysis…";

  const handleConfirmCancel = () => {
    setConfirmingCancel(false);
    void storeCancelAnalysis();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border bg-card text-card-foreground shadow-lg ring-1 ring-emerald-500/10"
    >
      <div className="flex items-start gap-3 p-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          {state.progress ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium" title={headline}>
              {headline}
            </span>
            {progressPct !== null ? (
              <span className="text-[11px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {progressPct}%
              </span>
            ) : null}
          </div>
          <div
            className="mt-0.5 truncate text-xs text-muted-foreground"
            title={subtitle}
          >
            {subtitle}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={
                progressPct !== null
                  ? "h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                  : "h-full w-1/3 animate-pulse rounded-full bg-emerald-500/70"
              }
              style={progressPct !== null ? { width: `${progressPct}%` } : undefined}
            />
          </div>

          {confirmingCancel ? (
            <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2">
              <div className="text-[11px] font-medium text-foreground">
                Cancel the running analysis?
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                The current AI briefing will be discarded.
              </div>
              <div className="mt-2 flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setConfirmingCancel(false)}
                >
                  Keep running
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={handleConfirmCancel}
                  autoFocus
                >
                  Yes, cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>
                {state.sectionsFound.length} section
                {state.sectionsFound.length === 1 ? "" : "s"} found
              </span>
              <a
                href="/ai/non-financial"
                className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
              >
                Open analysis
              </a>
            </div>
          )}
        </div>
        {!confirmingCancel && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Cancel analysis"
            title="Cancel analysis"
            onClick={() => setConfirmingCancel(true)}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <X />
          </Button>
        )}
      </div>
    </div>
  );
}
