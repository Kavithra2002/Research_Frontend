"use client";

import * as React from "react";
import {
  AlertCircle,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
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
import { useAuth } from "@/components/auth/auth-provider";
import {
  createUser,
  deleteUser,
  listUsers,
  updateUser,
  type AdminUser,
  type CreateUserInput,
  type UpdateUserInput,
  type UserStatus,
} from "@/lib/users";
import type { UserRole } from "@/lib/auth";

const ROLES: UserRole[] = ["Admin", "User"];
const STATUSES: UserStatus[] = ["active", "inactive", "suspended"];

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Never";
  try {
    return new Date(value).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; user: AdminUser };

interface UserEditorProps {
  state: EditorState | null;
  onClose: () => void;
  onSaved: () => void;
}

function UserEditor({ state, onClose, onSaved }: UserEditorProps) {
  const isEdit = state?.mode === "edit";
  const existing = isEdit ? state.user : null;
  const [first, setFirst] = React.useState(existing?.first_name ?? "");
  const [last, setLast] = React.useState(existing?.last_name ?? "");
  const [email, setEmail] = React.useState(existing?.email ?? "");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<UserRole>(existing?.role ?? "User");
  const [status, setStatus] = React.useState<UserStatus>(
    existing?.user_status ?? "active",
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (state?.mode === "edit") {
      setFirst(state.user.first_name);
      setLast(state.user.last_name);
      setEmail(state.user.email);
      setPassword("");
      setRole(state.user.role);
      setStatus(state.user.user_status);
    } else if (state?.mode === "create") {
      setFirst("");
      setLast("");
      setEmail("");
      setPassword("");
      setRole("User");
      setStatus("active");
    }
    setError(null);
  }, [state]);

  if (!state) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (state.mode === "create") {
        const payload: CreateUserInput = {
          first_name: first.trim(),
          last_name: last.trim(),
          email: email.trim(),
          password: password,
          role,
          user_status: status,
        };
        if (!payload.first_name || !payload.last_name || !payload.email) {
          throw new Error("First name, last name and email are required.");
        }
        if (payload.password.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }
        await createUser(payload);
      } else {
        const payload: UpdateUserInput = {};
        if (first.trim() !== state.user.first_name)
          payload.first_name = first.trim();
        if (last.trim() !== state.user.last_name)
          payload.last_name = last.trim();
        if (email.trim() !== state.user.email) payload.email = email.trim();
        if (role !== state.user.role) payload.role = role;
        if (status !== state.user.user_status) payload.user_status = status;
        if (password.trim().length > 0) {
          if (password.length < 6) {
            throw new Error("Password must be at least 6 characters.");
          }
          payload.password = password;
        }
        if (Object.keys(payload).length === 0) {
          onClose();
          return;
        }
        await updateUser(state.user._id, payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {state.mode === "create" ? "Add user" : "Edit user"}
            </DialogTitle>
            <DialogDescription>
              {state.mode === "create"
                ? "Create a new application user. They can sign in immediately."
                : `Update profile, role, or status for ${state.user.email}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="user-first">First name</Label>
              <Input
                id="user-first"
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                required
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-last">Last name</Label>
              <Input
                id="user-last"
                value={last}
                onChange={(e) => setLast(e.target.value)}
                required
                disabled={saving}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={saving}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="user-password">
                {state.mode === "create"
                  ? "Password"
                  : "New password (leave blank to keep)"}
              </Label>
              <Input
                id="user-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={state.mode === "create"}
                minLength={6}
                disabled={saving}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-role">Role</Label>
              <select
                id="user-role"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                disabled={saving}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-status">Status</Label>
              <select
                id="user-status"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                value={status}
                onChange={(e) => setStatus(e.target.value as UserStatus)}
                disabled={saving}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter>
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                >
                  Cancel
                </Button>
              }
            />
            <Button type="submit" size="sm" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {state.mode === "create" ? "Create user" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteDialogProps {
  user: AdminUser | null;
  onClose: () => void;
  onDeleted: () => void;
}

function DeleteUserDialog({ user, onClose, onDeleted }: DeleteDialogProps) {
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!user) return null;

  const handleConfirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteUser(user._id);
      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="size-4 text-destructive" />
            Delete user
          </DialogTitle>
          <DialogDescription>
            This will permanently remove{" "}
            <span className="font-medium">{user.email}</span> from the system.
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <DialogFooter>
          <DialogClose
            render={
              <Button variant="ghost" size="sm" disabled={deleting}>
                Cancel
              </Button>
            }
          />
          <Button
            size="sm"
            variant="destructive"
            onClick={handleConfirm}
            disabled={deleting}
          >
            {deleting && <Loader2 className="animate-spin" />}
            Delete user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UserManagementPanel() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [searchInput, setSearchInput] = React.useState("");
  const [editor, setEditor] = React.useState<EditorState | null>(null);
  const [toDelete, setToDelete] = React.useState<AdminUser | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listUsers({
        search: search.trim() || undefined,
        limit: 100,
      });
      setUsers(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [search]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Refresh whenever the tab regains focus / becomes visible, so admins
  // always see the current DB state (e.g. after editing in Compass).
  React.useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  return (
    <>
      <Card size="sm" className="flex min-h-0 flex-col">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-muted-foreground" />
                User management
              </CardTitle>
              <CardDescription className="mt-1">
                Create, update, or remove application users. Changes are
                persisted to the user database.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <form
                onSubmit={handleSearchSubmit}
                className="flex items-center gap-1"
              >
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    className="h-8 w-48 pl-7"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                </div>
                <Button type="submit" size="sm" variant="outline">
                  Search
                </Button>
              </form>
              <Button
                variant="outline"
                size="sm"
                onClick={() => load()}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RefreshCw />
                )}
                Refresh
              </Button>
              <Button size="sm" onClick={() => setEditor({ mode: "create" })}>
                <Plus />
                Add user
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-col gap-3 pt-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="size-3.5" />
            <span>
              {users.length} of {total} user{total === 1 ? "" : "s"} shown
            </span>
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border">
            <ScrollArea className="max-h-[28rem]">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">User</th>
                    <th className="px-3 py-2 text-left font-medium">Email</th>
                    <th className="px-3 py-2 text-left font-medium">Role</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">
                      Last login
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading && users.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-10 text-center text-muted-foreground"
                      >
                        <Loader2 className="mx-auto mb-2 size-4 animate-spin" />
                        Loading users...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-10 text-center text-muted-foreground"
                      >
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => {
                      const isSelf = u._id === currentUser?._id;
                      return (
                        <tr
                          key={u._id}
                          className={cn("hover:bg-muted/30", isSelf && "bg-primary/5")}
                        >
                          <td className="px-3 py-2">
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {u.first_name} {u.last_name}
                                {isSelf && (
                                  <Badge
                                    variant="secondary"
                                    className="ml-2 text-[10px]"
                                  >
                                    You
                                  </Badge>
                                )}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {u.user_id}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {u.email}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant={u.role === "Admin" ? "default" : "secondary"}
                              className="text-[10px]"
                            >
                              {u.role}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant={
                                u.user_status === "active"
                                  ? "default"
                                  : u.user_status === "suspended"
                                    ? "destructive"
                                    : "secondary"
                              }
                              className="text-[10px] capitalize"
                            >
                              {u.user_status}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {formatDateTime(u.last_login)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Edit user"
                                title="Edit user"
                                onClick={() =>
                                  setEditor({ mode: "edit", user: u })
                                }
                              >
                                <Pencil />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Delete user"
                                title="Delete user"
                                disabled={isSelf}
                                onClick={() => setToDelete(u)}
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>

      <UserEditor
        state={editor}
        onClose={() => setEditor(null)}
        onSaved={() => load()}
      />
      <DeleteUserDialog
        user={toDelete}
        onClose={() => setToDelete(null)}
        onDeleted={() => load()}
      />
    </>
  );
}
