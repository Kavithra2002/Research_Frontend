"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowLeft,
  Clock,
  FileDown,
  Loader2,
  LineChart,
  MessageSquarePlus,
  Send,
  Square,
  Trash2,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-provider";
import { sendRobinChat, type RobinMessage } from "@/lib/robin";
import {
  deleteChatSession,
  getChatSession,
  listChatSessions,
  saveChatSession,
  type ChatSessionSummary,
} from "@/lib/chat-log";
import { AssistantContent } from "@/components/ai/chat-markdown";
import {
  exportMessageToPdf,
  loadBrandLogoDataUrls,
  loadImageDataUrl,
} from "@/lib/report-pdf";

const AGENT = "robin";

/** After this long without a reply, reassure the user the work is still going. */
const SLOW_AFTER_MS = 30_000;
/** After this long, stop waiting and give a graceful apology instead. */
const TIMEOUT_AFTER_MS = 60_000;

type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts: number;
  /** True only when this assistant answer was a response to a PDF/report request. */
  exportable?: boolean;
};

/** A warm, helpful apology used when an answer is taking too long to return. */
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

/** Short clock label for a message, e.g. "12:38 PM". */
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

/** Did the user ask to create / download / review a PDF or report? */
function wantsPdfExport(text: string): boolean {
  const t = text.toLowerCase();
  if (/\b(pdf|download|export)\b/.test(t)) return true;
  if (
    /\b(report|summary|document)\b/.test(t) &&
    /\b(create|generate|make|prepare|give|produce|build|want|need|provide)\b/.test(
      t,
    )
  )
    return true;
  return false;
}

interface RobinAgentPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SUGGESTIONS = [
  "Which companies do you have data for?",
  "Show the income statement for the latest year",
  "What was total equity in the 2025 annual report?",
  "Compare total assets across the years you have",
];

function greetingTurn(firstName: string): Turn {
  return {
    id: "greet",
    role: "assistant",
    text: `Hi ${firstName}! I'm Robin, your company intelligence assistant. Ask me about financial figures, sector briefings, employees, branches, group structure — or how external events might affect a company. I'll pull answers from the database and the web.`,
    ts: Date.now(),
  };
}

export function RobinAgentPanel({ open, onOpenChange }: RobinAgentPanelProps) {
  const { user } = useAuth();
  const firstName =
    user?.first_name?.trim() || user?.email?.split("@")[0] || "there";
  const authorName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() ||
    user?.email ||
    undefined;

  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [slow, setSlow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const timedOutRef = React.useRef(false);

  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [sessions, setSessions] = React.useState<ChatSessionSummary[]>([]);
  const [showHistory, setShowHistory] = React.useState(false);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  const bottomRef = React.useRef<HTMLDivElement | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Grow the input up to 5 rows, then keep its height and let it scroll.
  const MAX_ROWS = 5;
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
      const list = await listChatSessions(AGENT);
      setSessions(list);
    } catch {
      // history is best-effort; ignore load failures
    }
  }, []);

  // On open: start a fresh chat + load the history list.
  React.useEffect(() => {
    if (open) {
      if (turns.length === 0) setTurns([greetingTurn(firstName)]);
      void refreshSessions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (!showHistory) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [turns, loading, showHistory]);

  function resetAll() {
    abortRef.current?.abort();
    abortRef.current = null;
    setTurns([]);
    setInput("");
    setLoading(false);
    setError(null);
    setSessionId(null);
    setShowHistory(false);
  }

  function startNewChat() {
    abortRef.current?.abort();
    abortRef.current = null;
    setTurns([greetingTurn(firstName)]);
    setInput("");
    setError(null);
    setSessionId(null);
    setShowHistory(false);
  }

  async function persist(allTurns: Turn[], currentId: string | null) {
    const messages = allTurns
      .filter((t) => t.id !== "greet")
      .map((t) => ({ role: t.role, content: t.text, ts: t.ts }));
    if (messages.length === 0) return;
    try {
      const saved = await saveChatSession(AGENT, {
        session_id: currentId,
        messages,
      });
      if (!currentId) setSessionId(saved.id);
      void refreshSessions();
    } catch {
      // saving history is best-effort; don't disrupt the chat
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setError(null);
    const userTurn: Turn = {
      id: `u-${Date.now()}`,
      role: "user",
      text: trimmed,
      ts: Date.now(),
    };
    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);
    setInput("");
    setLoading(true);
    setSlow(false);
    timedOutRef.current = false;
    // Keep the caret in the input so the user can keep typing right away.
    requestAnimationFrame(() => textareaRef.current?.focus());

    const history: RobinMessage[] = nextTurns
      .filter((t) => t.id !== "greet")
      .map((t) => ({ role: t.role, content: t.text }));

    const controller = new AbortController();
    abortRef.current = controller;

    // After 30s: reassure the user. After 1 min: stop waiting and apologise.
    const slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    const timeoutTimer = setTimeout(() => {
      timedOutRef.current = true;
      controller.abort();
    }, TIMEOUT_AFTER_MS);

    try {
      const res = await sendRobinChat(history, controller.signal);
      const assistantTurn: Turn = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: res.reply || "(no answer)",
        ts: Date.now(),
        exportable: wantsPdfExport(trimmed),
      };
      const finalTurns = [...nextTurns, assistantTurn];
      setTurns(finalTurns);
      void persist(finalTurns, sessionId);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        // Timed out (not a manual cancel) → leave a kind apology in the chat.
        if (timedOutRef.current) {
          const apologyTurn: Turn = {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: timeoutApology(firstName, trimmed),
            ts: Date.now(),
          };
          const finalTurns = [...nextTurns, apologyTurn];
          setTurns(finalTurns);
          void persist(finalTurns, sessionId);
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
    setShowHistory(false);
    setError(null);
    setHistoryLoading(true);
    try {
      const session = await getChatSession(AGENT, id);
      const loaded: Turn[] = session.messages.map((m, i) => ({
        id: `${session.id}-${i}`,
        role: m.role,
        text: m.content,
        ts: m.ts,
      }));
      setTurns(loaded.length ? loaded : [greetingTurn(firstName)]);
      setSessionId(session.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function removeSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await deleteChatSession(AGENT, id);
      // If the deleted chat was the one currently loaded, reset the active
      // conversation but stay in the history panel so the user can keep
      // managing past chats. They leave only via "New chat".
      if (id === sessionId) {
        abortRef.current?.abort();
        abortRef.current = null;
        setTurns([greetingTurn(firstName)]);
        setInput("");
        setError(null);
        setLoading(false);
        setSessionId(null);
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

  async function toggleHistory() {
    const next = !showHistory;
    setShowHistory(next);
    if (next) {
      setHistoryLoading(true);
      await refreshSessions();
      setHistoryLoading(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) resetAll();
        onOpenChange(next);
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 bg-card p-0 sm:!max-w-md md:!max-w-lg"
      >
        <SheetHeader className="shrink-0 border-b bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <span
                className="absolute -inset-1 rounded-full bg-emerald-500/30 blur-md animate-pulse"
                aria-hidden
              />
              <Avatar size="lg" className="relative ring-2 ring-emerald-500/40">
                <AvatarImage
                  src="/img/robin-avatar.png"
                  alt="Robin"
                />
                <AvatarFallback>RB</AvatarFallback>
              </Avatar>
              <span className="absolute right-0 bottom-0 z-10 size-3 rounded-full bg-emerald-500 ring-2 ring-card animate-pulse" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <SheetTitle className="flex items-center gap-2">
                Robin
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300"
                >
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Online
                </Badge>
              </SheetTitle>
              <SheetDescription className="flex items-center gap-1 text-xs">
                <LineChart className="size-3 text-emerald-500" />
                Financial analysis · Extracted report data
              </SheetDescription>
            </div>
            <div className="mr-8 flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void toggleHistory()}
                aria-label="Chat history"
                title="Chat history"
                className={cn(showHistory && "bg-muted text-foreground")}
              >
                <Clock className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={startNewChat}
                aria-label="New chat"
                title="New chat"
              >
                <MessageSquarePlus className="size-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-hidden">
          {showHistory ? (
            <HistoryList
              sessions={sessions}
              loading={historyLoading}
              activeId={sessionId}
              onBack={() => setShowHistory(false)}
              onOpen={(id) => void openSession(id)}
              onDelete={removeSession}
            />
          ) : (
            <ScrollArea className="h-full">
              <div className="flex flex-col gap-3 p-4">
                {turns.map((turn) =>
                  turn.role === "user" ? (
                    <UserBubble key={turn.id} content={turn.text} ts={turn.ts} />
                  ) : (
                    <AssistantBubble
                      key={turn.id}
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
                        : "Robin is analysing the data…"}
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
                        Please wait — your data is in progress. Thanks for your patience.
                      </span>
                    )}
                  </div>
                )}

                {turns.length <= 1 && !loading && (
                  <div className="mt-1 flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Try asking:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => void send(s)}
                          className="rounded-full border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-emerald-500/40 hover:text-foreground"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
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
          )}
        </div>

        <form
          onSubmit={onSubmit}
          className="flex shrink-0 items-end gap-2 border-t bg-background p-3"
        >
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
            placeholder="Ask about financials, sector, employees, branches, group structure…"
            disabled={showHistory}
            rows={1}
            className="w-full min-w-0 resize-none rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base leading-5 transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80"
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
              disabled={showHistory || !input.trim()}
              aria-label="Send"
            >
              <Send className="size-4" />
            </Button>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * History list
 * ────────────────────────────────────────────────────────────────────────── */

function HistoryList({
  sessions,
  loading,
  activeId,
  onBack,
  onOpen,
  onDelete,
}: {
  sessions: ChatSessionSummary[];
  loading: boolean;
  activeId: string | null;
  onBack: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back">
          <ArrowLeft className="size-4" />
        </Button>
        <span className="text-sm font-medium">Past chats</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {sessions.length}
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 p-2">
          {loading && (
            <div className="flex items-center gap-2 px-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Loading history…
            </div>
          )}
          {!loading && sessions.length === 0 && (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              No past chats yet. Start a conversation and it will be saved here.
            </div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(s.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onOpen(s.id);
              }}
              className={cn(
                "group flex cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 transition-colors hover:border-border hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                s.id === activeId && "border-emerald-500/40 bg-emerald-500/5",
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{s.title}</span>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(s.updated_at).toLocaleString()} · {s.message_count} msgs
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => onDelete(s.id, e)}
                className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                aria-label="Delete chat"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Message bubbles
 * ────────────────────────────────────────────────────────────────────────── */

function UserBubble({ content, ts }: { content: string; ts: number }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="max-w-[85%] overflow-hidden break-words whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
        {content}
      </div>
      <span className="px-1 text-[10px] text-muted-foreground">
        {formatTime(ts)}
      </span>
    </div>
  );
}

function deriveReportTitle(content: string): string {
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
  if (!clean) return "Robin Report";
  return clean.length > 80 ? `${clean.slice(0, 80)}…` : clean;
}

function AssistantBubble({
  content,
  ts,
  exportable,
  authorName,
}: {
  content: string;
  ts: number;
  exportable?: boolean;
  authorName?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Avatar size="sm" className="mt-0.5 ring-1 ring-emerald-500/30">
        <AvatarImage
          src="/img/robin-avatar.png"
          alt="Robin"
        />
        <AvatarFallback>RB</AvatarFallback>
      </Avatar>
      <div className="flex max-w-[85%] flex-col gap-0.5">
      <div className="rounded-2xl rounded-bl-sm border bg-muted/40 px-3 py-2">
        <AssistantContent content={content} />
        {exportable && (
          <div className="mt-2 flex justify-end border-t border-border/60 pt-1.5">
            <button
              type="button"
              onClick={async () => {
                const avatarDataUrl =
                  (await loadImageDataUrl("/img/robin-avatar.png")) ?? undefined;
                const headerLogoDataUrls = await loadBrandLogoDataUrls();
                exportMessageToPdf(content, {
                  title: deriveReportTitle(content),
                  author: authorName,
                  avatarDataUrl,
                  headerLogoDataUrls,
                  accentColor: [16, 185, 129],
                });
              }}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-300"
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
