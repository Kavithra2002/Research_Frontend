"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Database, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  cancelDemoRun,
  getDemoRunProgressPct,
  getServerSnapshot,
  getSnapshot,
  getTotalUploadedTables,
  subscribe,
} from "@/components/test-here/demo-run-store";

export function DemoRunFloatingStatus() {
  const state = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const pathname = usePathname();
  const [confirmingCancel, setConfirmingCancel] = React.useState(false);

  React.useEffect(() => {
    if (!state.running) setConfirmingCancel(false);
  }, [state.running]);

  if (!state.running) return null;
  if (pathname === "/test-here") return null;

  const progressPct = getDemoRunProgressPct(state.progress, state.activeStage);
  const totalUploadedTables = getTotalUploadedTables(state.uploads);
  const hasTotal = !!state.progress && state.progress.total > 0;
  const processingCount = state.progress
    ? Math.min(
        state.progress.done + (state.activeStage ? 1 : 0),
        state.progress.total,
      )
    : 0;

  const subtitle = hasTotal
    ? state.currentCompany
      ? `${processingCount}/${state.progress!.total} · ${state.currentCompany}${
          state.stageLabel ? ` · ${state.stageLabel}` : ""
        }`
      : `Processing ${processingCount}/${state.progress!.total} report(s)`
    : "Starting extraction…";

  const handleConfirmCancel = () => {
    setConfirmingCancel(false);
    void cancelDemoRun();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border bg-card text-card-foreground shadow-lg ring-1 ring-emerald-500/10"
    >
      <div className="flex items-start gap-3 p-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <Loader2 className="size-4 animate-spin" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Database className="size-3.5 text-muted-foreground" />
              Extracting demo reports
            </span>
            <span className="text-[11px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {hasTotal ? `${progressPct}%` : "…"}
            </span>
          </div>
          <div
            className="mt-0.5 truncate text-xs text-muted-foreground"
            title={subtitle}
          >
            {subtitle}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            {hasTotal ? (
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                style={{ width: `${progressPct}%` }}
              />
            ) : (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-emerald-500/70" />
            )}
          </div>

          {confirmingCancel ? (
            <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2">
              <div className="text-[11px] font-medium text-foreground">
                Cancel the running extraction?
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                Reports already saved to MongoDB will be kept.
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
                {totalUploadedTables} table
                {totalUploadedTables === 1 ? "" : "s"} uploaded
              </span>
              <a
                href="/test-here"
                className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
              >
                Open Development
              </a>
            </div>
          )}
        </div>
        {!confirmingCancel && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Cancel extraction"
            title="Cancel extraction"
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
