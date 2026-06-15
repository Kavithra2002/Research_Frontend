"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Renders a looping Lottie animation as a decorative, non-interactive backdrop.
 * The animation is loaded lazily on the client (lottie-web has no SSR support)
 * and respects the user's reduced-motion preference.
 */
export function LottieBackground({
  src = "/animation.json",
  className,
}: {
  src?: string;
  className?: string;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let cancelled = false;
    let animation: { destroy: () => void } | null = null;

    void import("lottie-web").then((mod) => {
      if (cancelled || !container) return;
      animation = mod.default.loadAnimation({
        container,
        renderer: "svg",
        loop: true,
        autoplay: !prefersReducedMotion,
        path: src,
      });
    });

    return () => {
      cancelled = true;
      animation?.destroy();
    };
  }, [src]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className={cn("pointer-events-none select-none", className)}
    />
  );
}
