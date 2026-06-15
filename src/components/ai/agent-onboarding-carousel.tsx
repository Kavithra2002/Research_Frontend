"use client";

import * as React from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Plus,
  Sparkles,
  Users,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  AGENT_CATALOG,
  addAgent,
  getAgentById,
  removeAgent,
  statusStyle,
  useAddedAgentIds,
  type AiAgent,
} from "@/lib/ai-agents";

const SWIPE_THRESHOLD = 60;
const STAGE_H = 220;

type Layout = {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  blur: number;
  z: number;
};

export function AgentOnboardingCarousel() {
  const agents = AGENT_CATALOG;
  const addedIds = useAddedAgentIds();
  const [active, setActive] = React.useState(0);

  const stageRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);

  // Pointer / touch swipe tracking.
  const dragStartX = React.useRef<number | null>(null);
  const [dragDx, setDragDx] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);

  // Pause autoplay while the user is interacting (hover / drag).
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? 0);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const count = agents.length;
  const activeAgent = agents[active];
  const isAdded = addedIds.includes(activeAgent.id);

  const spacing = Math.min(150, Math.max(92, width * 0.2));
  const arc = 16;
  const cx = width / 2;
  const cy = STAGE_H / 2;

  const layoutFor = React.useCallback(
    (offset: number): Layout => {
      const abs = Math.abs(offset);
      return {
        x: cx + offset * spacing + (dragging ? dragDx : 0),
        y: cy + abs * arc,
        scale: abs === 0 ? 1 : abs === 1 ? 0.6 : 0.42,
        opacity: abs === 0 ? 1 : abs === 1 ? 0.6 : 0.28,
        blur: abs === 0 ? 0 : abs === 1 ? 1.2 : 2.5,
        z: 20 - abs,
      };
    },
    [cx, cy, spacing, dragging, dragDx],
  );

  const go = React.useCallback(
    (dir: -1 | 1) => {
      setActive((prev) => (prev + dir + count) % count);
    },
    [count],
  );

  // Autoplay: advance to the next agent on an interval, pausing on
  // hover / drag and when the tab is in the background.
  React.useEffect(() => {
    if (paused || dragging || count <= 1) return;
    const id = window.setInterval(() => go(1), 3000);
    return () => window.clearInterval(id);
  }, [paused, dragging, count, go]);

  const onPointerDown = (e: React.PointerEvent) => {
    dragStartX.current = e.clientX;
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStartX.current === null) return;
    setDragDx(e.clientX - dragStartX.current);
  };

  const endDrag = () => {
    if (dragStartX.current === null) return;
    if (dragDx <= -SWIPE_THRESHOLD) go(1);
    else if (dragDx >= SWIPE_THRESHOLD) go(-1);
    dragStartX.current = null;
    setDragDx(0);
    setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    }
  };

  // Agent pending confirmation before it is charged + added.
  const [pendingAgent, setPendingAgent] = React.useState<AiAgent | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const noticeTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  const showNotice = React.useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  }, []);

  const toggleAdd = () => {
    // Removing is immediate; adding asks for confirmation (credits charged).
    if (isAdded) {
      removeAgent(activeAgent.id);
      showNotice(`${activeAgent.name} was removed from the system.`);
    } else {
      setPendingAgent(activeAgent);
    }
  };

  const confirmAdd = () => {
    if (!pendingAgent) return;
    addAgent(pendingAgent.id);
    showNotice(`${pendingAgent.name} is added to the system.`);
    setPendingAgent(null);
  };

  const wrappedOffset = (i: number) => {
    let offset = i - active;
    if (offset > count / 2) offset -= count;
    if (offset < -count / 2) offset += count;
    return offset;
  };

  // Connector segments between consecutive visual positions (-2..2).
  const connectorOffsets = [-2, -1, 0, 1, 2];

  return (
    <div className="flex flex-col gap-3">
      {notice ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300"
        >
          <Check className="size-3.5 shrink-0" />
          {notice}
        </div>
      ) : null}

      {/* Stage */}
      <div
        ref={stageRef}
        role="group"
        aria-roledescription="carousel"
        aria-label="Choose an AI agent to add"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        style={{ height: STAGE_H }}
        className={cn(
          "relative w-full touch-pan-y select-none overflow-hidden rounded-2xl border",
          "bg-gradient-to-b from-muted/50 via-background to-background",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <div className="pointer-events-none absolute left-1/2 top-1/2 size-60 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-primary/20 via-primary/5 to-transparent blur-3xl" />

        {/* Connecting lines (the "AI network") */}
        {width > 0 ? (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden
          >
            {connectorOffsets.slice(0, -1).map((o) => {
              const a = layoutFor(o);
              const b = layoutFor(o + 1);
              const central = o === -1 || o === 0;
              return (
                <line
                  key={o}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className={cn(
                    central ? "text-primary/60" : "text-border",
                  )}
                  stroke="currentColor"
                  strokeWidth={central ? 2 : 1.5}
                  strokeDasharray={central ? undefined : "4 5"}
                  strokeLinecap="round"
                  opacity={Math.min(a.opacity, b.opacity) + 0.15}
                />
              );
            })}
            {connectorOffsets.map((o) => {
              const p = layoutFor(o);
              return (
                <circle
                  key={`node-${o}`}
                  cx={p.x}
                  cy={p.y}
                  r={o === 0 ? 3 : 2}
                  className={o === 0 ? "text-primary" : "text-muted-foreground"}
                  fill="currentColor"
                  opacity={p.opacity}
                />
              );
            })}
          </svg>
        ) : null}

        {agents.map((agent, i) => {
          const offset = wrappedOffset(i);
          if (Math.abs(offset) > 2) return null;
          return (
            <AgentOrb
              key={agent.id}
              agent={agent}
              layout={layoutFor(offset)}
              isActive={offset === 0}
              isNeighbor={Math.abs(offset) === 1}
              added={addedIds.includes(agent.id)}
              onSelect={() => setActive(i)}
            />
          );
        })}

        {/* Arrow controls */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Previous agent"
          onClick={() => go(-1)}
          className="absolute left-3 top-1/2 z-30 size-8 -translate-y-1/2 rounded-full shadow-sm backdrop-blur"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Next agent"
          onClick={() => go(1)}
          className="absolute right-3 top-1/2 z-30 size-8 -translate-y-1/2 rounded-full shadow-sm backdrop-blur"
        >
          <ChevronRight className="size-4" />
        </Button>

        {/* Dots */}
        <div className="absolute inset-x-0 bottom-2 z-30 flex items-center justify-center gap-1.5">
          {agents.map((agent, i) => (
            <button
              key={agent.id}
              type="button"
              aria-label={`Go to ${agent.name}`}
              aria-current={i === active}
              onClick={() => setActive(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === active
                  ? "w-5 bg-primary"
                  : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60",
              )}
            />
          ))}
        </div>
      </div>

      {/* Active agent task + action (compact) */}
      <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
            <Sparkles className="size-3.5 shrink-0 text-primary/70" />
            <span className="truncate">
              {activeAgent.name}
              <span className="font-normal text-muted-foreground">
                {" "}
                · {activeAgent.role}
              </span>
            </span>
          </span>
          <p className="truncate text-xs text-muted-foreground">
            {activeAgent.task}
          </p>
        </div>
        <Button
          type="button"
          variant={isAdded ? "secondary" : "default"}
          size="sm"
          onClick={toggleAdd}
          className="shrink-0"
        >
          {isAdded ? (
            <>
              <Check className="size-3.5" />
              Added
            </>
          ) : (
            <>
              <Plus className="size-3.5" />
              Add
            </>
          )}
        </Button>
      </div>

      {/* Manage / remove added agents */}
      <div className="rounded-xl border bg-card px-3 py-2.5">
        <div className="mb-2 flex items-center gap-2">
          <Users className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold">Added to your account</span>
          <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {addedIds.length} / {count}
          </span>
        </div>

        {addedIds.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No agents added yet — browse above and press{" "}
            <span className="font-medium text-foreground">Add</span>.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {addedIds.map((id) => {
              const agent = getAgentById(id);
              if (!agent) return null;
              const s = statusStyle[agent.status];
              return (
                <li
                  key={id}
                  className="flex items-center gap-1.5 rounded-full border bg-background py-0.5 pr-0.5 pl-1 shadow-sm"
                >
                  <span
                    className={cn(
                      "relative inline-flex size-5 items-center justify-center rounded-full ring-2",
                      s.ring,
                    )}
                  >
                    <Avatar size="sm" className="size-5">
                      <AvatarImage src={agent.avatarSrc} alt={agent.name} />
                      <AvatarFallback>{agent.fallback}</AvatarFallback>
                    </Avatar>
                  </span>
                  <span className="text-xs font-medium leading-none">
                    {agent.name}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${agent.name}`}
                    title={`Remove ${agent.name}`}
                    onClick={() => removeAgent(id)}
                    className="size-4 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="size-3" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog
        open={pendingAgent !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAgent(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="size-4 text-primary" />
              Confirm adding {pendingAgent?.name}
            </DialogTitle>
            <DialogDescription>
              Credits will be charged for the use of these agents. Do you want to
              confirm adding{" "}
              <span className="font-medium text-foreground">
                {pendingAgent?.name}
              </span>{" "}
              ({pendingAgent?.role}) to the system?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="button" onClick={confirmAdd}>
              <Check className="size-3.5" />
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AgentOrb({
  agent,
  layout,
  isActive,
  isNeighbor,
  added,
  onSelect,
}: {
  agent: AiAgent;
  layout: Layout;
  isActive: boolean;
  isNeighbor: boolean;
  added: boolean;
  onSelect: () => void;
}) {
  const s = statusStyle[agent.status];
  const isLive = agent.status !== "Offline";

  return (
    <button
      type="button"
      tabIndex={isActive ? 0 : -1}
      aria-label={`${agent.name}, ${agent.role}`}
      onClick={onSelect}
      style={{
        left: layout.x,
        top: layout.y,
        transform: `translate(-50%, -50%) scale(${layout.scale})`,
        opacity: layout.opacity,
        filter: layout.blur ? `blur(${layout.blur}px)` : undefined,
        zIndex: layout.z,
      }}
      className={cn(
        "absolute flex size-36 flex-col items-center justify-center rounded-full p-3 text-center",
        "border bg-card shadow-lg transition-all duration-500 ease-out outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring",
        isActive
          ? "ring-2 ring-offset-2 ring-offset-background " + s.ring
          : "cursor-pointer",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 rounded-full bg-gradient-to-br",
          agent.accent,
          isActive ? "opacity-100" : "opacity-60",
        )}
      />

      {isActive && isLive ? (
        <span
          className="pointer-events-none absolute inset-1.5 rounded-full animate-status-pulse"
          style={
            {
              ["--status-pulse-color" as never]: s.pulseVar,
            } as React.CSSProperties
          }
          aria-hidden
        />
      ) : null}

      <div className="relative">
        <Avatar
          size="lg"
          className={cn(isActive ? "size-11" : isNeighbor ? "size-9" : "size-8")}
        >
          <AvatarImage src={agent.avatarSrc} alt={agent.name} />
          <AvatarFallback>{agent.fallback}</AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "absolute right-0 bottom-0 size-3 rounded-full ring-2 ring-card",
            s.dot,
            isLive && "animate-pulse",
          )}
          aria-hidden
        />
      </div>

      <span className="mt-1.5 text-sm font-semibold leading-tight">
        {agent.name}
      </span>

      {isActive ? (
        <>
          <span className="text-[11px] text-muted-foreground">
            {agent.role}
          </span>
          <span
            className={cn(
              "mt-1 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
              s.chipBg,
              s.text,
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                s.dot,
                isLive && "animate-pulse",
              )}
            />
            {agent.status}
          </span>
        </>
      ) : null}

      {added ? (
        <span className="absolute right-3 top-3 inline-flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
          <Check className="size-3" />
        </span>
      ) : null}
    </button>
  );
}
