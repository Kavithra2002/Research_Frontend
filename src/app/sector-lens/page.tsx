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
import { SectorLensExplorer } from "@/components/sector-lens/sector-lens-explorer";

export const dynamic = "force-dynamic";

export default function SectorLensPage() {
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
                <BreadcrumbItem>
                  <BreadcrumbPage>Sector Lens</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <HeaderLiveTicker className="mx-3" />
            <div className="ml-auto flex items-center gap-2">
              <AuthStatus />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex min-w-0 flex-col gap-3 px-4 pb-4 pt-3">
            <div>
              <h1 className="font-heading text-lg font-semibold">Sector Lens</h1>
              <p className="text-sm text-muted-foreground">
                Equity screener across the available universe, grouped by
                classified sector. Market cap and price come from the live CSE
                feed; revenue, cash, and P/E come from extracted reports where
                available. Total Return YTD still requires a historical price
                source.
              </p>
            </div>
            <SectorLensExplorer />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </RoleGate>
  );
}
