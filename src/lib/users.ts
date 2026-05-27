import { api } from "./api";
import type { UserRole } from "./auth";

export type UserStatus = "active" | "inactive" | "suspended";

export interface AdminUser {
  _id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
  user_status: UserStatus;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListUsersResponse {
  items: AdminUser[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListUsersOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: UserStatus;
}

export interface CreateUserInput {
  user_id?: string;
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  role?: UserRole;
  user_status?: UserStatus;
}

export interface UpdateUserInput {
  first_name?: string;
  last_name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  user_status?: UserStatus;
}

export async function listUsers(opts: ListUsersOptions = {}) {
  const params = new URLSearchParams();
  if (opts.page) params.set("page", String(opts.page));
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.search) params.set("search", opts.search);
  if (opts.status) params.set("status", opts.status);
  const qs = params.toString();
  return api<ListUsersResponse>(`/users${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
  });
}

export async function createUser(input: CreateUserInput) {
  return api<AdminUser>("/users", { method: "POST", body: input });
}

export async function updateUser(id: string, input: UpdateUserInput) {
  return api<AdminUser>(`/users/${id}`, { method: "PATCH", body: input });
}

export async function deleteUser(id: string) {
  return api<AdminUser>(`/users/${id}`, { method: "DELETE" });
}
