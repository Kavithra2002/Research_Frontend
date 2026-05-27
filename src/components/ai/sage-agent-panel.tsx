"use client";

import * as React from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
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
import {
  sendSageChat,
  type SageMessage,
  type SageToolEvent,
} from "@/lib/sage";

type ChatTurn =
  | {
      kind: "message";
      id: string;
      role: "user" | "assistant";
      content: string;
      timestamp: number;
      events?: SageToolEvent[];
    }
  | {
      kind: "typing";
      id: "typing";
    };

const QUICK_REPLIES: { label: string; icon: React.ComponentType<{ className?: string }>; prompt: string }[] = [
  {
    label: "Create a group",
    icon: Plus,
    prompt: "I'd like to create a new company group.",
  },
  {
    label: "Edit a group",
    icon: Pencil,
    prompt: "I'd like to edit an existing company group.",
  },
  {
    label: "Delete a group",
    icon: Trash2,
    prompt: "I'd like to delete a company group.",
  },
];

interface SageAgentPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SageAgentPanel({ open, onOpenChange }: SageAgentPanelProps) {
  const { user } = useAuth();
  const firstName = user?.first_name?.trim() || user?.email?.split("@")[0] || "there";

  const [turns, setTurns] = React.useState<ChatTurn[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const greetedFor = React.useRef<string | null>(null);

  const scrollToBottom = React.useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const key = user?._id ?? "anon";
    if (greetedFor.current === key && turns.length > 0) return;

    greetedFor.current = key;
    setTurns([
      {
        kind: "message",
        id: "greeting",
        role: "assistant",
        content:
          `Hi ${firstName}! I'm Sage — your configuration agent.\n\nI can help you manage **Company Groups**. Pick one to get started, or just tell me what you need:`,
        timestamp: Date.now(),
      },
    ]);
    setError(null);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, user?._id, firstName, turns.length]);

  React.useEffect(() => {
    scrollToBottom();
  }, [turns, scrollToBottom]);

  const showQuickReplies =
    turns.length === 1 &&
    turns[0]?.kind === "message" &&
    turns[0].role === "assistant";

  const send = React.useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      setError(null);

      const userTurn: ChatTurn = {
        kind: "message",
        id: `u-${Date.now()}`,
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
      };

      // Build conversation history for the API (skip the local greeting which
      // we re-derive on the server from the system prompt).
      const priorMessages: SageMessage[] = turns
        .filter(
          (t): t is Extract<ChatTurn, { kind: "message" }> =>
            t.kind === "message" && t.id !== "greeting",
        )
        .map((t) => ({ role: t.role, content: t.content }));

      const payload: SageMessage[] = [
        ...priorMessages,
        { role: "user", content: trimmed },
      ];

      setTurns((prev) => [
        ...prev,
        userTurn,
        { kind: "typing", id: "typing" },
      ]);
      setInput("");
      setSending(true);

      try {
        const res = await sendSageChat(payload);
        setTurns((prev) => {
          const withoutTyping = prev.filter((t) => t.kind !== "typing");
          return [
            ...withoutTyping,
            {
              kind: "message",
              id: `a-${Date.now()}`,
              role: "assistant",
              content: res.reply || "…",
              timestamp: Date.now(),
              events: res.tool_events,
            },
          ];
        });
      } catch (e) {
        setTurns((prev) => prev.filter((t) => t.kind !== "typing"));
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSending(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [sending, turns],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const reset = () => {
    greetedFor.current = null;
    setTurns([]);
    setError(null);
    setInput("");
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 bg-card p-0 sm:!max-w-md md:!max-w-lg"
      >
        <SheetHeader className="shrink-0 border-b bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <span
                className="absolute -inset-1 rounded-full bg-amber-500/30 blur-md animate-pulse"
                aria-hidden
              />
              <Avatar size="lg" className="relative ring-2 ring-amber-500/40">
                <AvatarImage
                  src="https://api.dicebear.com/8.x/bottts/svg?seed=sage"
                  alt="Sage"
                />
                <AvatarFallback>SG</AvatarFallback>
              </Avatar>
              <span className="absolute right-0 bottom-0 z-10 size-3 rounded-full bg-emerald-500 ring-2 ring-card animate-pulse" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <SheetTitle className="flex items-center gap-2">
                Sage
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300"
                >
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Online
                </Badge>
              </SheetTitle>
              <SheetDescription className="flex items-center gap-1 text-xs">
                <Sparkles className="size-3 text-amber-500" />
                Configuration agent · Company groups
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div ref={scrollRef} className="flex flex-col gap-3 p-4">
              {turns.map((turn) => {
                if (turn.kind === "typing") {
                  return <TypingBubble key={turn.id} />;
                }
                if (turn.role === "user") {
                  return (
                    <UserBubble
                      key={turn.id}
                      content={turn.content}
                      timestamp={turn.timestamp}
                    />
                  );
                }
                return (
                  <AssistantBubble
                    key={turn.id}
                    content={turn.content}
                    timestamp={turn.timestamp}
                    events={turn.events}
                  />
                );
              })}

              {showQuickReplies && (
                <div className="ml-10 flex flex-wrap gap-2 pt-1">
                  {QUICK_REPLIES.map((q) => {
                    const Icon = q.icon;
                    return (
                      <Button
                        key={q.label}
                        variant="outline"
                        size="sm"
                        onClick={() => void send(q.prompt)}
                        disabled={sending}
                      >
                        <Icon />
                        {q.label}
                      </Button>
                    );
                  })}
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span className="flex-1">{error}</span>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="shrink-0 border-t bg-background p-3">
          <div className="flex items-end gap-2 rounded-2xl border bg-muted/30 p-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Sage…"
              rows={1}
              disabled={sending}
              className={cn(
                "flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none",
                "max-h-32",
              )}
              style={{
                minHeight: 28,
                height: Math.min(128, Math.max(28, input.split("\n").length * 20 + 8)),
              }}
            />
            <Button
              size="icon-sm"
              onClick={() => void send(input)}
              disabled={sending || !input.trim()}
              aria-label="Send message"
            >
              {sending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Send />
              )}
            </Button>
          </div>
          <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ───────── bubbles ───────── */

function UserBubble({
  content,
  timestamp,
}: {
  content: string;
  timestamp: number;
}) {
  return (
    <div className="flex justify-end gap-2 animate-fade-rise">
      <div className="flex max-w-[80%] flex-col items-end gap-0.5">
        <div className="rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground shadow-sm">
          <p className="whitespace-pre-wrap break-words leading-relaxed">
            {content}
          </p>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {formatTime(timestamp)}
        </span>
      </div>
    </div>
  );
}

function AssistantBubble({
  content,
  timestamp,
  events,
}: {
  content: string;
  timestamp: number;
  events?: SageToolEvent[];
}) {
  return (
    <div className="flex items-start gap-2 animate-fade-rise">
      <Avatar size="sm" className="mt-0.5 shrink-0 ring-1 ring-amber-500/40">
        <AvatarImage
          src="https://api.dicebear.com/8.x/bottts/svg?seed=sage"
          alt="Sage"
        />
        <AvatarFallback>SG</AvatarFallback>
      </Avatar>
      <div className="flex max-w-[85%] flex-col gap-1.5">
        {events && events.length > 0 && (
          <div className="flex flex-col gap-1">
            {events.map((ev, i) => (
              <ToolEventCard key={i} event={ev} />
            ))}
          </div>
        )}
        <div className="rounded-2xl rounded-tl-md border bg-muted/40 px-3 py-2 text-sm shadow-sm">
          <RichText text={content} />
        </div>
        <span className="text-[10px] text-muted-foreground">
          {formatTime(timestamp)}
        </span>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex items-start gap-2">
      <Avatar size="sm" className="mt-0.5 shrink-0 ring-1 ring-amber-500/40">
        <AvatarImage
          src="https://api.dicebear.com/8.x/bottts/svg?seed=sage"
          alt="Sage"
        />
        <AvatarFallback>SG</AvatarFallback>
      </Avatar>
      <div className="rounded-2xl rounded-tl-md border bg-muted/40 px-3 py-2.5 shadow-sm">
        <div className="flex gap-1">
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
        </div>
      </div>
    </div>
  );
}

function ToolEventCard({ event }: { event: SageToolEvent }) {
  const meta = describeTool(event);
  const Icon = meta.icon;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-xs shadow-sm",
        event.ok
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-destructive/40 bg-destructive/5",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          event.ok
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-destructive",
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium leading-tight">{meta.title}</span>
        {meta.subtitle && (
          <span className="truncate text-[11px] text-muted-foreground">
            {meta.subtitle}
          </span>
        )}
        {!event.ok && event.error && (
          <span className="mt-0.5 text-[11px] text-destructive">
            {event.error}
          </span>
        )}
      </div>
      {event.ok && (
        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      )}
    </div>
  );
}

function describeTool(event: SageToolEvent): {
  title: string;
  subtitle: string | null;
  icon: React.ComponentType<{ className?: string }>;
} {
  const args = (event.arguments ?? {}) as Record<string, unknown>;
  const result = (event.result ?? {}) as Record<string, unknown>;
  const group = (result.group ?? null) as
    | { name?: string; symbols?: string[] }
    | null;

  switch (event.tool) {
    case "list_groups":
      return {
        title: "Listed company groups",
        subtitle: countSubtitle(result, "groups", "group", "groups"),
        icon: Layers,
      };
    case "list_cse_companies":
      return {
        title: typeof args.query === "string" && args.query
          ? `Searched companies for “${args.query}”`
          : "Loaded CSE companies",
        subtitle: countSubtitle(result, "companies", "company", "companies"),
        icon: Building2,
      };
    case "create_group":
      return {
        title: event.ok
          ? `Created group "${group?.name ?? args.name ?? "?"}"`
          : `Failed to create group "${args.name ?? "?"}"`,
        subtitle: group?.symbols?.length
          ? `${group.symbols.length} ${group.symbols.length === 1 ? "company" : "companies"}`
          : null,
        icon: Plus,
      };
    case "update_group":
      return {
        title: event.ok
          ? `Updated group "${group?.name ?? args.name ?? "?"}"`
          : `Failed to update group "${args.name ?? "?"}"`,
        subtitle: group?.symbols?.length
          ? `${group.symbols.length} ${group.symbols.length === 1 ? "company" : "companies"}`
          : null,
        icon: Pencil,
      };
    case "delete_group":
      return {
        title: event.ok
          ? `Deleted group "${group?.name ?? "?"}"`
          : "Failed to delete group",
        subtitle: null,
        icon: Trash2,
      };
    default:
      return { title: event.tool, subtitle: null, icon: Sparkles };
  }
}

function countSubtitle(
  result: Record<string, unknown>,
  key: string,
  singular: string,
  plural: string,
): string | null {
  const value = result[key];
  if (Array.isArray(value)) {
    return `${value.length} ${value.length === 1 ? singular : plural}`;
  }
  if (typeof result.returned === "number" && typeof result.total === "number") {
    const r = result.returned as number;
    const t = result.total as number;
    return t > r
      ? `${r} of ${t} ${t === 1 ? singular : plural}`
      : `${t} ${t === 1 ? singular : plural}`;
  }
  return null;
}

function RichText({ text }: { text: string }) {
  // Minimal markdown-ish rendering: **bold** + line breaks.
  // Avoids pulling a markdown lib; replies are short.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="whitespace-pre-wrap break-words leading-relaxed">
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </p>
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
