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
import { NewspaperDbExplorer } from "@/components/newspaper/newspaper-db-explorer";

export const dynamic = "force-dynamic";

export default function DbPage() {
  return (
    <RoleGate allow={["Admin", "User"]}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="flex h-svh min-w-0 flex-col overflow-hidden">
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
          <main className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-4">
            <div className="mb-3 shrink-0">
              <h1 className="font-heading text-lg font-semibold">DB</h1>
              <p className="text-sm text-muted-foreground">
                Preview and download historical financial statements in the COMB FS Excel format.
              </p>
            </div>
            <NewspaperDbExplorer />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </RoleGate>
  );
}
