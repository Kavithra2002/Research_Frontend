"use client";

import * as React from "react";
import {
  AlertCircle,
  Building2,
  Check,
  ChevronDown,
  FileDown,
  Globe,
  LineChart,
  Loader2,
  Plus,
  Sparkles,
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
  generateRobinReport,
  getRobinConfig,
  type DemoCompany,
  type RobinMetric,
} from "@/lib/robin";
import { addAgent, removeAgent, useAddedAgentIds } from "@/lib/ai-agents";
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
  getReportScheduleFromServer,
  saveReportScheduleToServer,
} from "@/lib/report-schedule";

const SELECTION_KEY = "ambeon.ai.robin.selection";

type Selection = { companies: string[]; metrics: string[] };

function loadSelection(): Selection {
  if (typeof window === "undefined") return { companies: [], metrics: [] };
  try {
    const raw = localStorage.getItem(SELECTION_KEY);
    if (!raw) return { companies: [], metrics: [] };
    const parsed = JSON.parse(raw) as Partial<Selection>;
    return {
      companies: Array.isArray(parsed.companies) ? parsed.companies : [],
      metrics: Array.isArray(parsed.metrics) ? parsed.metrics : [],
    };
  } catch {
    return { companies: [], metrics: [] };
  }
}

function saveSelection(sel: Selection) {
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify(sel));
  } catch {
    // ignore
  }
}

interface RobinConfigPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RobinConfigPanel({ open, onOpenChange }: RobinConfigPanelProps) {
  const [companies, setCompanies] = React.useState<DemoCompany[]>([]);
  const [metrics, setMetrics] = React.useState<RobinMetric[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [selCompanies, setSelCompanies] = React.useState<string[]>([]);
  const [selMetrics, setSelMetrics] = React.useState<string[]>([]);

  const [generating, setGenerating] = React.useState(false);
  const [report, setReport] = React.useState<string | null>(null);
  const [usedWeb, setUsedWeb] = React.useState(false);
  const [usedCse, setUsedCse] = React.useState(false);
  const [genError, setGenError] = React.useState<string | null>(null);
  const [savedNote, setSavedNote] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [schedule, setSchedule] = React.useState<ReportSchedule>(() =>
    getReportSchedule("robin"),
  );
  const [scheduleSaving, setScheduleSaving] = React.useState(false);
  const [scheduleError, setScheduleError] = React.useState<string | null>(null);

  const addedIds = useAddedAgentIds();
  const isAdded = addedIds.includes("robin");

  React.useEffect(() => {
    if (!open) return;
    const sel = loadSelection();
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- sync selection + kick off load on open */
    // Paint the locally-cached selection immediately, then reconcile with the
    // configuration that was actually saved on the server (source of truth for
    // an already-added agent — so reopening "Configure" restores the previously
    // picked companies/metrics even on a different browser or after a refresh).
    setSelCompanies(sel.companies);
    setSelMetrics(sel.metrics);
    setSchedule(getReportSchedule("robin"));
    setLoading(true);
    setLoadError(null);
    /* eslint-enable react-hooks/set-state-in-effect */

    const loadCatalog = getRobinConfig().then((res) => {
      if (cancelled) return res;
      setCompanies(res.companies);
      setMetrics(res.metrics);
      return res;
    });

    const loadSaved = getReportScheduleFromServer("robin").catch(() => null);

    void Promise.all([loadCatalog, loadSaved])
      .then(([res, saved]) => {
        if (cancelled) return;

        const savedCompanies =
          saved && Array.isArray(saved.config.companies)
            ? (saved.config.companies as unknown[]).map(String)
            : null;
        const savedMetrics =
          saved && Array.isArray(saved.config.metrics)
            ? (saved.config.metrics as unknown[]).map(String)
            : null;

        if (savedCompanies && savedCompanies.length > 0) {
          setSelCompanies(savedCompanies);
        }

        if (savedMetrics && savedMetrics.length > 0) {
          setSelMetrics(savedMetrics);
        } else if (sel.metrics.length === 0) {
          // No saved/cached choice yet → default to the enabled metrics.
          setSelMetrics(res.metrics.filter((m) => m.enabled).map((m) => m.id));
        }

        if (saved) {
          const restored: ReportSchedule = {
            time: saved.time,
            date: saved.date,
            frequency: saved.frequency,
            emails: saved.emails,
          };
          setSchedule(restored);
          saveReportSchedule("robin", restored);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  React.useEffect(() => {
    saveSelection({ companies: selCompanies, metrics: selMetrics });
  }, [selCompanies, selMetrics]);

  const toggleCompany = (name: string) => {
    setSelCompanies((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name],
    );
  };

  const toggleMetric = (id: string) => {
    setSelMetrics((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  const canGenerate =
    selCompanies.length > 0 && selMetrics.length > 0 && !generating;
  const canEnable = selCompanies.length > 0 && selMetrics.length > 0;

  const showSaved = (msg: string) => {
    setSavedNote(msg);
    window.setTimeout(() => setSavedNote(null), 2500);
  };

  async function enable() {
    if (!canEnable || scheduleSaving) return;
    setScheduleSaving(true);
    setScheduleError(null);
    try {
      await saveReportScheduleToServer("robin", {
        time: schedule.time,
        date: schedule.date,
        frequency: schedule.frequency,
        emails: schedule.emails,
        config: { companies: selCompanies, metrics: selMetrics },
        enabled: true,
      });
      saveReportSchedule("robin", schedule);
      addAgent("robin");
      setScheduleOpen(false);
      showSaved(
        isAdded
          ? "Configuration updated — report scheduled."
          : "Robin added — your report is scheduled and will be emailed.",
      );
    } catch (e) {
      setScheduleError(e instanceof Error ? e.message : String(e));
    } finally {
      setScheduleSaving(false);
    }
  }

  function remove() {
    removeAgent("robin");
    void deleteReportScheduleFromServer("robin").catch(() => {
      /* best-effort */
    });
    showSaved("Robin removed from your workspace.");
  }

  async function generate() {
    if (!canGenerate) return;
    setGenError(null);
    setReport(null);
    setGenerating(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await generateRobinReport(
        selCompanies,
        selMetrics,
        controller.signal,
      );
      const generated = res.report || "(no report returned)";
      setReport(generated);
      setUsedWeb(res.usedWebSearch);
      setUsedCse(res.usedCse);
      // Persist to the Gen_reports folder so it can be browsed later from
      // Robin's chat workspace.
      void saveAgentReport("robin", {
        content: generated,
        companies: selCompanies,
        metrics: selMetrics,
      });
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
        className="flex w-full flex-col gap-0 bg-card p-0 sm:!max-w-xl md:!max-w-2xl lg:!max-w-3xl"
      >
        <SheetHeader className="shrink-0 border-b bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-4">
          <div className="flex items-center gap-3">
            <Avatar size="lg" className="ring-2 ring-emerald-500/40">
              <AvatarImage
                src="/img/robin-avatar.png"
                alt="Robin"
              />
              <AvatarFallback>RB</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col">
              <SheetTitle className="flex items-center gap-2">
                Robin · Configuration
              </SheetTitle>
              <SheetDescription className="flex items-center gap-1 text-xs">
                <LineChart className="size-3 text-emerald-500" />
                Pick companies and metrics, then generate a summary report
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 p-4">
            {loadError ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{loadError}</span>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Left: companies */}
              <div className="rounded-xl border bg-background">
                <div className="flex items-center gap-2 border-b px-3 py-2">
                  <Building2 className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Companies</span>
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {selCompanies.length} selected
                  </Badge>
                </div>
                <div className="flex flex-col gap-1 p-2">
                  {loading && companies.length === 0 ? (
                    <div className="flex items-center gap-2 px-2 py-6 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      Loading companies…
                    </div>
                  ) : companies.length === 0 ? (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                      No demo companies found.
                    </p>
                  ) : (
                    companies.map((c) => {
                      const checked = selCompanies.includes(c.name);
                      return (
                        <label
                          key={c.name}
                          className={cn(
                            "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted",
                            checked && "bg-emerald-500/5",
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleCompany(c.name)}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {c.name}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right: metrics */}
              <div className="rounded-xl border bg-background">
                <div className="flex items-center gap-2 border-b px-3 py-2">
                  <Sparkles className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Metrics</span>
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {selMetrics.length} selected
                  </Badge>
                </div>
                <div className="flex flex-col gap-1 p-2">
                  {metrics.map((m) => {
                    const checked = selMetrics.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors",
                          m.enabled
                            ? "cursor-pointer hover:bg-muted"
                            : "cursor-not-allowed opacity-55",
                          checked && m.enabled && "bg-emerald-500/5",
                        )}
                      >
                        <Checkbox
                          checked={checked && m.enabled}
                          disabled={!m.enabled}
                          onCheckedChange={() =>
                            m.enabled && toggleMetric(m.id)
                          }
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {m.label}
                        </span>
                        {!m.enabled ? (
                          <Badge
                            variant="outline"
                            className="text-[9px] uppercase tracking-wide"
                          >
                            Soon
                          </Badge>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={() => setScheduleOpen((o) => !o)}
                disabled={!canEnable}
                aria-expanded={scheduleOpen}
              >
                {isAdded ? (
                  <Check className="size-4" />
                ) : (
                  <Plus className="size-4" />
                )}
                {isAdded
                  ? "Update configuration"
                  : "Add agent and enable generating summary report"}
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
                onClick={() => void generate()}
                disabled={!canGenerate}
              >
                {generating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Generating report…
                  </>
                ) : (
                  <>
                    <Globe className="size-4" />
                    Generate summary report
                  </>
                )}
              </Button>
              {isAdded ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={remove}
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
                    Schedule the summary report
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Choose when the report should be sent and the client emails
                    that should receive it.
                  </span>
                </div>
                <ReportScheduleFields
                  schedule={schedule}
                  onChange={setSchedule}
                  accent="text-emerald-500"
                />
                {scheduleError ? (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    <span>{scheduleError}</span>
                  </div>
                ) : null}
                <div>
                  <Button
                    type="button"
                    onClick={() => void enable()}
                    disabled={!canEnable || scheduleSaving}
                  >
                    {scheduleSaving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    {isAdded
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
            ) : (
              <p className="text-xs text-muted-foreground">
                Robin anchors price &amp; market cap on live Colombo Stock
                Exchange data, then researches the rest online.
              </p>
            )}

            {genError ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{genError}</span>
              </div>
            ) : null}

            {generating && !report ? (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-6 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Researching {selCompanies.length} compan
                {selCompanies.length === 1 ? "y" : "ies"} and compiling the
                report…
              </div>
            ) : null}

            {report ? (
              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Summary report
                  </Label>
                  {usedCse ? (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300"
                    >
                      <Building2 className="size-3" /> CSE market data
                    </Badge>
                  ) : null}
                  {usedWeb ? (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300"
                    >
                      <Globe className="size-3" /> Live web data
                    </Badge>
                  ) : !usedCse ? (
                    <Badge variant="secondary" className="text-[10px]">
                      Model knowledge
                    </Badge>
                  ) : null}
                  <button
                    type="button"
                    onClick={async () => {
                      const avatarDataUrl =
                        (await loadImageDataUrl("/img/robin-avatar.png")) ??
                        undefined;
                      const headerLogoDataUrls = await loadBrandLogoDataUrls();
                      exportMessageToPdf(report, {
                        title: "Robin — Financial Summary",
                        avatarDataUrl,
                        headerLogoDataUrls,
                        accentColor: [16, 185, 129],
                      });
                    }}
                    className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-300"
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
