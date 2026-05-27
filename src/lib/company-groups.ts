import { api } from "./api";

export interface CompanyGroup {
  _id: string;
  name: string;
  description: string;
  companies: string[];
  symbols: string[];
  created_by: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyGroupInput {
  name: string;
  description?: string;
  companies?: string[];
  symbols?: string[];
}

export interface ListCompanyGroupsResponse {
  groups: CompanyGroup[];
}

export async function listCompanyGroups(signal?: AbortSignal) {
  return api<ListCompanyGroupsResponse>("/company-groups", {
    signal,
    cache: "no-store",
  });
}

export async function createCompanyGroup(input: CompanyGroupInput) {
  return api<CompanyGroup>("/company-groups", {
    method: "POST",
    body: input,
  });
}

export async function updateCompanyGroup(
  id: string,
  input: CompanyGroupInput,
) {
  return api<CompanyGroup>(`/company-groups/${id}`, {
    method: "PUT",
    body: input,
  });
}

export async function deleteCompanyGroup(id: string) {
  return api<{ removed: boolean }>(`/company-groups/${id}`, {
    method: "DELETE",
  });
}

export interface CseCompany {
  name: string;
  symbol: string;
}

export interface ListCseCompaniesResponse {
  companies: CseCompany[];
  cached?: boolean;
  stale?: boolean;
  fetchedAt?: string;
  error?: string;
}

export async function listCseCompanies(opts?: {
  refresh?: boolean;
  signal?: AbortSignal;
}): Promise<ListCseCompaniesResponse> {
  const url = opts?.refresh ? "/api/companies?refresh=1" : "/api/companies";
  const res = await fetch(url, {
    cache: "no-store",
    signal: opts?.signal,
  });
  const data = (await res.json()) as ListCseCompaniesResponse;
  if (!res.ok && (!data.companies || data.companies.length === 0)) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data;
}
