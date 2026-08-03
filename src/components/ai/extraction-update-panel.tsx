"use client";

import * as React from "react";
import {
  BookPlus,
  CheckCircle2,
  GripVertical,
  Loader2,
  Maximize2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  addNewExtractionKeyword,
  addSimilarExtractionKeyword,
  deleteExtractionKeyword,
  listExtractionKeywords,
  listSheetLineOrder,
  removeExtractionAlias,
  reorderExtractionKeyword,
  seedExtractionKeywords,
  suggestCanonicalLabels,
  type CanonicalLabelOption,
  type ExtractionKeyword,
  type ExtractionKeywordScope,
  type SheetLineItem,
} from "@/lib/extraction-keywords";

const SCOPE_OPTIONS: { value: ExtractionKeywordScope; label: string }[] = [
  { value: "fs", label: "Annual FS" },
  { value: "drivers", label: "Drivers" },
  { value: "quarterly", label: "Quarterly" },
];

type TabId = "new" | "similar";

const PENDING_KEYWORD_ID = "__pending__";

/** Match DB financial statement table section styling. */
const SECTION_ROW_CLASS =
  "bg-blue-900 text-blue-50 dark:bg-blue-950 dark:text-blue-100 border-blue-800/60 dark:border-blue-900";
const SUBSECTION_ROW_CLASS =
  "bg-sky-950/90 text-sky-200 dark:bg-sky-950 dark:text-sky-300 border-sky-800/50 dark:border-sky-900/70";

function isDataKind(kind: string): boolean {
  return kind === "data" || kind === "check";
}

function sheetLineRowClasses(
  line: SheetLineItem,
  opts?: { isPending?: boolean; isDropTarget?: boolean; isDragging?: boolean },
): string {
  const isPending = opts?.isPending ?? false;
  return cn(
    "flex items-center gap-2 border-b px-3 text-sm transition-colors",
    line.kind === "section" &&
      cn("py-2 text-xs font-bold uppercase tracking-wide", SECTION_ROW_CLASS),
    line.kind === "subsection" &&
      cn("py-1.5 text-xs font-semibold uppercase tracking-wide", SUBSECTION_ROW_CLASS),
    isDataKind(line.kind) && "py-2",
    line.source === "user" && !isPending && isDataKind(line.kind) && "bg-emerald-500/5",
    isPending && "border-l-2 border-emerald-500 bg-emerald-500/10",
    opts?.isDropTarget && "ring-2 ring-inset ring-primary/40",
    opts?.isDragging && "opacity-50",
  );
}

function lineOrderAtDropIndex(
  lines: SheetLineItem[],
  dropIndex: number,
  excludeId?: string | null,
): number {
  let dataIndex = 0;
  for (let i = 0; i < dropIndex; i++) {
    const line = lines[i];
    if (line.draggable && line.keyword_id === excludeId) continue;
    if (line.kind === "data") dataIndex += 1;
  }
  return dataIndex;
}

function mergePendingLine(
  lines: SheetLineItem[],
  pendingLabel: string,
  pendingLineOrder: number,
): SheetLineItem[] {
  const label = pendingLabel.trim();
  if (!label) return lines;

  const pending: SheetLineItem = {
    label,
    kind: "data",
    source: "user",
    keyword_id: PENDING_KEYWORD_ID,
    is_new_keyword: true,
    line_order: pendingLineOrder,
    draggable: true,
  };

  const base = lines.filter((line) => line.keyword_id !== PENDING_KEYWORD_ID);
  const dataCount = base.filter((line) => line.kind === "data").length;
  const order = Math.min(Math.max(0, pendingLineOrder), dataCount);

  const inserts = new Map<number, SheetLineItem[]>();
  const trailing: SheetLineItem[] = [];
  if (order >= dataCount) trailing.push(pending);
  else {
    inserts.set(order, [...(inserts.get(order) ?? []), pending]);
  }

  const merged: SheetLineItem[] = [];
  let dataIndex = 0;
  for (const line of base) {
    if (line.kind === "data") {
      const pendingAtIndex = inserts.get(dataIndex) ?? [];
      merged.push(...pendingAtIndex);
    }
    merged.push(line);
    if (line.kind === "data") dataIndex += 1;
  }
  merged.push(...trailing);
  return merged;
}

function isSheetTopicRow(kind: string): boolean {
  return kind === "section" || kind === "subsection";
}

function filterSheetLines(
  lines: SheetLineItem[],
  query: string,
): SheetLineItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return lines;

  const labelMatches = (label: string) => label.toLowerCase().includes(q);
  const visible = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.kind === "data" && labelMatches(line.label)) {
      visible.add(i);
      for (let j = i - 1; j >= 0; j--) {
        const kind = lines[j].kind;
        if (isSheetTopicRow(kind)) {
          visible.add(j);
          if (kind === "section") break;
        }
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.kind === "section" && labelMatches(line.label)) {
      visible.add(i);
      for (let j = i + 1; j < lines.length && lines[j].kind !== "section"; j++) {
        visible.add(j);
      }
    } else if (line.kind === "subsection" && labelMatches(line.label)) {
      visible.add(i);
      for (
        let j = i + 1;
        j < lines.length && !isSheetTopicRow(lines[j].kind);
        j++
      ) {
        visible.add(j);
      }
    }
  }

  return lines.filter((_, i) => visible.has(i));
}

export function ExtractionUpdatePanel() {
  const [tab, setTab] = React.useState<TabId>("new");
  const [scope, setScope] = React.useState<ExtractionKeywordScope>("fs");
  const [keywords, setKeywords] = React.useState<ExtractionKeyword[]>([]);
  const [sheetLines, setSheetLines] = React.useState<SheetLineItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [linesLoading, setLinesLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [pendingLabel, setPendingLabel] = React.useState("");
  const [pendingLineOrder, setPendingLineOrder] = React.useState<number | null>(
    null,
  );
  const [lineOrderDialogOpen, setLineOrderDialogOpen] = React.useState(false);

  const loadKeywords = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await seedExtractionKeywords();
      const res = await listExtractionKeywords(scope);
      setKeywords(res.keywords ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setKeywords([]);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  const loadSheetLines = React.useCallback(async () => {
    setLinesLoading(true);
    try {
      const res = await listSheetLineOrder(scope);
      setSheetLines(res.lines ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSheetLines([]);
    } finally {
      setLinesLoading(false);
    }
  }, [scope]);

  const load = React.useCallback(async () => {
    await Promise.all([loadKeywords(), loadSheetLines()]);
  }, [loadKeywords, loadSheetLines]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    setPendingLineOrder(null);
  }, [scope]);

  const flashSuccess = (msg: string) => {
    setSuccess(msg);
    window.setTimeout(() => setSuccess(null), 2500);
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookPlus className="size-4 text-muted-foreground" />
          Extraction Update
        </CardTitle>
        <CardDescription>
          Description keywords appear in the UI. Wording in report / similar
          words are what the extraction script searches for in PDFs. Keywords
          are stored in MongoDB and synced to the script.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="inline-flex flex-wrap rounded-lg border bg-muted/40 p-0.5">
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "new"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setTab("new")}
          >
            Add new keyword
          </button>
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "similar"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setTab("similar")}
          >
            Add similar word
          </button>
        </div>

        <div className="flex flex-col gap-2 max-w-md">
          <Label htmlFor="extraction-scope">Sheet scope</Label>
          <select
            id="extraction-scope"
            value={scope}
            onChange={(e) =>
              setScope(e.target.value as ExtractionKeywordScope)
            }
            className={cn(
              "flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-xs",
              "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            )}
          >
            {SCOPE_OPTIONS.map((opt) => (
              <option
                key={opt.value}
                value={opt.value}
                className="bg-background text-foreground"
              >
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            Choose which sheet the keyword belongs to, then drag it into the
            correct line position below.
          </p>
        </div>

        {tab === "new" ? (
          <AddNewKeywordForm
            scope={scope}
            lineOrder={pendingLineOrder}
            onPendingLabelChange={setPendingLabel}
            onSuccess={(msg) => {
              flashSuccess(msg);
              setPendingLabel("");
              setPendingLineOrder(null);
              void load();
            }}
            onError={setError}
          />
        ) : (
          <AddSimilarKeywordForm
            scope={scope}
            onSuccess={(msg) => {
              flashSuccess(msg);
              void load();
            }}
            onError={setError}
          />
        )}

        <SheetLineOrderPanel
          scope={scope}
          lines={
            tab === "new" && pendingLabel.trim()
              ? mergePendingLine(
                  sheetLines,
                  pendingLabel,
                  pendingLineOrder ??
                    sheetLines.filter((line) => line.kind === "data").length,
                )
              : sheetLines
          }
          loading={linesLoading}
          allowPending={tab === "new" && Boolean(pendingLabel.trim())}
          dialogOpen={lineOrderDialogOpen}
          onDialogOpenChange={setLineOrderDialogOpen}
          onReorder={async (keywordId, lineOrder) => {
            if (keywordId === PENDING_KEYWORD_ID) {
              setPendingLineOrder(lineOrder);
              return;
            }
            setError(null);
            try {
              await reorderExtractionKeyword(keywordId, lineOrder);
              flashSuccess("Keyword position updated.");
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
          onDeleteKeywords={async (ids) => {
            setError(null);
            for (const id of ids) {
              await deleteExtractionKeyword(id);
            }
            flashSuccess(
              ids.length === 1
                ? "Keyword removed from the sheet."
                : `${ids.length} keywords removed from the sheet.`,
            );
            await load();
          }}
          onError={setError}
        />

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {success ? (
          <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" />
            {success}
          </p>
        ) : null}

        <div className="border-t pt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Saved keyword updates</p>
              <p className="text-xs text-muted-foreground">
                Your additions and similar words (script search terms).
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw
                className={cn("size-3.5", loading && "animate-spin")}
              />
              Refresh
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading keywords…
            </div>
          ) : keywords.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No user keyword updates for{" "}
              {SCOPE_OPTIONS.find((opt) => opt.value === scope)?.label ?? scope}{" "}
              yet.
            </p>
          ) : (
            <ScrollArea className="h-72 rounded-md border">
              <div className="divide-y p-2">
                {keywords.map((kw) => (
                  <KeywordRow
                    key={kw._id}
                    keyword={kw}
                    onRemoveAlias={async (alias) => {
                      await removeExtractionAlias(kw._id, alias);
                      flashSuccess(`Removed "${alias}".`);
                      void load();
                    }}
                    onDeleteAll={async () => {
                      await deleteExtractionKeyword(kw._id);
                      flashSuccess("All updates removed for this keyword.");
                      void load();
                    }}
                    onError={setError}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SheetLineOrderPanel({
  scope,
  lines,
  loading,
  allowPending,
  dialogOpen,
  onDialogOpenChange,
  onReorder,
  onDeleteKeywords,
  onError,
}: {
  scope: ExtractionKeywordScope;
  lines: SheetLineItem[];
  loading: boolean;
  allowPending: boolean;
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  onReorder: (keywordId: string, lineOrder: number) => Promise<void>;
  onDeleteKeywords: (ids: string[]) => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [deleteMode, setDeleteMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const scopeLabel =
    SCOPE_OPTIONS.find((opt) => opt.value === scope)?.label ?? scope;

  const isFiltering = Boolean(searchQuery.trim());
  const filteredLines = React.useMemo(
    () => filterSheetLines(lines, searchQuery),
    [lines, searchQuery],
  );

  const selectedLines = React.useMemo(() => {
    const seen = new Set<string>();
    return lines.filter((line) => {
      if (!line.keyword_id || !selectedIds.has(line.keyword_id)) return false;
      if (seen.has(line.keyword_id)) return false;
      seen.add(line.keyword_id);
      return true;
    });
  }, [lines, selectedIds]);

  const deletableLines = lines.filter(
    (line) =>
      line.draggable &&
      line.keyword_id &&
      line.keyword_id !== PENDING_KEYWORD_ID &&
      line.is_new_keyword,
  );

  React.useEffect(() => {
    setDeleteMode(false);
    setSelectedIds(new Set());
    setConfirmOpen(false);
    setSearchQuery("");
  }, [scope]);

  const searchInput = (
    <div className="relative w-full min-w-[220px] max-w-md">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search description keywords…"
        className="h-8 pl-8 pr-8"
        aria-label="Search description keywords"
      />
      {searchQuery ? (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
          onClick={() => setSearchQuery("")}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirmDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setDeleting(true);
    onError(null);
    try {
      await onDeleteKeywords(ids);
      setConfirmOpen(false);
      setDeleteMode(false);
      setSelectedIds(new Set());
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  const tableProps = {
    lines: filteredLines,
    loading,
    allowPending,
    deleteMode,
    selectedIds,
    searchQuery,
    isFiltering,
    onToggleSelect: toggleSelect,
    onReorder,
    onError,
  };

  return (
    <>
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Sheet line order ({scopeLabel})</p>
            <p className="text-xs text-muted-foreground">
              Topic rows use the same blue highlight as the DB table. Drag new
              keywords to set their line position.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {deleteMode ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDeleteMode(false);
                    setSelectedIds(new Set());
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  disabled={selectedIds.size === 0}
                  onClick={() => setConfirmOpen(true)}
                >
                  <Trash2 className="size-3.5" />
                  Delete selected ({selectedIds.size})
                </Button>
              </>
            ) : (
              <>
                {deletableLines.length > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setDeleteMode(true)}
                  >
                    <Trash2 className="size-3.5" />
                    Delete line items
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={loading}
                  onClick={() => onDialogOpenChange(true)}
                >
                  <Maximize2 className="size-3.5" />
                  Maximize
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {searchInput}
          {isFiltering ? (
            <p className="text-[11px] text-muted-foreground">
              {filteredLines.length} of {lines.length} rows shown
            </p>
          ) : null}
        </div>

        <SheetLineOrderTable {...tableProps} maxHeightClass="h-64" />
      </div>

      <Dialog open={dialogOpen} onOpenChange={onDialogOpenChange}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>Sheet line order — {scopeLabel}</DialogTitle>
            <DialogDescription>
              Drag new keywords to reposition them. Blue rows are statement
              topics (Income statement, Balance sheet, etc.) matching the DB
              view.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden px-4 py-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                {searchInput}
                {isFiltering ? (
                  <p className="text-[11px] text-muted-foreground">
                    {filteredLines.length} of {lines.length} rows shown
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
              {deleteMode ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDeleteMode(false);
                      setSelectedIds(new Set());
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="gap-1.5"
                    disabled={selectedIds.size === 0}
                    onClick={() => setConfirmOpen(true)}
                  >
                    <Trash2 className="size-3.5" />
                    Delete selected ({selectedIds.size})
                  </Button>
                </>
              ) : deletableLines.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setDeleteMode(true)}
                >
                  <Trash2 className="size-3.5" />
                  Delete line items
                </Button>
              ) : null}
              </div>
            </div>
            <SheetLineOrderTable {...tableProps} maxHeightClass="h-[60vh]" />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove description keywords?</DialogTitle>
            <DialogDescription>
              {selectedIds.size === 1
                ? "This will permanently remove the selected keyword and its sheet row position. The extraction script will be updated for the next run."
                : `This will permanently remove ${selectedIds.size} keywords and their sheet row positions. The extraction script will be updated for the next run.`}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-40 rounded-md border">
            <ul className="divide-y p-2 text-sm">
              {selectedLines.map((line) => (
                <li key={line.keyword_id!} className="py-1.5">
                  {line.label}
                </li>
              ))}
            </ul>
          </ScrollArea>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting || selectedIds.size === 0}
              className="gap-1.5"
              onClick={() => void handleConfirmDelete()}
            >
              {deleting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              Confirm delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SheetLineOrderTable({
  lines,
  loading,
  allowPending,
  deleteMode,
  selectedIds,
  searchQuery,
  isFiltering,
  onToggleSelect,
  onReorder,
  onError,
  maxHeightClass,
}: {
  lines: SheetLineItem[];
  loading: boolean;
  allowPending: boolean;
  deleteMode: boolean;
  selectedIds: Set<string>;
  searchQuery: string;
  isFiltering: boolean;
  onToggleSelect: (id: string) => void;
  onReorder: (keywordId: string, lineOrder: number) => Promise<void>;
  onError: (msg: string | null) => void;
  maxHeightClass: string;
}) {
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dropIndex, setDropIndex] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const dragDisabled = deleteMode || isFiltering;

  const handleDrop = async (index: number) => {
    if (!draggingId || dragDisabled) return;
    const lineOrder = lineOrderAtDropIndex(lines, index, draggingId);
    setSaving(true);
    onError(null);
    try {
      await onReorder(draggingId, lineOrder);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
      setDraggingId(null);
      setDropIndex(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading sheet lines…
      </div>
    );
  }

  return (
    <>
      <ScrollArea
        className={cn("rounded-md border bg-background", maxHeightClass)}
      >
        <div>
          <div
            className={cn(
              "sticky top-0 z-10 grid border-b bg-muted/80 text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur-sm",
              deleteMode ? "grid-cols-[auto_auto_1fr_auto]" : "grid-cols-[auto_1fr_auto]",
            )}
          >
            {deleteMode ? <div className="px-2 py-2" /> : null}
            <div className="px-2 py-2" />
            <div className="px-2 py-2">Description</div>
            <div className="px-2 py-2" />
          </div>

          {lines.length === 0 && isFiltering ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No line items match &ldquo;{searchQuery.trim()}&rdquo;
            </div>
          ) : null}

          {lines.map((line, index) => {
            const isDragging = draggingId === line.keyword_id;
            const isDropTarget = dropIndex === index && draggingId !== null;
            const isPending = line.keyword_id === PENDING_KEYWORD_ID;
            const canDelete =
              deleteMode &&
              line.draggable &&
              line.keyword_id &&
              line.keyword_id !== PENDING_KEYWORD_ID &&
              line.is_new_keyword;
            const isSectionLike =
              line.kind === "section" || line.kind === "subsection";

            return (
              <div
                key={`${line.keyword_id ?? "builtin"}-${line.label}-${index}`}
                className={sheetLineRowClasses(line, {
                  isPending,
                  isDropTarget,
                  isDragging,
                })}
                onDragOver={(e) => {
                  if (!draggingId || dragDisabled) return;
                  e.preventDefault();
                  setDropIndex(index);
                }}
                onDragLeave={() => {
                  if (dropIndex === index) setDropIndex(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  void handleDrop(index);
                }}
              >
                {canDelete ? (
                  <Checkbox
                    checked={selectedIds.has(line.keyword_id!)}
                    onCheckedChange={() => onToggleSelect(line.keyword_id!)}
                    aria-label={`Select ${line.label} for deletion`}
                  />
                ) : deleteMode ? (
                  <span className="size-4 shrink-0" />
                ) : null}

                {line.draggable && !dragDisabled ? (
                  <button
                    type="button"
                    draggable={!saving}
                    className="cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing disabled:opacity-50"
                    disabled={saving}
                    aria-label={`Drag ${line.label}`}
                    onDragStart={(e) => {
                      if (!line.keyword_id) return;
                      setDraggingId(line.keyword_id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDropIndex(null);
                    }}
                  >
                    <GripVertical className="size-3.5" />
                  </button>
                ) : (
                  <span className="size-4 shrink-0" />
                )}

                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    isSectionLike
                      ? "font-semibold"
                      : isDataKind(line.kind)
                        ? "text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {line.label}
                </span>

                {isPending ? (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    New (unsaved)
                  </Badge>
                ) : line.source === "user" ? (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    New keyword
                  </Badge>
                ) : null}
              </div>
            );
          })}

          {!isFiltering ? (
            <div
              className={cn(
                "px-3 py-2 text-xs text-muted-foreground",
                dropIndex === lines.length &&
                  draggingId &&
                  "bg-primary/5 ring-2 ring-inset ring-primary/40",
              )}
              onDragOver={(e) => {
                if (!draggingId || dragDisabled) return;
                e.preventDefault();
                setDropIndex(lines.length);
              }}
              onDrop={(e) => {
                e.preventDefault();
                void handleDrop(lines.length);
              }}
            >
              Drop here to place at the end of the sheet
            </div>
          ) : null}
        </div>
      </ScrollArea>

      {allowPending ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          The highlighted row is your unsaved keyword. Drag it to set where it
          will be inserted, then click Add keyword.
        </p>
      ) : deleteMode ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Search to find a line item, select it, then confirm deletion.
        </p>
      ) : isFiltering ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Clear search to drag and reposition keywords in the full sheet.
        </p>
      ) : null}
    </>
  );
}

function KeywordRow({
  keyword,
  onRemoveAlias,
  onDeleteAll,
  onError,
}: {
  keyword: ExtractionKeyword;
  onRemoveAlias: (alias: string) => Promise<void>;
  onDeleteAll: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [removingAlias, setRemovingAlias] = React.useState<string | null>(null);
  const [deletingAll, setDeletingAll] = React.useState(false);

  const userAliases = keyword.user_aliases ?? [];
  const hasUserAliases = userAliases.length > 0;

  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{keyword.canonical_label}</span>
          <Badge variant="outline" className="text-[10px] uppercase">
            {keyword.scope}
          </Badge>
          {keyword.is_new_keyword ? (
            <Badge variant="secondary" className="text-[10px]">
              New keyword
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">
              Similar words
            </Badge>
          )}
        </div>

        {hasUserAliases ? (
          <div className="mt-2">
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
              Script search terms you added
            </p>
            <div className="flex flex-wrap gap-1.5">
              {userAliases.map((alias) => (
                <span
                  key={alias}
                  className="inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/50 px-2 py-0.5 text-xs text-foreground"
                >
                  <span className="truncate">{alias}</span>
                  <button
                    type="button"
                    className="shrink-0 rounded-sm text-muted-foreground hover:text-destructive disabled:opacity-50"
                    disabled={removingAlias !== null || deletingAll}
                    aria-label={`Remove ${alias}`}
                    onClick={() => {
                      onError(null);
                      setRemovingAlias(alias);
                      void onRemoveAlias(alias)
                        .catch((err) =>
                          onError(
                            err instanceof Error ? err.message : String(err),
                          ),
                        )
                        .finally(() => setRemovingAlias(null));
                    }}
                  >
                    {removingAlias === alias ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <X className="size-3" />
                    )}
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            No script search terms saved yet.
          </p>
        )}
      </div>

      {hasUserAliases ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={deletingAll || removingAlias !== null}
          title="Remove all updates for this keyword"
          onClick={() => {
            onError(null);
            setDeletingAll(true);
            void onDeleteAll()
              .catch((err) =>
                onError(err instanceof Error ? err.message : String(err)),
              )
              .finally(() => setDeletingAll(false));
          }}
        >
          {deletingAll ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
        </Button>
      ) : null}
    </div>
  );
}

function AddNewKeywordForm({
  scope,
  lineOrder,
  onPendingLabelChange,
  onSuccess,
  onError,
}: {
  scope: ExtractionKeywordScope;
  lineOrder: number | null;
  onPendingLabelChange: (label: string) => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string | null) => void;
}) {
  const [canonicalLabel, setCanonicalLabel] = React.useState("");
  const [alias, setAlias] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    onPendingLabelChange(canonicalLabel);
  }, [canonicalLabel, onPendingLabelChange]);

  React.useEffect(() => {
    setCanonicalLabel("");
    setAlias("");
    onPendingLabelChange("");
  }, [scope, onPendingLabelChange]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    onError(null);
    setSaving(true);
    try {
      await addNewExtractionKeyword({
        canonical_label: canonicalLabel,
        alias,
        scope,
        line_order: lineOrder,
      });
      setCanonicalLabel("");
      setAlias("");
      onPendingLabelChange("");
      onSuccess("New keyword added and script sync started.");
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Add a new line item for the UI. The{" "}
        <strong className="font-medium text-foreground">Wording in report</strong>{" "}
        is the text the script searches for inside annual reports. After typing
        the description, drag the highlighted row in the sheet line order panel
        to choose its position.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-canonical">Description keyword (UI)</Label>
          <Input
            id="new-canonical"
            value={canonicalLabel}
            onChange={(e) => setCanonicalLabel(e.target.value)}
            placeholder="e.g. Digital banking income"
          />
          <p className="text-[11px] text-muted-foreground">
            Shown in DB / FS views.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-alias">Wording in report (script search)</Label>
          <Input
            id="new-alias"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="e.g. income from digital channels"
          />
          <p className="text-[11px] text-muted-foreground">
            Text to match in PDF tables.
          </p>
        </div>
      </div>
      <Button type="submit" size="sm" className="w-fit gap-1.5" disabled={saving}>
        {saving ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Plus className="size-3.5" />
        )}
        Add keyword
      </Button>
    </form>
  );
}

function AddSimilarKeywordForm({
  scope,
  onSuccess,
  onError,
}: {
  scope: ExtractionKeywordScope;
  onSuccess: (msg: string) => void;
  onError: (msg: string | null) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<CanonicalLabelOption | null>(
    null,
  );
  const [suggestions, setSuggestions] = React.useState<CanonicalLabelOption[]>(
    [],
  );
  const [suggestLoading, setSuggestLoading] = React.useState(false);
  const [similarWord, setSimilarWord] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const suggestRef = React.useRef<HTMLDivElement>(null);

  const fetchSuggestions = React.useCallback(
    async (q: string) => {
      setSuggestLoading(true);
      try {
        const res = await suggestCanonicalLabels(q, scope);
        setSuggestions(res.options ?? []);
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestLoading(false);
      }
    },
    [scope],
  );

  React.useEffect(() => {
    if (!showSuggestions) return;
    const handle = window.setTimeout(() => {
      void fetchSuggestions(query);
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query, showSuggestions, fetchSuggestions]);

  React.useEffect(() => {
    setSelected(null);
    setQuery("");
    setSimilarWord("");
    setSuggestions([]);
  }, [scope]);

  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!suggestRef.current?.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) {
      onError("Select an existing keyword first.");
      return;
    }
    onError(null);
    setSaving(true);
    try {
      await addSimilarExtractionKeyword({
        canonical_label: selected.label,
        similar_word: similarWord,
        scope,
      });
      setSimilarWord("");
      setShowSuggestions(false);
      onSuccess(
        `Similar word added to "${selected.label}" and script sync started.`,
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Search existing description keywords from the database, select one, then
        add another <strong className="font-medium text-foreground">report wording</strong> the
        script should also search for.
      </p>

      <div ref={suggestRef} className="relative flex max-w-lg flex-col gap-2">
        <Label htmlFor="existing-keyword">Existing keyword (from DB)</Label>
        <div className="relative">
          <Input
            id="existing-keyword"
            value={selected ? selected.label : query}
            onChange={(e) => {
              setSelected(null);
              setQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => {
              setShowSuggestions(true);
              void fetchSuggestions(query);
            }}
            placeholder="Type to search e.g. net interest…"
            autoComplete="off"
          />
          {selected ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSelected(null);
                setQuery("");
                setShowSuggestions(true);
              }}
            >
              Clear
            </button>
          ) : null}
        </div>

        {showSuggestions && !selected ? (
          <div className="absolute top-full z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
            {suggestLoading ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Searching keyword catalog…
              </div>
            ) : suggestions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                No matching keywords in database.
              </p>
            ) : (
              suggestions.map((opt) => (
                <button
                  key={`${opt.scope}-${opt.label}`}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 border-b border-border/50 px-3 py-2 text-left text-sm text-foreground last:border-0 hover:bg-muted"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSelected(opt);
                    setQuery(opt.label);
                    setShowSuggestions(false);
                  }}
                >
                  <span className="min-w-0 flex flex-col">
                    <span className="truncate">{opt.label}</span>
                    {opt.matched_alias ? (
                      <span className="truncate text-[11px] text-muted-foreground">
                        matches similar word: {opt.matched_alias}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {opt.source}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {opt.alias_count} terms
                    </Badge>
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      {selected ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="size-3.5" />
          Selected: <span className="font-medium text-foreground">{selected.label}</span>
        </p>
      ) : null}

      <div className="flex max-w-lg flex-col gap-2">
        <Label htmlFor="similar-word">Similar word (script search)</Label>
        <Input
          id="similar-word"
          value={similarWord}
          onChange={(e) => setSimilarWord(e.target.value)}
          placeholder="e.g. interest revenue"
          disabled={!selected}
        />
        <p className="text-[11px] text-muted-foreground">
          Extra wording to search in reports for the selected keyword.
        </p>
      </div>

      <Button
        type="submit"
        size="sm"
        className="w-fit gap-1.5"
        disabled={saving || !selected || !similarWord.trim()}
      >
        {saving ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Plus className="size-3.5" />
        )}
        Add similar word
      </Button>
    </form>
  );
}
