"use client";

import * as React from "react";
import { PanelLeft } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
import {
  AgentChatWorkspace,
  type AccentName,
  type AgentChatConfig,
} from "@/components/ai/agent-chat-workspace";

const BADGE_CLASS: Record<AccentName, string> = {
  emerald:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  sky: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  violet:
    "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  amber:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

const DOT_CLASS: Record<AccentName, string> = {
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
};

const RING_CLASS: Record<AccentName, string> = {
  emerald: "ring-emerald-500/40",
  sky: "ring-sky-500/40",
  violet: "ring-violet-500/40",
  amber: "ring-amber-500/40",
};

export function AgentChatPage({ config }: { config: AgentChatConfig }) {
  // The chat rail (reports + history) is open by default; toggled from the header.
  const [railOpen, setRailOpen] = React.useState(true);

  return (
    <RoleGate allow={["Admin", "User"]}>
      {/* Main app sidebar starts collapsed so the agent gets the full width. */}
      <SidebarProvider defaultOpen={false}>
        <AppSidebar />
        <SidebarInset className="flex h-svh min-h-0 min-w-0 flex-col overflow-x-hidden">
          <header className="flex h-14 min-w-0 shrink-0 items-center gap-2 overflow-hidden border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={railOpen ? "Hide reports & history" : "Show reports & history"}
              aria-pressed={railOpen}
              onClick={() => setRailOpen((v) => !v)}
              className={cn(railOpen && "bg-accent text-accent-foreground")}
            >
              <PanelLeft className="size-4" />
            </Button>
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/ai">AI</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{config.name}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-4 hidden items-center gap-2 sm:flex">
              <Avatar
                size="sm"
                className={cn("ring-1", RING_CLASS[config.accent])}
              >
                <AvatarImage src={config.avatarSrc} alt={config.name} />
                <AvatarFallback>{config.fallback}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{config.name}</span>
              <Badge
                variant="outline"
                className={cn("text-[10px]", BADGE_CLASS[config.accent])}
              >
                <span
                  className={cn(
                    "size-1.5 animate-pulse rounded-full",
                    DOT_CLASS[config.accent],
                  )}
                />
                Online
              </Badge>
            </div>
            <HeaderLiveTicker className="mx-3" />
            <div className="ml-auto flex items-center gap-2">
              <AuthStatus />
              <ThemeToggle />
            </div>
          </header>
          <AgentChatWorkspace config={config} railOpen={railOpen} />
        </SidebarInset>
      </SidebarProvider>
    </RoleGate>
  );
}
