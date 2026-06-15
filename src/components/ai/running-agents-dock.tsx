"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { GripVertical, MessageCircle, Square, X } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AGENT_CATALOG,
  stopAgent,
  useRunningAgentIds,
  type AiAgent,
} from "@/lib/ai-agents";
import {
  setReportScheduleEnabled,
  type ScheduleAgent,
} from "@/lib/report-schedule";
import { cn } from "@/lib/utils";

const POS_KEY = "ambeon.ai.runningDock.pos";
const MARGIN = 16;

const AGENT_ROUTE: Record<string, string> = {
  robin: "/ai/robin",
  tuck: "/ai/tuck",
  marian: "/ai/marian",
};
const SCHEDULE_AGENTS: ReadonlySet<string> = new Set(["robin", "tuck", "marian"]);

type Pos = { x: number; y: number };

function readPos(): Pos | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.x === "number" && typeof p?.y === "number") return p;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Global, draggable indicator that surfaces any currently running agents in the
 * bottom-right corner of every page. Tap it to expand a richer panel listing
 * each running agent; drag it anywhere; dismiss it (agents keep running — only
 * the indicator is hidden).
 */
export function RunningAgentsDock() {
  const runningIds = useRunningAgentIds();
  const router = useRouter();
  const ref = React.useRef<HTMLDivElement | null>(null);
  const drag = React.useRef<{
    dx: number;
    dy: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  const [pos, setPos] = React.useState<Pos | null>(null);
  const [hidden, setHidden] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [shuffle, setShuffle] = React.useState(0);
  const [expanded, setExpanded] = React.useState(false);

  // Restore a previously dragged position once on mount.
  React.useEffect(() => {
    setPos(readPos());
  }, []);

  const runKey = React.useMemo(
    () => [...runningIds].sort().join("|"),
    [runningIds],
  );

  // Re-surface the dock whenever the set of running agents changes.
  React.useEffect(() => {
    if (runKey) setHidden(false);
  }, [runKey]);

  const agents = React.useMemo<AiAgent[]>(
    () => AGENT_CATALOG.filter((a) => runningIds.includes(a.id)),
    [runningIds],
  );

  // Swap the avatars between slots every 3 seconds for a lively swipe.
  React.useEffect(() => {
    if (agents.length < 2 || hidden || expanded) return;
    const id = window.setInterval(() => setShuffle((s) => s + 1), 3000);
    return () => window.clearInterval(id);
  }, [agents.length, hidden, expanded]);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    drag.current = {
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    setPos({ x: rect.left, y: rect.top });
    setDragging(true);
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    if (
      Math.abs(e.clientX - d.startX) > 4 ||
      Math.abs(e.clientY - d.startY) > 4
    ) {
      d.moved = true;
    }
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const x = Math.max(
      MARGIN,
      Math.min(e.clientX - d.dx, window.innerWidth - w - MARGIN),
    );
    const y = Math.max(
      MARGIN,
      Math.min(e.clientY - d.dy, window.innerHeight - h - MARGIN),
    );
    setPos({ x, y });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const el = ref.current;
    el?.releasePointerCapture(e.pointerId);
    setDragging(false);
    const moved = drag.current?.moved;
    if (moved && el && pos) {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      // Snap to whichever vertical edge (left/right) is closer — never the middle.
      const centerX = pos.x + w / 2;
      const snappedX =
        centerX < window.innerWidth / 2
          ? MARGIN
          : window.innerWidth - w - MARGIN;
      const snappedY = Math.max(
        MARGIN,
        Math.min(pos.y, window.innerHeight - h - MARGIN),
      );
      const snapped = { x: snappedX, y: snappedY };
      setPos(snapped);
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(snapped));
      } catch {
        /* ignore */
      }
    } else if (!moved) {
      // A tap (not a drag) toggles the expanded panel.
      setExpanded((v) => !v);
    }
    drag.current = null;
  };

  const handleStop = (agent: AiAgent, e: React.MouseEvent) => {
    e.stopPropagation();
    stopAgent(agent.id);
    if (SCHEDULE_AGENTS.has(agent.id)) {
      void setReportScheduleEnabled(agent.id as ScheduleAgent, false).catch(
        () => {},
      );
    }
  };

  const handleOpen = (agent: AiAgent, e: React.MouseEvent) => {
    e.stopPropagation();
    const route = AGENT_ROUTE[agent.id];
    if (route) router.push(route);
    setExpanded(false);
  };

  if (agents.length === 0 || hidden) return null;

  // Anchor the expanded panel to the closer side / half of the screen.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const onRight = pos ? pos.x + 60 > vw / 2 : true;
  const onBottom = pos ? pos.y > vh / 2 : true;

  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
      className={cn(
        "animate-dock-in fixed z-[90] max-w-[calc(100vw-2rem)] cursor-grab touch-none active:cursor-grabbing",
        !pos && "right-4 bottom-4",
        !dragging && "transition-[left,top] duration-300 ease-out",
      )}
    >
      {/* ── Expanded panel: a richer list of the running agents ─────────────── */}
      {expanded ? (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          className={cn(
            "absolute w-64 max-w-[calc(100vw-2rem)] cursor-default rounded-xl border bg-card/95 p-1.5 shadow-xl ring-1 ring-emerald-500/15 backdrop-blur",
            onBottom ? "bottom-full mb-2" : "top-full mt-2",
            onRight ? "right-0" : "left-0",
          )}
        >
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="relative inline-flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/70" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-semibold">
              Running agents · {agents.length}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            {agents.map((agent) => {
              const canOpen = Boolean(AGENT_ROUTE[agent.id]);
              return (
                <div
                  key={agent.id}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60"
                >
                  <span className="relative inline-flex shrink-0">
                    <Avatar size="sm" className="relative size-8 ring-2 ring-card">
                      <AvatarImage src={agent.avatarSrc} alt={agent.name} />
                      <AvatarFallback>{agent.fallback}</AvatarFallback>
                    </Avatar>
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate text-xs font-medium">
                      {agent.name}
                    </span>
                    <span className="truncate text-[10px] text-muted-foreground">
                      {agent.role}
                    </span>
                  </div>
                  {canOpen ? (
                    <button
                      type="button"
                      title={`Open ${agent.name}`}
                      aria-label={`Open ${agent.name}`}
                      onClick={(e) => handleOpen(agent, e)}
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-300"
                    >
                      <MessageCircle className="size-3.5" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    title={`Stop ${agent.name}`}
                    aria-label={`Stop ${agent.name}`}
                    onClick={(e) => handleStop(agent, e)}
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Square className="size-3 fill-current" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ── Compact pill ────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "relative flex items-center gap-2 rounded-full border bg-card/95 py-1.5 pr-2 pl-1.5 shadow-lg ring-1 ring-emerald-500/15 backdrop-blur",
          onRight ? "ml-auto" : "mr-auto",
        )}
      >
        {/* Animated glow so it reads as "active in the background". */}
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-px -z-10 animate-pulse rounded-full bg-gradient-to-r from-emerald-500/10 via-sky-500/10 to-transparent"
        />

        <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />

        {(() => {
          const SLOT = 18; // horizontal spacing between overlapping avatars (px)
          const AV = 28; // avatar diameter (size-7, px)
          const visible = agents.slice(0, 5);
          const n = visible.length;
          const width = (n - 1) * SLOT + AV;
          return (
            <div className="relative h-7 shrink-0" style={{ width }}>
              {visible.map((agent, i) => {
                const slot = (((i + shuffle) % n) + n) % n;
                return (
                  <span
                    key={agent.id}
                    title={`${agent.name} is running`}
                    className="absolute top-0 left-0 inline-flex transition-transform duration-700 ease-in-out"
                    style={{
                      transform: `translateX(${slot * SLOT}px)`,
                      zIndex: n - slot,
                    }}
                  >
                    <Avatar size="sm" className="relative size-7 ring-2 ring-card">
                      <AvatarImage src={agent.avatarSrc} alt={agent.name} />
                      <AvatarFallback>{agent.fallback}</AvatarFallback>
                    </Avatar>
                    <span
                      aria-hidden
                      className="absolute -right-0.5 -bottom-0.5 z-20 size-2 rounded-full bg-emerald-500 ring-2 ring-card"
                    />
                  </span>
                );
              })}
            </div>
          );
        })()}
        {agents.length > 5 ? (
          <span className="relative inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold ring-2 ring-card">
            +{agents.length - 5}
          </span>
        ) : null}

        <button
          type="button"
          aria-label="Hide running agents"
          title="Hide"
          // Don't start a drag or toggle when the intent is to dismiss.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setHidden(true);
          }}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
