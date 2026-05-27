"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  FileText,
  GitCompare,
  LayoutDashboard,
  LifeBuoy,
  Settings,
  SlidersHorizontal,
  Sparkles,
  TableProperties,
  Users,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useAuth } from "@/components/auth/auth-provider";
import type { UserRole } from "@/lib/auth";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: readonly UserRole[];
  exact?: boolean;
};

const mainNav: NavItem[] = [
  {
    title: "Extracted Tables",
    url: "/",
    icon: TableProperties,
    roles: ["Admin", "User"],
  },
  { title: "System", url: "/system", icon: Activity, roles: ["Admin"] },
  { title: "Reports", url: "/reports", icon: FileText, roles: ["Admin", "User"] },
  { title: "Analytics", url: "#", icon: BarChart3, roles: ["Admin", "User"] },
  {
    title: "Comparison",
    url: "/ai/comparison",
    icon: GitCompare,
    roles: ["Admin", "User"],
  },
];

const aiNav: NavItem[] = [
  {
    title: "AI",
    url: "/ai",
    icon: Sparkles,
    roles: ["Admin", "User"],
    exact: true,
  },
  {
    title: "Configuration",
    url: "/ai/configuration",
    icon: SlidersHorizontal,
    roles: ["Admin", "User"],
  },
];

const workspaceNav: NavItem[] = [
  { title: "Team", url: "#", icon: Users, roles: ["Admin", "User"] },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
    roles: ["Admin", "User"],
  },
  { title: "Support", url: "#", icon: LifeBuoy, roles: ["Admin", "User"] },
];

export function AppSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { user } = useAuth();
  const role: UserRole = user?.role ?? "User";

  const visibleMainNav = mainNav.filter((item) => item.roles.includes(role));
  const visibleAiNav = aiNav.filter((item) => item.roles.includes(role));
  const visibleWorkspaceNav = workspaceNav.filter((item) =>
    item.roles.includes(role),
  );

  const isActive = (url: string, exact?: boolean) => {
    if (!url || url === "#") return false;
    if (url === "/" || exact) return pathname === url;
    return pathname === url || pathname.startsWith(url + "/");
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="#" />}>
              <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <LayoutDashboard className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Sherwood Technology</span>
                <span className="truncate text-xs">Research Application</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Application</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={isActive(item.url, item.exact)}
                    render={<Link href={item.url} />}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {visibleAiNav.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAiNav.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      tooltip={item.title}
                      isActive={isActive(item.url, item.exact)}
                      render={<Link href={item.url} />}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
        {visibleWorkspaceNav.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleWorkspaceNav.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      tooltip={item.title}
                      isActive={isActive(item.url, item.exact)}
                      render={<Link href={item.url} />}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Account" render={<Link href="#" />}>
              <Users />
              <span>Account</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
