"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, ListChecks, Trash2, X } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AGENT_CATALOG } from "@/lib/ai-agents";
import { cn } from "@/lib/utils";
import {
  clearAll,
  getServerSnapshot,
  getSnapshot,
  markAllRead,
  markRead,
  removeNotification,
  removeNotifications,
  subscribe,
  type AppNotification,
  type NotificationAccent,
} from "./notification-store";

const ACCENT_DOT: Record<NotificationAccent, string> = {
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
};

function initials(text?: string): string {
  if (!text) return "?";
  const words = text.trim().split(/\s+/).slice(0, 2);
  return words.map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function NotificationIcon({ n }: { n: AppNotification }) {
  const agent = n.agentId
    ? AGENT_CATALOG.find((a) => a.id === n.agentId)
    : undefined;
  const src = n.avatarSrc ?? agent?.avatarSrc;
  const fallback = n.fallback ?? agent?.fallback ?? initials(n.company ?? n.title);

  if (n.kind === "system" && !src) {
    return (
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full text-white",
          ACCENT_DOT[n.accent ?? "sky"],
        )}
      >
        <Bell className="size-4" />
      </span>
    );
  }

  return (
    <Avatar size="sm" className="size-9 shrink-0 ring-1 ring-border">
      {src ? <AvatarImage src={src} alt={n.company ?? n.title} /> : null}
      <AvatarFallback className="text-[11px]">{fallback}</AvatarFallback>
    </Avatar>
  );
}

export function NotificationBell() {
  const items = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [selecting, setSelecting] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const unread = items.reduce((acc, n) => acc + (n.read ? 0 : 1), 0);

  // Drop selected ids that no longer exist, and leave select mode when empty.
  React.useEffect(() => {
    if (items.length === 0 && selecting) {
      setSelecting(false);
      setSelected(new Set());
      return;
    }
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(items.map((n) => n.id));
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items, selecting]);

  const selectedCount = selected.size;
  const allSelected = items.length > 0 && selectedCount === items.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // Opening the panel clears the unread badge.
    if (next) markAllRead();
    // Leaving the panel exits selection mode.
    if (!next) {
      setSelecting(false);
      setSelected(new Set());
    }
  };

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((n) => n.id)),
    );
  };

  const deleteSelected = () => {
    if (selectedCount === 0) return;
    removeNotifications([...selected]);
    setSelected(new Set());
    setSelecting(false);
  };

  const handleRowClick = (n: AppNotification) => {
    if (selecting) {
      toggleSelect(n.id);
      return;
    }
    markRead(n.id);
    if (n.href) {
      router.push(n.href);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              unread > 0 ? `Notifications (${unread} unread)` : "Notifications"
            }
            className="relative"
          >
            <Bell className="size-4" />
            {unread > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-4 text-white ring-2 ring-background">
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
            {unread > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 inline-flex size-4 animate-ping rounded-full bg-rose-500/60" />
            ) : null}
          </Button>
        }
      />
      <PopoverContent
        align="end"
        sideOffset={8}
        className="flex max-h-[80vh] w-80 flex-col gap-0 overflow-hidden p-0"
      >
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
          {selecting ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium select-none">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onCheckedChange={() => toggleSelectAll()}
                aria-label="Select all notifications"
              />
              {selectedCount > 0 ? `${selectedCount} selected` : "Select all"}
            </label>
          ) : (
            <span className="text-sm font-semibold">Notifications</span>
          )}

          <div className="flex items-center gap-0.5">
            {selecting ? (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Delete selected"
                  aria-label="Delete selected"
                  onClick={deleteSelected}
                  disabled={selectedCount === 0}
                  className="text-rose-500 hover:text-rose-500"
                >
                  <Trash2 className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Cancel selection"
                  aria-label="Cancel selection"
                  onClick={exitSelect}
                >
                  <X className="size-4" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Select notifications"
                  aria-label="Select notifications"
                  onClick={() => setSelecting(true)}
                  disabled={items.length === 0}
                >
                  <ListChecks className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Mark all as read"
                  aria-label="Mark all as read"
                  onClick={() => markAllRead()}
                  disabled={items.length === 0}
                >
                  <CheckCheck className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Clear all"
                  aria-label="Clear all"
                  onClick={() => clearAll()}
                  disabled={items.length === 0}
                >
                  <Trash2 className="size-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="flex shrink-0 flex-col items-center gap-2 px-6 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Bell className="size-5" />
            </span>
            <p className="text-sm font-medium">You&apos;re all caught up</p>
            <p className="text-xs text-muted-foreground">
              Agent reports and live market updates will show up here.
            </p>
          </div>
        ) : (
          <div className="max-h-[70vh] min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="flex flex-col">
              {items.map((n) => {
                const isSelected = selected.has(n.id);
                return (
                  <div
                    key={n.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleRowClick(n)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleRowClick(n);
                      }
                    }}
                    className={cn(
                      "group relative flex w-full items-start gap-3 border-b px-3 py-2.5 text-left transition-colors outline-none last:border-b-0 hover:bg-muted/60 focus-visible:bg-muted/60",
                      (selecting || n.href) && "cursor-pointer",
                      !n.read && !selecting && "bg-emerald-500/[0.06]",
                      selecting && isSelected && "bg-primary/10",
                    )}
                  >
                    {selecting ? (
                      <Checkbox
                        checked={isSelected}
                        tabIndex={-1}
                        aria-hidden
                        className="pointer-events-none mt-1"
                      />
                    ) : null}
                    <NotificationIcon n={n} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {n.title}
                        </span>
                        {!n.read && !selecting ? (
                          <span className="ml-auto size-2 shrink-0 rounded-full bg-emerald-500" />
                        ) : null}
                      </div>
                      {n.body ? (
                        <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {n.body}
                        </span>
                      ) : null}
                      <span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                        {timeAgo(n.createdAt)}
                      </span>
                    </div>
                    {!selecting ? (
                      <button
                        type="button"
                        title="Delete notification"
                        aria-label="Delete notification"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeNotification(n.id);
                        }}
                        className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-colors group-hover:opacity-100 hover:bg-rose-500/10 hover:text-rose-500 focus-visible:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
