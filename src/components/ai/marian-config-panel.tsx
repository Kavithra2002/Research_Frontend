"use client";

import * as React from "react";
import {
  AlertCircle,
  BarChart3,
  CalendarClock,
  Check,
  ChevronDown,
  FileDown,
  Loader2,
  Plus,
  RefreshCw,
  Table2,
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
import {
  deleteMarianConfig,
  downloadMarianReportPdf,
  getMarianConfig,
  getMarianSections,
  saveMarianConfig,
  type MarianSection,
} from "@/lib/marian";
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

const COVERAGE_LABEL: Record<string, string> = {
  full: "",
  partial: "partial data",
  derived: "computed",
  none: "no live data",
};

interface MarianConfigPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MarianConfigPanel({ open, onOpenChange }: MarianConfigPanelProps) {
  const [sections, setSections] = React.useState<MarianSection[]>([]);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [configured, setConfigured] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [saving, setSaving] = React.useState(false);
  const [savedNote, setSavedNote] = React.useState<string | null>(null);

  const [generating, setGenerating] = React.useState(false);
  const [hasGenerated, setHasGenerated] = React.useState(false);
  const [unavailable, setUnavailable] = React.useState<string[]>([]);
  const [genNote, setGenNote] = React.useState<string | null>(null);
  const [genError, setGenError] = React.useState<string | null>(null);

  const abortRef = React.useRef<AbortController | null>(null);

  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [schedule, setSchedule] = React.useState<ReportSchedule>(() =>
    getReportSchedule("marian"),
  );

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- kick off load on open */
    setLoading(true);
    setLoadError(null);
    setSchedule(getReportSchedule("marian"));
    /* eslint-enable react-hooks/set-state-in-effect */
    Promise.all([getMarianSections(), getMarianConfig()])
      .then(([secs, config]) => {
        if (cancelled) return;
        setSections(secs);
        if (config) {
          setSelected(config.sections);
          setConfigured(true);
        } else {
          setSelected([]);
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

  const tableSections = React.useMemo(
    () => sections.filter((s) => s.kind === "table"),
    [sections],
  );
  const chartSections = React.useMemo(
    () => sections.filter((s) => s.kind === "chart"),
    [sections],
  );

  const allIds = React.useMemo(() => sections.map((s) => s.id), [sections]);
  const allSelected =
    allIds.length > 0 && allIds.every((id) => selected.includes(id));

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const toggleGroup = (ids: string[], on: boolean) => {
    setSelected((prev) => {
      const set = new Set(prev);
      for (const id of ids) {
        if (on) set.add(id);
        else set.delete(id);
      }
      return [...set];
    });
  };

  const showSaved = (msg: string) => {
    setSavedNote(msg);
    window.setTimeout(() => setSavedNote(null), 2500);
  };

  async function save() {
    if (selected.length === 0 || saving) return;
    setSaving(true);
    setLoadError(null);
    try {
      await saveMarianConfig(selected, true);
      await saveReportScheduleToServer("marian", {
        time: schedule.time,
        date: schedule.date,
        frequency: schedule.frequency,
        emails: schedule.emails,
        config: { sections: selected },
        enabled: true,
      });
      saveReportSchedule("marian", schedule);
      addAgent("marian");
      setConfigured(true);
      setScheduleOpen(false);
      showSaved(
        configured
          ? "Configuration updated — Daily Market Wrap scheduled."
          : "Marian added — your Daily Market Wrap is scheduled and will be emailed.",
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
      await deleteMarianConfig();
      await deleteReportScheduleFromServer("marian").catch(() => {
        /* best-effort */
      });
      removeAgent("marian");
      setConfigured(false);
      showSaved("Daily Market Wrap disabled and Marian removed.");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function generateNow() {
    if (selected.length === 0 || generating) return;
    setGenError(null);
    setGenNote(null);
    setGenerating(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { unavailable: un } = await downloadMarianReportPdf(
        selected,
        controller.signal,
      );
      setHasGenerated(true);
      setUnavailable(un);
      setGenNote("Daily Market Wrap generated and downloaded as a PDF.");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }

  async function downloadAgain() {
    if (!hasGenerated || generating) return;
    try {
      await downloadMarianReportPdf(selected);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      abortRef.current?.abort();
      abortRef.current = null;
    }
    onOpenChange(next);
  }

  const unavailableLabels = React.useMemo(
    () =>
      unavailable
        .map((id) => sections.find((s) => s.id === id)?.label ?? id)
        .filter(Boolean),
    [unavailable, sections],
  );

  const renderGroup = (
    title: string,
    icon: React.ReactNode,
    list: MarianSection[],
  ) => {
    if (list.length === 0) return null;
    const ids = list.map((s) => s.id);
    const groupAllOn = ids.every((id) => selected.includes(id));
    return (
      <div className="rounded-xl border bg-background">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          {icon}
          <span className="text-sm font-medium">{title}</span>
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {list.filter((s) => selected.includes(s.id)).length}/{list.length}
          </Badge>
          <button
            type="button"
            onClick={() => toggleGroup(ids, !groupAllOn)}
            className="text-[11px] text-sky-600 hover:underline dark:text-sky-400"
          >
            {groupAllOn ? "Clear" : "All"}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-1 p-2 sm:grid-cols-2">
          {list.map((s) => {
            const checked = selected.includes(s.id);
            const cov = COVERAGE_LABEL[s.coverage];
            return (
              <label
                key={s.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted",
                  checked && "bg-sky-500/5",
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(s.id)}
                />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {s.label}
                </span>
                {cov ? (
                  <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400">
                    {cov}
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 bg-card p-0 sm:!max-w-xl md:!max-w-2xl"
      >
        <SheetHeader className="shrink-0 border-b bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-transparent p-4">
          <div className="flex items-center gap-3">
            <Avatar size="lg" className="ring-2 ring-sky-500/40">
              <AvatarImage
                src="/img/marian-avatar.png"
                alt="Marian"
              />
              <AvatarFallback>MR</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col">
              <SheetTitle>Marian · Configuration</SheetTitle>
              <SheetDescription className="flex items-center gap-1 text-xs">
                <CalendarClock className="size-3 text-sky-500" />
                Daily Market Wrap · tables &amp; charts from live CSE data
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 p-4">
            <p className="text-sm text-muted-foreground">
              Tick the report components you want. Marian rebuilds the Ambeon{" "}
              <strong>Daily Market Wrap</strong> from the live Colombo Stock
              Exchange feed — choose any mix of <strong>tables</strong> and{" "}
              <strong>charts</strong>, or tick everything for the full wrap.
            </p>

            {loadError ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{loadError}</span>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                {selected.length} of {sections.length} selected
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => toggleGroup(allIds, !allSelected)}
                disabled={sections.length === 0}
                className="ml-auto h-7 text-xs"
              >
                {allSelected ? "Clear all" : "Select all (full wrap)"}
              </Button>
            </div>

            {loading && sections.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border px-3 py-6 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Loading components…
              </div>
            ) : (
              <>
                {renderGroup(
                  "Tables",
                  <Table2 className="size-4 text-sky-500" />,
                  tableSections,
                )}
                {renderGroup(
                  "Charts",
                  <BarChart3 className="size-4 text-sky-500" />,
                  chartSections,
                )}
              </>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={() => setScheduleOpen((o) => !o)}
                disabled={selected.length === 0 || saving}
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
                  : "Add agent & enable Daily Market Wrap"}
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
                onClick={() => void generateNow()}
                disabled={selected.length === 0 || generating}
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
                    Schedule the Daily Market Wrap
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Choose when the report should be sent and the client emails
                    that should receive it.
                  </span>
                </div>
                <ReportScheduleFields
                  schedule={schedule}
                  onChange={setSchedule}
                  accent="text-sky-500"
                />
                <div>
                  <Button
                    type="button"
                    onClick={() => void save()}
                    disabled={selected.length === 0 || saving}
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
                Fetching live CSE data and building the Daily Market Wrap PDF…
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
                  <button
                    type="button"
                    onClick={() => void downloadAgain()}
                    className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-sky-500/10 hover:text-sky-600 dark:hover:text-sky-300"
                    title="Download the PDF again"
                  >
                    <FileDown className="size-3" />
                    Download again
                  </button>
                </div>

                {unavailableLabels.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
                    <span className="font-medium">
                      Not available from the live CSE feed (noted in the report):
                    </span>{" "}
                    {unavailableLabels.join(", ")}.
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
