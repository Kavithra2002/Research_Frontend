"use client";

import * as React from "react";
import {
  AlertCircle,
  CalendarClock,
  Check,
  ChevronDown,
  FileDown,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  deleteTuckConfig,
  generateTuckReport,
  getTuckConfig,
  getTuckSections,
  saveTuckConfig,
  type TuckSection,
} from "@/lib/tuck";
import { addAgent, removeAgent } from "@/lib/ai-agents";
import { saveAgentReport } from "@/lib/agent-reports";
import { AssistantContent } from "@/components/ai/chat-markdown";
import {
  exportMessageToPdf,
  loadBrandLogoDataUrls,
  loadImageDataUrl,
} from "@/lib/report-pdf";
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

interface TuckConfigPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TuckConfigPanel({ open, onOpenChange }: TuckConfigPanelProps) {
  const [sections, setSections] = React.useState<TuckSection[]>([]);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [configured, setConfigured] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [saving, setSaving] = React.useState(false);
  const [savedNote, setSavedNote] = React.useState<string | null>(null);

  const [generating, setGenerating] = React.useState(false);
  const [report, setReport] = React.useState<string | null>(null);
  const [genError, setGenError] = React.useState<string | null>(null);

  const abortRef = React.useRef<AbortController | null>(null);

  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [schedule, setSchedule] = React.useState<ReportSchedule>(() =>
    getReportSchedule("tuck"),
  );

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- kick off load on open */
    setLoading(true);
    setLoadError(null);
    setSchedule(getReportSchedule("tuck"));
    /* eslint-enable react-hooks/set-state-in-effect */
    Promise.all([getTuckSections(), getTuckConfig()])
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

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
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
      await saveTuckConfig(selected, [], true);
      await saveReportScheduleToServer("tuck", {
        time: schedule.time,
        date: schedule.date,
        frequency: schedule.frequency,
        emails: schedule.emails,
        config: { sections: selected, companies: [] },
        enabled: true,
      });
      saveReportSchedule("tuck", schedule);
      addAgent("tuck");
      setConfigured(true);
      setScheduleOpen(false);
      showSaved(
        configured
          ? "Configuration updated — report scheduled."
          : "Tuck added — your report is scheduled and will be emailed.",
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
      await deleteTuckConfig();
      await deleteReportScheduleFromServer("tuck").catch(() => {
        /* best-effort */
      });
      removeAgent("tuck");
      setConfigured(false);
      showSaved("Daily report disabled and Tuck removed.");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function generateNow() {
    if (selected.length === 0 || generating) return;
    setGenError(null);
    setReport(null);
    setGenerating(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await generateTuckReport(
        selected,
        [],
        true,
        controller.signal,
      );
      const generated = res.report || "(no report returned)";
      setReport(generated);
      // Persist to the Gen_reports folder so it shows in Tuck's chat workspace.
      void saveAgentReport("tuck", { content: generated, metrics: selected });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
      abortRef.current = null;
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
        <SheetHeader className="shrink-0 border-b bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-transparent p-4">
          <div className="flex items-center gap-3">
            <Avatar size="lg" className="ring-2 ring-sky-500/40">
              <AvatarImage
                src="/img/tuck-avatar.png"
                alt="Tuck"
              />
              <AvatarFallback>TC</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col">
              <SheetTitle>Tuck · Configuration</SheetTitle>
              <SheetDescription className="flex items-center gap-1 text-xs">
                <CalendarClock className="size-3 text-sky-500" />
                Daily CSE market summary · auto-generated each day
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 p-4">
            <p className="text-sm text-muted-foreground">
              Tick the market data you want in your report. Once added, Tuck
              builds a fresh report automatically every day from the Colombo
              Stock Exchange feed.
            </p>

            {loadError ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{loadError}</span>
              </div>
            ) : null}

            <div className="rounded-xl border bg-background">
              <div className="flex items-center gap-2 border-b px-3 py-2">
                <span className="text-sm font-medium">Report sections</span>
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {selected.length} selected
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-1 p-2 sm:grid-cols-2">
                {loading && sections.length === 0 ? (
                  <div className="col-span-full flex items-center gap-2 px-2 py-6 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    Loading options…
                  </div>
                ) : (
                  sections.map((s) => {
                    const checked = selected.includes(s.id);
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
                      </label>
                    );
                  })
                )}
              </div>
            </div>

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
                {configured ? "Update configuration" : "Add agent & enable daily report"}
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
                Generate report now
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
                    Schedule the daily report
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

            {generating && !report ? (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-6 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Fetching live CSE data and writing the report…
              </div>
            ) : null}

            {report ? (
              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Market report
                  </Label>
                  <button
                    type="button"
                    onClick={async () => {
                      const avatarDataUrl =
                        (await loadImageDataUrl("/img/tuck-avatar.png")) ??
                        undefined;
                      const headerLogoDataUrls = await loadBrandLogoDataUrls();
                      exportMessageToPdf(report, {
                        title: "Tuck — Daily Market Summary",
                        avatarDataUrl,
                        headerLogoDataUrls,
                        accentColor: [14, 165, 233],
                      });
                    }}
                    className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-sky-500/10 hover:text-sky-600 dark:hover:text-sky-300"
                    title="Download this report as PDF"
                  >
                    <FileDown className="size-3" />
                    Download PDF
                  </button>
                </div>
                <AssistantContent content={report} />
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
