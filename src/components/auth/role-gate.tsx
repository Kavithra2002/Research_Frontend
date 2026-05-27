"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { defaultRouteForRole, type UserRole } from "@/lib/auth";
import { useAuth } from "./auth-provider";

interface RoleGateProps {
  allow: readonly UserRole[];
  children: ReactNode;
}

export function RoleGate({ allow, children }: RoleGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, user } = useAuth();

  useEffect(() => {
    if (status === "loading") return;

    if (status === "anonymous") {
      const target = `/login?redirect=${encodeURIComponent(pathname || "/")}`;
      router.replace(target);
      return;
    }

    if (user && !allow.includes(user.role)) {
      router.replace(defaultRouteForRole(user.role));
    }
  }, [status, user, allow, pathname, router]);

  if (status !== "authenticated" || !user || !allow.includes(user.role)) {
    return (
      <div className="flex h-svh w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-xs">
            {status === "loading"
              ? "Checking your session..."
              : status === "anonymous"
              ? "Redirecting to sign in..."
              : "Redirecting..."}
          </span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
