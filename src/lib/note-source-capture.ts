import {
  buildDemoPdfViewerUrl,
  demoPdfRelPathFromSource,
} from "@/lib/demo-data";
import type { DbGridRow } from "@/lib/newspaper-db";

type NoteSourceMeta = NonNullable<DbGridRow["note_source_by_year"]>[string];

type CaptureImage = { name: string; url: string };
type CaptureStatement = { key: string; images?: CaptureImage[] };

function capturePageFileName(page: number): string {
  return `page_${String(page).padStart(4, "0")}.png`;
}

function findCaptureUrls(
  statements: CaptureStatement[],
  fileNames: string[],
  statementKey?: string,
): string[] {
  const urls: string[] = [];
  for (const fileName of fileNames) {
    const url = findCaptureUrl(statements, fileName, statementKey);
    if (url) urls.push(url);
  }
  return urls;
}

function findCaptureUrl(
  statements: CaptureStatement[],
  pageFile: string,
  statementKey?: string,
): string | null {
  if (statementKey) {
    const preferred = statements.find((stmt) => stmt.key === statementKey);
    const match = preferred?.images?.find((img) => img.name === pageFile);
    if (match?.url) return match.url;
  }

  for (const stmt of statements) {
    const match = stmt.images?.find((img) => img.name === pageFile);
    if (match?.url) return match.url;
  }

  return null;
}

function openSourceUrl(url: string): { ok: true } {
  window.open(url, "_blank", "noopener,noreferrer");
  return { ok: true };
}

function openSourcePdf(source: NoteSourceMeta): { ok: true } | { ok: false; error: string } {
  const relPath = source.source_pdf
    ? demoPdfRelPathFromSource(source.source_pdf)
    : null;

  if (!relPath) {
    return {
      ok: false,
      error: "The stored report PDF path is not available under Demo_Data.",
    };
  }

  return openSourceUrl(buildDemoPdfViewerUrl(relPath, source.source_page));
}

function captureFileNames(source: NoteSourceMeta): string[] {
  const files = source.capture_files?.filter(Boolean) ?? [];
  if (files.length > 0) return files;
  if (source.source_page != null && Number.isFinite(source.source_page)) {
    return [capturePageFileName(source.source_page)];
  }
  return [];
}

async function fetchCaptureStatements(
  company: string,
  year: string,
): Promise<CaptureStatement[]> {
  const params = new URLSearchParams({
    company,
    period: "annual",
    year,
  });

  const res = await fetch(`/api/extracted/captures?${params.toString()}`, {
    cache: "no-store",
  });
  const json = (await res.json()) as {
    error?: string;
    statements?: CaptureStatement[];
  };

  if (!res.ok) {
    return [];
  }
  return json.statements ?? [];
}

/** Resolve capture image URLs for inline display (dialog), newest segment crops first. */
export async function resolveNoteCaptureUrls(options: {
  company: string;
  year: string;
  source: NoteSourceMeta;
}): Promise<string[]> {
  const fileNames = captureFileNames(options.source);
  if (fileNames.length === 0) {
    return [];
  }

  try {
    const statements = await fetchCaptureStatements(options.company, options.year);
    return findCaptureUrls(
      statements,
      fileNames,
      options.source.statement_key,
    );
  } catch {
    return [];
  }
}

/** Resolve a single capture image URL (first segment / legacy page capture). */
export async function resolveNoteCaptureUrl(options: {
  company: string;
  year: string;
  source: NoteSourceMeta;
}): Promise<string | null> {
  const urls = await resolveNoteCaptureUrls(options);
  return urls[0] ?? null;
}

/** Open the note source as a page capture image, or fall back to the report PDF. */
export async function openNoteSourceCapture(options: {
  company: string;
  year: string;
  source: NoteSourceMeta;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const captureUrl = await resolveNoteCaptureUrl(options);
  if (captureUrl) {
    return openSourceUrl(captureUrl);
  }

  return openSourcePdf(options.source);
}

export type { NoteSourceMeta };
