import path from "node:path";

export {
  buildDemoPdfViewerUrl,
  demoPdfRelPathFromSource,
} from "@/lib/demo-data-client";

/** Resolve `<backend>/Demo_Data` (same convention as demo reports API). */
export function getDemoDataRoot(): string {
  const scriptRoot =
    process.env.SCRIPT_ROOT?.trim() ||
    path.resolve(process.cwd(), "..", "backend");
  const fromEnv = process.env.DEMO_DATA_DIR?.trim();
  return fromEnv ? path.resolve(fromEnv) : path.join(scriptRoot, "Demo_Data");
}

export function resolveDemoPdfAbsPath(relPath: string): string | null {
  const rel = relPath.trim().replace(/\\/g, "/");
  if (!rel || rel.includes("..")) return null;
  if (!rel.toLowerCase().endsWith(".pdf")) return null;

  const root = path.resolve(getDemoDataRoot());
  const abs = path.resolve(root, rel);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!abs.startsWith(rootPrefix) && abs !== root) return null;
  return abs;
}
