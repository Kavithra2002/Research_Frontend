import { api } from "./api";

export type LoginEvent =
  | "login"
  | "signup"
  | "logout"
  | "password_reset_request"
  | "password_reset_success";

export interface LoginHistoryEntry {
  _id: string;
  user_id: string;
  user_business_id: string;
  email: string;
  event: LoginEvent;
  success: boolean;
  ip: string | null;
  user_agent: string | null;
  session_id: string | null;
  logged_at: string;
}

export interface ListLoginHistoryResponse {
  items: LoginHistoryEntry[];
  total: number;
}

export interface ListLoginHistoryOptions {
  userId?: string;
  userBusinessId?: string;
  event?: LoginEvent;
  limit?: number;
}

export async function listLoginHistory(
  opts: ListLoginHistoryOptions = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  if (opts.userId) params.set("userId", opts.userId);
  if (opts.userBusinessId)
    params.set("userBusinessId", opts.userBusinessId);
  if (opts.event) params.set("event", opts.event);
  if (opts.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return api<ListLoginHistoryResponse>(
    `/login-history${qs ? `?${qs}` : ""}`,
    { signal, cache: "no-store" },
  );
}

export async function getLastLoginForUser(userId: string) {
  return api<{ item: LoginHistoryEntry | null }>(
    `/login-history/users/${encodeURIComponent(userId)}/last`,
    { cache: "no-store" },
  );
}
