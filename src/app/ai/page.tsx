"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  Bot,
  Brain,
  Cpu,
  Loader2,
  MessageCircle,
  Play,
  Settings2,
  Sparkles,
  Square,
  Zap,
} from "lucide-react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  AGENT_CATALOG,
  getAgentStatus,
  isAgentImplemented,
  startAgent,
  statusOrder,
  statusStyle,
  stopAgent,
  useAddedAgentIds,
  useRunningAgentIds,
  type AgentStatus,
  type AiAgent,
} from "@/lib/ai-agents";
import {
  setReportScheduleEnabled,
  type ScheduleAgent,
} from "@/lib/report-schedule";
import { SageAgentPanel } from "@/components/ai/sage-agent-panel";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { HeaderLiveTicker } from "@/components/live-ticker/header-live-ticker";
import { AuthStatus } from "@/components/auth/auth-status";
import { RoleGate } from "@/components/auth/role-gate";
import { cn } from "@/lib/utils";

const statusIcon: Record<AgentStatus, React.ComponentType<{ className?: string }>> = {
  Online: Activity,
  Working: Zap,
  Idle: Cpu,
  Offline: Bot,
};

function AgentMarquee({ agents }: { agents: AiAgent[] }) {
  const renderSet = (keyPrefix: string, ariaHidden = false) => (
    <div
      className="flex shrink-0 items-center gap-3 pr-3"
      aria-hidden={ariaHidden || undefined}
    >
      {agents.map((agent, i) => {
        const s = statusStyle[agent.status];
        return (
          <div
            key={`${keyPrefix}-${agent.name}-${i}`}
            className="flex shrink-0 items-center gap-2 rounded-full border bg-card/80 py-1 pr-3 pl-1 shadow-sm backdrop-blur transition-transform hover:-translate-y-0.5"
          >
            <span
              className={cn(
                "relative inline-flex size-6 items-center justify-center rounded-full ring-2",
                s.ring,
              )}
            >
              <Avatar size="sm" className="size-6">
                <AvatarImage src={agent.avatarSrc} alt={agent.name} />
                <AvatarFallback>{agent.fallback}</AvatarFallback>
              </Avatar>
            </span>
            <span className="text-xs font-medium leading-none">
              {agent.name}
            </span>
            <span
              className={cn(
                "inline-flex size-1.5 rounded-full",
                s.dot,
                agent.status !== "Offline" && "animate-pulse",
              )}
            />
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="relative overflow-hidden rounded-lg border bg-gradient-to-r from-muted/40 via-muted/10 to-muted/40 py-3">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-card to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-card to-transparent" />
      <div className="flex w-max animate-marquee-x pause-on-hover">
        {renderSet("a")}
        {renderSet("b", true)}
      </div>
    </div>
  );
}

function StatusSummary({ agents }: { agents: AiAgent[] }) {
  const counts = statusOrder.reduce<Record<AgentStatus, number>>(
    (acc, st) => {
      acc[st] = agents.filter((a) => a.status === st).length;
      return acc;
    },
    { Online: 0, Working: 0, Idle: 0, Offline: 0 },
  );

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {statusOrder.map((status, idx) => {
        const s = statusStyle[status];
        const Icon = statusIcon[status];
        return (
          <div
            key={status}
            className={cn(
              "animate-fade-rise relative flex items-center gap-3 overflow-hidden rounded-lg border px-3 py-2",
              s.chipBg,
            )}
            style={{ animationDelay: `${idx * 60}ms` }}
          >
            <span
              className={cn(
                "relative inline-flex size-8 items-center justify-center rounded-full bg-background/60 ring-1",
                s.ring,
              )}
            >
              <Icon className={cn("size-4", s.text)} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="text-xs text-muted-foreground">{status}</span>
              <span className="text-base font-semibold tabular-nums">
                {counts[status]}
              </span>
            </div>
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                s.dot,
                status !== "Offline" && "animate-pulse",
              )}
            />
          </div>
        );
      })}
    </div>
  );
}

function RunButton({
  running,
  onToggle,
  onStartingChange,
  disabled = false,
}: {
  running: boolean;
  onToggle: (next: boolean) => void | Promise<void>;
  onStartingChange?: (starting: boolean) => void;
  disabled?: boolean;
}) {
  const [pending, setPending] = React.useState(false);

  if (disabled) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-dashed bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
        title="This agent isn't available yet"
      >
        <Cpu className="size-2.5" />
        Soon
      </span>
    );
  }

  const handleClick = async (e: React.MouseEvent) => {
    // The whole card is clickable (navigates to chat); keep the toggle isolated.
    e.stopPropagation();
    if (pending) return;
    const next = !running;
    setPending(true);
    // Only glow with the galaxy "booting up" effect when starting, not stopping.
    if (next) onStartingChange?.(true);
    try {
      // Brief, visible start/stop process before the state flips.
      await new Promise((resolve) => setTimeout(resolve, 1600));
      await onToggle(next);
    } finally {
      setPending(false);
      onStartingChange?.(false);
    }
  };

  const label = pending
    ? running
      ? "Stopping"
      : "Starting"
    : running
      ? "Running"
      : "Run";

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={(e) => e.stopPropagation()}
      aria-pressed={running}
      aria-label={running ? "Stop agent" : "Run agent"}
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors disabled:cursor-progress",
        running
          ? "border-sky-500/30 bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 dark:text-sky-300"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300",
      )}
    >
      {pending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : running ? (
        <Square className="size-2.5 fill-current" />
      ) : (
        <Play className="size-2.5 fill-current" />
      )}
      {label}
    </button>
  );
}

function AgentCard({
  agent,
  index,
  running,
  onToggleRun,
  onActivate,
}: {
  agent: AiAgent;
  index: number;
  running: boolean;
  onToggleRun: (next: boolean) => void | Promise<void>;
  onActivate?: () => void;
}) {
  const s = statusStyle[agent.status];
  const isLive = agent.status !== "Offline";
  const chatEnabled = running && Boolean(onActivate);
  const [starting, setStarting] = React.useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!chatEnabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate?.();
    }
  };

  return (
    <div
      className={cn(
        "group animate-fade-rise relative overflow-hidden rounded-xl border bg-card p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-foreground/5 hover:ring-1 hover:ring-foreground/10",
        chatEnabled && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        starting && "animate-card-neon-glow",
      )}
      style={{ animationDelay: `${index * 80}ms` }}
      role={chatEnabled ? "button" : undefined}
      tabIndex={chatEnabled ? 0 : undefined}
      onClick={chatEnabled ? onActivate : undefined}
      onKeyDown={chatEnabled ? handleKeyDown : undefined}
      aria-label={chatEnabled ? `Chat with ${agent.name}` : undefined}
    >
      {/* Galaxy "booting up" shimmer + running neon border while starting. */}
      {starting ? (
        <>
          <span
            aria-hidden
            className="galaxy-texture animate-galaxy-card-in pointer-events-none absolute inset-0 -z-[5] opacity-35 mix-blend-screen"
          >
            <span className="galaxy-stars animate-galaxy-drift absolute inset-0" />
          </span>
          <span
            aria-hidden
            className="animate-neon-border-sweep pointer-events-none absolute inset-0 rounded-xl"
          />
        </>
      ) : null}

      <div
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br opacity-0 transition-opacity duration-500 group-hover:opacity-100",
          agent.accent,
        )}
      />
      <div className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-gradient-to-br from-primary/15 to-transparent opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />

      <div className="flex items-start gap-3">
        <div className="relative">
          <span
            className={cn(
              "absolute inset-0 rounded-full ring-2 ring-offset-2 ring-offset-card",
              s.ring,
            )}
            aria-hidden
          />
          {isLive ? (
            <span
              className="absolute -inset-1 rounded-full animate-status-pulse"
              style={
                {
                  ["--status-pulse-color" as never]: s.pulseVar,
                } as React.CSSProperties
              }
              aria-hidden
            />
          ) : null}
          <Avatar size="lg" className="relative">
            <AvatarImage src={agent.avatarSrc} alt={agent.name} />
            <AvatarFallback>{agent.fallback}</AvatarFallback>
          </Avatar>
          <span
            className={cn(
              "absolute right-0 bottom-0 z-10 size-3 rounded-full ring-2 ring-card",
              s.dot,
              isLive && "animate-pulse",
            )}
            aria-hidden
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium leading-tight">
              {agent.name}
            </span>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
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
          </div>
          <span className="mt-0.5 text-xs text-muted-foreground">
            {agent.role}
          </span>
        </div>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{agent.task}</p>

      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Sparkles className="size-3 text-primary/70" />
          Agent #{String(index + 1).padStart(2, "0")}
        </span>
        <div className="flex items-center gap-1.5">
          <RunButton
            running={running}
            onToggle={onToggleRun}
            onStartingChange={setStarting}
            disabled={!isAgentImplemented(agent.id)}
          />
          {onActivate ? (
            <button
              type="button"
              disabled={!chatEnabled}
              onClick={(e) => {
                e.stopPropagation();
                if (chatEnabled) onActivate?.();
              }}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label={
                chatEnabled
                  ? `Chat with ${agent.name}`
                  : `Run ${agent.name} to enable chat`
              }
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                chatEnabled
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
                  : "cursor-not-allowed border-muted bg-muted/40 text-muted-foreground opacity-60",
              )}
            >
              <MessageCircle className="size-3" />
              Chat
            </button>
          ) : (
            <span className="font-mono uppercase tracking-wider">
              {agent.role.split(" ")[0]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyAgents() {
  return (
    <div className="animate-fade-rise relative flex flex-col items-center justify-center gap-4 overflow-hidden rounded-xl border border-dashed bg-gradient-to-b from-muted/40 to-background px-6 py-12 text-center">
      <div className="pointer-events-none absolute -top-10 left-1/2 size-40 -translate-x-1/2 rounded-full bg-gradient-to-br from-primary/15 to-transparent blur-3xl" />
      <span className="relative inline-flex size-14 items-center justify-center rounded-full border bg-card shadow-sm">
        <Bot className="size-6 text-muted-foreground" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold">No agents yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Your workspace doesn&apos;t have any AI agents. Head to Configuration
          to browse the team and add the agents you need.
        </p>
      </div>
      <Button size="sm" nativeButton={false} render={<Link href="/ai/configuration" />}>
        <Settings2 className="size-3.5" />
        Add agents
      </Button>
    </div>
  );
}

const SCHEDULE_AGENT_IDS: ReadonlySet<string> = new Set([
  "robin",
  "tuck",
  "marian",
]);

export default function AiPage() {
  const router = useRouter();
  const [sageOpen, setSageOpen] = React.useState(false);
  const addedIds = useAddedAgentIds();
  const runningIds = useRunningAgentIds();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const runningSet = React.useMemo(() => new Set(runningIds), [runningIds]);

  // Agents only do scheduled work while running; reflect that in their status.
  // Status is derived centrally so the AI and Configuration pages always agree.
  const agents = React.useMemo(
    () =>
      AGENT_CATALOG.filter(
        (a) => addedIds.includes(a.id) && isAgentImplemented(a.id),
      ).map((a) => ({
        ...a,
        status: getAgentStatus(a.id, runningSet.has(a.id)),
      })),
    [addedIds, runningSet],
  );
  const hasAgents = agents.length > 0;

  const handleToggleRun = React.useCallback(
    async (agent: AiAgent, next: boolean) => {
      if (next) startAgent(agent.id);
      else stopAgent(agent.id);
      // Gate the server-side work schedule so it only runs while the agent is on.
      if (SCHEDULE_AGENT_IDS.has(agent.id)) {
        try {
          await setReportScheduleEnabled(agent.id as ScheduleAgent, next);
        } catch {
          /* no saved schedule yet, or offline — running state still applies */
        }
      }
    },
    [],
  );

  return (
    <RoleGate allow={["Admin", "User"]}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-h-svh min-w-0 overflow-x-hidden">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>AI</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <HeaderLiveTicker className="mx-3" />
            <div className="ml-auto flex items-center gap-2">
              <AuthStatus />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex min-w-0 flex-1 min-h-0 flex-col gap-4 p-4">
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="size-4 text-muted-foreground" />
                  AI
                </CardTitle>
                <CardDescription className="mt-1">
                  Workspace for AI-powered extraction and analysis tools.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="size-4 text-muted-foreground" />
                  AI Agents
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full border bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                    Live
                  </span>
                </CardTitle>
                <CardDescription className="mt-1">
                  Specialized agents that handle individual tasks across the
                  extraction pipeline.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {!mounted ? null : hasAgents ? (
                  <>
                    <AgentMarquee agents={agents} />
                    <StatusSummary agents={agents} />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {agents.map((agent, idx) => (
                        <AgentCard
                          key={agent.id}
                          agent={agent}
                          index={idx}
                          running={runningSet.has(agent.id)}
                          onToggleRun={(next) => handleToggleRun(agent, next)}
                          onActivate={
                            agent.id === "scarlet"
                              ? () => setSageOpen(true)
                              : agent.id === "robin"
                                ? () => router.push("/ai/robin")
                                : agent.id === "tuck"
                                  ? () => router.push("/ai/tuck")
                                  : agent.id === "marian"
                                    ? () => router.push("/ai/marian")
                                    : agent.id === "jone"
                                      ? () => router.push("/ai/jone")
                                      : undefined
                          }
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyAgents />
                )}
              </CardContent>
            </Card>
          </main>
        </SidebarInset>
      </SidebarProvider>

      <SageAgentPanel open={sageOpen} onOpenChange={setSageOpen} />
    </RoleGate>
  );
}
