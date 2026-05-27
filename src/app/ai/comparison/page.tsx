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
import { AuthStatus } from "@/components/auth/auth-status";
import { RoleGate } from "@/components/auth/role-gate";
import { ComparisonExplorer } from "@/components/ai/comparison-explorer";

export const dynamic = "force-dynamic";

export default function AiComparisonPage() {
  return (
    <RoleGate allow={["Admin", "User"]}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-h-svh min-w-0 overflow-x-hidden">
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
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
                  <BreadcrumbPage>Comparison</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex items-center gap-2">
              <AuthStatus />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex min-w-0 flex-col px-4 pb-4 pt-2">
            <ComparisonExplorer />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </RoleGate>
  );
}
