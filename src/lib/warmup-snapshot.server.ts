import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getWarmupSnapshot,
  hydrateWarmupSnapshot,
  type WarmupSnapshot,
} from "@/lib/warmup-data";

export const WARMUP_SNAPSHOT_PATH = join(
  process.cwd(),
  ".next",
  "warmup-snapshot.json",
);

export function readWarmupSnapshotFile(): WarmupSnapshot {
  try {
    const raw = readFileSync(WARMUP_SNAPSHOT_PATH, "utf8");
    const parsed = JSON.parse(raw) as WarmupSnapshot;
    if (parsed && typeof parsed === "object") {
      hydrateWarmupSnapshot(parsed);
      return getWarmupSnapshot();
    }
  } catch {
    // file missing until warmup finishes
  }
  return getWarmupSnapshot();
}
