"use client";

import * as React from "react";
import {
  AlertCircle,
  Clock,
  History,
  KeyRound,
  LogIn,
  LogOut,
  RefreshCw,
  Loader2,
  UserPlus,
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
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  getLastLoginForUser,
  listLoginHistory,
  type LoginEvent,
  type LoginHistoryEntry,
} from "@/lib/login-history";
import { listUsers, type AdminUser } from "@/lib/users";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return value;
  }
}

function eventBadge(event: LoginEvent, success: boolean) {
  if (!success) {
    return (
      <Badge variant="destructive" className="capitalize text-[10px]">
        {event} failed
      </Badge>
    );
  }
  if (event === "login") {
    return (
      <Badge variant="default" className="text-[10px]">
        <LogIn className="mr-1 size-3" />
        Login
      </Badge>
    );
  }
  if (event === "signup") {
    return (
      <Badge variant="secondary" className="text-[10px]">
        <UserPlus className="mr-1 size-3" />
        Signup
      </Badge>
    );
  }
  if (event === "password_reset_request") {
    return (
      <Badge variant="outline" className="text-[10px]">
        <KeyRound className="mr-1 size-3" />
        Reset requested
      </Badge>
    );
  }
  if (event === "password_reset_success") {
    return (
      <Badge variant="default" className="text-[10px]">
        <KeyRound className="mr-1 size-3" />
        Password reset
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px]">
      <LogOut className="mr-1 size-3" />
      Logout
    </Badge>
  );
}

function shortUA(ua: string | null) {
  if (!ua) return "Unknown agent";
  // Keep it short for the table — the full UA is in the title attribute.
  const m =
    ua.match(/(Chrome|Edg|Edge|Firefox|Safari|Opera|OPR)[/\s]([\d.]+)/) ||
    ua.match(/([A-Za-z]+)[/\s]([\d.]+)/);
  if (m) return `${m[1]} ${m[2]}`;
  return ua.slice(0, 60);
}

export function UserLogPanel() {
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = React.useState(false);
  const [selectedUserId, setSelectedUserId] = React.useState<string>("");
  const [entries, setEntries] = React.useState<LoginHistoryEntry[]>([]);
  const [lastEntry, setLastEntry] = React.useState<LoginHistoryEntry | null>(
    null,
  );
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadUsers = React.useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await listUsers({ limit: 100 });
      setUsers(res.items);
      // Keep selection valid if the previously-selected user disappears.
      if (selectedUserId && !res.items.find((u) => u._id === selectedUserId)) {
        setSelectedUserId("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUsersLoading(false);
    }
  }, [selectedUserId]);

  const loadHistory = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const opts = selectedUserId ? { userId: selectedUserId } : {};
      const [historyRes, lastRes] = await Promise.all([
        listLoginHistory({ ...opts, limit: 100 }),
        selectedUserId ? getLastLoginForUser(selectedUserId) : Promise.resolve({ item: null }),
      ]);
      setEntries(historyRes.items);
      setTotal(historyRes.total);
      setLastEntry(lastRes.item);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedUserId]);

  React.useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  React.useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const selectedUser = React.useMemo(
    () => users.find((u) => u._id === selectedUserId) ?? null,
    [users, selectedUserId],
  );

  return (
    <Card size="sm" className="flex min-h-0 flex-col">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <History className="size-4 text-muted-foreground" />
              User log
            </CardTitle>
            <CardDescription className="mt-1">
              Browse login activity. Pick a user to view only their sign-in
              history, or leave blank to see all recent events.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="user-log-select" className="text-xs">
                User
              </Label>
              <select
                id="user-log-select"
                className="h-8 min-w-52 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                disabled={usersLoading}
              >
                <option value="">All users</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.first_name} {u.last_name} ({u.user_id})
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void loadUsers();
                void loadHistory();
              }}
              disabled={loading || usersLoading}
            >
              {loading || usersLoading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <RefreshCw />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-col gap-3 pt-0">
        {selectedUser && (
          <div className="rounded-lg border bg-muted/20 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Clock className="size-3.5 text-muted-foreground" />
              <span className="font-medium">
                Last login for {selectedUser.first_name}{" "}
                {selectedUser.last_name}
              </span>
              <Separator orientation="vertical" className="h-3" />
              {lastEntry ? (
                <>
                  <span>{formatDateTime(lastEntry.logged_at)}</span>
                  <Separator orientation="vertical" className="h-3" />
                  <span className="text-muted-foreground">
                    IP {lastEntry.ip ?? "unknown"}
                  </span>
                  <Separator orientation="vertical" className="h-3" />
                  <span
                    className="truncate text-muted-foreground"
                    title={lastEntry.user_agent ?? undefined}
                  >
                    {shortUA(lastEntry.user_agent)}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  No successful login recorded yet.
                </span>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <History className="size-3.5" />
          <span>
            {entries.length} of {total} event{total === 1 ? "" : "s"} shown
            {selectedUser
              ? ` for ${selectedUser.first_name} ${selectedUser.last_name}`
              : ""}
          </span>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <ScrollArea className="max-h-[26rem]">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">When</th>
                  <th className="px-3 py-2 text-left font-medium">Event</th>
                  <th className="px-3 py-2 text-left font-medium">User</th>
                  <th className="px-3 py-2 text-left font-medium">IP</th>
                  <th className="px-3 py-2 text-left font-medium">
                    User agent
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading && entries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-10 text-center text-muted-foreground"
                    >
                      <Loader2 className="mx-auto mb-2 size-4 animate-spin" />
                      Loading log...
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-10 text-center text-muted-foreground"
                    >
                      No login events recorded yet.
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => (
                    <tr
                      key={entry._id}
                      className={cn(
                        "hover:bg-muted/30",
                        !entry.success && "bg-destructive/5",
                      )}
                    >
                      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                        {formatDateTime(entry.logged_at)}
                      </td>
                      <td className="px-3 py-2">
                        {eventBadge(entry.event, entry.success)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {entry.email || "—"}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {entry.user_business_id}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {entry.ip ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className="block max-w-xs truncate text-xs text-muted-foreground"
                          title={entry.user_agent ?? undefined}
                        >
                          {shortUA(entry.user_agent)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
