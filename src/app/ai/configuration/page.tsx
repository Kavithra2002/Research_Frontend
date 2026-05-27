"use client";

import { SlidersHorizontal } from "lucide-react";

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
import { AiConfigurationPanel } from "@/components/ai/ai-configuration-panel";

export default function AiConfigurationPage() {
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
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/ai">AI</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Configuration</BreadcrumbPage>
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
                  <SlidersHorizontal className="size-4 text-muted-foreground" />
                  AI Configuration
                </CardTitle>
                <CardDescription className="mt-1">
                  Tune the AI extraction pipeline — choose the model, statement
                  scope and capture DPI used when parsing financial reports.
                </CardDescription>
              </CardHeader>
            </Card>

            <AiConfigurationPanel />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </RoleGate>
  );
}
