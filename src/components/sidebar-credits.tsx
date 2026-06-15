"use client";

import * as React from "react";
import {
  CreditCard,
  RefreshCw,
  AlertCircle,
  ChevronRight,
  Pencil,
} from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  SidebarGroup,
  SidebarGroupContent,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  getOpenAiSpend,
  setOpenAiBalance,
  type OpenAiSpend,
} from "@/lib/openai-usage";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/components/auth/auth-provider";

function formatUsd(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency || "usd").toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

export function SidebarCredits() {
  const { state, isMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";

  const [spend, setSpend] = React.useState<OpenAiSpend | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [editing, setEditing] = React.useState(false);
  const [balanceInput, setBalanceInput] = React.useState("");
  const [asOfInput, setAsOfInput] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const load = React.useCallback(async (signal?: AbortSignal, force = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getOpenAiSpend(signal, force);
      setSpend(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message =
        err instanceof ApiError ? err.message : "Could not load usage";
      setError(message);
      setSpend(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const openEditor = React.useCallback(() => {
    setSaveError(null);
    setBalanceInput(
      spend?.balance ? String(spend.balance.initial) : "",
    );
    setAsOfInput(new Date().toISOString().slice(0, 10));
    setEditing(true);
  }, [spend]);

  const saveBalance = React.useCallback(async () => {
    const value = Number(balanceInput);
    if (!Number.isFinite(value) || value < 0) {
      setSaveError("Enter a valid balance (e.g. 12.43).");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const data = await setOpenAiBalance(value, asOfInput || undefined);
      setSpend(data);
      setEditing(false);
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.message : "Could not save balance",
      );
    } finally {
      setSaving(false);
    }
  }, [balanceInput, asOfInput]);

  // Headline value shown on the small trigger: credits left if available,
  // otherwise this month's spend.
  const headline = spend?.balance
    ? formatUsd(spend.balance.remaining, spend.currency)
    : spend?.month != null
      ? formatUsd(spend.month, spend.currency)
      : null;
  const headlineLabel = spend?.balance ? "Credits left" : "This month";

  const details = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <CreditCard className="size-3.5" />
          OpenAI usage
        </span>
        <button
          type="button"
          onClick={() => void load(undefined, true)}
          disabled={loading}
          aria-label="Refresh usage"
          className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error ? (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
          <span className="leading-snug">{error}</span>
        </div>
      ) : loading && !spend ? (
        <div className="space-y-1.5">
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3.5 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ) : spend ? (
        <div className="space-y-1">
          {spend.balance ? (
            <div className="mb-1 border-b pb-1.5">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Credits left
                </span>
                <span className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatUsd(spend.balance.remaining, spend.currency)}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                {spend.balance.liveDecrement
                  ? `Est. from ${formatUsd(spend.balance.initial, spend.currency)} on ${spend.balance.asOf}`
                  : `Set ${spend.balance.asOf} (add admin key for live updates)`}
              </p>
            </div>
          ) : null}
          {spend.today != null ? (
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">Today</span>
              <span className="text-sm font-semibold tabular-nums">
                {formatUsd(spend.today, spend.currency)}
              </span>
            </div>
          ) : null}
          {spend.month != null ? (
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">This month</span>
              <span className="text-sm font-semibold tabular-nums">
                {formatUsd(spend.month, spend.currency)}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {isAdmin && !error ? (
        editing ? (
          <div className="mt-1 flex flex-col gap-2 border-t pt-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium text-muted-foreground">
                New balance (USD)
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={balanceInput}
                onChange={(e) => setBalanceInput(e.target.value)}
                placeholder="e.g. 12.43"
                className="h-7 rounded-md border bg-background px-2 text-sm tabular-nums outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium text-muted-foreground">
                As of date
              </span>
              <input
                type="date"
                value={asOfInput}
                onChange={(e) => setAsOfInput(e.target.value)}
                className="h-7 rounded-md border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
            {saveError ? (
              <p className="text-[10px] leading-tight text-red-500">
                {saveError}
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void saveBalance()}
                disabled={saving}
                className="inline-flex h-7 flex-1 items-center justify-center rounded-md bg-emerald-600 px-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="inline-flex h-7 items-center justify-center rounded-md border px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            <p className="text-[10px] leading-tight text-muted-foreground">
              OpenAI has no live-balance API. Enter the balance from your OpenAI
              dashboard; spend is then deducted automatically from this date.
            </p>
          </div>
        ) : (
          <div className="mt-1 border-t pt-2">
            <button
              type="button"
              onClick={openEditor}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Pencil className="size-3" />
              Update balance
            </button>
          </div>
        )
      ) : null}
    </div>
  );

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <Popover openOnHover delay={120} closeDelay={120}>
          <PopoverTrigger
            className={
              collapsed
                ? "flex w-full items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                : "flex w-fit items-center gap-2 rounded-md border bg-sidebar-accent/40 px-2.5 py-1 text-left text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            }
            aria-label="OpenAI usage details"
          >
            <CreditCard className="size-4 shrink-0 text-muted-foreground" />
            {!collapsed ? (
              <>
                <span className="flex flex-col leading-tight">
                  <span className="text-[10px] text-muted-foreground">
                    {error ? "Usage" : headlineLabel}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {error ? "—" : (headline ?? "…")}
                  </span>
                </span>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              </>
            ) : null}
          </PopoverTrigger>
          <PopoverContent
            side={collapsed ? "right" : "top"}
            align={collapsed ? "start" : "center"}
            className="w-60"
          >
            {details}
          </PopoverContent>
        </Popover>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
