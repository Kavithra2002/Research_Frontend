import { api, ApiError } from "./api";

export const USER_ROLES = ["Admin", "User"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface AuthUser {
  _id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  user_status: string;
  role: UserRole;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoginResponse {
  user: AuthUser;
  session: { expires_at: string };
}

export interface MeResponse {
  user: AuthUser;
}

export async function login(email: string, password: string) {
  return api<LoginResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export interface SignupRequest {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
}

export async function signup(input: SignupRequest) {
  return api<LoginResponse>("/auth/signup", {
    method: "POST",
    body: input,
  });
}

export async function logout() {
  return api<{ ok: true }>("/auth/logout", { method: "POST" });
}

export async function requestPasswordReset(email: string) {
  return api<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: { email },
  });
}

export async function resetPassword(token: string, password: string) {
  return api<{ message: string }>("/auth/reset-password", {
    method: "POST",
    body: { token, password },
  });
}

export async function getMe(signal?: AbortSignal): Promise<AuthUser | null> {
  try {
    const res = await api<MeResponse>("/auth/me", { signal, cache: "no-store" });
    return res.user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export function getDisplayName(user: AuthUser): string {
  const parts = [user.first_name, user.last_name].filter(Boolean);
  return parts.join(" ") || user.email;
}

export function getInitials(user: AuthUser): string {
  const name = getDisplayName(user);
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function defaultRouteForRole(_role: UserRole): string {
  return "/";
}

export function isRoleAllowed(
  role: UserRole,
  allow: readonly UserRole[],
): boolean {
  return allow.includes(role);
}
