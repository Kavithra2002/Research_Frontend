"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Database, Download, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  cancelDownload,
  cancelExtract,
  getServerSnapshot,
  getSnapshot,
  liveExtractIndeterminate,
  liveExtractProgressPct,
  subscribe,
  type LiveJobState,
} from "@/components/system/live-extraction-store";

export function LiveExtractFloatingStatus() {
  const { download, extract } = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const pathname = usePathname();
  const [confirmingCancel, setConfirmingCancel] = React.useState(false);

  const running = extract.running || download.running;

  React.useEffect(() => {
    if (!running) setConfirmingCancel(false);
  }, [running]);

  if (!running) return null;
  // The Development page already renders the live log inline.
  if (pathname === "/test-here") return null;

  const isExtract = extract.running;
  const job: LiveJobState = isExtract ? extract : download;
  const indeterminate = liveExtractIndeterminate(job);
  const pct = liveExtractProgressPct(job);
  const total = job.progress?.total ?? 0;

  const title = isExtract ? "Extracting reports" : "Downloading reports";
  const Icon = isExtract ? Database : Download;
  const subtitle = job.stageLabel
    ? job.stageLabel
    : total > 1
      ? `Processing ${job.progress!.done}/${total} report(s)`
      : "Working — this can take a few minutes…";

  const handleConfirmCancel = () => {
    setConfirmingCancel(false);
    if (extract.running) void cancelExtract();
    if (download.running) void cancelDownload();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border bg-card text-card-foreground shadow-lg ring-1 ring-primary/10"
    >
      <div className="flex items-start gap-3 p-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Loader2 className="size-4 animate-spin" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Icon className="size-3.5 text-muted-foreground" />
              {title}
            </span>
            <span className="text-[11px] font-semibold tabular-nums text-primary">
              {indeterminate ? "…" : `${pct}%`}
            </span>
          </div>
          <div
            className="mt-0.5 truncate text-xs text-muted-foreground"
            title={subtitle}
          >
            {subtitle}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            {indeterminate ? (
              <div className="animate-demo-indeterminate h-full w-2/5 rounded-full bg-primary" />
            ) : (
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${pct}%` }}
              />
            )}
          </div>

          {confirmingCancel ? (
            <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2">
              <div className="text-[11px] font-medium text-foreground">
                Stop the running script?
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                Data already saved to MongoDB will be kept.
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
                  Yes, stop
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-1.5 flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
              <a
                href="/test-here"
                className="font-medium text-primary hover:underline"
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
            aria-label="Stop script"
            title="Stop script"
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
