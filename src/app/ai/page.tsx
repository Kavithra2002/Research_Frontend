"use client";

import * as React from "react";
import { Activity, Bot, Brain, Cpu, MessageCircle, Sparkles, Zap } from "lucide-react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
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
import { AuthStatus } from "@/components/auth/auth-status";
import { RoleGate } from "@/components/auth/role-gate";
import { cn } from "@/lib/utils";

type AgentStatus = "Online" | "Working" | "Idle" | "Offline";

type AiAgent = {
  name: string;
  role: string;
  task: string;
  avatarSrc: string;
  fallback: string;
  status: AgentStatus;
  accent: string;
};

const statusStyle: Record<
  AgentStatus,
  {
    dot: string;
    ring: string;
    text: string;
    chipBg: string;
    pulseVar: string;
  }
> = {
  Online: {
    dot: "bg-emerald-500",
    ring: "ring-emerald-500/60",
    text: "text-emerald-600 dark:text-emerald-400",
    chipBg: "bg-emerald-500/10 border-emerald-500/30",
    pulseVar: "rgba(16, 185, 129, 0.55)",
  },
  Working: {
    dot: "bg-sky-500",
    ring: "ring-sky-500/60",
    text: "text-sky-600 dark:text-sky-400",
    chipBg: "bg-sky-500/10 border-sky-500/30",
    pulseVar: "rgba(14, 165, 233, 0.55)",
  },
  Idle: {
    dot: "bg-amber-500",
    ring: "ring-amber-500/50",
    text: "text-amber-600 dark:text-amber-400",
    chipBg: "bg-amber-500/10 border-amber-500/30",
    pulseVar: "rgba(245, 158, 11, 0.45)",
  },
  Offline: {
    dot: "bg-zinc-400",
    ring: "ring-zinc-400/40",
    text: "text-zinc-500 dark:text-zinc-400",
    chipBg: "bg-zinc-500/10 border-zinc-500/30",
    pulseVar: "rgba(0, 0, 0, 0)",
  },
};

const agents: AiAgent[] = [
  {
    name: "Robin",
    role: "Extraction Agent",
    task: "Parses financial statements from uploaded PDF and image reports.",
    avatarSrc: "https://api.dicebear.com/8.x/bottts/svg?seed=atlas",
    fallback: "RB",
    status: "Online",
    accent: "from-emerald-500/30 via-emerald-500/10 to-transparent",
  },
  {
    name: "Marian",
    role: "Validation Agent",
    task: "Cross-checks extracted tables for numeric consistency and missing rows.",
    avatarSrc: "https://api.dicebear.com/8.x/bottts/svg?seed=nova",
    fallback: "MR",
    status: "Working",
    accent: "from-sky-500/30 via-sky-500/10 to-transparent",
  },
  {
    name: "John",
    role: "Comparison Agent",
    task: "Compares extracted output against the source report image side by side.",
    avatarSrc: "https://api.dicebear.com/8.x/bottts/svg?seed=echo",
    fallback: "JN",
    status: "Online",
    accent: "from-violet-500/30 via-violet-500/10 to-transparent",
  },
  {
    name: "Scarlet",
    role: "Configuration Agent",
    task: "Tunes the extraction model, prompts and runtime options for each run.",
    avatarSrc: "https://api.dicebear.com/8.x/bottts/svg?seed=sage",
    fallback: "SC",
    status: "Idle",
    accent: "from-amber-500/30 via-amber-500/10 to-transparent",
  },
  {
    name: "Tuck",
    role: "Indexing Agent",
    task: "Builds a searchable index over historical extracted statements.",
    avatarSrc: "https://api.dicebear.com/8.x/bottts/svg?seed=forge",
    fallback: "TC",
    status: "Offline",
    accent: "from-zinc-500/20 via-zinc-500/5 to-transparent",
  },
];

const statusOrder: AgentStatus[] = ["Online", "Working", "Idle", "Offline"];
const statusIcon: Record<AgentStatus, React.ComponentType<{ className?: string }>> = {
  Online: Activity,
  Working: Zap,
  Idle: Cpu,
  Offline: Bot,
};

function AgentMarquee() {
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

function StatusSummary() {
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

function AgentCard({
  agent,
  index,
  onActivate,
}: {
  agent: AiAgent;
  index: number;
  onActivate?: () => void;
}) {
  const s = statusStyle[agent.status];
  const isLive = agent.status !== "Offline";
  const interactive = Boolean(onActivate);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate?.();
    }
  };

  return (
    <div
      className={cn(
        "group animate-fade-rise relative overflow-hidden rounded-xl border bg-card p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-foreground/5 hover:ring-1 hover:ring-foreground/10",
        interactive && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      style={{ animationDelay: `${index * 80}ms` }}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onActivate : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
      aria-label={interactive ? `Chat with ${agent.name}` : undefined}
    >
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
        {interactive ? (
          <span className="inline-flex items-center gap-1 rounded-full border bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300">
            <MessageCircle className="size-3" />
            Chat
          </span>
        ) : (
          <span className="font-mono uppercase tracking-wider">
            {agent.role.split(" ")[0]}
          </span>
        )}
      </div>
    </div>
  );
}

export default function AiPage() {
  const [sageOpen, setSageOpen] = React.useState(false);

  return (
    <RoleGate allow={["Admin", "User"]}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
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
            <div className="ml-auto flex items-center gap-2">
              <AuthStatus />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex flex-1 min-h-0 flex-col gap-4 p-4">
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
                <AgentMarquee />
                <StatusSummary />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {agents.map((agent, idx) => (
                    <AgentCard
                      key={agent.name}
                      agent={agent}
                      index={idx}
                      onActivate={
                        agent.name === "Scarlet"
                          ? () => setSageOpen(true)
                          : undefined
                      }
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </main>
        </SidebarInset>
      </SidebarProvider>

      <SageAgentPanel open={sageOpen} onOpenChange={setSageOpen} />
    </RoleGate>
  );
}
