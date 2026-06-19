"use client";

import * as React from "react";
import {
  AlertCircle,
  CalendarClock,
  Check,
  ChevronDown,
  Download,
  FileDown,
  LineChart,
  List,
  Loader2,
  Plus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Trash2,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { loadWatchlists, type AnalyticsWatchlist } from "@/lib/analytics-watchlists";
import {
  deleteJoneConfig,
  downloadJoneReportCsv,
  downloadJoneReportPdf,
  getJoneColumns,
  getJoneConfig,
  getJonePresetGroups,
  saveJoneConfig,
  type JoneColumn,
  type JonePresetGroup,
  type JoneReportPayload,
} from "@/lib/jone";
import { ALL_TRADE_SUMMARY_COLUMN_IDS } from "@/lib/market-summary-columns";
import {
  isPresetGroupId,
  JONE_PRESET_GROUPS,
  presetGroupForId,
} from "@/lib/jone-market-groups";
import { addAgent, removeAgent } from "@/lib/ai-agents";
import { ReportScheduleFields } from "@/components/ai/report-schedule-fields";
import {
  getReportSchedule,
  saveReportSchedule,
  type ReportSchedule,
} from "@/lib/email-recipients";
import {
  deleteReportScheduleFromServer,
  saveReportScheduleToServer,
} from "@/lib/report-schedule";

const LOGO_SRC = "/company_logo.png";

interface JoneConfigPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JoneConfigPanel({ open, onOpenChange }: JoneConfigPanelProps) {
  const [columns, setColumns] = React.useState<JoneColumn[]>([]);
  const [selectedColumns, setSelectedColumns] = React.useState<string[]>([]);
  const [watchlists, setWatchlists] = React.useState<AnalyticsWatchlist[]>([]);
  const [presetGroups, setPresetGroups] = React.useState<JonePresetGroup[]>(
    [],
  );
  const [selectedGroupId, setSelectedGroupId] = React.useState<string | null>(
    null,
  );
  const [configured, setConfigured] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [savedNote, setSavedNote] = React.useState<string | null>(null);

  const [generating, setGenerating] = React.useState(false);
  const [generatingCsv, setGeneratingCsv] = React.useState(false);
  const [hasGenerated, setHasGenerated] = React.useState(false);
  const [genNote, setGenNote] = React.useState<string | null>(null);
  const [genError, setGenError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [schedule, setSchedule] = React.useState<ReportSchedule>(() =>
    getReportSchedule("jone"),
  );

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setWatchlists(loadWatchlists());
    setSchedule(getReportSchedule("jone"));

    Promise.all([getJoneColumns(), getJoneConfig(), getJonePresetGroups()])
      .then(([cols, config, presets]) => {
        if (cancelled) return;
        setColumns(cols);
        setPresetGroups(presets);
        if (config) {
          setSelectedColumns(config.columns);
          setSelectedGroupId(config.watchlistId || null);
          setConfigured(true);
        } else {
          setSelectedColumns([...ALL_TRADE_SUMMARY_COLUMN_IDS]);
          setSelectedGroupId(null);
          setConfigured(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedWatchlist = React.useMemo(
    () => watchlists.find((w) => w.id === selectedGroupId) ?? null,
    [watchlists, selectedGroupId],
  );

  const reportPayload = React.useMemo((): JoneReportPayload | null => {
    if (!selectedGroupId) return null;
    if (isPresetGroupId(selectedGroupId)) {
      const preset =
        presetGroups.find((p) => p.id === selectedGroupId) ??
        JONE_PRESET_GROUPS.find((p) => p.id === selectedGroupId);
      if (!preset) return null;
      return {
        groupKind: preset.kind,
        watchlistId: preset.id,
        watchlistName: preset.name,
        watchlistSymbols: [],
      };
    }
    if (!selectedWatchlist || selectedWatchlist.symbols.length === 0) return null;
    return {
      groupKind: "watchlist",
      watchlistId: selectedWatchlist.id,
      watchlistName: selectedWatchlist.name,
      watchlistSymbols: selectedWatchlist.symbols,
    };
  }, [selectedGroupId, selectedWatchlist, presetGroups]);

  const canSave = selectedColumns.length > 0 && reportPayload != null;

  const toggleColumn = (id: string) => {
    setSelectedColumns((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const showSaved = (msg: string) => {
    setSavedNote(msg);
    window.setTimeout(() => setSavedNote(null), 2500);
  };

  async function save() {
    if (!canSave || !reportPayload || saving) return;
    setSaving(true);
    setLoadError(null);
    try {
      await saveJoneConfig({
        columns: selectedColumns,
        groupKind: reportPayload.groupKind,
        watchlistId: reportPayload.watchlistId,
        watchlistName: reportPayload.watchlistName,
        watchlistSymbols: reportPayload.watchlistSymbols,
        enabled: true,
      });
      await saveReportScheduleToServer("jone", {
        time: schedule.time,
        date: schedule.date,
        frequency: schedule.frequency,
        emails: schedule.emails,
        config: {
          columns: selectedColumns,
          groupKind: reportPayload.groupKind,
          watchlistId: reportPayload.watchlistId,
          watchlistName: reportPayload.watchlistName,
          watchlistSymbols: reportPayload.watchlistSymbols,
        },
        enabled: true,
      });
      saveReportSchedule("jone", schedule);
      addAgent("jone");
      setConfigured(true);
      setScheduleOpen(false);
      showSaved(
        configured
          ? "Configuration updated — market summary report scheduled."
          : "John added — your market summary report is scheduled and will be emailed.",
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await deleteJoneConfig();
      await deleteReportScheduleFromServer("jone").catch(() => {
        /* best-effort */
      });
      removeAgent("jone");
      setConfigured(false);
      showSaved("Market summary report disabled and John removed.");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function generateNow() {
    if (!canSave || !reportPayload || generating) return;
    setGenError(null);
    setGenNote(null);
    setGenerating(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await downloadJoneReportPdf(reportPayload, controller.signal);
      setHasGenerated(true);
      setGenNote("Trade summary generated and downloaded as a PDF (all columns).");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }

  async function downloadAgain() {
    if (!hasGenerated || !reportPayload || generating) return;
    try {
      await downloadJoneReportPdf(reportPayload);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e));
    }
  }

  async function generateCsvNow() {
    if (!canSave || !reportPayload || generatingCsv) return;
    setGenError(null);
    setGeneratingCsv(true);
    try {
      await downloadJoneReportCsv(reportPayload);
      setGenNote("Trade summary downloaded as CSV (all columns).");
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setGeneratingCsv(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      abortRef.current?.abort();
      abortRef.current = null;
    }
    onOpenChange(next);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 bg-card p-0 sm:!max-w-xl md:!max-w-2xl"
      >
        <SheetHeader className="shrink-0 border-b bg-gradient-to-br from-violet-500/10 via-violet-500/5 to-transparent p-4">
          <div className="flex items-center gap-3">
            <Avatar size="lg" className="ring-2 ring-violet-500/40">
              <AvatarImage src="/img/john-avatar.png" alt="John" />
              <AvatarFallback>JO</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col">
              <SheetTitle>John · Configuration</SheetTitle>
              <SheetDescription className="flex items-center gap-1 text-xs">
                <CalendarClock className="size-3 text-violet-500" />
                My List market summary · live CSE data
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 p-4">
            <p className="text-sm text-muted-foreground">
              Tick the trade summary columns John should emphasise in chat, then
              pick a <strong>market preset</strong> (Top Gainers / Top Losers) or
              one of your Analytics <strong>My List</strong> groups. Download or
              schedule a report — CSV and PDF always include all trade summary
              columns.
            </p>

            {loadError ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{loadError}</span>
              </div>
            ) : null}

            <div className="rounded-xl border bg-background">
              <div className="flex items-center gap-2 border-b px-3 py-2">
                <LineChart className="size-3.5 text-violet-500" />
                <span className="text-sm font-medium">Trade summary columns</span>
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {selectedColumns.length} selected
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-1 p-2 sm:grid-cols-2">
                {loading && columns.length === 0 ? (
                  <div className="col-span-full flex items-center gap-2 px-2 py-6 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    Loading columns…
                  </div>
                ) : (
                  columns.map((col) => {
                    const checked = selectedColumns.includes(col.id);
                    return (
                      <label
                        key={col.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted",
                          checked && "bg-violet-500/5",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleColumn(col.id)}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {col.label}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-xl border bg-background">
              <div className="flex items-center gap-2 border-b px-3 py-2">
                <List className="size-3.5 text-violet-500" />
                <span className="text-sm font-medium">Market group</span>
              </div>
              <div className="flex flex-col gap-1 p-2">
                {JONE_PRESET_GROUPS.map((preset) => {
                  const active = selectedGroupId === preset.id;
                  const live = presetGroups.find((p) => p.id === preset.id);
                  const count = live?.count;
                  const Icon =
                    preset.kind === "top_gainers" ? TrendingUp : TrendingDown;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setSelectedGroupId(preset.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                        active
                          ? "border-violet-500/50 bg-violet-500/5"
                          : "border-transparent hover:bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "size-3.5 shrink-0 rounded-full border-2",
                          active
                            ? "border-violet-500 bg-violet-500"
                            : "border-muted-foreground/40",
                        )}
                      />
                      <Icon
                        className={cn(
                          "size-3.5 shrink-0",
                          preset.kind === "top_gainers"
                            ? "text-emerald-500"
                            : "text-rose-500",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {preset.name}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {preset.description}
                        </span>
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {count == null ? "…" : count}
                      </Badge>
                    </button>
                  );
                })}

                {watchlists.length > 0 ? (
                  <div className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                    My lists
                  </div>
                ) : null}

                {watchlists.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    No custom lists yet — use Top Gainers/Losers above, or create
                    groups under <strong>Analytics → My lists</strong>.
                  </p>
                ) : (
                  watchlists.map((w) => {
                    const active = selectedGroupId === w.id;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => setSelectedGroupId(w.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                          active
                            ? "border-violet-500/50 bg-violet-500/5"
                            : "border-transparent hover:bg-muted",
                        )}
                      >
                        <span
                          className={cn(
                            "size-3.5 shrink-0 rounded-full border-2",
                            active
                              ? "border-violet-500 bg-violet-500"
                              : "border-muted-foreground/40",
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {w.name}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {w.symbols.length}
                        </Badge>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={() => setScheduleOpen((o) => !o)}
                disabled={!canSave || saving}
                aria-expanded={scheduleOpen}
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : configured ? (
                  <Check className="size-4" />
                ) : (
                  <Plus className="size-4" />
                )}
                {configured
                  ? "Update configuration"
                  : "Add agent & enable report"}
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform",
                    scheduleOpen && "rotate-180",
                  )}
                />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void generateCsvNow()}
                disabled={!canSave || generatingCsv || generating}
              >
                {generatingCsv ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Download CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void generateNow()}
                disabled={!canSave || generating || generatingCsv}
              >
                {generating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Generate &amp; download PDF
              </Button>
              {configured ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void remove()}
                  disabled={saving}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                  Remove
                </Button>
              ) : null}
            </div>

            {scheduleOpen ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    Schedule the trade summary report
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Choose when the report should be sent and the client emails
                    that should receive it.
                  </span>
                </div>
                <ReportScheduleFields
                  schedule={schedule}
                  onChange={setSchedule}
                  accent="text-violet-500"
                />
                <div>
                  <Button
                    type="button"
                    onClick={() => void save()}
                    disabled={!canSave || saving}
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    {configured
                      ? "Save schedule & update"
                      : "Confirm & enable report"}
                  </Button>
                </div>
              </div>
            ) : null}

            {savedNote ? (
              <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <Check className="size-3.5" />
                {savedNote}
              </p>
            ) : null}

            {genError ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{genError}</span>
              </div>
            ) : null}

            {generating ? (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-6 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Fetching live CSE data and building the trade summary PDF…
              </div>
            ) : null}

            {!generating && genNote ? (
              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- static brand logo */}
                  <img src={LOGO_SRC} alt="Company logo" className="h-8 w-auto" />
                  <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3.5" />
                    {genNote}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    onClick={() => void downloadAgain()}
                  >
                    <FileDown className="size-3.5" />
                    Download again
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
