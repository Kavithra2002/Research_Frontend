import fs from "node:fs/promises";
import path from "node:path";

import { getLocalRoot, type StorageRoot } from "./config";
import type { StorageFileInfo, StorageListResult } from "./types";

function resolveUnderRoot(root: StorageRoot, ...segments: string[]): string {
  const base = getLocalRoot(root);
  const full = path.resolve(base, ...segments);
  if (
    !full.startsWith(base + path.sep) &&
    full !== base
  ) {
    throw new Error("Path traversal detected");
  }
  return full;
}

export async function localReadBytes(
  root: StorageRoot,
  ...segments: string[]
): Promise<Uint8Array> {
  const full = resolveUnderRoot(root, ...segments);
  const data = await fs.readFile(full);
  return new Uint8Array(data);
}

export async function localReadUtf8(
  root: StorageRoot,
  ...segments: string[]
): Promise<string> {
  const full = resolveUnderRoot(root, ...segments);
  return fs.readFile(full, "utf8");
}

export async function localStat(
  root: StorageRoot,
  ...segments: string[]
): Promise<StorageFileInfo | null> {
  const full = resolveUnderRoot(root, ...segments);
  try {
    const stat = await fs.stat(full);
    if (!stat.isFile()) return null;
    return {
      name: segments[segments.length - 1] ?? "",
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

export async function localList(
  root: StorageRoot,
  ...segments: string[]
): Promise<StorageListResult> {
  const dir = resolveUnderRoot(root, ...segments);
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return { directories: [], files: [] };
  }

  const directories: string[] = [];
  const files: StorageFileInfo[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      directories.push(entry.name);
      continue;
    }
    if (!entry.isFile()) continue;
    const stat = await fs
      .stat(path.join(dir, entry.name))
      .catch(() => null);
    if (!stat) continue;
    files.push({
      name: entry.name,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    });
  }

  directories.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
  files.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  return { directories, files };
}

export function localAbsolutePath(
  root: StorageRoot,
  ...segments: string[]
): string {
  return resolveUnderRoot(root, ...segments);
}

export async function localDeleteFile(
  root: StorageRoot,
  ...segments: string[]
): Promise<boolean> {
  const full = resolveUnderRoot(root, ...segments);
  try {
    await fs.unlink(full);
    return true;
  } catch {
    return false;
  }
}
