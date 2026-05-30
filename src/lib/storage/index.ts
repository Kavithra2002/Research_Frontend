import { isR2Storage } from "./config";
import type { StorageRoot } from "./config";
import * as local from "./local";
import * as r2 from "./r2";
import type { StorageFileInfo, StorageListResult } from "./types";

export type { StorageRoot, StorageFileInfo, StorageListResult };
export { isR2Storage, isSafeSegment, toStorageKey, getLocalRoot } from "./config";

export async function readBytes(
  root: StorageRoot,
  ...segments: string[]
): Promise<Uint8Array> {
  if (isR2Storage()) return r2.r2ReadBytes(root, ...segments);
  return local.localReadBytes(root, ...segments);
}

export async function readUtf8(
  root: StorageRoot,
  ...segments: string[]
): Promise<string> {
  if (isR2Storage()) return r2.r2ReadUtf8(root, ...segments);
  return local.localReadUtf8(root, ...segments);
}

export async function statFile(
  root: StorageRoot,
  ...segments: string[]
): Promise<StorageFileInfo | null> {
  if (isR2Storage()) return r2.r2Stat(root, ...segments);
  return local.localStat(root, ...segments);
}

export async function listDirectory(
  root: StorageRoot,
  ...segments: string[]
): Promise<StorageListResult> {
  if (isR2Storage()) return r2.r2List(root, ...segments);
  return local.localList(root, ...segments);
}

/** Path for Python --pdf (local absolute path, or R2 key when using backend download). */
export function resolvePdfPath(
  root: StorageRoot,
  ...segments: string[]
): string {
  if (isR2Storage()) return r2.r2ObjectKey(root, ...segments);
  return local.localAbsolutePath(root, ...segments);
}
