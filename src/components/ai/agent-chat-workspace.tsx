"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowLeft,
  Clock,
  FileDown,
  FileText,
  Loader2,
  LineChart,
  MessageSquarePlus,
  Pencil,
  Plus,
  Send,
  Square,
  Trash2,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-provider";
import {
  clearActiveSessionId,
  deleteChatSession,
  getActiveSessionId,
  getChatSession,
  listChatSessions,
  saveChatSession,
  setActiveSessionId,
  type ChatSessionSummary,
} from "@/lib/chat-log";
import {
  deleteAgentReport,
  useAgentReports,
  type GeneratedReport,
} from "@/lib/agent-reports";
import { AssistantContent } from "@/components/ai/chat-markdown";
import { LottieBackground } from "@/components/ai/lottie-background";
import { exportMessageToPdf, loadImageDataUrl } from "@/lib/report-pdf";

/* ────────────────────────────────────────────────────────────────────────── *
 * Configurable, full-page ChatGPT-style workspace shared by all chat agents
 * (Robin, Marian, Tuck …). A left rail shows the agent's generated reports
 * (top) and chat history (bottom); the main panel is the conversation, with a
 * centered "first chat" hero that docks to the bottom once a chat starts.
 * ────────────────────────────────────────────────────────────────────────── */

export type AccentName = "emerald" | "sky" | "violet" | "amber";

interface AccentTokens {
  glow: string;
  ring: string;
  ringSm: string;
  icon: string;
  active: string;
  suggestionHover: string;
  pdfHover: string;
}

const ACCENTS: Record<AccentName, AccentTokens> = {
  emerald: {
    glow: "bg-emerald-500/25",
    ring: "ring-emerald-500/40",
    ringSm: "ring-emerald-500/30",
    icon: "text-emerald-500",
    active: "border-emerald-500/40 bg-emerald-500/5",
    suggestionHover: "hover:border-emerald-500/40",
    pdfHover:
      "hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-300",
  },
  sky: {
    glow: "bg-sky-500/25",
    ring: "ring-sky-500/40",
    ringSm: "ring-sky-500/30",
    icon: "text-sky-500",
    active: "border-sky-500/40 bg-sky-500/5",
    suggestionHover: "hover:border-sky-500/40",
    pdfHover: "hover:bg-sky-500/10 hover:text-sky-600 dark:hover:text-sky-300",
  },
  violet: {
    glow: "bg-violet-500/25",
    ring: "ring-violet-500/40",
    ringSm: "ring-violet-500/30",
    icon: "text-violet-500",
    active: "border-violet-500/40 bg-violet-500/5",
    suggestionHover: "hover:border-violet-500/40",
    pdfHover:
      "hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-300",
  },
  amber: {
    glow: "bg-amber-500/25",
    ring: "ring-amber-500/40",
    ringSm: "ring-amber-500/30",
    icon: "text-amber-500",
    active: "border-amber-500/40 bg-amber-500/5",
    suggestionHover: "hover:border-amber-500/40",
    pdfHover:
      "hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-300",
  },
};

export interface AgentChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentChatConfig {
  /** Storage key for chat history + reports (e.g. "robin"). */
  agent: string;
  name: string;
  avatarSrc: string;
  fallback: string;
  accent: AccentName;
  /** Full greeting shown on the empty/landing screen only (not a chat bubble). */
  greeting: (firstName: string) => string;
  /** Short paragraph under the hero heading on a fresh chat. */
  heroSubtitle: string;
  suggestions: string[];
  placeholder: string;
  /** Sends the conversation and returns the assistant reply. */
  send: (
    messages: AgentChatMessage[],
    signal?: AbortSignal,
  ) => Promise<{ reply: string }>;
  /** Fallback title when deriving a PDF/report name. */
  reportTitleFallback: string;
  /** Optional PDF branding (brand line + logo to embed). */
  pdf?: { brand?: string; logoSrc?: string };
}

const SLOW_AFTER_MS = 30_000;
const TIMEOUT_AFTER_MS = 60_000;

type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts: number;
  exportable?: boolean;
};

type View = { kind: "chat" } | { kind: "report"; report: GeneratedReport };

function timeoutApology(firstName: string, question: string): string {
  const q = question.trim();
  const quoted = q.length > 90 ? `${q.slice(0, 90)}…` : q;
  return [
    `I'm really sorry, ${firstName} — this one is taking longer than usual and I don't want to keep you waiting. 🙏`,
    "",
    `Your question (*"${quoted}"*) likely needs a slow source right now — a large report, live web/market data, or a heavy lookup — and it hasn't come back in time.`,
    "",
    "Here's what tends to help:",
    "- Try again in a moment — these slowdowns are usually temporary.",
    "- Narrow it down (a specific **company**, **year**, or single figure) so I can fetch it faster.",
    "- For broad market/web questions, ask about one company at a time.",
    "",
    "Send it again whenever you're ready and I'll get right on it.",
  ].join("\n");
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatReportDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function wantsPdfExport(text: string): boolean {
  const t = text.toLowerCase();
  if (/\b(pdf|download|export)\b/.test(t)) return true;
  if (
    /\b(report|wrap|summary|document)\b/.test(t) &&
    /\b(create|generate|make|prepare|give|produce|build|want|need|provide)\b/.test(
      t,
    )
  )
    return true;
  return false;
}

function deriveReportTitle(content: string, fallback: string): string {
  const firstLine =
    content
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  const clean = firstLine
    .replace(/^#{1,6}\s*/, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/[|`]/g, "")
    .trim();
  if (!clean) return fallback;
  return clean.length > 80 ? `${clean.slice(0, 80)}…` : clean;
}

export function AgentChatWorkspace({
  config,
  railOpen = false,
}: {
  config: AgentChatConfig;
  /** Whether the left rail (reports + chat history) is shown. Hidden by default. */
  railOpen?: boolean;
}) {
  const accent = ACCENTS[config.accent];
  const { user } = useAuth();
  const firstName =
    user?.first_name?.trim() || user?.email?.split("@")[0] || "there";
  const authorName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() ||
    user?.email ||
    undefined;

  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState("");
  const [editingTurnId, setEditingTurnId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [slow, setSlow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const timedOutRef = React.useRef(false);

  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [sessions, setSessions] = React.useState<ChatSessionSummary[]>([]);
  const [historyUpdating, setHistoryUpdating] = React.useState(false);
  const [historyReveal, setHistoryReveal] = React.useState(false);
  const [highlightedSessionId, setHighlightedSessionId] = React.useState<
    string | null
  >(null);
  const newChatSavingRef = React.useRef(false);

  const turnsRef = React.useRef(turns);
  const sessionIdRef = React.useRef(sessionId);
  turnsRef.current = turns;
  sessionIdRef.current = sessionId;

  const { reports } = useAgentReports(config.agent);
  const [view, setView] = React.useState<View>({ kind: "chat" });

  const bottomRef = React.useRef<HTMLDivElement | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const MAX_ROWS = 6;
  React.useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const style = window.getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight) || 20;
    const paddingY =
      (parseFloat(style.paddingTop) || 0) +
      (parseFloat(style.paddingBottom) || 0);
    const borderY =
      (parseFloat(style.borderTopWidth) || 0) +
      (parseFloat(style.borderBottomWidth) || 0);
    const maxHeight = lineHeight * MAX_ROWS + paddingY + borderY;
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [input]);

  const refreshSessions = React.useCallback(async () => {
    try {
      const list = await listChatSessions(config.agent);
      setSessions(list);
    } catch {
      // history is best-effort; ignore load failures
    }
  }, [config.agent]);

  React.useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  /** Resume the in-progress chat when returning to this agent page. */
  React.useEffect(() => {
    let cancelled = false;
    const activeId = getActiveSessionId(config.agent);
    if (!activeId) return;

    void (async () => {
      try {
        const session = await getChatSession(config.agent, activeId);
        if (cancelled || turnsRef.current.length > 0) return;
        const loaded: Turn[] = session.messages.map((m, i) => ({
          id: `${session.id}-${i}`,
          role: m.role,
          text: m.content,
          ts: m.ts,
        }));
        if (loaded.length > 0) {
          setTurns(loaded);
          setSessionId(session.id);
          sessionIdRef.current = session.id;
        }
      } catch {
        clearActiveSessionId(config.agent);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [config.agent]);

  /** Save the active conversation when navigating away from the page. */
  React.useEffect(() => {
    return () => {
      const currentTurns = turnsRef.current;
      const currentSessionId = sessionIdRef.current;
      if (currentTurns.length === 0) return;

      const messages = currentTurns.map((t) => ({
        role: t.role,
        content: t.text,
        ts: t.ts,
      }));

      void saveChatSession(config.agent, {
        session_id: currentSessionId,
        messages,
      })
        .then((saved) => {
          setActiveSessionId(config.agent, saved.id);
        })
        .catch(() => {
          // best-effort
        });
    };
  }, [config.agent]);

  React.useEffect(() => {
    if (view.kind === "chat") {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [turns, loading, view.kind]);

  async function startNewChat() {
    if (newChatSavingRef.current) return;

    const currentTurns = turns;
    const currentSessionId = sessionId;
    const hasMessages = currentTurns.length > 0;

    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setSlow(false);

    if (hasMessages) {
      newChatSavingRef.current = true;
      setHistoryUpdating(true);
      setHistoryReveal(false);
      try {
        // Phase 1: animation only — history list does not update yet.
        await new Promise((resolve) => window.setTimeout(resolve, 750));

        const savedId = await persist(currentTurns, currentSessionId, {
          assignSessionId: false,
        });
        await refreshSessions();

        // Phase 2: reveal the saved chat in history with a highlight flash.
        setHistoryReveal(true);
        const highlightId = savedId ?? currentSessionId;
        if (highlightId) {
          setHighlightedSessionId(highlightId);
          window.setTimeout(() => setHighlightedSessionId(null), 1600);
        }
        await new Promise((resolve) => window.setTimeout(resolve, 550));
      } finally {
        setHistoryUpdating(false);
        setHistoryReveal(false);
        newChatSavingRef.current = false;
      }
    }

    setTurns([]);
    setInput("");
    setEditingTurnId(null);
    setEditDraft("");
    setError(null);
    setSessionId(null);
    clearActiveSessionId(config.agent);
    sessionIdRef.current = null;
    setView({ kind: "chat" });
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function persist(
    allTurns: Turn[],
    currentId: string | null,
    opts?: { assignSessionId?: boolean },
  ): Promise<string | null> {
    const messages = allTurns.map((t) => ({
      role: t.role,
      content: t.text,
      ts: t.ts,
    }));
    if (messages.length === 0) return null;
    try {
      const saved = await saveChatSession(config.agent, {
        session_id: currentId,
        messages,
      });
      if (opts?.assignSessionId !== false && !currentId) {
        setSessionId(saved.id);
      }
      sessionIdRef.current = saved.id;
      setActiveSessionId(config.agent, saved.id);
      return saved.id;
    } catch {
      // saving history is best-effort; don't disrupt the chat
      return null;
    }
  }

  async function autoSave(allTurns: Turn[], currentId: string | null) {
    const savedId = await persist(allTurns, currentId);
    if (savedId) {
      await refreshSessions();
    }
  }

  function cancelEdit() {
    setEditingTurnId(null);
    setEditDraft("");
  }

  function startEdit(turnId: string, text: string) {
    if (loading) return;
    setEditingTurnId(turnId);
    setEditDraft(text);
  }

  async function send(
    text: string,
    opts?: { replaceFromTurnId?: string },
  ) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    let priorTurns = turns;
    if (opts?.replaceFromTurnId) {
      const idx = turns.findIndex((t) => t.id === opts.replaceFromTurnId);
      if (idx === -1 || turns[idx]?.role !== "user") return;
      priorTurns = turns.slice(0, idx);
      cancelEdit();
      abortRef.current?.abort();
      abortRef.current = null;
    }

    setView({ kind: "chat" });
    setError(null);
    const userTurn: Turn = {
      id: `u-${Date.now()}`,
      role: "user",
      text: trimmed,
      ts: Date.now(),
    };
    const nextTurns = [...priorTurns, userTurn];
    setTurns(nextTurns);
    setInput("");
    setLoading(true);
    setSlow(false);
    timedOutRef.current = false;
    requestAnimationFrame(() => textareaRef.current?.focus());

    const history: AgentChatMessage[] = nextTurns.map((t) => ({
      role: t.role,
      content: t.text,
    }));

    const controller = new AbortController();
    abortRef.current = controller;

    const slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    const timeoutTimer = setTimeout(() => {
      timedOutRef.current = true;
      controller.abort();
    }, TIMEOUT_AFTER_MS);

    try {
      const res = await config.send(history, controller.signal);
      const assistantTurn: Turn = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: res.reply || "(no answer)",
        ts: Date.now(),
        exportable: wantsPdfExport(trimmed),
      };
      const finalTurns = [...nextTurns, assistantTurn];
      setTurns(finalTurns);
      void autoSave(finalTurns, sessionIdRef.current);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        if (timedOutRef.current) {
          const apologyTurn: Turn = {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: timeoutApology(firstName, trimmed),
            ts: Date.now(),
          };
          const finalTurns = [...nextTurns, apologyTurn];
          setTurns(finalTurns);
          void autoSave(finalTurns, sessionIdRef.current);
        }
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(slowTimer);
      clearTimeout(timeoutTimer);
      setLoading(false);
      setSlow(false);
      abortRef.current = null;
    }
  }

  function cancel() {
    timedOutRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setSlow(false);
  }

  async function openSession(id: string) {
    setView({ kind: "chat" });
    setError(null);
    try {
      const session = await getChatSession(config.agent, id);
      const loaded: Turn[] = session.messages.map((m, i) => ({
        id: `${session.id}-${i}`,
        role: m.role,
        text: m.content,
        ts: m.ts,
      }));
      setTurns(loaded.length ? loaded : []);
      setSessionId(session.id);
      setEditingTurnId(null);
      setEditDraft("");
      sessionIdRef.current = session.id;
      setActiveSessionId(config.agent, session.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await deleteChatSession(config.agent, id);
      if (id === sessionId) {
        abortRef.current?.abort();
        abortRef.current = null;
        setTurns([]);
        setInput("");
        setEditingTurnId(null);
        setEditDraft("");
        setError(null);
        setLoading(false);
        setSessionId(null);
        clearActiveSessionId(config.agent);
        sessionIdRef.current = null;
      }
      await refreshSessions();
    } catch {
      // ignore
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }

  // Landing: greeting lives in the hero only — not as a chat bubble.
  const isLanding = view.kind === "chat" && turns.length === 0 && !loading;

  const composerInner = (
    <div className="flex w-full items-end gap-2">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void send(input);
          }
        }}
        placeholder={config.placeholder}
        rows={1}
        className="w-full min-w-0 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-base leading-5 transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
        autoFocus
      />
      {loading ? (
        <Button
          type="button"
          size="icon"
          variant="destructive"
          className="size-9 shrink-0"
          onClick={cancel}
          aria-label="Stop analysing"
          title="Stop analysing"
        >
          <Square className="size-4 fill-current" />
        </Button>
      ) : (
        <Button
          type="submit"
          size="icon"
          className="size-9 shrink-0"
          disabled={!input.trim()}
          aria-label="Send"
        >
          <Send className="size-4" />
        </Button>
      )}
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="size-9 shrink-0"
        onClick={() => void startNewChat()}
        disabled={historyUpdating}
        aria-label="New chat"
        title="New chat"
      >
        {historyUpdating ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Plus className="size-4" />
        )}
      </Button>
    </div>
  );

  const suggestions = (
    <div className="flex flex-wrap justify-center gap-1.5">
      {config.suggestions.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => void send(s)}
          className={cn(
            "rounded-full border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground",
            accent.suggestionHover,
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── Left rail: reports (top) + chat history (bottom) ───────────────── */}
      <aside
        className={cn(
          "w-72 shrink-0 flex-col border-r bg-card/40",
          railOpen ? "flex" : "hidden",
        )}
      >
        <div className="shrink-0 p-3">
          <Button
            type="button"
            onClick={() => void startNewChat()}
            disabled={historyUpdating}
            className="w-full justify-start gap-2"
            variant="outline"
          >
            {historyUpdating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MessageSquarePlus className="size-4" />
            )}
            {historyUpdating ? "Saving chat…" : "New chat"}
          </Button>
        </div>

        {/* Reports */}
        <div className="flex min-h-0 flex-1 flex-col border-t">
          <div className="flex shrink-0 items-center gap-2 px-3 py-2 text-muted-foreground">
            <FileText className="size-3.5" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Reports
            </span>
            <span className="ml-auto text-[11px] tabular-nums">
              {reports.length}
            </span>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-1 px-2 pb-2">
              {reports.length === 0 ? (
                <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">
                  No reports yet. Generate one from {config.name}&apos;s
                  Configuration.
                </p>
              ) : (
                reports.map((r) => (
                  <RailItem
                    key={r.id}
                    accent={accent}
                    active={view.kind === "report" && view.report.id === r.id}
                    title={r.title}
                    subtitle={formatReportDate(r.createdAt)}
                    icon={
                      <FileText
                        className={cn("mt-0.5 size-3.5 shrink-0", accent.icon)}
                      />
                    }
                    onClick={() => setView({ kind: "report", report: r })}
                    onDelete={(e) => {
                      e.stopPropagation();
                      void deleteAgentReport(r.id);
                      setView((v) =>
                        v.kind === "report" && v.report.id === r.id
                          ? { kind: "chat" }
                          : v,
                      );
                    }}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Chat history */}
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col border-t transition-colors",
            historyUpdating && "bg-muted/20",
          )}
        >
          <div
            className={cn(
              "flex shrink-0 items-center gap-2 px-3 py-2 text-muted-foreground",
              historyUpdating && "animate-history-section-shimmer",
            )}
          >
            <Clock className="size-3.5" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Chat history
            </span>
            {historyUpdating ? (
              <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-primary">
                <Loader2 className="size-3 animate-spin" />
                Updating…
              </span>
            ) : (
              <span className="ml-auto text-[11px] tabular-nums">
                {sessions.length}
              </span>
            )}
          </div>
          {historyUpdating ? (
            <div
              className="relative h-0.5 shrink-0 overflow-hidden bg-muted"
              aria-hidden
            >
              <div className="absolute inset-y-0 w-1/3 animate-demo-indeterminate bg-primary/70" />
            </div>
          ) : null}
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-1 px-2 pb-2">
              {historyUpdating && !historyReveal ? (
                <div className="flex flex-col items-center gap-2 px-2 py-6 text-center text-[11px] text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  Saving your conversation…
                </div>
              ) : sessions.length === 0 ? (
                <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">
                  No past chats yet. Start a conversation — it saves
                  automatically as you chat.
                </p>
              ) : (
                sessions.map((s) => (
                  <RailItem
                    key={s.id}
                    accent={accent}
                    active={
                      !historyUpdating &&
                      view.kind === "chat" &&
                      s.id === sessionId
                    }
                    highlighted={s.id === highlightedSessionId}
                    title={s.title}
                    subtitle={`${new Date(
                      s.updated_at,
                    ).toLocaleDateString()} · ${s.message_count} msgs`}
                    onClick={() => void openSession(s.id)}
                    onDelete={(e) => void removeSession(s.id, e)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </aside>

      {/* ── Main panel ──────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        {view.kind === "report" ? (
          <ReportView
            report={view.report}
            accent={accent}
            authorName={authorName}
            reportTitleFallback={config.reportTitleFallback}
            pdf={config.pdf}
            avatarSrc={config.avatarSrc}
            accentName={config.accent}
            onBack={() => setView({ kind: "chat" })}
          />
        ) : isLanding ? (
          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-4 py-8">
            <LottieBackground className="absolute left-1/2 top-1/2 h-[120%] w-[120%] max-w-[820px] -translate-x-1/2 -translate-y-1/2 opacity-[0.18] [filter:brightness(0)] dark:opacity-[0.12] dark:[filter:none]" />
            <div className="relative z-10 flex w-full max-w-2xl flex-col items-center gap-6">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="relative">
                  <span
                    className={cn(
                      "absolute -inset-1 rounded-full blur-md",
                      accent.glow,
                    )}
                    aria-hidden
                  />
                  <Avatar
                    size="lg"
                    className={cn("relative size-14 ring-2", accent.ring)}
                  >
                    <AvatarImage src={config.avatarSrc} alt={config.name} />
                    <AvatarFallback>{config.fallback}</AvatarFallback>
                  </Avatar>
                </div>
                <div className="flex flex-col gap-1">
                  <h1 className="text-xl font-semibold">
                    Hi {firstName}, I&apos;m {config.name}
                  </h1>
                  <p className="max-w-md text-sm text-muted-foreground">
                    {config.greeting(firstName)}
                  </p>
                </div>
              </div>

              <form onSubmit={onSubmit} className="w-full">
                {composerInner}
              </form>

              {error && (
                <div className="flex w-full items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span className="flex-1">{error}</span>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="text-[11px] underline opacity-80 hover:opacity-100"
                  >
                    dismiss
                  </button>
                </div>
              )}

              {suggestions}
            </div>
          </div>
        ) : (
          <>
            <ScrollArea className="min-h-0 flex-1">
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
                {turns.map((turn) =>
                  turn.role === "user" ? (
                    <UserBubble
                      key={turn.id}
                      content={turn.text}
                      ts={turn.ts}
                      isEditing={editingTurnId === turn.id}
                      editDraft={editDraft}
                      canEdit={!loading}
                      onStartEdit={() => startEdit(turn.id, turn.text)}
                      onEditDraftChange={setEditDraft}
                      onEditSubmit={() => void send(editDraft, { replaceFromTurnId: turn.id })}
                      onEditCancel={cancelEdit}
                    />
                  ) : (
                    <AssistantBubble
                      key={turn.id}
                      config={config}
                      accent={accent}
                      content={turn.text}
                      ts={turn.ts}
                      exportable={Boolean(turn.exportable)}
                      authorName={authorName}
                    />
                  ),
                )}

                {loading && (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      {slow
                        ? "Still working on it — this is taking a little longer than usual."
                        : `${config.name} is analysing the data…`}
                      <button
                        type="button"
                        onClick={cancel}
                        className="ml-1 inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                      >
                        <X className="size-3" />
                        Cancel
                      </button>
                    </div>
                    {slow && (
                      <span className="pl-5 text-[11px] text-muted-foreground/80">
                        Please wait — your data is in progress. Thanks for your
                        patience.
                      </span>
                    )}
                  </div>
                )}

                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button
                      type="button"
                      onClick={() => setError(null)}
                      className="text-[11px] underline opacity-80 hover:opacity-100"
                    >
                      dismiss
                    </button>
                  </div>
                )}

                <div ref={bottomRef} aria-hidden className="h-px shrink-0" />
              </div>
            </ScrollArea>

            <form
              onSubmit={onSubmit}
              className="shrink-0 border-t bg-background p-3"
            >
              <div className="mx-auto w-full max-w-3xl">{composerInner}</div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Left-rail list item (used for both reports and chat history)
 * ────────────────────────────────────────────────────────────────────────── */

function RailItem({
  accent,
  active,
  highlighted,
  title,
  subtitle,
  icon,
  onClick,
  onDelete,
}: {
  accent: AccentTokens;
  active: boolean;
  highlighted?: boolean;
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      className={cn(
        "group flex cursor-pointer items-start gap-2 rounded-lg border border-transparent px-2.5 py-2 transition-colors hover:border-border hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && accent.active,
        highlighted && "animate-history-save-flash border-primary/30",
      )}
    >
      {icon}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm leading-tight">{title}</span>
        <span className="truncate text-[11px] text-muted-foreground">
          {subtitle}
        </span>
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        aria-label="Delete"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Report view (shown in the main panel when a report is selected)
 * ────────────────────────────────────────────────────────────────────────── */

const ACCENT_RGB: Record<AccentName, [number, number, number]> = {
  emerald: [16, 185, 129],
  sky: [14, 165, 233],
  violet: [139, 92, 246],
  amber: [245, 158, 11],
};

async function exportReport(
  content: string,
  opts: {
    title: string;
    author?: string;
    pdf?: { brand?: string; logoSrc?: string };
    avatarSrc?: string;
    accent?: AccentName;
  },
) {
  const logoDataUrl = opts.pdf?.logoSrc
    ? ((await loadImageDataUrl(opts.pdf.logoSrc)) ?? undefined)
    : undefined;
  const avatarDataUrl = opts.avatarSrc
    ? ((await loadImageDataUrl(opts.avatarSrc)) ?? undefined)
    : undefined;
  exportMessageToPdf(content, {
    title: opts.title,
    author: opts.author,
    brand: opts.pdf?.brand,
    logoDataUrl,
    avatarDataUrl,
    accentColor: opts.accent ? ACCENT_RGB[opts.accent] : undefined,
  });
}

function ReportView({
  report,
  accent,
  authorName,
  reportTitleFallback,
  pdf,
  avatarSrc,
  accentName,
  onBack,
}: {
  report: GeneratedReport;
  accent: AccentTokens;
  authorName?: string;
  reportTitleFallback: string;
  pdf?: { brand?: string; logoSrc?: string };
  avatarSrc?: string;
  accentName?: AccentName;
  onBack: () => void;
}) {
  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onBack}
          aria-label="Back to chat"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{report.title}</span>
          <span className="text-[11px] text-muted-foreground">
            Generated {formatReportDate(report.createdAt)}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            void exportReport(report.content, {
              title: deriveReportTitle(report.content, reportTitleFallback),
              author: authorName,
              pdf,
              avatarSrc,
              accent: accentName,
            })
          }
        >
          <FileDown className="size-3.5" />
          Download PDF
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          {report.companies && report.companies.length > 0 ? (
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              <LineChart className={cn("size-3.5", accent.icon)} />
              {report.companies.map((c) => (
                <Badge key={c} variant="secondary" className="text-[10px]">
                  {c}
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="rounded-xl border bg-muted/30 p-4">
            <AssistantContent content={report.content} />
          </div>
        </div>
      </ScrollArea>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Message bubbles
 * ────────────────────────────────────────────────────────────────────────── */

function UserBubble({
  content,
  ts,
  isEditing,
  editDraft,
  canEdit,
  onStartEdit,
  onEditDraftChange,
  onEditSubmit,
  onEditCancel,
}: {
  content: string;
  ts: number;
  isEditing: boolean;
  editDraft: string;
  canEdit: boolean;
  onStartEdit: () => void;
  onEditDraftChange: (value: string) => void;
  onEditSubmit: () => void;
  onEditCancel: () => void;
}) {
  const editRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    if (!isEditing) return;
    const el = editRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [isEditing]);

  if (isEditing) {
    return (
      <div className="flex w-full max-w-[85%] flex-col items-end gap-1.5 self-end">
        <textarea
          ref={editRef}
          value={editDraft}
          onChange={(e) => onEditDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onEditSubmit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onEditCancel();
            }
          }}
          rows={3}
          className="w-full resize-none rounded-2xl rounded-br-sm border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        />
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            onClick={onEditSubmit}
            disabled={!editDraft.trim()}
          >
            Send
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onEditCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex flex-col items-end gap-0.5">
      <div className="flex max-w-[85%] items-end gap-1">
        <button
          type="button"
          onClick={onStartEdit}
          disabled={!canEdit}
          className="mb-1 shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0"
          aria-label="Edit message"
          title="Edit message"
        >
          <Pencil className="size-3.5" />
        </button>
        <div className="overflow-hidden break-words whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
          {content}
        </div>
      </div>
      <span className="px-1 text-[10px] text-muted-foreground">
        {formatTime(ts)}
      </span>
    </div>
  );
}

function AssistantBubble({
  config,
  accent,
  content,
  ts,
  exportable,
  authorName,
}: {
  config: AgentChatConfig;
  accent: AccentTokens;
  content: string;
  ts: number;
  exportable?: boolean;
  authorName?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Avatar size="sm" className={cn("mt-0.5 ring-1", accent.ringSm)}>
        <AvatarImage src={config.avatarSrc} alt={config.name} />
        <AvatarFallback>{config.fallback}</AvatarFallback>
      </Avatar>
      <div className="flex max-w-[85%] flex-col gap-0.5">
        <div className="rounded-2xl rounded-bl-sm border bg-muted/40 px-3 py-2">
          <AssistantContent content={content} />
          {exportable && (
            <div className="mt-2 flex justify-end border-t border-border/60 pt-1.5">
              <button
                type="button"
                onClick={() =>
                  void exportReport(content, {
                    title: deriveReportTitle(
                      content,
                      config.reportTitleFallback,
                    ),
                    author: authorName,
                    pdf: config.pdf,
                    avatarSrc: config.avatarSrc,
                    accent: config.accent,
                  })
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-muted-foreground transition-colors",
                  accent.pdfHover,
                )}
                title="Download this report as PDF"
              >
                <FileDown className="size-3" />
                Download PDF
              </button>
            </div>
          )}
        </div>
        <span className="px-1 text-[10px] text-muted-foreground">
          {formatTime(ts)}
        </span>
      </div>
    </div>
  );
}
