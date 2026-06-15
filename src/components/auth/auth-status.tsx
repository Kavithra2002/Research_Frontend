"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, LogOut } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarMenu } from "@/components/calendar-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { getDisplayName, getInitials } from "@/lib/auth";
import { useAuth } from "./auth-provider";

export function AuthStatus() {
  const router = useRouter();
  const { status, user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleLogout = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
      router.replace("/login");
      router.refresh();
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="size-7 rounded-full" />
        <Skeleton className="h-3 w-20" />
      </div>
    );
  }

  if (!user) {
    return (
      <Button
        variant="outline"
        size="sm"
        nativeButton={false}
        render={<Link href="/login" />}
      >
        <LogIn />
        Sign in
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 rounded-full border bg-card pl-1 pr-3 py-0.5">
        <span className="bg-sidebar-primary text-sidebar-primary-foreground flex size-6 items-center justify-center rounded-full text-[0.65rem] font-semibold">
          {getInitials(user)}
        </span>
        <span className="hidden sm:flex flex-col leading-tight">
          <span className="text-xs font-medium">{getDisplayName(user)}</span>
          <span className="text-[0.65rem] text-muted-foreground">
            {user.user_id}
          </span>
        </span>
        <Badge
          variant={user.role === "Admin" ? "default" : "secondary"}
          className="ml-1 hidden text-[0.6rem] sm:inline-flex"
        >
          {user.role}
        </Badge>
      </div>
      <NotificationBell />
      <CalendarMenu />
      <Button
        variant="ghost"
        size="sm"
        onClick={handleLogout}
        disabled={signingOut}
      >
        <LogOut />
        <span className="hidden sm:inline">
          {signingOut ? "Signing out..." : "Sign out"}
        </span>
      </Button>
    </div>
  );
}
