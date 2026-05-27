"use client";

import * as React from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
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
  createCompanyGroup,
  deleteCompanyGroup,
  listCompanyGroups,
  listCseCompanies,
  updateCompanyGroup,
  type CompanyGroup,
  type CseCompany,
} from "@/lib/company-groups";

type EditState =
  | { kind: "create" }
  | { kind: "edit"; group: CompanyGroup }
  | null;

export function CompanyGroupsManager() {
  const [groups, setGroups] = React.useState<CompanyGroup[]>([]);
  const [companies, setCompanies] = React.useState<CseCompany[]>([]);
  const [companiesError, setCompaniesError] = React.useState<string | null>(
    null,
  );
  const [companiesCached, setCompaniesCached] = React.useState(false);
  const [companiesLoading, setCompaniesLoading] = React.useState(true);
  const [groupsLoading, setGroupsLoading] = React.useState(true);
  const [groupsError, setGroupsError] = React.useState<string | null>(null);
  const [editState, setEditState] = React.useState<EditState>(null);
  const [deleting, setDeleting] = React.useState<CompanyGroup | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  const flashSuccess = React.useCallback((msg: string) => {
    setSuccessMsg(msg);
    window.setTimeout(() => setSuccessMsg(null), 2500);
  }, []);

  const loadGroups = React.useCallback(async () => {
    setGroupsLoading(true);
    setGroupsError(null);
    try {
      const data = await listCompanyGroups();
      setGroups(data.groups);
    } catch (e) {
      setGroupsError(e instanceof Error ? e.message : String(e));
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  const loadCompanies = React.useCallback(async (refresh = false) => {
    setCompaniesLoading(true);
    setCompaniesError(null);
    try {
      const data = await listCseCompanies({ refresh });
      setCompanies(data.companies);
      setCompaniesCached(Boolean(data.cached));
      if (data.error) setCompaniesError(data.error);
    } catch (e) {
      setCompaniesError(e instanceof Error ? e.message : String(e));
    } finally {
      setCompaniesLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadGroups();
    loadCompanies();
  }, [loadGroups, loadCompanies]);

  const symbolToName = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const c of companies) map.set(c.symbol, c.name);
    return map;
  }, [companies]);

  const handleDelete = React.useCallback(async () => {
    if (!deleting) return;
    setActionError(null);
    try {
      await deleteCompanyGroup(deleting._id);
      setGroups((prev) => prev.filter((g) => g._id !== deleting._id));
      flashSuccess(`Group "${deleting.name}" deleted`);
      setDeleting(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }, [deleting, flashSuccess]);

  const handleSaved = React.useCallback(
    (group: CompanyGroup, mode: "create" | "edit") => {
      setGroups((prev) => {
        if (mode === "create") return [...prev, group].sort(byName);
        return prev.map((g) => (g._id === group._id ? group : g)).sort(byName);
      });
      flashSuccess(
        mode === "create"
          ? `Group "${group.name}" created`
          : `Group "${group.name}" updated`,
      );
      setEditState(null);
    },
    [flashSuccess],
  );

  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Layers className="size-4 text-muted-foreground" />
              Company groups
            </CardTitle>
            <CardDescription className="mt-1">
              Group companies together so the system page can scan only the
              companies in a selected group instead of every listed company.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadCompanies(true)}
              disabled={companiesLoading}
            >
              {companiesLoading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <RefreshCw />
              )}
              Refresh companies
            </Button>
            <Button size="sm" onClick={() => setEditState({ kind: "create" })}>
              <Plus />
              New group
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {companiesError && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              {companiesCached
                ? "Using cached company list — could not refresh: "
                : "Could not load company list: "}
              {companiesError}
            </span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-4" />
            <span>{successMsg}</span>
          </div>
        )}

        {actionError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span className="flex-1">{actionError}</span>
            <Button
              variant="ghost"
              size="sm"
              className="-my-1 h-6 px-2 text-[11px]"
              onClick={() => setActionError(null)}
            >
              Dismiss
            </Button>
          </div>
        )}

        {groupsLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading groups...
          </div>
        ) : groupsError ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{groupsError}</span>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <Layers className="size-8" />
            <p>No groups yet. Create one to scope scans to specific companies.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {groups.map((group) => (
              <li
                key={group._id}
                className="rounded-lg border bg-muted/20 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Layers className="size-4 text-muted-foreground" />
                      <span className="font-medium" title={group.name}>
                        {group.name}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {group.symbols.length || group.companies.length}{" "}
                        compan
                        {(group.symbols.length || group.companies.length) === 1
                          ? "y"
                          : "ies"}
                      </Badge>
                    </div>
                    {group.description && (
                      <p
                        className="mt-1 text-xs text-muted-foreground"
                        title={group.description}
                      >
                        {group.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setEditState({ kind: "edit", group })
                      }
                    >
                      <Pencil />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDeleting(group)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                {group.symbols.length > 0 || group.companies.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(group.symbols.length > 0
                      ? group.symbols.slice(0, 8)
                      : group.companies.slice(0, 8)
                    ).map((s) => {
                      const displayName =
                        symbolToName.get(s) ??
                        (group.symbols.length > 0
                          ? s
                          : s);
                      return (
                        <Badge
                          key={s}
                          variant="outline"
                          className="text-[10px]"
                          title={displayName}
                        >
                          <Building2 className="size-3" />
                          {group.symbols.length > 0
                            ? symbolToName.get(s) ?? s
                            : s}
                        </Badge>
                      );
                    })}
                    {Math.max(group.symbols.length, group.companies.length) >
                      8 && (
                      <Badge variant="secondary" className="text-[10px]">
                        +
                        {Math.max(group.symbols.length, group.companies.length) -
                          8}{" "}
                        more
                      </Badge>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {editState !== null && (
        <GroupEditorDialog
          mode={editState.kind}
          initial={editState.kind === "edit" ? editState.group : null}
          companies={companies}
          companiesLoading={companiesLoading}
          onClose={() => setEditState(null)}
          onSaved={handleSaved}
        />
      )}

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="size-4 text-destructive" />
              Delete group?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete the group{" "}
              <span className="font-medium text-foreground">
                {deleting?.name}
              </span>
              . The companies themselves will not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={
                <Button variant="ghost" size="sm">
                  Cancel
                </Button>
              }
            />
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
            >
              <Trash2 />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function byName(a: CompanyGroup, b: CompanyGroup) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

type GroupEditorDialogProps = {
  mode: "create" | "edit";
  initial: CompanyGroup | null;
  companies: CseCompany[];
  companiesLoading: boolean;
  onClose: () => void;
  onSaved: (group: CompanyGroup, mode: "create" | "edit") => void;
};

function GroupEditorDialog({
  mode,
  initial,
  companies,
  companiesLoading,
  onClose,
  onSaved,
}: GroupEditorDialogProps) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [description, setDescription] = React.useState(
    initial?.description ?? "",
  );
  const [selectedSymbols, setSelectedSymbols] = React.useState<Set<string>>(
    () => new Set(initial?.symbols ?? []),
  );
  const [query, setQuery] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q),
    );
  }, [companies, query]);

  const allSelected =
    filtered.length > 0 &&
    filtered.every((c) => selectedSymbols.has(c.symbol));
  const someSelected =
    !allSelected && filtered.some((c) => selectedSymbols.has(c.symbol));

  const toggleSymbol = (symbol: string) => {
    setSelectedSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  };

  const toggleFilteredAll = () => {
    setSelectedSymbols((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const c of filtered) next.delete(c.symbol);
      } else {
        for (const c of filtered) next.add(c.symbol);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const symbolToCompany = new Map(companies.map((c) => [c.symbol, c.name]));
      const symbols = Array.from(selectedSymbols);
      const companyNames = symbols.map(
        (s) => symbolToCompany.get(s) ?? s,
      );

      const payload = {
        name: name.trim(),
        description: description.trim(),
        symbols,
        companies: companyNames,
      };

      if (!payload.name) {
        setError("Group name is required");
        setSaving(false);
        return;
      }
      if (payload.symbols.length === 0) {
        setError("Select at least one company");
        setSaving(false);
        return;
      }

      const saved =
        mode === "create"
          ? await createCompanyGroup(payload)
          : await updateCompanyGroup(initial!._id, payload);
      onSaved(saved, mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="!flex max-h-[min(85vh,720px)] w-[min(700px,95vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 border-b px-4 pt-4 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Layers className="size-4 text-muted-foreground" />
            {mode === "create" ? "New company group" : "Edit company group"}
          </DialogTitle>
          <DialogDescription>
            Pick the companies that belong to this group. Scans on the System
            page will be limited to these companies when the group is selected.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-3">
          <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="group-name">Group name</Label>
              <Input
                id="group-name"
                placeholder="e.g. Watchlist - Banks"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="group-description">Description (optional)</Label>
              <Input
                id="group-description"
                placeholder="Short note about this group"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search companies..."
                className="h-9 pl-8"
              />
            </div>
            <Badge variant="secondary" className="shrink-0">
              {selectedSymbols.size} selected
            </Badge>
          </div>

          {filtered.length > 0 && (
            <label className="flex shrink-0 items-center gap-2 px-1 text-xs text-muted-foreground">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onCheckedChange={toggleFilteredAll}
              />
              <span>
                {allSelected
                  ? "Deselect "
                  : someSelected
                  ? "Select remaining "
                  : "Select all "}
                {query.trim()
                  ? `${filtered.length} match${
                      filtered.length === 1 ? "" : "es"
                    }`
                  : `${filtered.length} compan${
                      filtered.length === 1 ? "y" : "ies"
                    }`}
              </span>
            </label>
          )}

          <div className="h-[min(42vh,360px)] shrink-0 overflow-hidden rounded-lg border bg-background">
            <ScrollArea className="h-full">
              {companiesLoading && companies.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading companies from CSE...
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-1 py-10 text-center text-sm text-muted-foreground">
                  <Building2 className="size-6" />
                  <span>
                    {companies.length === 0
                      ? "No companies available."
                      : `No matches for "${query}".`}
                  </span>
                </div>
              ) : (
                <ul className="flex flex-col">
                  {filtered.map((c) => {
                    const checked = selectedSymbols.has(c.symbol);
                    return (
                      <li
                        key={c.symbol}
                        className={cn(
                          "flex items-center gap-2 border-b px-3 py-2 last:border-b-0",
                          "cursor-pointer hover:bg-muted/40",
                          checked && "bg-primary/5",
                        )}
                        onClick={() => toggleSymbol(c.symbol)}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleSymbol(c.symbol)}
                          aria-label={`Select ${c.name}`}
                        />
                        <Building2 className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm" title={c.name}>
                            {c.name}
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {c.symbol}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </div>

          {error && (
            <div className="flex shrink-0 items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className="relative z-10 mx-0 mb-0 mt-0 shrink-0 border-t bg-background">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X />
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {mode === "create" ? "Create group" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
