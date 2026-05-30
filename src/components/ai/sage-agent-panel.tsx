"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-provider";
import {
  createCompanyGroup,
  deleteCompanyGroup,
  listCompanyGroups,
  listCseCompanies,
  updateCompanyGroup,
  type CompanyGroup,
  type CseCompany,
} from "@/lib/company-groups";

/* ────────────────────────────────────────────────────────────────────────── *
 * Types
 * ────────────────────────────────────────────────────────────────────────── */

type Turn =
  | { kind: "assistant"; id: string; text: string; ts: number }
  | { kind: "user"; id: string; text: string; ts: number };

type Step =
  | { kind: "intro" }
  | { kind: "create_form"; name: string; selected: string[] }
  | { kind: "create_confirm"; name: string; symbols: string[] }
  | { kind: "edit_pick" }
  | { kind: "edit_search"; original: CompanyGroup; symbols: string[] }
  | { kind: "edit_confirm"; original: CompanyGroup; symbols: string[] }
  | { kind: "delete_pick" }
  | { kind: "delete_confirm"; group: CompanyGroup }
  | { kind: "loading"; text: string };

interface SageAgentPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function SageAgentPanel({ open, onOpenChange }: SageAgentPanelProps) {
  const { user } = useAuth();
  const firstName =
    user?.first_name?.trim() || user?.email?.split("@")[0] || "there";

  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [step, setStep] = React.useState<Step>({ kind: "intro" });
  const [groups, setGroups] = React.useState<CompanyGroup[]>([]);
  const [companies, setCompanies] = React.useState<CseCompany[]>([]);
  const [companiesLoading, setCompaniesLoading] = React.useState(false);
  const [groupsLoading, setGroupsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const bottomRef = React.useRef<HTMLDivElement>(null);
  const initialisedFor = React.useRef<string | null>(null);

  /* ──────── helpers ──────── */

  const scrollToBottom = React.useCallback(() => {
    // Two-frame delay so we scroll after layout settles (especially when the
    // active-step widget below the chat changes height between transitions).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ block: "end" });
      });
    });
  }, []);

  const pushAssistant = React.useCallback((text: string) => {
    setTurns((prev) => [
      ...prev,
      {
        kind: "assistant",
        id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text,
        ts: Date.now(),
      },
    ]);
  }, []);

  const pushUser = React.useCallback((text: string) => {
    setTurns((prev) => [
      ...prev,
      {
        kind: "user",
        id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text,
        ts: Date.now(),
      },
    ]);
  }, []);

  const symbolToName = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const c of companies) map.set(c.symbol, c.name);
    return map;
  }, [companies]);

  const symbolDisplay = React.useCallback(
    (symbol: string) => symbolToName.get(symbol) ?? symbol,
    [symbolToName],
  );

  /* ──────── data loading ──────── */

  const loadCompanies = React.useCallback(async () => {
    if (companies.length > 0 || companiesLoading) return;
    setCompaniesLoading(true);
    try {
      const data = await listCseCompanies();
      setCompanies(data.companies ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCompaniesLoading(false);
    }
  }, [companies.length, companiesLoading]);

  const loadGroups = React.useCallback(async () => {
    setGroupsLoading(true);
    try {
      const data = await listCompanyGroups();
      setGroups(data.groups ?? []);
      return data.groups ?? [];
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return [] as CompanyGroup[];
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  /* ──────── lifecycle ──────── */

  React.useEffect(() => {
    if (!open) return;
    const key = user?._id ?? "anon";
    if (initialisedFor.current === key && turns.length > 0) return;
    initialisedFor.current = key;
    setTurns([
      {
        kind: "assistant",
        id: "greeting",
        ts: Date.now(),
        text: `Hi! I'm **Scarlet**, your configuration agent for **Company Groups**. I can help you create a new group, edit an existing one, or delete one. Pick an option below to get started.`,
      },
    ]);
    setStep({ kind: "intro" });
    setError(null);
    void loadCompanies();
  }, [open, user?._id, turns.length, loadCompanies]);

  React.useEffect(() => {
    scrollToBottom();
  }, [turns, step, scrollToBottom]);

  /* ──────── flow transitions ──────── */

  const goIntro = React.useCallback(() => {
    setStep({ kind: "intro" });
    pushAssistant("What would you like to do next?");
  }, [pushAssistant]);

  const startCreate = React.useCallback(() => {
    pushUser("Create a new group");
    pushAssistant(
      "Sure! Give the group a name and pick the companies you want in it. Use the **+** to add companies, then press **Done**.",
    );
    setStep({ kind: "create_form", name: "", selected: [] });
    void loadCompanies();
  }, [pushAssistant, pushUser, loadCompanies]);

  const startEdit = React.useCallback(async () => {
    pushUser("Edit an existing group");
    setStep({ kind: "loading", text: "Loading your groups..." });
    const gs = await loadGroups();
    void loadCompanies();
    if (gs.length === 0) {
      pushAssistant(
        "You don't have any groups yet. Would you like to create one?",
      );
      setStep({ kind: "intro" });
      return;
    }
    pushAssistant(
      `Here are your current groups. Pick the one you'd like to edit.`,
    );
    setStep({ kind: "edit_pick" });
  }, [pushAssistant, pushUser, loadGroups, loadCompanies]);

  const startDelete = React.useCallback(async () => {
    pushUser("Delete a group");
    setStep({ kind: "loading", text: "Loading your groups..." });
    const gs = await loadGroups();
    void loadCompanies();
    if (gs.length === 0) {
      pushAssistant("You don't have any groups to delete.");
      setStep({ kind: "intro" });
      return;
    }
    pushAssistant(
      `Here are your current groups. Pick the one you'd like to delete.`,
    );
    setStep({ kind: "delete_pick" });
  }, [pushAssistant, pushUser, loadGroups]);

  /* ──────── create flow ──────── */

  const onCreateFormDone = React.useCallback(
    (name: string, symbols: string[]) => {
      const trimmed = name.trim();
      if (!trimmed || symbols.length === 0) return;
      pushUser(
        `Name: **${trimmed}** · ${symbols.length} compan${symbols.length === 1 ? "y" : "ies"} selected`,
      );
      pushAssistant("Here's the group I'll create. Do you want to proceed?");
      setStep({ kind: "create_confirm", name: trimmed, symbols });
    },
    [pushAssistant, pushUser],
  );

  const onCreateConfirm = React.useCallback(
    async (yes: boolean, name: string, symbols: string[]) => {
      if (!yes) {
        pushUser("No, cancel");
        pushAssistant("No problem — cancelled. What would you like to do?");
        setStep({ kind: "intro" });
        return;
      }
      pushUser("Yes, proceed");
      setStep({ kind: "loading", text: "Creating group..." });
      try {
        const symbolToCompany = new Map(
          companies.map((c) => [c.symbol, c.name]),
        );
        const companyNames = symbols.map(
          (s) => symbolToCompany.get(s) ?? s,
        );
        const created = await createCompanyGroup({
          name,
          symbols,
          companies: companyNames,
        });
        setGroups((prev) => [...prev, created]);
        pushAssistant(
          `Done! Group **${created.name}** has been created with ${symbols.length} compan${symbols.length === 1 ? "y" : "ies"}.`,
        );
        goIntro();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        pushAssistant("Sorry, I couldn't create that group. See the error above.");
        setStep({ kind: "intro" });
      }
    },
    [companies, pushAssistant, pushUser, goIntro],
  );

  /* ──────── edit flow ──────── */

  const onEditPick = React.useCallback(
    (group: CompanyGroup) => {
      pushUser(`Edit **${group.name}**`);
      pushAssistant(
        `**${group.name}** currently has ${group.symbols.length} compan${group.symbols.length === 1 ? "y" : "ies"}. Add or remove as needed, then press **Done**.`,
      );
      setStep({
        kind: "edit_search",
        original: group,
        symbols: [...group.symbols],
      });
      void loadCompanies();
    },
    [pushAssistant, pushUser, loadCompanies],
  );

  const onEditSearchDone = React.useCallback(
    (original: CompanyGroup, symbols: string[]) => {
      if (symbols.length === 0) return;
      pushUser(
        `Updated to ${symbols.length} compan${symbols.length === 1 ? "y" : "ies"}.`,
      );
      pushAssistant("Here's the updated group. Do you want to proceed?");
      setStep({ kind: "edit_confirm", original, symbols });
    },
    [pushAssistant, pushUser],
  );

  const onEditConfirm = React.useCallback(
    async (yes: boolean, original: CompanyGroup, symbols: string[]) => {
      if (!yes) {
        pushUser("No, cancel");
        pushAssistant("OK — nothing changed. What would you like to do?");
        setStep({ kind: "intro" });
        return;
      }
      pushUser("Yes, proceed");
      setStep({ kind: "loading", text: "Updating group..." });
      try {
        const symbolToCompany = new Map(
          companies.map((c) => [c.symbol, c.name]),
        );
        const companyNames = symbols.map(
          (s) => symbolToCompany.get(s) ?? s,
        );
        const updated = await updateCompanyGroup(original._id, {
          name: original.name,
          description: original.description,
          symbols,
          companies: companyNames,
        });
        setGroups((prev) =>
          prev.map((g) => (g._id === updated._id ? updated : g)),
        );
        pushAssistant(
          `Done! Group **${updated.name}** has been updated.`,
        );
        goIntro();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        pushAssistant("Sorry, I couldn't update that group. See the error above.");
        setStep({ kind: "intro" });
      }
    },
    [companies, pushAssistant, pushUser, goIntro],
  );

  /* ──────── delete flow ──────── */

  const onDeletePick = React.useCallback(
    (group: CompanyGroup) => {
      pushUser(`Delete **${group.name}**`);
      pushAssistant(
        `Are you sure you want to delete **${group.name}**? This cannot be undone.`,
      );
      setStep({ kind: "delete_confirm", group });
    },
    [pushAssistant, pushUser],
  );

  const onDeleteConfirm = React.useCallback(
    async (yes: boolean, group: CompanyGroup) => {
      if (!yes) {
        pushUser("No, cancel");
        pushAssistant("OK — nothing was deleted. What would you like to do?");
        setStep({ kind: "intro" });
        return;
      }
      pushUser("Yes, delete it");
      setStep({ kind: "loading", text: "Deleting group..." });
      try {
        await deleteCompanyGroup(group._id);
        setGroups((prev) => prev.filter((g) => g._id !== group._id));
        pushAssistant(`Done. Group **${group.name}** has been deleted.`);
        goIntro();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        pushAssistant("Sorry, I couldn't delete that group. See the error above.");
        setStep({ kind: "intro" });
      }
    },
    [pushAssistant, pushUser, goIntro],
  );

  /* ──────── reset on close ──────── */

  const reset = React.useCallback(() => {
    initialisedFor.current = null;
    setTurns([]);
    setStep({ kind: "intro" });
    setError(null);
  }, []);

  /* ──────── render ──────── */

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 bg-card p-0 sm:!max-w-md md:!max-w-lg"
      >
        <SheetHeader className="shrink-0 border-b bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <span
                className="absolute -inset-1 rounded-full bg-amber-500/30 blur-md animate-pulse"
                aria-hidden
              />
              <Avatar size="lg" className="relative ring-2 ring-amber-500/40">
                <AvatarImage
                  src="https://api.dicebear.com/8.x/bottts/svg?seed=sage"
                  alt="Scarlet"
                />
                <AvatarFallback>SC</AvatarFallback>
              </Avatar>
              <span className="absolute right-0 bottom-0 z-10 size-3 rounded-full bg-emerald-500 ring-2 ring-card animate-pulse" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <SheetTitle className="flex items-center gap-2">
                Scarlet
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300"
                >
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Online
                </Badge>
              </SheetTitle>
              <SheetDescription className="flex items-center gap-1 text-xs">
                <Sparkles className="size-3 text-amber-500" />
                Configuration agent · Company groups
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-3 p-4">
              {turns.map((turn) =>
                turn.kind === "user" ? (
                  <UserBubble
                    key={turn.id}
                    content={turn.text}
                    timestamp={turn.ts}
                  />
                ) : (
                  <AssistantBubble
                    key={turn.id}
                    content={turn.text}
                    timestamp={turn.ts}
                  />
                ),
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span className="flex-1">{error}</span>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="text-[11px] underline opacity-80 hover:opacity-100"
                  >
                    dismiss
                  </button>
                </div>
              )}

              {/* Sentinel — scrolled into view whenever new turns are added so
                  the latest message is always visible without manual scroll. */}
              <div ref={bottomRef} aria-hidden className="h-px shrink-0" />
            </div>
          </ScrollArea>
        </div>

        <div className="shrink-0 border-t bg-background p-3">
          <ActiveStep
            firstName={firstName}
            step={step}
            groups={groups}
            companies={companies}
            companiesLoading={companiesLoading}
            groupsLoading={groupsLoading}
            symbolDisplay={symbolDisplay}
            onStartCreate={startCreate}
            onStartEdit={() => void startEdit()}
            onStartDelete={() => void startDelete()}
            onCreateFormDone={onCreateFormDone}
            onCreateConfirm={onCreateConfirm}
            onEditPick={onEditPick}
            onEditSearchDone={onEditSearchDone}
            onEditConfirm={onEditConfirm}
            onDeletePick={onDeletePick}
            onDeleteConfirm={onDeleteConfirm}
            onUpdateStep={setStep}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Active step (the interactive widget shown at the bottom)
 * ────────────────────────────────────────────────────────────────────────── */

interface ActiveStepProps {
  firstName: string;
  step: Step;
  groups: CompanyGroup[];
  companies: CseCompany[];
  companiesLoading: boolean;
  groupsLoading: boolean;
  symbolDisplay: (s: string) => string;
  onStartCreate: () => void;
  onStartEdit: () => void;
  onStartDelete: () => void;
  onCreateFormDone: (name: string, symbols: string[]) => void;
  onCreateConfirm: (
    yes: boolean,
    name: string,
    symbols: string[],
  ) => void | Promise<void>;
  onEditPick: (group: CompanyGroup) => void;
  onEditSearchDone: (original: CompanyGroup, symbols: string[]) => void;
  onEditConfirm: (
    yes: boolean,
    original: CompanyGroup,
    symbols: string[],
  ) => void | Promise<void>;
  onDeletePick: (group: CompanyGroup) => void;
  onDeleteConfirm: (
    yes: boolean,
    group: CompanyGroup,
  ) => void | Promise<void>;
  onUpdateStep: (step: Step) => void;
}

function ActiveStep(props: ActiveStepProps) {
  const {
    step,
    groups,
    companies,
    companiesLoading,
    groupsLoading,
    symbolDisplay,
    onStartCreate,
    onStartEdit,
    onStartDelete,
    onCreateFormDone,
    onCreateConfirm,
    onEditPick,
    onEditSearchDone,
    onEditConfirm,
    onDeletePick,
    onDeleteConfirm,
    onUpdateStep,
  } = props;

  switch (step.kind) {
    case "intro":
      return (
        <div className="flex flex-col gap-2">
          <p className="px-1 text-[11px] text-muted-foreground">
            Pick an action to continue:
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button
              variant="outline"
              className="justify-start"
              onClick={onStartCreate}
            >
              <Plus />
              Create group
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={onStartEdit}
            >
              <Pencil />
              Edit group
            </Button>
            <Button
              variant="outline"
              className="justify-start text-destructive hover:text-destructive"
              onClick={onStartDelete}
            >
              <Trash2 />
              Delete group
            </Button>
          </div>
        </div>
      );

    case "create_form":
      return (
        <CompanySearchCard
          title="Set up your new group"
          companies={companies}
          companiesLoading={companiesLoading}
          initialSelected={step.selected}
          symbolDisplay={symbolDisplay}
          doneLabel="Done"
          nameInput={{
            value: step.name,
            placeholder: "Group name — e.g. Watchlist - Banks",
            onChange: (name) =>
              onUpdateStep({ ...step, name, selected: step.selected }),
          }}
          onDone={(symbols) => onCreateFormDone(step.name, symbols)}
          onBack={() => onUpdateStep({ kind: "intro" })}
        />
      );

    case "create_confirm":
      return (
        <ConfirmCard
          summary={
            <GroupSummaryCard
              title="New group"
              name={step.name}
              symbols={step.symbols}
              symbolDisplay={symbolDisplay}
            />
          }
          question="Create this group?"
          confirmLabel="Yes, create"
          confirmIcon={<CheckCircle2 />}
          onAnswer={(yes) => void onCreateConfirm(yes, step.name, step.symbols)}
        />
      );

    case "edit_pick":
      return (
        <GroupPickerCard
          title="Pick a group to edit"
          groups={groups}
          loading={groupsLoading}
          symbolDisplay={symbolDisplay}
          onPick={onEditPick}
          onBack={() => onUpdateStep({ kind: "intro" })}
        />
      );

    case "edit_search":
      return (
        <CompanySearchCard
          title={`Editing "${step.original.name}"`}
          companies={companies}
          companiesLoading={companiesLoading}
          initialSelected={step.symbols}
          symbolDisplay={symbolDisplay}
          doneLabel="Done"
          onDone={(symbols) => onEditSearchDone(step.original, symbols)}
          onBack={() => onUpdateStep({ kind: "edit_pick" })}
        />
      );

    case "edit_confirm":
      return (
        <ConfirmCard
          summary={
            <GroupSummaryCard
              title="Updated group"
              name={step.original.name}
              symbols={step.symbols}
              symbolDisplay={symbolDisplay}
            />
          }
          question="Apply these changes?"
          confirmLabel="Yes, update"
          confirmIcon={<CheckCircle2 />}
          onAnswer={(yes) =>
            void onEditConfirm(yes, step.original, step.symbols)
          }
        />
      );

    case "delete_pick":
      return (
        <GroupPickerCard
          title="Pick a group to delete"
          groups={groups}
          loading={groupsLoading}
          symbolDisplay={symbolDisplay}
          onPick={onDeletePick}
          onBack={() => onUpdateStep({ kind: "intro" })}
          destructive
        />
      );

    case "delete_confirm":
      return (
        <ConfirmCard
          summary={
            <GroupSummaryCard
              title="Group to delete"
              name={step.group.name}
              symbols={step.group.symbols}
              symbolDisplay={symbolDisplay}
              destructive
            />
          }
          question={`Delete "${step.group.name}"?`}
          confirmLabel="Yes, delete"
          confirmIcon={<Trash2 />}
          destructive
          onAnswer={(yes) => void onDeleteConfirm(yes, step.group)}
        />
      );

    case "loading":
      return (
        <div className="flex items-center justify-center gap-2 rounded-lg border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {step.text}
        </div>
      );

    default:
      return null;
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Sub-widgets
 * ────────────────────────────────────────────────────────────────────────── */

function CompanySearchCard({
  title,
  companies,
  companiesLoading,
  initialSelected,
  symbolDisplay,
  doneLabel,
  nameInput,
  onDone,
  onBack,
}: {
  title: string;
  companies: CseCompany[];
  companiesLoading: boolean;
  initialSelected: string[];
  symbolDisplay: (s: string) => string;
  doneLabel: string;
  nameInput?: {
    value: string;
    placeholder: string;
    onChange: (value: string) => void;
  };
  onDone: (symbols: string[]) => void;
  onBack?: () => void;
}) {
  const [selected, setSelected] = React.useState<string[]>(initialSelected);
  const [query, setQuery] = React.useState("");
  const nameInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (nameInput) setTimeout(() => nameInputRef.current?.focus(), 50);
  }, [nameInput]);

  // Keep state in sync if the initial set changes (e.g., switching groups)
  const initialKey = React.useMemo(
    () => initialSelected.join("|"),
    [initialSelected],
  );
  React.useEffect(() => {
    setSelected(initialSelected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  const selectedSet = React.useMemo(() => new Set(selected), [selected]);

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;
  const filtered = React.useMemo(() => {
    const q = trimmedQuery.toLowerCase();
    if (!q) return [];
    return companies
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.symbol.toLowerCase().includes(q),
      )
      .slice(0, 60);
  }, [companies, trimmedQuery]);

  const add = (symbol: string) => {
    setSelected((prev) => (prev.includes(symbol) ? prev : [...prev, symbol]));
  };
  const remove = (symbol: string) => {
    setSelected((prev) => prev.filter((s) => s !== symbol));
  };

  const nameOk = !nameInput || nameInput.value.trim().length > 0;
  const canSubmit = nameOk && selected.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">{title}</p>
        <Badge variant="secondary" className="shrink-0">
          {selected.length} selected
        </Badge>
      </div>

      {nameInput && (
        <div className="flex flex-col gap-1">
          <label className="px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Group name
          </label>
          <Input
            ref={nameInputRef}
            value={nameInput.value}
            onChange={(e) => nameInput.onChange(e.target.value)}
            placeholder={nameInput.placeholder}
            className="h-9"
          />
        </div>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/20 p-2">
          {selected.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => remove(s)}
              className="group inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] hover:border-destructive/60 hover:bg-destructive/5"
              title={`Remove ${symbolDisplay(s)}`}
            >
              <Building2 className="size-3 text-muted-foreground" />
              <span className="max-w-[140px] truncate">{symbolDisplay(s)}</span>
              <X className="size-3 text-muted-foreground group-hover:text-destructive" />
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a company by name or symbol..."
          className="h-9 pl-8 pr-8"
        />
        {hasQuery && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {!hasQuery ? (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed bg-muted/10 px-3 py-6 text-center text-xs text-muted-foreground">
          {companiesLoading && companies.length === 0 ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>Loading companies...</span>
            </>
          ) : (
            <>
              <Search className="size-4" />
              <span>
                Type to search from{" "}
                <span className="font-medium text-foreground">
                  {companies.length}
                </span>{" "}
                CSE companies.
              </span>
            </>
          )}
        </div>
      ) : (
        <div className="h-44 overflow-hidden rounded-lg border bg-background">
          <ScrollArea className="h-full">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-8 text-center text-xs text-muted-foreground">
                <Building2 className="size-5" />
                <span>No matches for &ldquo;{trimmedQuery}&rdquo;.</span>
              </div>
            ) : (
              <ul className="flex flex-col">
                {filtered.map((c) => {
                  const added = selectedSet.has(c.symbol);
                  return (
                    <li
                      key={c.symbol}
                      className={cn(
                        "flex items-center gap-2 border-b px-2.5 py-1.5 last:border-b-0",
                        added && "bg-emerald-500/5",
                      )}
                    >
                      <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div
                          className="truncate text-xs font-medium"
                          title={c.name}
                        >
                          {c.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {c.symbol}
                        </div>
                      </div>
                      {added ? (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => remove(c.symbol)}
                          aria-label={`Remove ${c.name}`}
                          className="text-emerald-600 hover:bg-destructive/10 hover:text-destructive dark:text-emerald-400"
                        >
                          <Check />
                        </Button>
                      ) : (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => add(c.symbol)}
                          aria-label={`Add ${c.name}`}
                        >
                          <Plus />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </div>
      )}

      <div className="flex items-center justify-between">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="px-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1 inline-block size-3" />
            Back
          </button>
        ) : (
          <span />
        )}
        <Button
          size="sm"
          onClick={() => onDone(selected)}
          disabled={!canSubmit}
        >
          <CheckCircle2 />
          {doneLabel}
        </Button>
      </div>
    </div>
  );
}

function GroupPickerCard({
  title,
  groups,
  loading,
  symbolDisplay,
  onPick,
  onBack,
  destructive,
}: {
  title: string;
  groups: CompanyGroup[];
  loading: boolean;
  symbolDisplay: (s: string) => string;
  onPick: (group: CompanyGroup) => void;
  onBack?: () => void;
  destructive?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium">{title}</p>

      <div className="h-72 overflow-hidden rounded-lg border bg-background">
        <ScrollArea className="h-full">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Loading groups...
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-6 text-center text-xs text-muted-foreground">
              <Layers className="size-5" />
              <span>No groups yet.</span>
            </div>
          ) : (
            <ul className="flex flex-col">
              {groups.map((g) => {
                const count = g.symbols.length || g.companies.length;
                const preview = (
                  g.symbols.length > 0 ? g.symbols : g.companies
                ).slice(0, 4);
                return (
                  <li key={g._id} className="border-b last:border-b-0">
                    <button
                      type="button"
                      onClick={() => onPick(g)}
                      className={cn(
                        "flex w-full items-start gap-2 px-2.5 py-2 text-left transition-colors",
                        destructive
                          ? "hover:bg-destructive/5"
                          : "hover:bg-muted/40",
                      )}
                    >
                      <Layers
                        className={cn(
                          "mt-0.5 size-3.5 shrink-0",
                          destructive
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="truncate text-xs font-medium"
                            title={g.name}
                          >
                            {g.name}
                          </span>
                          <Badge
                            variant="secondary"
                            className="shrink-0 text-[10px]"
                          >
                            {count} compan{count === 1 ? "y" : "ies"}
                          </Badge>
                        </div>
                        {preview.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {preview.map((s) => (
                              <Badge
                                key={s}
                                variant="outline"
                                className="text-[10px]"
                              >
                                {g.symbols.length > 0 ? symbolDisplay(s) : s}
                              </Badge>
                            ))}
                            {count > preview.length && (
                              <Badge
                                variant="secondary"
                                className="text-[10px]"
                              >
                                +{count - preview.length} more
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      <ChevronRight
                        className={cn(
                          "mt-1 size-3.5 shrink-0",
                          destructive
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </div>

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="self-start px-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 inline-block size-3" />
          Back
        </button>
      )}
    </div>
  );
}

function GroupSummaryCard({
  title,
  name,
  symbols,
  symbolDisplay,
  destructive,
}: {
  title: string;
  name: string;
  symbols: string[];
  symbolDisplay: (s: string) => string;
  destructive?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-muted/20 p-2.5",
        destructive && "border-destructive/40 bg-destructive/5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        <Badge variant="secondary" className="text-[10px]">
          {symbols.length} compan{symbols.length === 1 ? "y" : "ies"}
        </Badge>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Layers
          className={cn(
            "size-4",
            destructive ? "text-destructive" : "text-muted-foreground",
          )}
        />
        <span className="truncate text-sm font-medium" title={name}>
          {name}
        </span>
      </div>
      {symbols.length > 0 && (
        <div className="mt-2 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
          {symbols.map((s) => (
            <Badge key={s} variant="outline" className="text-[10px]">
              <Building2 className="size-3" />
              {symbolDisplay(s)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfirmCard({
  summary,
  question,
  confirmLabel,
  confirmIcon,
  destructive,
  onAnswer,
}: {
  summary: React.ReactNode;
  question: string;
  confirmLabel: string;
  confirmIcon?: React.ReactNode;
  destructive?: boolean;
  onAnswer: (yes: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {summary}
      <p className="px-1 text-xs">{question}</p>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => onAnswer(false)}>
          <X />
          No
        </Button>
        <Button
          size="sm"
          variant={destructive ? "destructive" : "default"}
          onClick={() => onAnswer(true)}
        >
          {confirmIcon}
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Chat bubbles
 * ────────────────────────────────────────────────────────────────────────── */

function UserBubble({
  content,
  timestamp,
}: {
  content: string;
  timestamp: number;
}) {
  return (
    <div className="flex justify-end gap-2 animate-fade-rise">
      <div className="flex max-w-[80%] flex-col items-end gap-0.5">
        <div className="rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground shadow-sm">
          <RichText text={content} />
        </div>
        <span className="text-[10px] text-muted-foreground">
          {formatTime(timestamp)}
        </span>
      </div>
    </div>
  );
}

function AssistantBubble({
  content,
  timestamp,
}: {
  content: string;
  timestamp: number;
}) {
  return (
    <div className="flex items-start gap-2 animate-fade-rise">
      <Avatar size="sm" className="mt-0.5 shrink-0 ring-1 ring-amber-500/40">
        <AvatarImage
          src="https://api.dicebear.com/8.x/bottts/svg?seed=sage"
          alt="Scarlet"
        />
        <AvatarFallback>SC</AvatarFallback>
      </Avatar>
      <div className="flex max-w-[85%] flex-col gap-1.5">
        <div className="rounded-2xl rounded-tl-md border bg-muted/40 px-3 py-2 text-sm shadow-sm">
          <RichText text={content} />
        </div>
        <span className="text-[10px] text-muted-foreground">
          {formatTime(timestamp)}
        </span>
      </div>
    </div>
  );
}

function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="whitespace-pre-wrap break-words leading-relaxed">
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </p>
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
