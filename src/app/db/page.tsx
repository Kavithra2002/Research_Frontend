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
import { DbPageClient } from "@/components/newspaper/db-page-client";

export const dynamic = "force-dynamic";

export default function DbPage() {
  return (
    <RoleGate allow={["Admin", "User"]}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden">
          <header className="z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>DB</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <HeaderLiveTicker className="mx-3" />
            <div className="ml-auto flex items-center gap-2">
              <AuthStatus />
              <ThemeToggle />
            </div>
          </header>
          {/* Page scroll lives here so table year headers can stick to the top of this pane. */}
          <main className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-x-none px-4 pb-8">
            <DbPageClient />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </RoleGate>
  );
}
