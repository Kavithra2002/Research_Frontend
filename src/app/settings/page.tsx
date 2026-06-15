"use client";

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
import { UserManagementPanel } from "@/components/settings/user-management-panel";
import { UserLogPanel } from "@/components/settings/user-log-panel";
import { useAuth } from "@/components/auth/auth-provider";
import { Settings as SettingsIcon } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";

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
                  <BreadcrumbPage>Settings</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <HeaderLiveTicker className="mx-3" />
            <div className="ml-auto flex items-center gap-2">
              <AuthStatus />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex flex-1 min-h-0 flex-col gap-4 p-4">
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SettingsIcon className="size-4 text-muted-foreground" />
                  Settings
                </CardTitle>
                <CardDescription className="mt-1">
                  {isAdmin
                    ? "Manage application users and other administrative settings."
                    : "Manage your personal preferences."}
                </CardDescription>
              </CardHeader>
              {!isAdmin && (
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    There are no settings available for your account at this
                    time.
                  </p>
                </CardContent>
              )}
            </Card>

            {isAdmin && <UserManagementPanel />}
            {isAdmin && <UserLogPanel />}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </RoleGate>
  );
}
