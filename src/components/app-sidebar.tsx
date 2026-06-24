"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  ChevronRight,
  Database,
  FileText,
  GitCompare,
  Globe2,
  LayoutDashboard,
  FlaskConical,
  LifeBuoy,
  Megaphone,
  Newspaper,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Sparkles,
  TableProperties,
  Telescope,
  Users,
} from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-provider";
import { SidebarCredits } from "@/components/sidebar-credits";
import type { UserRole } from "@/lib/auth";

type NavIconColor =
  | "sky"
  | "rose"
  | "violet"
  | "amber"
  | "emerald"
  | "orange"
  | "cyan"
  | "yellow"
  | "indigo"
  | "teal"
  | "lime"
  | "fuchsia"
  | "blue"
  | "slate";

const navIconColors: Record<NavIconColor, { bg: string; text: string }> = {
  sky: { bg: "bg-sky-500/15", text: "text-sky-400" },
  rose: { bg: "bg-rose-500/15", text: "text-rose-400" },
  violet: { bg: "bg-violet-500/15", text: "text-violet-400" },
  amber: { bg: "bg-amber-500/15", text: "text-amber-400" },
  emerald: { bg: "bg-emerald-500/15", text: "text-emerald-400" },
  orange: { bg: "bg-orange-500/15", text: "text-orange-400" },
  cyan: { bg: "bg-cyan-500/15", text: "text-cyan-400" },
  yellow: { bg: "bg-yellow-500/15", text: "text-yellow-400" },
  indigo: { bg: "bg-indigo-500/15", text: "text-indigo-400" },
  teal: { bg: "bg-teal-500/15", text: "text-teal-400" },
  lime: { bg: "bg-lime-500/15", text: "text-lime-400" },
  fuchsia: { bg: "bg-fuchsia-500/15", text: "text-fuchsia-400" },
  blue: { bg: "bg-blue-500/15", text: "text-blue-400" },
  slate: { bg: "bg-slate-500/15", text: "text-slate-400" },
};

function ColoredNavIcon({
  icon: Icon,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: NavIconColor;
}) {
  const palette = navIconColors[color];
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-md",
        palette.bg,
      )}
    >
      <Icon className={cn("size-3.5", palette.text)} />
    </span>
  );
}

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: NavIconColor;
  roles: readonly UserRole[];
  exact?: boolean;
};

const mainNav: NavItem[] = [
  {
    title: "Extracted Tables",
    url: "/",
    icon: TableProperties,
    iconColor: "sky",
    roles: ["Admin", "User"],
  },
  {
    title: "System",
    url: "/system",
    icon: Activity,
    iconColor: "rose",
    roles: ["Admin"],
  },
  {
    title: "Development",
    url: "/test-here",
    icon: FlaskConical,
    iconColor: "violet",
    roles: ["Admin"],
  },
  {
    title: "Reports",
    url: "/reports",
    icon: FileText,
    iconColor: "amber",
    roles: ["Admin", "User"],
  },
  {
    title: "Analytics",
    url: "/analytics",
    icon: BarChart3,
    iconColor: "emerald",
    roles: ["Admin", "User"],
  },
  {
    title: "Comparison",
    url: "/ai/comparison",
    icon: GitCompare,
    iconColor: "orange",
    roles: ["Admin", "User"],
  },
  {
    title: "Non Financial Data Section",
    url: "/ai/non-financial",
    icon: Newspaper,
    iconColor: "cyan",
    roles: ["Admin", "User"],
  },
  {
    title: "Announcement",
    url: "/announcement",
    icon: Megaphone,
    iconColor: "yellow",
    roles: ["Admin", "User"],
  },
  {
    title: "Sector Lens",
    url: "/sector-lens",
    icon: Telescope,
    iconColor: "indigo",
    roles: ["Admin", "User"],
  },
  {
    title: "Newspaper",
    url: "/newspaper",
    icon: ScrollText,
    iconColor: "lime",
    roles: ["Admin", "User"],
  },
  {
    title: "DB",
    url: "/db",
    icon: Database,
    iconColor: "slate",
    roles: ["Admin", "User"],
  },
  {
    title: "Macroeconomics",
    url: "/macroeconomics/indicator",
    icon: Globe2,
    iconColor: "teal",
    roles: ["Admin", "User"],
  },
];

const aiNav: NavItem[] = [
  {
    title: "AI",
    url: "/ai",
    icon: Sparkles,
    iconColor: "fuchsia",
    roles: ["Admin", "User"],
    exact: true,
  },
  {
    title: "Configuration",
    url: "/ai/configuration",
    icon: SlidersHorizontal,
    iconColor: "slate",
    roles: ["Admin", "User"],
  },
];

const workspaceNav: NavItem[] = [
  {
    title: "Team",
    url: "#",
    icon: Users,
    iconColor: "blue",
    roles: ["Admin", "User"],
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
    iconColor: "slate",
    roles: ["Admin", "User"],
  },
  {
    title: "Support",
    url: "#",
    icon: LifeBuoy,
    iconColor: "rose",
    roles: ["Admin", "User"],
  },
];

const macroeconomicsSubNav = [
  {
    title: "Macroeconomics Indicator",
    url: "/macroeconomics/indicator",
  },
  {
    title: "Macroeconomics Analysis",
    url: "/macroeconomics/analysis",
  },
  {
    title: "Macroeconomics Charts",
    url: "/macroeconomics/charts",
  },
] as const;

function MacroeconomicsSidebarItem({
  isActive,
}: {
  isActive: (url: string) => boolean;
}) {
  const pathname = usePathname();
  const macroActive = pathname.startsWith("/macroeconomics");
  const [open, setOpen] = React.useState(macroActive);

  React.useEffect(() => {
    if (macroActive) {
      setOpen(true);
    }
  }, [macroActive]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger
          render={
            <SidebarMenuButton
              tooltip="Macroeconomics"
              isActive={macroActive}
            />
          }
        >
          <ColoredNavIcon icon={Globe2} color="teal" />
          <span>Macroeconomics</span>
          <ChevronRight
            className={cn(
              "ml-auto transition-transform duration-200",
              open && "rotate-90",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {macroeconomicsSubNav.map((item) => (
              <SidebarMenuSubItem key={item.url}>
                <SidebarMenuSubButton
                  isActive={isActive(item.url)}
                  render={<Link href={item.url} />}
                >
                  <span>{item.title}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

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
              <div className="grid flex-1 text-left text-sm leading-none">
                <span className="truncate font-semibold">Sherwood Technologies</span>
                <span className="truncate text-[10px] leading-tight">Research Application</span>
                <span className="truncate text-[10px] leading-tight">for Ambeon Research</span>
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
                <React.Fragment key={item.title}>
                  {item.title === "Macroeconomics" ? (
                    <MacroeconomicsSidebarItem isActive={isActive} />
                  ) : (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        tooltip={item.title}
                        isActive={isActive(item.url, item.exact)}
                        render={<Link href={item.url} />}
                      >
                        <ColoredNavIcon icon={item.icon} color={item.iconColor} />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </React.Fragment>
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
                      <ColoredNavIcon icon={item.icon} color={item.iconColor} />
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
                      <ColoredNavIcon icon={item.icon} color={item.iconColor} />
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
        {user ? <SidebarCredits /> : null}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Account" render={<Link href="#" />}>
              <ColoredNavIcon icon={Users} color="blue" />
              <span>Account</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
