import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
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
import { DemoRunnerPanel } from "@/components/test-here/demo-runner-panel";
import { NonFinancialRunnerPanel } from "@/components/test-here/non-financial-runner-panel";
import { NonFinancialViewerPanel } from "@/components/test-here/non-financial-viewer-panel";
import { DbViewerPanel } from "@/components/test-here/db-viewer-panel";

export const dynamic = "force-dynamic";

export default function TestHerePage() {
  return (
    <RoleGate allow={["Admin"]}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-h-svh min-w-0 overflow-x-hidden">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>Test Here</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <HeaderLiveTicker className="mx-3" />
            <div className="ml-auto flex items-center gap-2">
              <AuthStatus />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex flex-1 min-h-0 min-w-0 flex-col gap-4 overflow-y-auto p-4">
            <DemoRunnerPanel />
            <NonFinancialRunnerPanel />
            <NonFinancialViewerPanel />
            <DbViewerPanel />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </RoleGate>
  );
}
