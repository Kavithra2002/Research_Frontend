"use client";

import * as React from "react";

import {
  hydrateWarmupSnapshot,
  installWarmupFetchPatch,
  type WarmupSnapshot,
} from "@/lib/warmup-data";

export function WarmupDataBridge({
  snapshot,
  children,
}: {
  snapshot: WarmupSnapshot;
  children: React.ReactNode;
}) {
  hydrateWarmupSnapshot(snapshot);
  installWarmupFetchPatch();
  return children;
}
