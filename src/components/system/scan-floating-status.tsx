"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Loader2, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  cancelScan as storeCancelScan,
  getServerSnapshot,
  getSnapshot,
  subscribe as subscribeScanStore,
} from "@/components/system/scan-store";

export function ScanFloatingStatus() {
  const scan = React.useSyncExternalStore(
    subscribeScanStore,
    getSnapshot,
    getServerSnapshot,
  );
  const pathname = usePathname();
  const [confirmingCancel, setConfirmingCancel] = React.useState(false);

  // Reset the confirm prompt whenever the scan stops (e.g. finished on its own).
  React.useEffect(() => {
    if (!scan.scanning) setConfirmingCancel(false);
  }, [scan.scanning]);

  // Only show while a scan is running and the user is NOT already on the
  // /system page (where the full panel is visible).
  if (!scan.scanning) return null;
  if (pathname === "/system") return null;

  const progressPct = scan.progress
    ? Math.min(
        100,
        Math.round(
          (scan.progress.index / Math.max(1, scan.progress.total)) * 100,
        ),
      )
    : 0;

  const subtitle = scan.progress
    ? `${scan.progress.index} / ${scan.progress.total} · ${scan.progress.company}`
    : "Starting scan...";

  const handleConfirmCancel = () => {
    setConfirmingCancel(false);
    void storeCancelScan();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border bg-card text-card-foreground shadow-lg ring-1 ring-emerald-500/10"
    >
      <div className="flex items-start gap-3 p-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          {scan.progress ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">
              Scanning for new uploads
            </span>
            <span className="text-[11px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {progressPct}%
            </span>
          </div>
          <div
            className="mt-0.5 truncate text-xs text-muted-foreground"
            title={subtitle}
          >
            {subtitle}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {confirmingCancel ? (
            <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2">
              <div className="text-[11px] font-medium text-foreground">
                Cancel the running scan?
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                Reports already downloaded will be kept.
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
                {scan.foundDuringScan} new report
                {scan.foundDuringScan === 1 ? "" : "s"} found
              </span>
              <a
                href="/system"
                className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
              >
                Open System
              </a>
            </div>
          )}
        </div>
        {!confirmingCancel && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Cancel scan"
            title="Cancel scan"
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
