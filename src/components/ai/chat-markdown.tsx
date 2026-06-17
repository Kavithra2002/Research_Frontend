"use client";

import * as React from "react";
import { Maximize2, Table2 } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ChartBlock, toChartSpec, type ChartSpec } from "@/components/ai/chart-block";

/* ────────────────────────────────────────────────────────────────────────── *
 * Renders an assistant message. Plain prose is shown as text; any GitHub-style
 * Markdown table is replaced with a collapsed "View table" chip that expands
 * into a real, scrollable table when the user clicks it. A ```chart fenced
 * block (JSON spec) is rendered as an actual chart (bar/line/area/pie/donut).
 * ────────────────────────────────────────────────────────────────────────── */

type Segment =
  | { kind: "text"; text: string }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "chart"; spec: ChartSpec };

const CHART_FENCE_RE = /^\s*```\s*chart\s*$/i;
const FENCE_CLOSE_RE = /^\s*```\s*$/;

const SEPARATOR_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

function parseChartJson(raw: string): ChartSpec | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    return toChartSpec(JSON.parse(text));
  } catch {
    return null;
  }
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function looksLikeRow(line: string): boolean {
  return line.includes("|") && line.trim().length > 0;
}

export function parseSegments(content: string): Segment[] {
  const lines = content.split("\n");
  const segments: Segment[] = [];
  let buffer: string[] = [];

  const flushText = () => {
    if (buffer.length) {
      const text = buffer.join("\n").trim();
      if (text) segments.push({ kind: "text", text });
      buffer = [];
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1];

    // ```chart fenced block → real chart
    if (CHART_FENCE_RE.test(line)) {
      const jsonLines: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j += 1) {
        if (FENCE_CLOSE_RE.test(lines[j])) break;
        jsonLines.push(lines[j]);
      }
      const spec = parseChartJson(jsonLines.join("\n"));
      if (spec) {
        flushText();
        segments.push({ kind: "chart", spec });
        i = j; // skip past the closing fence
        continue;
      }
      // Not a valid chart spec — fall through and treat as plain text.
    }

    const isHeader = looksLikeRow(line);
    const hasSeparator = next !== undefined && SEPARATOR_RE.test(next) && next.includes("-");

    if (isHeader && hasSeparator) {
      flushText();
      const headers = splitRow(line);
      const rows: string[][] = [];
      let j = i + 2;
      for (; j < lines.length; j += 1) {
        if (!looksLikeRow(lines[j])) break;
        const cells = splitRow(lines[j]);
        // pad/truncate to header width
        while (cells.length < headers.length) cells.push("");
        rows.push(cells.slice(0, headers.length));
      }
      segments.push({ kind: "table", headers, rows });
      i = j - 1;
    } else {
      buffer.push(line);
    }
  }
  flushText();
  return segments;
}

/* Inline rendering (no dangerouslySetInnerHTML): **bold**, *italic*, `code`, [links](url). */
const LINK_RE = /^\[([^\]]+)\]\(([^)]+)\)$/;

function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  try {
    const url = new URL(href);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function InlineText({ text }: { text: string }) {
  const parts = text.split(
    /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*|\[[^\]]+\]\([^)]+\))/g,
  );
  return (
    <>
      {parts.map((part, idx) => {
        const link = LINK_RE.exec(part);
        if (link) {
          const href = safeHref(link[2]);
          if (href) {
            return (
              <a
                key={idx}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-emerald-600 underline underline-offset-2 hover:text-emerald-500 dark:text-emerald-400"
              >
                {link[1]}
              </a>
            );
          }
          return (
            <span key={idx} className="text-muted-foreground">
              {link[1]} ({link[2]})
            </span>
          );
        }
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={idx} className="font-semibold text-foreground">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={idx}
              className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        if (
          part.length > 2 &&
          part.startsWith("*") &&
          part.endsWith("*") &&
          !part.startsWith("**")
        ) {
          return (
            <em key={idx} className="italic">
              {part.slice(1, -1)}
            </em>
          );
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      })}
    </>
  );
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BULLET_RE = /^\s*[-*•]\s+(.*)$/;
const NUM_RE = /^\s*(\d+)[.)]\s+(.*)$/;
// A list marker alone on its own line, e.g. "1." or "2)" with no text after it.
// Some models emit the number on one line and the item text on the next; we
// still want these grouped into a single, correctly-numbered list item.
const NUM_MARKER_ONLY_RE = /^\s*(\d+)[.)]\s*$/;

/**
 * Render an assistant text block with friendly formatting: headings become bold
 * lines (the raw # marks are never shown), bullet/numbered lists render as real
 * lists, and inline **bold** / *italic* / `code` are styled. Everything else is
 * a normal paragraph.
 */
function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (line === "") {
      i += 1;
      continue;
    }

    // Heading → bold line (no visible # marks)
    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        <p
          key={key++}
          className={cn(
            "font-semibold text-foreground",
            level <= 2 ? "mt-1 text-[0.95rem]" : "text-sm",
          )}
        >
          <InlineText text={heading[2]} />
        </p>,
      );
      i += 1;
      continue;
    }

    // Bullet list (tolerate blank lines between items so they stay one list)
    if (BULLET_RE.test(lines[i])) {
      const items: string[] = [];
      while (i < lines.length) {
        if (BULLET_RE.test(lines[i])) {
          items.push(BULLET_RE.exec(lines[i])![1]);
          i += 1;
          continue;
        }
        if (lines[i].trim() === "") {
          let j = i + 1;
          while (j < lines.length && lines[j].trim() === "") j += 1;
          if (j < lines.length && BULLET_RE.test(lines[j])) {
            i = j;
            continue;
          }
        }
        break;
      }
      blocks.push(
        <ul key={key++} className="my-0.5 flex flex-col gap-1 text-sm">
          {items.map((it, idx) => (
            <li key={idx} className="flex gap-2 leading-relaxed">
              <span
                aria-hidden
                className="mt-[0.5em] size-1.5 shrink-0 rounded-full bg-emerald-500/70"
              />
              <span className="min-w-0 flex-1">
                <InlineText text={it} />
              </span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Numbered list. Handles the shapes the models actually produce:
    //   "1. text"        → marker + inline text
    //   "1." (own line)  → bare marker; the item text is on the following line(s)
    //   a marker followed by nested "- " bullet sub-points (kept INSIDE the item)
    // Item text and each bullet run until a blank line or the next marker
    // (markdown-style lazy continuation). Numbers are always rendered sequentially
    // (1, 2, 3 …), so a stream of "1." — or numbers split by nested bullets — still
    // displays correctly instead of restarting at 1 for every point.
    if (NUM_RE.test(lines[i]) || NUM_MARKER_ONLY_RE.test(lines[i])) {
      const items: { text: string; bullets: string[] }[] = [];
      while (i < lines.length) {
        const inline = NUM_RE.exec(lines[i]);
        const bare = NUM_MARKER_ONLY_RE.test(lines[i]);
        if (inline || bare) {
          const parts: string[] = [];
          if (inline) parts.push(inline[2]);
          i += 1;
          while (
            i < lines.length &&
            lines[i].trim() !== "" &&
            !NUM_RE.test(lines[i]) &&
            !NUM_MARKER_ONLY_RE.test(lines[i]) &&
            !BULLET_RE.test(lines[i])
          ) {
            parts.push(lines[i].trim());
            i += 1;
          }
          const text = parts.join(" ").trim();

          // Absorb any nested bullet sub-points belonging to this number.
          const bullets: string[] = [];
          while (i < lines.length) {
            if (BULLET_RE.test(lines[i])) {
              const bParts: string[] = [BULLET_RE.exec(lines[i])![1]];
              i += 1;
              while (
                i < lines.length &&
                lines[i].trim() !== "" &&
                !BULLET_RE.test(lines[i]) &&
                !NUM_RE.test(lines[i]) &&
                !NUM_MARKER_ONLY_RE.test(lines[i])
              ) {
                bParts.push(lines[i].trim());
                i += 1;
              }
              const bText = bParts.join(" ").trim();
              if (bText) bullets.push(bText);
              continue;
            }
            if (lines[i].trim() === "") {
              let j = i + 1;
              while (j < lines.length && lines[j].trim() === "") j += 1;
              if (j < lines.length && BULLET_RE.test(lines[j])) {
                i = j;
                continue;
              }
            }
            break;
          }

          if (text || bullets.length) items.push({ text, bullets });
          continue;
        }
        if (lines[i].trim() === "") {
          let j = i + 1;
          while (j < lines.length && lines[j].trim() === "") j += 1;
          if (
            j < lines.length &&
            (NUM_RE.test(lines[j]) || NUM_MARKER_ONLY_RE.test(lines[j]))
          ) {
            i = j;
            continue;
          }
        }
        break;
      }
      blocks.push(
        <ol key={key++} className="my-0.5 flex flex-col gap-1.5 text-sm">
          {items.map((it, idx) => (
            <li key={idx} className="flex flex-col gap-1">
              <div className="flex gap-2 leading-relaxed">
                <span className="shrink-0 font-semibold text-emerald-600 dark:text-emerald-400">
                  {idx + 1}.
                </span>
                <span className="min-w-0 flex-1">
                  <InlineText text={it.text} />
                </span>
              </div>
              {it.bullets.length > 0 && (
                <ul className="ml-6 flex flex-col gap-1">
                  {it.bullets.map((b, bi) => (
                    <li key={bi} className="flex gap-2 leading-relaxed">
                      <span
                        aria-hidden
                        className="mt-[0.5em] size-1.5 shrink-0 rounded-full bg-emerald-500/70"
                      />
                      <span className="min-w-0 flex-1">
                        <InlineText text={b} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // Paragraph (gather consecutive plain lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !HEADING_RE.test(lines[i].trim()) &&
      !BULLET_RE.test(lines[i]) &&
      !NUM_RE.test(lines[i]) &&
      !NUM_MARKER_ONLY_RE.test(lines[i])
    ) {
      paraLines.push(lines[i].trim());
      i += 1;
    }
    blocks.push(
      <p key={key++} className="text-sm leading-relaxed">
        <InlineText text={paraLines.join(" ")} />
      </p>,
    );
  }

  return <div className="flex flex-col gap-1.5">{blocks}</div>;
}

function TableBlock({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="my-1 flex w-full items-center gap-2 rounded-lg border bg-background/60 px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:border-emerald-500/40 hover:bg-muted/60"
      >
        <Table2 className="size-3.5 text-emerald-500" />
        <span className="flex-1">
          View table
          <span className="ml-1 font-normal text-muted-foreground">
            · {headers.length} cols × {rows.length} rows
          </span>
        </span>
        <Maximize2 className="size-3.5 text-muted-foreground" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] w-full flex-col gap-3 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Table2 className="size-4 text-emerald-500" />
              Table
            </DialogTitle>
            <DialogDescription>
              {headers.length} columns × {rows.length} rows
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  {headers.map((h, i) => (
                    <TableHead key={i} className="whitespace-nowrap">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, ri) => (
                  <TableRow key={ri}>
                    {row.map((cell, ci) => (
                      <TableCell
                        key={ci}
                        className={cn(
                          "whitespace-nowrap text-xs",
                          ci === 0 && "font-medium",
                        )}
                      >
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AssistantContent({ content }: { content: string }) {
  const segments = React.useMemo(() => parseSegments(content), [content]);
  return (
    <div className="flex flex-col gap-1.5">
      {segments.map((seg, idx) => {
        if (seg.kind === "text") return <MarkdownText key={idx} text={seg.text} />;
        if (seg.kind === "chart") return <ChartBlock key={idx} spec={seg.spec} />;
        return <TableBlock key={idx} headers={seg.headers} rows={seg.rows} />;
      })}
    </div>
  );
}
